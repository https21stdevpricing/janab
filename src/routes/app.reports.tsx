import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr, fmt } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Minus } from "lucide-react";

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
  const sumAcc = (names: string[], side: "d" | "c") =>
    names.reduce((a, n) => a + (sums[n]?.[side] ?? 0), 0);

  const revenue = (sums["Sales Revenue"]?.c ?? 0) + (sums["TP Sales Revenue"]?.c ?? 0);
  const directSales = sums["Sales Revenue"]?.c ?? 0;
  const tpSales = sums["TP Sales Revenue"]?.c ?? 0;
  const directCogs = sums["Purchases"]?.d ?? 0;
  const tpCogs = sums["TP Purchases"]?.d ?? 0;
  const cogs = directCogs + tpCogs;
  const grossProfit = revenue - cogs;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const expenseKeys = Object.keys(sums).filter(k => k.startsWith("Expenses:"));
  const expenses = expenseKeys.reduce((a, k) => a + sums[k].d - sums[k].c, 0);
  const netProfit = revenue - cogs - expenses;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const ar = bal("Accounts Receivable");
  const ap = balCr("Accounts Payable");
  const cash = bal("Cash"); const bank = bal("Bank");
  // Per StoneWorld standards (AS-compliant split): Input CGST/SGST/IGST are assets, Output CGST/SGST/IGST are liabilities.
  const gstInputAccts = ["Input CGST", "Input SGST", "Input IGST", "GST Input"];
  const gstOutputAccts = ["Output CGST", "Output SGST", "Output IGST", "GST Output"];
  const gstIn = sumAcc(gstInputAccts, "d") - sumAcc(gstInputAccts, "c");
  const gstOut = sumAcc(gstOutputAccts, "c") - sumAcc(gstOutputAccts, "d");
  const netGstPayable = gstOut - gstIn;

  const tbAll = Object.entries(sums).map(([acct, v]) => ({ acct, debit: v.d, credit: v.c, net: v.d - v.c }));
  const tbTotalD = tbAll.reduce((a, r) => a + r.debit, 0);
  const tbTotalC = tbAll.reduce((a, r) => a + r.credit, 0);
  const tbBalanced = Math.abs(tbTotalD - tbTotalC) < 0.01;

  const totalAssets = cash + bank + ar + Math.max(0, gstIn);
  const totalLiab = ap + Math.max(0, gstOut);
  const equity = netProfit;
  const balanceCheck = Math.abs(totalAssets - (totalLiab + equity)) < 1;

  // ---------- Position & Outlook ----------
  const today = new Date();
  const dCutoff = (days: number) => {
    const d = new Date(today); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10);
  };
  const last90 = dCutoff(90);
  const prev90 = dCutoff(180);

  const revWindow = (from: string, to: string) =>
    rows.filter(r => (r.account === "Sales Revenue" || r.account === "TP Sales Revenue") && r.date >= from && r.date < to)
      .reduce((a, r) => a + Number(r.credit ?? 0), 0);
  const expWindow = (from: string, to: string) =>
    rows.filter(r => String(r.account).startsWith("Expenses:") && r.date >= from && r.date < to)
      .reduce((a, r) => a + Number(r.debit ?? 0) - Number(r.credit ?? 0), 0);

  const rev90 = revWindow(last90, today.toISOString().slice(0, 10));
  const revPrev90 = revWindow(prev90, last90);
  const revGrowthPct = revPrev90 > 0 ? ((rev90 - revPrev90) / revPrev90) * 100 : (rev90 > 0 ? 100 : 0);
  const exp90 = expWindow(last90, today.toISOString().slice(0, 10));
  const monthlyOpex = exp90 / 3;
  const liquid = cash + bank;
  const runwayMonths = monthlyOpex > 0 ? liquid / monthlyOpex : Infinity;

  const currentRatio = totalLiab > 0 ? totalAssets / totalLiab : Infinity;
  const quickRatio = totalLiab > 0 ? (liquid + ar) / totalLiab : Infinity;
  const workingCapital = totalAssets - totalLiab;
  const arApDelta = ar - ap;

  const topExpense = expenseKeys
    .map(k => ({ k: k.replace("Expenses: ", ""), v: sums[k].d - sums[k].c }))
    .sort((a, b) => b.v - a.v)[0];

  const insights = buildInsights({
    revenue, netProfit, grossMarginPct, netMarginPct, currentRatio, quickRatio,
    runwayMonths, revGrowthPct, ar, ap, netGstPayable, workingCapital,
    tbBalanced, balanceCheck, topExpense,
  });

  return (
    <TooltipProvider delayDuration={150}>
      <PageHeader title="Financial Reports" description="Built from the ledger per StoneWorld Accounting Standards (AS 2 · AS 9 · GST 2017)" />
      <Tabs defaultValue="outlook">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="outlook">Position &amp; Outlook</TabsTrigger>
          <TabsTrigger value="pnl">P&amp;L</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="tb">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="outlook" className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Revenue (all-time)" value={inr(revenue)}
              hint="Goods & services billed (AS 9 — recognised on invoice)." />
            <Kpi label="Net Profit" value={inr(netProfit)} tone={netProfit >= 0 ? "good" : "bad"}
              hint="Revenue − COGS − Operating Expenses. What's actually left for the business." />
            <Kpi label="Gross Margin" value={`${fmt(grossMarginPct, 1)}%`} tone={grossMarginPct >= 20 ? "good" : grossMarginPct >= 10 ? "warn" : "bad"}
              hint="(Revenue − COGS) ÷ Revenue. Healthy stone trading: 18–30%." />
            <Kpi label="Cash Runway" value={isFinite(runwayMonths) ? `${fmt(runwayMonths, 1)} mo` : "∞"}
              tone={runwayMonths >= 6 ? "good" : runwayMonths >= 3 ? "warn" : "bad"}
              hint="Liquid cash ÷ avg monthly operating expenses (last 90 days)." />
            <Kpi label="Current Ratio" value={isFinite(currentRatio) ? fmt(currentRatio, 2) : "∞"}
              tone={currentRatio >= 1.5 ? "good" : currentRatio >= 1 ? "warn" : "bad"}
              hint="Current Assets ÷ Current Liabilities. ≥1.5 means short-term obligations are comfortably covered." />
            <Kpi label="Quick Ratio" value={isFinite(quickRatio) ? fmt(quickRatio, 2) : "∞"}
              tone={quickRatio >= 1 ? "good" : quickRatio >= 0.7 ? "warn" : "bad"}
              hint="(Cash + Bank + AR) ÷ Current Liabilities. Liquidity excluding stock." />
            <Kpi label="Revenue Trend (90d vs prior 90d)"
              value={`${revGrowthPct >= 0 ? "+" : ""}${fmt(revGrowthPct, 1)}%`}
              tone={revGrowthPct >= 5 ? "good" : revGrowthPct >= -5 ? "warn" : "bad"}
              hint="Sales in last 90 days vs the 90 days before that." />
            <Kpi label="Net GST Payable" value={inr(Math.max(0, netGstPayable))}
              tone={netGstPayable > 0 ? "warn" : "good"}
              hint="Output GST − Input GST. Amount payable to the government this period." />
          </div>

          <Card>
            <CardHeader><CardTitle>What this means for your business</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {insights.map((it, i) => (
                <div key={i} className="flex gap-3 items-start py-1.5 border-b last:border-0">
                  <ToneIcon tone={it.tone} />
                  <div className="flex-1">
                    <div className="font-medium text-sm">{it.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed">{it.body}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Where the business is heading</CardTitle></CardHeader>
            <CardContent className="text-sm leading-relaxed space-y-2">
              <p>{outlookNarrative({ revGrowthPct, netProfit, grossMarginPct, runwayMonths, currentRatio, arApDelta, netGstPayable })}</p>
              <p className="text-xs text-muted-foreground">
                Note: This outlook is a logical reading of the data above (trend, margin, liquidity & working-capital position).
                It is not a forecast — actuals depend on collections, new orders and disciplined journal posting per the StoneWorld
                standards (block-rules on negative stock, unbalanced JEs, and GST mismatches).
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card>
            <CardHeader><CardTitle>Profit &amp; Loss</CardTitle></CardHeader>
            <CardContent>
              <Section title="Revenue (AS 9 — recognised on invoice raise)" />
              <Row label="Direct Sales Revenue" value={directSales} hint="Sales of your own stock — billed to buyers." />
              <Row label="Third-Party Sales Revenue" value={tpSales} hint="Drop-ship sales: supplier ships directly to your buyer. Margin only stays with you." />
              <Row label="Total Revenue" value={revenue} bold />
              <Sep />
              <Section title="Cost of Goods Sold (AS 2)" />
              <Row label="Purchases (COGS)" value={-directCogs} hint="Cost of stock sold from your inventory." />
              <Row label="TP Purchases" value={-tpCogs} hint="Cost paid to supplier in third-party trades." />
              <Row label="Gross Profit" value={grossProfit} bold positive
                hint={`Gross Margin: ${fmt(grossMarginPct, 1)}%. This is what you earn before paying salaries, rent, etc.`} />
              <Sep />
              <Section title="Operating Expenses" />
              {expenseKeys.map(k => <Row key={k} label={k.replace("Expenses: ", "")} value={-(sums[k].d - sums[k].c)} />)}
              <Row label="Total Expenses" value={-expenses} bold />
              <Sep />
              <Row label="Net Profit" value={netProfit} bold positive
                hint={`Net Margin: ${fmt(netMarginPct, 1)}%. The bottom line — what actually accrues to the owner.`} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bs">
          <div className="grid md:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle>Assets</CardTitle></CardHeader><CardContent>
              <Section title="Current Assets" />
              <Row label="Cash in Hand" value={cash} hint="Physical cash with the business." />
              <Row label="Bank Balance" value={bank} hint="Funds in current/savings accounts." />
              <Row label="Accounts Receivable" value={ar} hint="Money buyers owe you against invoices raised." />
              <Row label="GST Input Credit" value={Math.max(0, gstIn)} hint="GST paid on purchases — recoverable by setoff against Output GST." />
              <Sep /><Row label="Total Assets" value={totalAssets} bold />
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Liabilities &amp; Equity</CardTitle></CardHeader><CardContent>
              <Section title="Current Liabilities" />
              <Row label="Accounts Payable" value={ap} hint="Amount you owe suppliers against their bills." />
              <Row label="GST Output Payable" value={Math.max(0, gstOut)} hint="GST collected on sales — payable to government (after setoff)." />
              <Sep />
              <Section title="Equity" />
              <Row label="Retained Earnings (Net Profit)" value={netProfit} hint="Cumulative profit reinvested into the business." />
              <Sep /><Row label="Total Liabilities + Equity" value={totalLiab + equity} bold />
              <div className={`mt-2 text-xs flex items-center gap-1.5 ${balanceCheck ? "text-primary" : "text-destructive"}`}>
                {balanceCheck ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {balanceCheck ? "Balance sheet equation balances (A = L + E)." : `Imbalance of ${inr(totalAssets - (totalLiab + equity))} — review unposted entries.`}
              </div>
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
            <div className={`px-4 py-2 text-xs flex items-center gap-1.5 ${tbBalanced ? "text-primary" : "text-destructive"}`}>
              {tbBalanced ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              {tbBalanced ? "Trial balance is in balance — every journal entry posts equal debits and credits." : "Trial balance is OUT of balance. Review recent journal entries (BLOCK rule per Standards §III)."}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  );
}

function Row({ label, value, bold, positive, hint }: { label: string; value: number; bold?: boolean; positive?: boolean; hint?: string }) {
  return <div className={`flex items-center justify-between py-1.5 ${bold ? "border-t font-semibold" : ""}`}>
    <span className="flex items-center gap-1.5">
      {label}
      {hint && (
        <Tooltip>
          <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
        </Tooltip>
      )}
    </span>
    <span className={`tabular-nums ${positive ? (value >= 0 ? "text-primary" : "text-destructive") : ""}`}>{inr(value)}</span>
  </div>;
}
function Sep() { return <div className="h-2" />; }
function Section({ title }: { title: string }) {
  return <div className="text-xs uppercase tracking-wide text-muted-foreground mt-2 mb-1">{title}</div>;
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "good" | "warn" | "bad" }) {
  const toneCls = tone === "good" ? "text-primary" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "bad" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {label}
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3 w-3 cursor-help" /></TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
          </Tooltip>
        </div>
        <div className={`text-xl font-semibold tabular-nums mt-1 ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ToneIcon({ tone }: { tone: "good" | "warn" | "bad" | "info" }) {
  if (tone === "good") return <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />;
  if (tone === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />;
  if (tone === "bad") return <TrendingDown className="h-4 w-4 text-destructive mt-0.5" />;
  return <Minus className="h-4 w-4 text-muted-foreground mt-0.5" />;
}

type Insight = { tone: "good" | "warn" | "bad" | "info"; title: string; body: string };
function buildInsights(x: {
  revenue: number; netProfit: number; grossMarginPct: number; netMarginPct: number;
  currentRatio: number; quickRatio: number; runwayMonths: number; revGrowthPct: number;
  ar: number; ap: number; netGstPayable: number; workingCapital: number;
  tbBalanced: boolean; balanceCheck: boolean;
  topExpense?: { k: string; v: number };
}): Insight[] {
  const out: Insight[] = [];

  if (x.grossMarginPct >= 20) out.push({ tone: "good", title: `Healthy gross margin (${fmt(x.grossMarginPct, 1)}%)`, body: "Pricing comfortably covers stock cost. Each ₹100 of sales produces ₹" + fmt(x.grossMarginPct, 1) + " before operating expenses." });
  else if (x.grossMarginPct >= 10) out.push({ tone: "warn", title: `Thin gross margin (${fmt(x.grossMarginPct, 1)}%)`, body: "Stone trading typically runs 18–30%. Review buyer-wise rate discounts, transport recovery and wastage accounting (AS 2)." });
  else out.push({ tone: "bad", title: `Critically low margin (${fmt(x.grossMarginPct, 1)}%)`, body: "Selling close to or below cost. Audit price lists, purchase rates, and third-party markups before raising more invoices." });

  if (x.netProfit >= 0) out.push({ tone: "good", title: `Profitable: net ${inr(x.netProfit)}`, body: `Net margin ${fmt(x.netMarginPct, 1)}%. Operating expenses are being absorbed by gross profit.` });
  else out.push({ tone: "bad", title: `Operating at a loss (${inr(x.netProfit)})`, body: "Gross profit isn't covering overheads. Cut discretionary expenses or push sales volume." });

  if (x.runwayMonths >= 6) out.push({ tone: "good", title: `Strong cash runway (${fmt(x.runwayMonths, 1)} months)`, body: "Liquid cash covers more than six months of operating spend even with zero new collections." });
  else if (x.runwayMonths >= 3) out.push({ tone: "warn", title: `Moderate runway (${fmt(x.runwayMonths, 1)} months)`, body: "Accelerate receivables collection and avoid large upfront purchases." });
  else out.push({ tone: "bad", title: `Tight runway (${isFinite(x.runwayMonths) ? fmt(x.runwayMonths, 1) + " months" : "no expense data"})`, body: "Prioritise collecting outstanding invoices and defer non-essential expenses." });

  if (isFinite(x.currentRatio)) {
    if (x.currentRatio >= 1.5) out.push({ tone: "good", title: `Liquidity comfortable (current ratio ${fmt(x.currentRatio, 2)})`, body: "Current assets exceed current liabilities by a safe margin." });
    else if (x.currentRatio >= 1) out.push({ tone: "warn", title: `Liquidity acceptable (${fmt(x.currentRatio, 2)})`, body: "Stay above 1.0; chase older receivables to widen the buffer." });
    else out.push({ tone: "bad", title: `Liquidity strained (${fmt(x.currentRatio, 2)})`, body: "Current liabilities exceed current assets — short-term solvency risk." });
  }

  const arApGap = x.ar - x.ap;
  if (arApGap > 0) out.push({ tone: "info", title: `Buyers owe ${inr(arApGap)} more than you owe suppliers`, body: "Funding suppliers' credit cycle out of your pocket. Tighten buyer payment terms or extend supplier credit." });
  else if (arApGap < 0) out.push({ tone: "good", title: `Supplier credit funding ${inr(-arApGap)} of working capital`, body: "Suppliers are effectively financing your operations — good leverage as long as bills are paid on time." });

  if (x.revGrowthPct >= 10) out.push({ tone: "good", title: `Revenue growing ${fmt(x.revGrowthPct, 1)}% QoQ`, body: "Last 90 days are tracking meaningfully above the prior 90 — sales engine is working." });
  else if (x.revGrowthPct <= -10) out.push({ tone: "bad", title: `Revenue declining ${fmt(Math.abs(x.revGrowthPct), 1)}% QoQ`, body: "Sales softening. Review buyer concentration, quote-to-order conversion, and price list discounts." });

  if (x.netGstPayable > 0) out.push({ tone: "info", title: `Net GST payable: ${inr(x.netGstPayable)}`, body: "Set aside this amount before the 20th of next month (GSTR-3B). Output GST > Input GST after setoff." });
  if (x.topExpense && x.topExpense.v > 0) out.push({ tone: "info", title: `Largest expense head: ${x.topExpense.k} (${inr(x.topExpense.v)})`, body: "Biggest controllable cost — first place to look for savings." });

  if (!x.tbBalanced) out.push({ tone: "bad", title: "Trial balance not balanced", body: "Per StoneWorld Standards Part III, every journal must post equal Dr/Cr. Review the most recent entries." });
  if (!x.balanceCheck) out.push({ tone: "warn", title: "Balance sheet equation drifting", body: "Assets ≠ Liabilities + Equity. Usually caused by un-posted inventory or GST entries." });

  return out;
}

function outlookNarrative(x: {
  revGrowthPct: number; netProfit: number; grossMarginPct: number; runwayMonths: number;
  currentRatio: number; arApDelta: number; netGstPayable: number;
}): string {
  const trend =
    x.revGrowthPct >= 10 ? "expanding"
      : x.revGrowthPct >= 0 ? "stable"
        : x.revGrowthPct >= -10 ? "softening"
          : "contracting";
  const profitability = x.netProfit >= 0 && x.grossMarginPct >= 15 ? "profitable" : x.netProfit >= 0 ? "marginally profitable" : "loss-making";
  const liquidity =
    isFinite(x.currentRatio) && x.currentRatio >= 1.5 ? "liquid and well-funded"
      : isFinite(x.currentRatio) && x.currentRatio >= 1 ? "adequately funded"
        : "liquidity-constrained";
  const direction =
    (x.revGrowthPct >= 0 && x.netProfit >= 0 && x.runwayMonths >= 3)
      ? "trending positively — compound the gains by reinvesting in inventory of fast-moving SKUs and tightening collection on Accounts Receivable"
      : (x.netProfit < 0 || x.runwayMonths < 3)
        ? "heading into a stress zone — focus the next 30 days on collections, cost cuts in the largest expense head, and pausing low-margin third-party deals"
        : "broadly sideways — protect cash, renegotiate supplier credit, and avoid new fixed overheads until margin improves";
  const wc = x.arApDelta > 0 ? `Working capital is tied up in buyer credit (${inr(x.arApDelta)} more in AR than AP). ` : "";
  const gst = x.netGstPayable > 0 ? `Reserve ${inr(x.netGstPayable)} for the upcoming GST payment cycle. ` : "";
  return `The business is currently ${profitability}, ${liquidity}, with revenue ${trend} over the last quarter. ${wc}${gst}On this trajectory the business is ${direction}.`;
}