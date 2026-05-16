import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/button";

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

function Dashboard() {
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

  const tiles = [
    { label: "Revenue", value: s?.revenue, tone: "text-foreground" },
    { label: "Purchases", value: s?.purchases, tone: "text-foreground" },
    { label: "Receivables", value: s?.receivables, tone: "text-primary" },
    { label: "Payables", value: s?.payables, tone: "text-destructive" },
    { label: "Cash + Bank", value: s?.cash, tone: "text-foreground" },
    { label: "Expenses", value: s?.expenses, tone: "text-foreground" },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live snapshot of your books"
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link to="/app/sales">New Sale</Link></Button>
            <Button asChild size="sm"><Link to="/app/purchases">New Purchase</Link></Button>
          </>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-semibold tabular-nums ${t.tone}`}>
                {s ? inr(t.value ?? 0) : "—"}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Low-stock items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-semibold tabular-nums">
            {s ? s.lowStock : "—"} <span className="text-sm font-normal text-muted-foreground">products at or below reorder level</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}