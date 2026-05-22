import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  ShoppingCart, Truck, Wallet, ArrowRight, ArrowUpRight, ArrowDownRight,
  TrendingUp, AlertTriangle, Sparkles, Receipt, ArrowDownLeft, ArrowUpLeft, HelpCircle, Landmark,
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

/**
 * Per-day raw lines for the trailing year. We bucket on the fly so the
 * graphical section can re-aggregate to whatever range the user picks
 * without another network round-trip.
 */
type DailyRow = { date: string; account: string; debit: number; credit: number };

/** Today's snapshot — drives the "Today" tiles strip. */
type Today = {
  sales: number;
  collected: number;
  purchases: number;
  paidOut: number;
  expenses: number;
  saleCount: number;
  purchaseCount: number;
};

const METRICS = [
  { key: "revenue", label: "Revenue", hint: "Money billed to buyers", kind: "flow" as const },
  { key: "profit", label: "Profit", hint: "Revenue − purchases − expenses", kind: "flow" as const },
  { key: "cash", label: "Cash position", hint: "Cash + bank balance", kind: "stock" as const },
  { key: "receivables", label: "Owed to you", hint: "Open invoices total", kind: "stock" as const },
  { key: "expenses", label: "Expenses", hint: "Running costs", kind: "flow" as const },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const RANGES = [
  { key: "7d",  label: "7 days",   days: 7,   buckets: 7,  unit: "day" as const },
  { key: "30d", label: "30 days",  days: 30,  buckets: 30, unit: "day" as const },
  { key: "4w",  label: "4 weeks",  days: 28,  buckets: 4,  unit: "week" as const },
  { key: "12w", label: "12 weeks", days: 84,  buckets: 12, unit: "week" as const },
  { key: "6m",  label: "6 months", days: 182, buckets: 6,  unit: "month" as const },
  { key: "1y",  label: "12 months",days: 365, buckets: 12, unit: "month" as const },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

/* ---------------- helpers ---------------- */

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const diff = (x.getDay() + 6) % 7; // Mon
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function isoDay(d: Date) { return startOfDay(d).toISOString().slice(0, 10); }

/* ---------------- Morphing infographic ---------------- */

/**
 * Morphing visualization. Renders as bars or a smooth area line depending
 * on the metric kind. Bars/area animate height via CSS transition when the
 * series changes so switching metric/range feels like a single morph.
 */
function MorphChart({
  values,
  labels,
  accent,
  variant,
  formatValue,
}: {
  values: number[];
  labels: string[];
  accent: string;
  variant: "bars" | "area";
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(1, ...values.map((v) => Math.abs(v)));
  const [hover, setHover] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    if (values.length === 0) return;
    const idx = Math.min(values.length - 1, Math.max(0, Math.round((x / rect.width) * (values.length - 1))));
    setHover(idx);
  };
  const onLeave = () => setHover(null);
  const fmt = formatValue ?? ((v: number) => v.toLocaleString());

  const tooltip = hover != null && values[hover] != null ? (
    <div
      className="absolute -top-1 -translate-y-full z-10 pointer-events-none rounded-lg border bg-popover/95 backdrop-blur-md shadow-md px-3 py-2 text-xs animate-in fade-in zoom-in-95 duration-150"
      style={{ left: `calc(${(hover / Math.max(1, values.length - 1)) * 100}% - 50px)`, width: 100 }}
    >
      <div className="text-[10px] text-muted-foreground tracking-wide">{labels[hover]}</div>
      <div className="font-semibold tabular-nums" style={{ color: accent }}>{fmt(values[hover])}</div>
    </div>
  ) : null;

  const crosshair = hover != null ? (
    <div
      className="absolute top-0 bottom-5 w-px bg-foreground/30 pointer-events-none transition-[left] duration-100"
      style={{ left: `${(hover / Math.max(1, values.length - 1)) * 100}%` }}
    />
  ) : null;

  if (variant === "area") {
    // Smooth area line for "stock" metrics (running balances).
    const w = 100, h = 100;
    const step = values.length > 1 ? w / (values.length - 1) : w;
    const points = values.map((v, i) => {
      const y = h - (Math.abs(v) / max) * (h - 6) - 3;
      return [i * step, y] as const;
    });
    const d = points
      .map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`))
      .join(" ");
    const areaD = `${d} L ${w} ${h} L 0 ${h} Z`;
    return (
      <div className="relative h-[200px] sm:h-[240px] w-full touch-none"
        onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onMove}>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accent} stopOpacity="0.32" />
              <stop offset="100%" stopColor={accent} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaD} fill="url(#areaFill)" className="transition-all duration-[600ms] ease-[cubic-bezier(.22,1,.36,1)]" />
          <path d={d} fill="none" stroke={accent} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"
            className="transition-all duration-[600ms] ease-[cubic-bezier(.22,1,.36,1)]" vectorEffect="non-scaling-stroke" />
          {hover != null && points[hover] && (
            <circle cx={points[hover][0]} cy={points[hover][1]} r="1.6" fill={accent} stroke="var(--background)" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        <div className="absolute left-0 right-0 bottom-0 h-px bg-border/60" />
        {crosshair}
        {tooltip}
        <Ticks labels={labels} />
      </div>
    );
  }
  return (
    <div className="relative h-[200px] sm:h-[240px] w-full touch-none"
      onPointerMove={onMove} onPointerLeave={onLeave} onPointerDown={onMove}>
      <div className="absolute inset-x-0 top-0 bottom-5 flex items-end gap-[3px] sm:gap-1.5">
        {values.map((v, i) => {
          const pct = (Math.abs(v) / max) * 100;
          const neg = v < 0;
          const isHover = hover === i;
          return (
            <div key={i} className="flex-1 h-full flex items-end">
              <div
                className="w-full rounded-t-[4px] transition-all duration-[600ms] ease-[cubic-bezier(.22,1,.36,1)]"
                style={{
                  height: `${Math.max(2, pct)}%`,
                  background: neg ? "var(--destructive)" : accent,
                  opacity: isHover ? 1 : 0.22 + (pct / 100) * 0.78,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="absolute left-0 right-0 bottom-5 h-px bg-border/60" />
      {crosshair}
      {tooltip}
      <Ticks labels={labels} />
    </div>
  );
}

function Ticks({ labels }: { labels: string[] }) {
  // Show first, middle and last labels only to keep the strip clean.
  const last = labels.length - 1;
  const mid = Math.floor(last / 2);
  return (
    <div className="absolute left-0 right-0 bottom-0 flex justify-between text-[10px] text-muted-foreground tracking-wide tabular-nums">
      <span>{labels[0] ?? ""}</span>
      <span>{labels[mid] ?? ""}</span>
      <span>{labels[last] ?? ""}</span>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [s, setS] = useState<Stats | null>(null);
  const [daily, setDaily] = useState<DailyRow[] | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [metric, setMetric] = useState<MetricKey>("revenue");
  const [range, setRange] = useState<RangeKey>("30d");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

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

  const loadAll = async () => {
      const [{ data: ledger }, { data: stock }, { data: jl }] = await Promise.all([
        supabase.from("ledger_view").select("account,debit,credit"),
        supabase.from("stock_view").select("on_hand,reorder_level"),
        supabase
          .from("journal_lines")
          .select("date,account,debit,credit")
          .gte("date", isoDay(new Date(Date.now() - 365 * 86400000))),
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

      // Keep raw daily rows — we re-bucket on the fly when range/metric changes.
      setDaily(
        (jl ?? []).map((r: any) => ({
          date: r.date,
          account: String(r.account),
          debit: Number(r.debit ?? 0),
          credit: Number(r.credit ?? 0),
        })),
      );

      // ---- Today snapshot ----
      const todayStr = isoDay(new Date());
      const tStats: Today = { sales: 0, collected: 0, purchases: 0, paidOut: 0, expenses: 0, saleCount: 0, purchaseCount: 0 };
      for (const r of (jl ?? []) as any[]) {
        if (r.date !== todayStr) continue;
        const a = String(r.account), dr = Number(r.debit ?? 0), cr = Number(r.credit ?? 0);
        if (a === "Sales Revenue" || a === "TP Sales Revenue") tStats.sales += cr;
        if (a === "Purchases" || a === "TP Purchases") tStats.purchases += dr;
        if (a.startsWith("Expenses:")) tStats.expenses += dr - cr;
        if ((a === "Cash" || a === "Bank") && cr > 0) tStats.paidOut += cr;
        if ((a === "Cash" || a === "Bank") && dr > 0) tStats.collected += dr;
      }
      const [{ count: sc }, { count: pc }] = await Promise.all([
        (supabase as any).from("sales").select("id", { count: "exact", head: true }).eq("date", todayStr),
        (supabase as any).from("purchases").select("id", { count: "exact", head: true }).eq("date", todayStr),
      ]);
      tStats.saleCount = sc ?? 0;
      tStats.purchaseCount = pc ?? 0;
      setToday(tStats);
      setUpdatedAt(new Date());
  };

  useEffect(() => {
    let refreshTimer: number | undefined;
    const scheduleLoad = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => loadAll(), 180);
    };
    loadAll();
    // Realtime: refresh when anything that affects the dashboard changes.
    const ch = supabase.channel("dash-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_items" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_items" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "third_party" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "tp_items" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_allocations" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_transfers" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "journal_entries" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "journal_lines" }, scheduleLoad)
      .subscribe();
    // Refresh on tab focus too, in case realtime is throttled.
    const onFocus = () => loadAll();
    const onVisible = () => { if (document.visibilityState === "visible") loadAll(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(refreshTimer); supabase.removeChannel(ch); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Re-aggregate the raw lines into buckets matching the chosen range.
  const current = useMemo(() => {
    const range_ = RANGES.find((r) => r.key === range)!;
    const metricDef = METRICS.find((m) => m.key === metric)!;
    const empty = { value: 0, data: new Array(range_.buckets).fill(0), labels: new Array(range_.buckets).fill(""), delta: 0, variant: metricDef.kind === "stock" ? ("area" as const) : ("bars" as const) };
    if (!s || !daily) return empty;

    // Bucket boundaries
    const buckets: { start: Date; label: string }[] = [];
    const now = new Date();
    if (range_.unit === "day") {
      const cur = startOfDay(now);
      for (let i = range_.buckets - 1; i >= 0; i--) {
        const d = new Date(cur);
        d.setDate(d.getDate() - i);
        buckets.push({ start: d, label: `${d.getDate()}/${d.getMonth() + 1}` });
      }
    } else if (range_.unit === "week") {
      const cur = startOfWeek(now);
      for (let i = range_.buckets - 1; i >= 0; i--) {
        const d = new Date(cur);
        d.setDate(d.getDate() - i * 7);
        buckets.push({ start: d, label: `${d.getDate()}/${d.getMonth() + 1}` });
      }
    } else {
      const cur = startOfMonth(now);
      for (let i = range_.buckets - 1; i >= 0; i--) {
        const d = new Date(cur);
        d.setMonth(d.getMonth() - i);
        buckets.push({ start: d, label: d.toLocaleDateString(undefined, { month: "short" }) });
      }
    }
    const idxOf = (date: Date) => {
      const t = date.getTime();
      let last = -1;
      for (let i = 0; i < buckets.length; i++) if (t >= buckets[i].start.getTime()) last = i;
      return last;
    };

    const flow = new Array(buckets.length).fill(0);
    for (const r of daily) {
      const i = idxOf(new Date(r.date));
      if (i < 0) continue;
      const a = r.account;
      if (metric === "revenue" && (a === "Sales Revenue" || a === "TP Sales Revenue")) flow[i] += r.credit;
      else if (metric === "expenses" && a.startsWith("Expenses:")) flow[i] += r.debit - r.credit;
      else if (metric === "profit") {
        if (a === "Sales Revenue" || a === "TP Sales Revenue") flow[i] += r.credit;
        if (a === "Purchases" || a === "TP Purchases" || a.startsWith("Expenses:")) flow[i] -= r.debit - r.credit;
      } else if (metric === "cash" && (a === "Cash" || a === "Bank")) flow[i] += r.debit - r.credit;
      else if (metric === "receivables" && a === "Accounts Receivable") flow[i] += r.debit - r.credit;
    }

    let data = flow;
    if (metricDef.kind === "stock") {
      // Running balance for stock metrics
      const run: number[] = [];
      let acc = 0;
      for (const v of flow) { acc += v; run.push(acc); }
      data = run;
    }

    const value =
      metric === "cash" ? s.cash :
      metric === "receivables" ? s.receivables :
      metric === "profit" ? s.revenue - s.purchases - s.expenses :
      metric === "expenses" ? s.expenses :
      s.revenue;

    const last = data[data.length - 1] ?? 0;
    const prev = data[data.length - 2] ?? 0;
    const delta = prev === 0 ? 0 : ((last - prev) / Math.abs(prev)) * 100;
    return { value, data, labels: buckets.map((b) => b.label), delta, variant: metricDef.kind === "stock" ? ("area" as const) : ("bars" as const) };
  }, [s, daily, metric, range]);

  const name = (user?.email ?? "").split("@")[0] || "there";
  const accent = "var(--primary)";

  const actions = [
    { to: "/app/sales", label: "New sale", icon: ShoppingCart, primary: true },
    { to: "/app/purchases", label: "New purchase", icon: Truck },
    { to: "/app/bills", label: "Record payment", icon: Wallet },
    { to: "/app/bank", label: "Bank & cash", icon: Landmark },
  ];

  const periodLabel = RANGES.find((r) => r.key === range)!.label;
  const metricDef = METRICS.find((m) => m.key === metric)!;

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

      {/* ─────────── Section 1 · TODAY tiles — simple daily updates ─────────── */}
      <section>
        <SectionLabel
          title="Today"
          hint={new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <TodayTile
            label="Sales today"
            value={today ? inr(today.sales) : "—"}
            hint={today ? `${today.saleCount} invoice${today.saleCount === 1 ? "" : "s"}` : ""}
            icon={ShoppingCart}
            to="/app/sales"
          />
          <TodayTile
            label="Collected"
            value={today ? inr(today.collected) : "—"}
            hint="Cash + bank in"
            icon={ArrowDownLeft}
            tone="good"
            to="/app/bills"
          />
          <TodayTile
            label="Purchases"
            value={today ? inr(today.purchases) : "—"}
            hint={today ? `${today.purchaseCount} bill${today.purchaseCount === 1 ? "" : "s"}` : ""}
            icon={Truck}
            to="/app/purchases"
          />
          <TodayTile
            label="Paid out"
            value={today ? inr(today.paidOut) : "—"}
            hint="Cash + bank out"
            icon={ArrowUpLeft}
            to="/app/bills"
          />
          <TodayTile
            label="Expenses"
            value={today ? inr(today.expenses) : "—"}
            hint="Posted today"
            icon={Receipt}
            to="/app/expenses"
          />
        </div>
      </section>

      {/* ─────────── Section 2 · TRENDS — graphical view with filters ─────────── */}
      <section className="rounded-3xl border border-border/70 bg-card overflow-hidden">
        <div className="p-5 sm:p-7 space-y-5">
          {/* Top row: title + tap-to-lock pill */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="eyebrow">Trends · {periodLabel}</div>
              <h2 className="text-[15px] font-semibold tracking-tight mt-1">Graphical view</h2>
            </div>
            <Link to="/app/guide" className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-full hover:bg-muted">
              <HelpCircle className="h-3 w-3" /> Help & FAQ
            </Link>
          </div>

          {/* Filter rail — metric on top, time range below. Tapping any chip locks. */}
          <div className="space-y-2">
            <div role="tablist" aria-label="Metric" className="flex flex-wrap gap-1.5">
              {METRICS.map((m) => {
                const active = m.key === metric;
                return (
                  <button
                    key={m.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setMetric(m.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-[12px] font-medium transition-all",
                      active
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div role="tablist" aria-label="Time range" className="flex flex-wrap gap-1.5">
              {RANGES.map((r) => {
                const active = r.key === range;
                return (
                  <button
                    key={r.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setRange(r.key)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all",
                      active
                        ? "border-foreground/40 text-foreground bg-muted"
                        : "border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30",
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Big number — animates in/out as metric morphs */}
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div key={`${metric}-${range}`} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
              <div className="text-[12px] text-muted-foreground tracking-tight">
                {metricDef.hint}
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
                    {current.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {Math.abs(current.delta).toFixed(1)}% vs prev
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Morphing chart — bars for flows, smooth area for running balances */}
          <MorphChart values={current.data} labels={current.labels} accent={accent} variant={current.variant} formatValue={inr} />
        </div>
      </section>

      {/* Quick actions — flat, Apple-style chiclets */}
      <section>
        <SectionLabel title="Quick actions" />
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
      <section>
        <SectionLabel title="Health" />
        <div className="grid md:grid-cols-3 gap-3">
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
        </div>
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

function SectionLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 mb-3 px-1">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
        {title}
      </h2>
      {hint && <div className="text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

function TodayTile({
  label, value, hint, icon: Icon, tone, to,
}: {
  label: string; value: string; hint?: string; icon: any; tone?: "good" | "warn" | "bad"; to: string;
}) {
  const toneClass =
    tone === "good" ? "text-emerald-700 dark:text-emerald-400" :
    tone === "warn" ? "text-amber-700 dark:text-amber-400" :
    tone === "bad" ? "text-rose-700 dark:text-rose-400" :
    "text-foreground";
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-border/70 bg-card p-3 sm:p-4 transition-all hover:border-foreground/30 hover:shadow-sm active:scale-[0.99]"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="h-7 w-7 rounded-lg bg-muted grid place-items-center">
          <Icon className="h-3.5 w-3.5 text-foreground" />
        </div>
        <ArrowRight className="h-3 w-3 text-muted-foreground/60 group-hover:translate-x-0.5 group-hover:text-foreground transition-all" />
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className={cn("text-[15px] sm:text-base font-semibold tabular-nums mt-0.5 truncate", toneClass)}>{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
    </Link>
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
