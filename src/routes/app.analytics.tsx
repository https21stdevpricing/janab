import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { inr, fmtDate } from "@/lib/format";
import { Trophy, TrendingUp, TrendingDown, Wallet, Package } from "lucide-react";

export const Route = createFileRoute("/app/analytics")({ component: AnalyticsPage });

type Period = "month" | "lastMonth" | "fy" | "all";

function periodRange(p: Period): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "month") return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: now.toLocaleString("en-IN", { month: "long", year: "numeric" }) };
  if (p === "lastMonth") { const d = new Date(y, m - 1, 1); return { from: iso(d), to: iso(new Date(y, m, 0)), label: d.toLocaleString("en-IN", { month: "long", year: "numeric" }) }; }
  if (p === "fy") { const start = new Date(m >= 3 ? y : y - 1, 3, 1); return { from: iso(start), to: iso(new Date(start.getFullYear() + 1, 2, 31)), label: `FY ${start.getFullYear()}-${(start.getFullYear() + 1) % 100}` }; }
  return { from: "1970-01-01", to: "2999-12-31", label: "All Time" };
}

function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const r = periodRange(period);
  const [monthlyPnl, setMonthlyPnl] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topBuyers, setTopBuyers] = useState<any[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<any[]>([]);
  const [cash, setCash] = useState<{ inSum: number; outSum: number }>({ inSum: 0, outSum: 0 });

  const load = async () => {
    const [{ data: mp }, { data: prod }, { data: party }, { data: pays }] = await Promise.all([
      supabase.from("monthly_pnl_view" as never).select("*").order("month" as never, { ascending: true }),
      supabase.from("monthly_product_view" as never).select("*").gte("month" as never, r.from).lte("month" as never, r.to),
      supabase.from("monthly_party_view" as never).select("*").gte("month" as never, r.from).lte("month" as never, r.to),
      supabase.from("payments").select("direction,amount,date").gte("date", r.from).lte("date", r.to),
    ]);
    setMonthlyPnl((mp ?? []) as any[]);
    // aggregate top products
    const pmap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const p of (prod ?? []) as any[]) {
      const key = p.product_id;
      const cur = pmap.get(key) ?? { name: p.product_name, qty: 0, revenue: 0 };
      cur.qty += Number(p.qty_sold); cur.revenue += Number(p.revenue); pmap.set(key, cur);
    }
    setTopProducts([...pmap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5));
    const bMap = new Map<string, { name: string; amount: number }>();
    const sMap = new Map<string, { name: string; amount: number }>();
    for (const p of (party ?? []) as any[]) {
      const m = p.role === "buyer" ? bMap : sMap;
      const cur = m.get(p.party_id) ?? { name: p.party_name, amount: 0 };
      cur.amount += Number(p.amount); m.set(p.party_id, cur);
    }
    setTopBuyers([...bMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 5));
    setTopSuppliers([...sMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 5));
    let inSum = 0, outSum = 0;
    for (const p of (pays ?? []) as any[]) (p.direction === "in" ? (inSum += Number(p.amount)) : (outSum += Number(p.amount)));
    setCash({ inSum, outSum });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);
  useEffect(() => {
    const ch = supabase.channel("analytics-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [period]);

  const periodPnl = useMemo(() => {
    const inRange = monthlyPnl.filter((m) => m.month >= r.from && m.month <= r.to);
    let revenue = 0, cogs = 0, expenses = 0;
    for (const m of inRange) { revenue += Number(m.revenue || 0); cogs += Number(m.cogs || 0); expenses += Number(m.expenses || 0); }
    return { revenue, cogs, expenses, profit: revenue - cogs - expenses, margin: revenue ? ((revenue - cogs) / revenue) * 100 : 0 };
  }, [monthlyPnl, r.from, r.to]);

  const bestMonth = useMemo(() => {
    if (monthlyPnl.length === 0) return null;
    const sorted = [...monthlyPnl].sort((a, b) => Number(b.revenue) - Number(a.revenue));
    return sorted[0];
  }, [monthlyPnl]);

  const maxBar = (rows: { amount?: number; revenue?: number }[], k: "amount" | "revenue") => Math.max(1, ...rows.map((x) => Number((x as any)[k] || 0)));

  return (
    <div>
      <PageHeader title="Analytics" description={`Bird's-eye view · ${r.label}`} actions={
        <div className="flex gap-1 flex-wrap">
          {(["month", "lastMonth", "fy", "all"] as Period[]).map((p) => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
              {p === "month" ? "This Month" : p === "lastMonth" ? "Last Month" : p === "fy" ? "FY" : "All Time"}
            </Button>
          ))}
        </div>
      } />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
        <Tile icon={<TrendingUp className="h-4 w-4" />} label="Revenue" value={inr(periodPnl.revenue)} tone="text-primary" />
        <Tile icon={<TrendingDown className="h-4 w-4" />} label="Cost of Goods" value={inr(periodPnl.cogs)} />
        <Tile icon={<Wallet className="h-4 w-4" />} label="Cash In / Out" value={`${inr(cash.inSum)} / ${inr(cash.outSum)}`} />
        <Tile icon={<Trophy className="h-4 w-4" />} label="Profit · Margin" value={`${inr(periodPnl.profit)} · ${periodPnl.margin.toFixed(1)}%`} tone={periodPnl.profit > 0 ? "text-emerald-600" : "text-destructive"} />
      </div>

      {bestMonth && (
        <div className="mt-3 rounded-md border bg-card p-3 flex items-center gap-3">
          <Trophy className="h-5 w-5 text-amber-500" />
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Best month so far</div>
            <div className="font-semibold">{new Date(bestMonth.month).toLocaleString("en-IN", { month: "long", year: "numeric" })} · {inr(bestMonth.revenue)} revenue</div>
          </div>
        </div>
      )}

      <div className="grid gap-3 mt-4 md:grid-cols-3">
        <Leaderboard title="Top Products" icon={<Package className="h-4 w-4" />} rows={topProducts.map((p) => ({ name: p.name, value: p.revenue, sub: `${p.qty.toFixed(0)} units` }))} max={maxBar(topProducts, "revenue")} />
        <Leaderboard title="Top Buyers" linkTo="/app/buyers" rows={topBuyers.map((p) => ({ name: p.name, value: p.amount }))} max={maxBar(topBuyers, "amount")} />
        <Leaderboard title="Top Suppliers" linkTo="/app/suppliers" rows={topSuppliers.map((p) => ({ name: p.name, value: p.amount }))} max={maxBar(topSuppliers, "amount")} />
      </div>

      <div className="mt-4 rounded-md border bg-card p-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Monthly P&amp;L</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr><th className="text-left p-2">Month</th><th className="text-right p-2">Revenue</th><th className="text-right p-2">COGS</th><th className="text-right p-2">Expenses</th><th className="text-right p-2">Profit</th></tr>
            </thead>
            <tbody>
              {monthlyPnl.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No data yet.</td></tr>}
              {[...monthlyPnl].reverse().map((m) => (
                <tr key={m.month} className="border-b last:border-0">
                  <td className="p-2">{new Date(m.month).toLocaleString("en-IN", { month: "short", year: "numeric" })}</td>
                  <td className="p-2 text-right tabular-nums">{inr(m.revenue)}</td>
                  <td className="p-2 text-right tabular-nums">{inr(m.cogs)}</td>
                  <td className="p-2 text-right tabular-nums">{inr(m.expenses)}</td>
                  <td className={`p-2 text-right tabular-nums font-semibold ${Number(m.revenue) - Number(m.cogs) - Number(m.expenses) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{inr(Number(m.revenue) - Number(m.cogs) - Number(m.expenses))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone, icon }: { label: string; value: string; tone?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3 sm:p-4 min-w-0">
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground flex items-center gap-1 truncate">{icon}{label}</div>
      <div className={`text-[15px] sm:text-lg font-semibold tabular-nums mt-1 leading-tight break-words ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function Leaderboard({ title, rows, max, linkTo, icon }: { title: string; rows: { name: string; value: number; sub?: string }[]; max: number; linkTo?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">{icon}{title}</div>
        {linkTo && <Link to={linkTo} className="text-[10px] text-primary hover:underline">View all →</Link>}
      </div>
      {rows.length === 0 ? <div className="text-xs text-muted-foreground py-4 text-center">No data</div> : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="truncate font-medium">{i + 1}. {r.name}</span>
                <span className="tabular-nums shrink-0">{inr(r.value)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded mt-1 overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
              </div>
              {r.sub && <div className="text-[10px] text-muted-foreground mt-0.5">{r.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}