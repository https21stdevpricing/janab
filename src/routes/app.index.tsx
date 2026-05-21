import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  ShoppingCart, Truck, Wallet, FileSpreadsheet, Boxes, BarChart3, Sparkles, ArrowRight, BookOpenCheck,
  TrendingUp, TrendingDown, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/")({ component: Dashboard });

type Stats = {
  revenue: number;
  purchases: number;
  receivables: number;
  payables: number;
  cash: number;
  expenses: number;
  lowStock: number;
};

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { data: ledger } = await supabase.from("ledger_view").select("account,debit,credit");
      const { data: stock } = await supabase.from("stock_view").select("on_hand,reorder_level");
      const sums: Record<string, { d: number; c: number }> = {};
      for (const r of ledger ?? []) {
        const a = r.account as string;
        sums[a] ??= { d: 0, c: 0 };
        sums[a].d += Number(r.debit ?? 0);
        sums[a].c += Number(r.credit ?? 0);
      }
      const bal = (a: string) => (sums[a]?.d ?? 0) - (sums[a]?.c ?? 0);
      setS({
        revenue: (sums["Sales Revenue"]?.c ?? 0) + (sums["TP Sales Revenue"]?.c ?? 0),
        purchases: (sums["Purchases"]?.d ?? 0) + (sums["TP Purchases"]?.d ?? 0),
        receivables: bal("Accounts Receivable"),
        payables: -bal("Accounts Payable"),
        cash: bal("Cash") + bal("Bank"),
        expenses: Object.entries(sums)
          .filter(([k]) => k.startsWith("Expenses:"))
          .reduce((acc, [, v]) => acc + v.d - v.c, 0),
        lowStock: (stock ?? []).filter((r) => Number(r.on_hand ?? 0) <= Number(r.reorder_level ?? 0)).length,
      });
    })();
  }, []);

  const name = (user?.email ?? "").split("@")[0] || "there";
  const profit = s ? s.revenue - s.purchases - s.expenses : 0;
  const profitable = profit >= 0;

  const headline = s ? [
    { label: "Money you've earned", hint: "Total sales so far", value: s.revenue, icon: TrendingUp, tone: "text-emerald-700", bg: "bg-emerald-500/10" },
    { label: "Money in the bank", hint: "Cash + bank balance", value: s.cash, icon: Wallet, tone: "text-foreground", bg: "bg-muted" },
    { label: "Owed to you", hint: "Customers yet to pay", value: s.receivables, icon: FileSpreadsheet, tone: "text-primary", bg: "bg-primary/10" },
    { label: "You owe", hint: "Bills still to pay", value: s.payables, icon: TrendingDown, tone: "text-rose-700", bg: "bg-rose-500/10" },
  ] : [];

  const actions = [
    { to: "/app/sales", label: "Record a sale", hint: "Bill a customer", icon: ShoppingCart, primary: true },
    { to: "/app/purchases", label: "Add purchase", hint: "Stock you bought", icon: Truck },
    { to: "/app/payments", label: "Collect payment", hint: "Money received", icon: Wallet },
    { to: "/app/stock", label: "Check stock", hint: "What's in the yard", icon: Boxes },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome hero */}
      <section className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.1em] text-muted-foreground">{greet()}</div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1 capitalize">Hi {name}</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
              Here's your business at a glance. Everything below updates in real time — no spreadsheets needed.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <Link to="/app/guide"><BookOpenCheck className="h-3.5 w-3.5" /> 90-second tour</Link>
          </Button>
        </div>

        {/* Headline numbers — plain English */}
        <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {headline.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.label} className="rounded-xl border bg-card p-3 sm:p-4">
                <div className="flex items-center gap-2">
                  <div className={cn("h-7 w-7 rounded-lg grid place-items-center", t.bg)}>
                    <Icon className={cn("h-4 w-4", t.tone)} />
                  </div>
                  <div className="text-[11px] sm:text-xs font-medium text-muted-foreground truncate">{t.label}</div>
                </div>
                <div className={cn("mt-2 text-lg sm:text-2xl font-semibold tabular-nums truncate", t.tone)}>
                  {inr(t.value)}
                </div>
                <div className="text-[10px] sm:text-[11px] text-muted-foreground/80 mt-0.5">{t.hint}</div>
              </div>
            );
          })}
          {!s && (
            <div className="col-span-2 lg:col-span-4 text-xs text-muted-foreground py-2">Loading your numbers…</div>
          )}
        </div>
      </section>

      {/* Quick actions — what most people do every day */}
      <section>
        <div className="flex items-baseline justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold tracking-tight">What would you like to do?</h2>
          <span className="text-[11px] text-muted-foreground">Daily essentials</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.to}
                to={a.to}
                className={cn(
                  "group rounded-xl border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.99]",
                  a.primary && "border-primary/30 bg-primary/[0.03]",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn("h-9 w-9 rounded-lg grid place-items-center", a.primary ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 group-hover:text-foreground transition-all" />
                </div>
                <div className="mt-3 text-sm font-medium">{a.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{a.hint}</div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Health & alerts strip */}
      <section className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Are you making money?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-semibold tabular-nums", profitable ? "text-emerald-700" : "text-rose-700")}>
              {s ? inr(profit) : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {s
                ? profitable
                  ? "Your sales are bigger than your costs and expenses. That's profit — well done."
                  : "Your costs are higher than your sales right now. Tap Reports to see where the money's going."
                : "We'll show you whether you're in profit or loss once your data loads."}
            </p>
            <Button asChild variant="link" size="sm" className="px-0 mt-1 h-auto">
              <Link to="/app/reports">Open full report <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Things to keep an eye on
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {s ? s.lowStock : "—"} <span className="text-sm font-normal text-muted-foreground">product{s?.lowStock === 1 ? "" : "s"} running low</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {s && s.lowStock > 0
                ? "Stock has dropped at or below the level you set for reordering. Time to refill."
                : "Your stock levels look healthy. We'll alert you the moment anything dips below your reorder level."}
            </p>
            <Button asChild variant="link" size="sm" className="px-0 mt-1 h-auto">
              <Link to="/app/stock">Review stock <ArrowRight className="h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* New-user tip */}
      <section className="rounded-xl border border-dashed bg-muted/30 p-4 flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-background border grid place-items-center shrink-0">
          <BarChart3 className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">New here? Start with one sale.</div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Record one real customer sale. Watch your stock, bills and ledger update together — it's the fastest way to see how everything fits.
          </div>
        </div>
        <Button asChild size="sm" className="shrink-0 rounded-full"><Link to="/app/sales">Try it now</Link></Button>
      </section>
    </div>
  );
}