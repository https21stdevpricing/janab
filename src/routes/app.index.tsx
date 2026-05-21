import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  ShoppingCart, Truck, Wallet, Boxes, ArrowRight, ArrowUpRight, ArrowDownRight,
  TrendingUp, AlertTriangle, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({ component: Dashboard });

/* ---------------- types ---------------- */

type Stats = {
  revenue: number;
  cash: number;
  receivables: number;
  payables: number;
  expenses: number;
  purchases: number;
  lowStock: number;
};

type Series = {
  revenue: number[];
  cash: number[];
  receivables: number[];
  profit: number[];
};

const METRICS = [
  { key: "revenue", label: "Revenue", hint: "Total sales" },
  { key: "profit", label: "Profit", hint: "Sales − costs − expenses" },
  { key: "cash", label: "Cash position", hint: "Cash + bank" },
  { key: "receivables", label: "Owed to you", hint: "Open invoices" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

/* ---------------- helpers ---------------- */

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // Mon as start
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - diff);
  return x;
}

/* ---------------- Morphing infographic ---------------- */

function MorphChart({ values, accent }: { values: number[]; accent: string }) {
  // Normalized bar chart. Bars animate height via CSS transition when values change.
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  return (
    <div className="relative h-[180px] sm:h-[220px] w-full">
      <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1">
        {values.map((v, i) => {
          const h = (Math.abs(v) / max) * 100;
          return (
            <div key={i} className="flex-1 h-full flex items-end">
              <div
                className="w-full rounded-t-[3px] transition-all duration-[700ms] ease-[cubic-bezier(.22,1,.36,1)]"
                style={{
                  height: `${Math.max(2, h)}%`,
                  background: accent,
                  opacity: 0.18 + (h / 100) * 0.82,
                }}
              />
            </div>
          );
        })}
      </div>
      {/* baseline */}
      <div className="absolute left-0 right-0 bottom-0 h-px bg-border/60" />
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState<Stats | null>(null);
  const [series, setSeries] = useState<Series | null>(null);
  const [metric, setMetric] = useState<MetricKey>("revenue");

  // First-time intro tour
  useEffect(() => {
    try {
      const seen = localStorage.getItem("sw_intro_seen");
      if (!seen) {
        localStorage.setItem("sw_intro_seen", "1");
        navigate({ to: "/app/guide", search: { intro: "1" } as any, replace: false });
      }
    } catch {}
  }, [navigate]);

  // Auto-cycle through metrics every 5s (pauses if user clicks)
  const [autoplay, setAutoplay] = useState(true);
  useEffect(() => {
    if (!autoplay) return;
    const id = setInterval(() => {
      setMetric((m) => {
        const idx = METRICS.findIndex((x) => x.key === m);
        return METRICS[(idx + 1) % METRICS.length].key;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [autoplay]);

  useEffect(() => {
    (async () => {
      const [{ data: ledger }, { data: stock }, { data: jl }] = await Promise.all([
        supabase.from("ledger_view").select("account,debit,credit"),
        supabase.from("stock_view").select("on_hand,reorder_level"),
        supabase
          .from("journal_lines")
          .select("date,account,debit,credit")
          .gte("date", new Date(Date.now() - 12 * 7 * 86400000).toISOString().slice(0, 10)),
      ]);

      const sums: Record<string, { d: number; c: number }> = {};
      for (const r of ledger ?? []) {
        const a = r.account as string;
        sums[a] ??= { d: 0, c: 0 };
        sums[a].d += Number(r.debit ?? 0);
        sums[a].c += Number(r.credit ?? 0);
      }
      const bal = (a: string) => (sums[a]?.d ?? 0) - (sums[a]?.c ?? 0);
      const expenses = Object.entries(sums)
        .filter(([k]) => k.startsWith("Expenses:"))
        .reduce((acc, [, v]) => acc + v.d - v.c, 0);
      const revenue = (sums["Sales Revenue"]?.c ?? 0) + (sums["TP Sales Revenue"]?.c ?? 0);
      const purchases = (sums["Purchases"]?.d ?? 0) + (sums["TP Purchases"]?.d ?? 0);

      setS({
        revenue,
        purchases,
        expenses,
        cash: bal("Cash") + bal("Bank"),
        receivables: bal("Accounts Receivable"),
        payables: -bal("Accounts Payable"),
        lowStock: (stock ?? []).filter(
          (r) => Number(r.on_hand ?? 0) <= Number(r.reorder_level ?? 0),
        ).length,
      });

      // ---- Weekly buckets (12 weeks) ----
      const weeks: Date[] = [];
      const now = startOfWeek(new Date());
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        weeks.push(d);
      }
      const idxOf = (d: Date) => {
        const ws = startOfWeek(d).getTime();
        return weeks.findIndex((w) => w.getTime() === ws);
      };

      const rev = new Array(12).fill(0);
      const cash = new Array(12).fill(0);
      const recv = new Array(12).fill(0);
      const cost = new Array(12).fill(0);

      for (const r of (jl ?? []) as any[]) {
        const d = new Date(r.date);
        const i = idxOf(d);
        if (i < 0) continue;
        const acct = String(r.account);
        const dr = Number(r.debit ?? 0);
        const cr = Number(r.credit ?? 0);
        if (acct === "Sales Revenue" || acct === "TP Sales Revenue") rev[i] += cr;
        if (acct === "Cash" || acct === "Bank") cash[i] += dr - cr;
        if (acct === "Accounts Receivable") recv[i] += dr - cr;
        if (acct === "Purchases" || acct === "TP Purchases" || acct.startsWith("Expenses:"))
          cost[i] += dr - cr;
      }
      // Running cash + running receivables (cumulative balance feel)
      const runCash: number[] = [];
      const runRecv: number[] = [];
      let cc = 0, rr = 0;
      for (let i = 0; i < 12; i++) {
        cc += cash[i]; rr += recv[i];
        runCash.push(cc); runRecv.push(rr);
      }
      const profit = rev.map((v, i) => v - cost[i]);

      setSeries({ revenue: rev, cash: runCash, receivables: runRecv, profit });
    })();
  }, []);

  const current = useMemo(() => {
    if (!s || !series) return { value: 0, data: new Array(12).fill(0), delta: 0 };
    const data = series[metric];
    const value =
      metric === "cash" ? s.cash :
      metric === "receivables" ? s.receivables :
      metric === "profit" ? s.revenue - s.purchases - s.expenses :
      s.revenue;
    // Week-over-week delta on the series
    const last = data[data.length - 1] ?? 0;
    const prev = data[data.length - 2] ?? 0;
    const delta = prev === 0 ? 0 : ((last - prev) / Math.abs(prev)) * 100;
    return { value, data, delta };
  }, [s, series, metric]);

  const name = (user?.email ?? "").split("@")[0] || "there";
  const accent = "var(--primary)";

  const actions = [
    { to: "/app/sales", label: "New sale", icon: ShoppingCart, primary: true },
    { to: "/app/purchases", label: "New purchase", icon: Truck },
    { to: "/app/payments", label: "Record payment", icon: Wallet },
    { to: "/app/stock", label: "Check stock", icon: Boxes },
  ];

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Header — minimal, no boxy hero */}
      <header className="flex items-end justify-between gap-4 pt-1">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {greet()}
          </div>
          <h1 className="text-[26px] sm:text-[34px] font-semibold tracking-tight leading-tight mt-1 capitalize">
            {name}
          </h1>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[11px] text-muted-foreground">Today</div>
          <div className="text-sm font-medium tabular-nums">
            {new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" })}
          </div>
        </div>
      </header>

      {/* Single focal infographic — morphs between metrics */}
      <section className="rounded-3xl border border-border/70 bg-card overflow-hidden">
        <div className="p-5 sm:p-7">
          {/* Metric tabs */}
          <div
            role="tablist"
            className="flex flex-wrap gap-1.5 mb-5"
          >
            {METRICS.map((m) => {
              const active = m.key === metric;
              return (
                <button
                  key={m.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setMetric(m.key); setAutoplay(false); }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[12px] font-medium transition-all",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Big number — animates in/out */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div key={metric} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
              <div className="text-[12px] text-muted-foreground tracking-tight">
                {METRICS.find((m) => m.key === metric)?.hint}
              </div>
              <div className="mt-1 flex items-baseline gap-3 flex-wrap">
                <div className="text-[40px] sm:text-[56px] font-semibold tabular-nums leading-none tracking-tight">
                  {s ? inr(current.value) : "—"}
                </div>
                {s && Math.abs(current.delta) > 0.5 && (
                  <div
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                      current.delta >= 0
                        ? "text-emerald-700 bg-emerald-500/10"
                        : "text-rose-700 bg-rose-500/10",
                    )}
                  >
                    {current.delta >= 0 ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {Math.abs(current.delta).toFixed(1)}% wow
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Morphing bar chart */}
          <div className="mt-6">
            <MorphChart values={current.data} accent={accent} />
            <div className="mt-2 flex justify-between text-[10px] text-muted-foreground tracking-wide">
              <span>12 weeks ago</span>
              <span>This week</span>
            </div>
          </div>
        </div>
      </section>

      {/* Quick actions — flat, Apple-style chiclets */}
      <section>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-[13px] font-semibold tracking-tight text-muted-foreground uppercase">
            Quick actions
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.to}
                to={a.to}
                className={cn(
                  "group rounded-2xl border border-border/70 bg-card p-4 sm:p-5 transition-all hover:border-foreground/30 hover:shadow-sm active:scale-[0.99]",
                )}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      "h-9 w-9 rounded-xl grid place-items-center",
                      a.primary ? "bg-foreground text-background" : "bg-muted text-foreground",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground transition-all" />
                </div>
                <div className="mt-4 text-[15px] font-medium tracking-tight">{a.label}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Bottom strip — health & alerts, super minimal */}
      <section className="grid md:grid-cols-3 gap-3">
        <MiniStat
          label="Profit this period"
          value={s ? inr(s.revenue - s.purchases - s.expenses) : "—"}
          tone={s && s.revenue - s.purchases - s.expenses >= 0 ? "good" : "bad"}
          icon={TrendingUp}
          to="/app/reports"
        />
        <MiniStat
          label="Cash on hand"
          value={s ? inr(s.cash) : "—"}
          icon={Wallet}
          to="/app/ledger"
        />
        <MiniStat
          label={s && s.lowStock > 0 ? `${s.lowStock} item${s.lowStock === 1 ? "" : "s"} low` : "Stock healthy"}
          value={s ? `${s.lowStock} below reorder` : "—"}
          tone={s && s.lowStock > 0 ? "warn" : "muted"}
          icon={AlertTriangle}
          to="/app/stock"
        />
      </section>

      {/* New-user tip — only first session */}
      {s && s.revenue === 0 && s.purchases === 0 && (
        <section className="rounded-2xl border border-dashed border-border/70 p-4 flex items-start gap-3 bg-muted/20">
          <div className="h-8 w-8 rounded-xl bg-background border grid place-items-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Start with one sale.</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Record a real sale and watch stock, ledger and delivery update together. It's the fastest way to see how StoneWorld fits.
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0 rounded-full">
            <Link to="/app/sales">Try now</Link>
          </Button>
        </section>
      )}
    </div>
  );
}

function MiniStat({
  label, value, tone = "default", icon: Icon, to,
}: {
  label: string; value: string; tone?: "good" | "bad" | "warn" | "muted" | "default";
  icon: any; to: string;
}) {
  const toneClass =
    tone === "good" ? "text-emerald-700" :
    tone === "bad" ? "text-rose-700" :
    tone === "warn" ? "text-amber-700" :
    "text-foreground";
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border/70 bg-card p-4 flex items-center gap-3 hover:border-foreground/30 transition-all"
    >
      <div className="h-9 w-9 rounded-xl bg-muted grid place-items-center shrink-0">
        <Icon className={cn("h-4 w-4", toneClass)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-muted-foreground truncate">{label}</div>
        <div className={cn("text-[15px] font-medium tabular-nums truncate", toneClass)}>{value}</div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground transition-all shrink-0" />
    </Link>
  );
}
