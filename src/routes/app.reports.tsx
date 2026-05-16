import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr, fmt } from "@/lib/format";

export const Route = createFileRoute("/app/reports")({ component: ReportsPage });

function ReportsPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.from("ledger_view").select("*").then(({ data }) => setRows(data ?? [])); }, []);

  const sums = useMemo(() => {
    const out: Record<string, { d: number; c: number }> = {};
    for (const r of rows) {
      const a = r.account as string;
      out[a] ??= { d: 0, c: 0 };
      out[a].d += Number(r.debit ?? 0);
      out[a].c += Number(r.credit ?? 0);
    }
    return out;
  }, [rows]);

  const bal = (a: string) => (sums[a]?.d ?? 0) - (sums[a]?.c ?? 0);
  const balCr = (a: string) => (sums[a]?.c ?? 0) - (sums[a]?.d ?? 0);

  const revenue = (sums["Sales Revenue"]?.c ?? 0) + (sums["TP Sales Revenue"]?.c ?? 0);
  const cogs = (sums["Purchases"]?.d ?? 0) + (sums["TP Purchases"]?.d ?? 0);
  const expenseKeys = Object.keys(sums).filter(k => k.startsWith("Expenses:"));
  const expenses = expenseKeys.reduce((a, k) => a + sums[k].d - sums[k].c, 0);
  const netProfit = revenue - cogs - expenses;

  const ar = bal("Accounts Receivable");
  const ap = balCr("Accounts Payable");
  const cash = bal("Cash"); const bank = bal("Bank");
  const gstIn = bal("GST Input"); const gstOut = balCr("GST Output");

  const tbAll = Object.entries(sums).map(([acct, v]) => ({ acct, debit: v.d, credit: v.c, net: v.d - v.c }));
  const tbTotalD = tbAll.reduce((a, r) => a + r.debit, 0);
  const tbTotalC = tbAll.reduce((a, r) => a + r.credit, 0);

  return (
    <div>
      <PageHeader title="Financial Reports" description="Auto-built from the ledger" />
      <Tabs defaultValue="pnl">
        <TabsList><TabsTrigger value="pnl">P&amp;L</TabsTrigger><TabsTrigger value="bs">Balance Sheet</TabsTrigger><TabsTrigger value="tb">Trial Balance</TabsTrigger></TabsList>

        <TabsContent value="pnl">
          <Card>
            <CardHeader><CardTitle>Profit &amp; Loss</CardTitle></CardHeader>
            <CardContent>
              <Row label="Sales Revenue" value={sums["Sales Revenue"]?.c ?? 0} />
              <Row label="TP Sales Revenue" value={sums["TP Sales Revenue"]?.c ?? 0} />
              <Row label="Total Revenue" value={revenue} bold />
              <Sep />
              <Row label="Purchases (COGS)" value={-(sums["Purchases"]?.d ?? 0)} />
              <Row label="TP Purchases" value={-(sums["TP Purchases"]?.d ?? 0)} />
              <Row label="Gross Profit" value={revenue - cogs} bold />
              <Sep />
              {expenseKeys.map(k => <Row key={k} label={k.replace("Expenses: ", "")} value={-(sums[k].d - sums[k].c)} />)}
              <Row label="Total Expenses" value={-expenses} bold />
              <Sep />
              <Row label="Net Profit" value={netProfit} bold positive />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bs">
          <div className="grid md:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle>Assets</CardTitle></CardHeader><CardContent>
              <Row label="Cash" value={cash} /><Row label="Bank" value={bank} />
              <Row label="Accounts Receivable" value={ar} />
              <Row label="GST Input (asset)" value={gstIn} />
              <Sep /><Row label="Total Assets" value={cash + bank + ar + gstIn} bold />
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Liabilities &amp; Equity</CardTitle></CardHeader><CardContent>
              <Row label="Accounts Payable" value={ap} />
              <Row label="GST Output (liability)" value={gstOut} />
              <Sep /><Row label="Net Profit (retained)" value={netProfit} />
              <Row label="Total L+E" value={ap + gstOut + netProfit} bold />
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="tb">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                <tr><th className="text-left p-2">Account</th><th className="text-right p-2">Debit</th><th className="text-right p-2">Credit</th><th className="text-right p-2">Net</th></tr>
              </thead>
              <tbody>
                {tbAll.map(r => (
                  <tr key={r.acct} className="border-t">
                    <td className="p-2">{r.acct}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.debit)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.credit)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">{fmt(r.net)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/30 font-semibold">
                  <td className="p-2">Totals</td>
                  <td className="p-2 text-right tabular-nums">{fmt(tbTotalD)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(tbTotalC)}</td>
                  <td className="p-2 text-right tabular-nums">{fmt(tbTotalD - tbTotalC)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, bold, positive }: { label: string; value: number; bold?: boolean; positive?: boolean }) {
  return <div className={`flex items-center justify-between py-1.5 ${bold ? "border-t font-semibold" : ""}`}>
    <span>{label}</span>
    <span className={`tabular-nums ${positive ? (value >= 0 ? "text-primary" : "text-destructive") : ""}`}>{inr(value)}</span>
  </div>;
}
function Sep() { return <div className="h-2" />; }