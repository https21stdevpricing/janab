import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr, fmt } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Minus, Wallet, ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/app/reports")({ component: ReportsPage });

function ReportsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [saleItems, setSaleItems] = useState<any[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);
  const [purchaseHdr, setPurchaseHdr] = useState<any[]>([]);
  const [fixedAssets, setFixedAssets] = useState<any[]>([]);
  const [cogsMethod, setCogsMethod] = useState<"weighted_average" | "fifo">("weighted_average");

  useEffect(() => {
    supabase.from("ledger_view").select("*").then(({ data }) => setRows(data ?? []));
    supabase.from("products").select("id,name,kind,opening_stock,purchase_rate,sale_rate").then(({ data }) => setProducts(data ?? []));
    supabase.from("sale_items").select("product_id,qty").then(({ data }) => setSaleItems(data ?? []));
    supabase.from("purchase_items").select("product_id,qty,rate").then(({ data }) => setPurchaseItems(data ?? []));
    (supabase as any).from("purchase_items").select("product_id,qty,rate,purchases!inner(date)").then(({ data }: any) => setPurchaseHdr(data ?? []));
    (supabase as any).from("fixed_assets").select("*").then(({ data }: any) => setFixedAssets(data ?? []));
    (supabase as any).from("settings").select("cogs_method").maybeSingle().then(({ data }: any) => {
      if (data?.cogs_method) setCogsMethod(data.cogs_method);
    });
  }, []);

  const saveCogsMethod = async (m: "weighted_average" | "fifo") => {
    setCogsMethod(m);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await (supabase as any).from("settings").update({ cogs_method: m }).eq("user_id", user.id);
    if (error) toast.error(error.message); else toast.success(`COGS method: ${m === "fifo" ? "FIFO" : "Weighted Average"}`);
  };

  // ---------- AS 2: Inventory valuation (lower of cost or NRV) ----------
  const inventory = useMemo(() => {
    const soldByP: Record<string, number> = {};
    for (const s of saleItems) if (s.product_id) soldByP[s.product_id] = (soldByP[s.product_id] ?? 0) + Number(s.qty ?? 0);
    const purByP: Record<string, { qty: number; val: number }> = {};
    for (const p of purchaseItems) {
      if (!p.product_id) continue;
      const q = Number(p.qty ?? 0); const r = Number(p.rate ?? 0);
      purByP[p.product_id] ??= { qty: 0, val: 0 };
      purByP[p.product_id].qty += q;
      purByP[p.product_id].val += q * r;
    }
    // FIFO lots, sorted by date
    const lotsByP: Record<string, { qty: number; rate: number; date: string }[]> = {};
    for (const p of purchaseHdr) {
      if (!p.product_id) continue;
      (lotsByP[p.product_id] ??= []).push({ qty: Number(p.qty ?? 0), rate: Number(p.rate ?? 0), date: p.purchases?.date ?? "" });
    }

    let closingQty = 0, closingValue = 0, openingValue = 0, purchasesValue = 0;
    for (const pr of products) {
      if (pr.kind && pr.kind !== "stocked") continue;
      const opQty = Number(pr.opening_stock ?? 0);
      const pur = purByP[pr.id] ?? { qty: 0, val: 0 };
      const sold = soldByP[pr.id] ?? 0;
      const onHand = Math.max(0, opQty + pur.qty - sold);

      let unitVal: number;
      if (cogsMethod === "fifo") {
        // FIFO: oldest goes out first → newest lots remain as closing stock.
        let remaining = onHand;
        let value = 0;
        const lots = (lotsByP[pr.id] ?? []).slice().sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
        const openingLot = { qty: opQty, rate: Number(pr.purchase_rate ?? 0) };
        for (const l of [...lots, openingLot]) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, l.qty);
          value += take * l.rate;
          remaining -= take;
        }
        const unit = onHand > 0 ? value / onHand : 0;
        const nrv = Number(pr.sale_rate ?? 0) || unit;
        unitVal = Math.min(unit, nrv);
      } else {
        const avgCost = (opQty + pur.qty) > 0
          ? (opQty * Number(pr.purchase_rate ?? 0) + pur.val) / (opQty + pur.qty)
          : Number(pr.purchase_rate ?? 0);
        const nrv = Number(pr.sale_rate ?? 0) || avgCost;
        unitVal = Math.min(avgCost, nrv);
      }
      closingQty += onHand;
      closingValue += onHand * unitVal;
      openingValue += opQty * Number(pr.purchase_rate ?? 0);
      purchasesValue += pur.val;
    }
    return { closingQty, closingValue, openingValue, purchasesValue };
  }, [products, saleItems, purchaseItems, purchaseHdr, cogsMethod]);

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

  // Fixed assets summary
  const faSummary = useMemo(() => {
    const byCat: Record<string, { gross: number; accDep: number }> = {};
    let gross = 0, accDep = 0;
    for (const a of fixedAssets) {
      if (a.disposed_at) continue;
      const cat = a.category || "Other";
      byCat[cat] ??= { gross: 0, accDep: 0 };
      byCat[cat].gross += Number(a.cost ?? 0);
      byCat[cat].accDep += Number(a.accumulated_depreciation ?? 0);
      gross += Number(a.cost ?? 0);
      accDep += Number(a.accumulated_depreciation ?? 0);
    }
    return { byCat, gross, accDep, netBlock: gross - accDep };
  }, [fixedAssets]);

  const revenue = (sums["Sales Revenue"]?.c ?? 0) + (sums["TP Sales Revenue"]?.c ?? 0);
  const directSales = sums["Sales Revenue"]?.c ?? 0;
  const tpSales = sums["TP Sales Revenue"]?.c ?? 0;
  const directCogs = sums["Purchases"]?.d ?? 0;
  const tpCogs = sums["TP Purchases"]?.d ?? 0;
  const directCogs_AS2 = inventory.openingValue + directCogs - inventory.closingValue;
  const cogs = directCogs_AS2 + tpCogs;
  const grossProfit = revenue - cogs;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const expenseKeys = Object.keys(sums).filter(k => k.startsWith("Expenses:"));
  const expenses = expenseKeys.reduce((a, k) => a + sums[k].d - sums[k].c, 0);
  const depreciationExp = sums["Expenses: Depreciation"] ? sums["Expenses: Depreciation"].d - sums["Expenses: Depreciation"].c : 0;
  const netProfit = revenue - cogs - expenses;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const ar = bal("Accounts Receivable");
  const ap = balCr("Accounts Payable");
  const cash = bal("Cash"); const bank = bal("Bank");
  const gstInputAccts = ["Input CGST", "Input SGST", "Input IGST", "GST Input"];
  const gstOutputAccts = ["Output CGST", "Output SGST", "Output IGST", "GST Output"];
  const gstIn = sumAcc(gstInputAccts, "d") - sumAcc(gstInputAccts, "c");
  const gstOut = sumAcc(gstOutputAccts, "c") - sumAcc(gstOutputAccts, "d");
  const netGstPayable = gstOut - gstIn;

  const tbAll = Object.entries(sums).map(([acct, v]) => ({ acct, debit: v.d, credit: v.c, net: v.d - v.c }));
  const tbTotalD = tbAll.reduce((a, r) => a + r.debit, 0);
  const tbTotalC = tbAll.reduce((a, r) => a + r.credit, 0);
  const tbBalanced = Math.abs(tbTotalD - tbTotalC) < 0.01;

  const inventoryAsset = inventory.closingValue;
  const currentAssets = cash + bank + ar + inventoryAsset + Math.max(0, gstIn);
  const nonCurrentAssets = faSummary.netBlock;
  const totalAssets = currentAssets + nonCurrentAssets;
  const currentLiab = ap + Math.max(0, gstOut);
  const totalLiab = currentLiab;
  const equity = netProfit;
  const balanceCheck = Math.abs(totalAssets - (totalLiab + equity)) < 1;

  const today = new Date();
  const dCutoff = (days: number) => { const d = new Date(today); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); };
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

  const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : Infinity;
  const quickRatio = currentLiab > 0 ? (liquid + ar) / currentLiab : Infinity;
  const workingCapital = currentAssets - currentLiab;
  const arApDelta = ar - ap;
  const annualRev = rev90 * 4;
  const dso = annualRev > 0 ? (ar / annualRev) * 365 : 0;
  const dpo = cogs > 0 ? (ap / cogs) * 365 : 0;
  const dio = cogs > 0 ? (inventoryAsset / cogs) * 365 : 0;
  const ccc = dso + dio - dpo;

  const topExpense = expenseKeys
    .map(k => ({ k: k.replace("Expenses: ", ""), v: sums[k].d - sums[k].c }))
    .sort((a, b) => b.v - a.v)[0];

  const insights = buildInsights({
    revenue, netProfit, grossMarginPct, netMarginPct, currentRatio, quickRatio,
    runwayMonths, revGrowthPct, ar, ap, netGstPayable, workingCapital,
    tbBalanced, balanceCheck, topExpense,
  });

  return (
    <>
      <PageHeader title="Financial Reports" description="Auto-built from your ledger. Every figure is traceable to a journal entry." />

      {/* Trust strip — show data integrity at a glance */}
      <div className="mb-4 rounded-lg border bg-card overflow-hidden">
        <div className="flex flex-wrap gap-3 p-3 items-center justify-between border-b">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <IntegrityBadge ok={tbBalanced} okLabel="Trial balance matches" badLabel="Trial balance OFF" />
            <IntegrityBadge ok={balanceCheck} okLabel="Balance sheet balances (A = L + E)" badLabel="Balance sheet drift" />
            <span className="text-muted-foreground">Standards: AS 2 · AS 9 · AS 10 · GST 2017</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Inventory method:</span>
            <Select value={cogsMethod} onValueChange={(v) => saveCogsMethod(v as any)}>
              <SelectTrigger className="h-8 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weighted_average">Weighted Average</SelectItem>
                <SelectItem value="fifo">FIFO</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/30">
          Closing stock is valued at the lower of cost or net realisable value (AS 2). Changing the method instantly recomputes COGS and Gross Profit.
        </div>
      </div>

      <Tabs defaultValue="outlook">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="outlook">Overview</TabsTrigger>
          <TabsTrigger value="pnl">Profit &amp; Loss</TabsTrigger>
          <TabsTrigger value="bs">Balance Sheet</TabsTrigger>
          <TabsTrigger value="wc">Working Capital</TabsTrigger>
          <TabsTrigger value="tb">Trial Balance</TabsTrigger>
        </TabsList>

        <TabsContent value="outlook" className="space-y-4">
          {/* Headline card — single source of truth */}
          <Card>
            <CardContent className="p-5">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <Headline label="Revenue" value={inr(revenue)} sub="Total billed to date" />
                <Headline label="Net Profit" value={inr(netProfit)} sub={`Margin ${fmt(netMarginPct, 1)}%`} tone={netProfit >= 0 ? "good" : "bad"} />
                <Headline label="Cash + Bank" value={inr(liquid)} sub={isFinite(runwayMonths) ? `${fmt(runwayMonths, 1)} months runway` : "No recent OPEX"} tone={runwayMonths >= 3 ? "good" : "bad"} />
                <Headline label="You're owed − you owe" value={inr(arApDelta)} sub={arApDelta >= 0 ? "Net cash inflow expected" : "Net cash outflow expected"} tone={arApDelta >= 0 ? "good" : "warn"} />
              </div>
            </CardContent>
          </Card>

          {/* Health meters — plain language under each */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MeterCard label="Gross Margin" value={`${fmt(grossMarginPct, 1)}%`} status={statusFor(grossMarginPct, 20, 10)}
              meaning={grossMarginPct >= 20 ? "Pricing safely above stock cost." : grossMarginPct >= 10 ? "Margins thin — review pricing." : "Selling near or below cost."} />
            <MeterCard label="Current Ratio" value={isFinite(currentRatio) ? fmt(currentRatio, 2) : "∞"} status={statusFor(currentRatio, 1.5, 1)}
              meaning={currentRatio >= 1.5 ? "Plenty of cushion to pay dues." : currentRatio >= 1 ? "Can just about meet dues." : "Short-term dues exceed cash + receivables."} />
            <MeterCard label="Revenue Trend (90d)" value={`${revGrowthPct >= 0 ? "+" : ""}${fmt(revGrowthPct, 1)}%`} status={statusFor(revGrowthPct, 5, -5)}
              meaning={revGrowthPct >= 5 ? "Sales growing quarter-on-quarter." : revGrowthPct >= -5 ? "Sales roughly flat." : "Sales declining — investigate."} />
            <MeterCard label="GST Payable" value={inr(Math.max(0, netGstPayable))} status={netGstPayable <= 0 ? "good" : "warn"}
              meaning={netGstPayable <= 0 ? "Input credit covers liability." : "Reserve before GSTR-3B due date."} />
          </div>

          {/* What to do — prioritized action list */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">What to do next</CardTitle>
              <div className="text-xs text-muted-foreground">Ranked by impact on your cash and profit.</div>
            </CardHeader>
            <CardContent className="divide-y">
              {insights.map((it, i) => (
                <div key={i} className="flex gap-3 items-start py-3">
                  <ToneIcon tone={it.tone} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{it.title}</div>
                    <div className="text-xs text-muted-foreground leading-relaxed mt-0.5">{it.body}</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Plain-English summary */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">In one paragraph</CardTitle></CardHeader>
            <CardContent className="text-sm leading-relaxed text-muted-foreground">
              {outlookNarrative({ revGrowthPct, netProfit, grossMarginPct, runwayMonths, currentRatio, arApDelta, netGstPayable })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pnl">
          <Card>
            <CardHeader><CardTitle>Profit &amp; Loss</CardTitle></CardHeader>
            <CardContent>
              <Section title="Revenue (AS 9 — recognised on invoice raise)" />
              <Row label="Direct Sales Revenue" value={directSales} hint="Sales of your own stock." />
              <Row label="Third-Party Sales Revenue" value={tpSales} hint="Drop-ship sales — supplier ships directly to your buyer." />
              <Row label="Total Revenue" value={revenue} bold />
              <Sep />
              <Section title={`Cost of Goods Sold (AS 2 · ${cogsMethod === "fifo" ? "FIFO" : "Weighted Avg"})`} />
              <Row label="Opening Stock" value={-inventory.openingValue} hint="Inventory carried in at the start (at cost, AS 2)." />
              <Row label="Add: Purchases" value={-directCogs} hint="All stock bought during the period." />
              <Row label="Less: Closing Stock" value={inventory.closingValue} hint="Unsold inventory at period end (AS 2: lower of cost or NRV)." />
              <Row label="Direct COGS" value={-directCogs_AS2} bold hint="Opening + Purchases − Closing." />
              <Row label="TP Purchases (drop-ship cost)" value={-tpCogs} hint="Cost paid to supplier in third-party trades." />
              <Row label="Gross Profit" value={grossProfit} bold positive hint={`Gross Margin: ${fmt(grossMarginPct, 1)}%.`} />
              <Sep />
              <Section title="Operating Expenses" />
              {expenseKeys.map(k => <Row key={k} label={k.replace("Expenses: ", "")} value={-(sums[k].d - sums[k].c)} />)}
              <Row label="Total Expenses" value={-expenses} bold />
              {depreciationExp > 0 && <div className="text-[11px] text-muted-foreground pl-2 mt-1">Includes ₹{fmt(depreciationExp)} depreciation on fixed assets (AS 10).</div>}
              <Sep />
              <Row label="Net Profit" value={netProfit} bold positive hint={`Net Margin: ${fmt(netMarginPct, 1)}%.`} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bs">
          <div className="grid md:grid-cols-2 gap-4">
            <Card><CardHeader><CardTitle>Assets</CardTitle></CardHeader><CardContent>
              <Section title="Current Assets" />
              <Row label="Cash in Hand" value={cash} hint="Physical cash with the business." />
              <Row label="Bank Balance" value={bank} hint="Funds in current/savings accounts." />
              <Row label="Accounts Receivable" value={ar} hint="Money buyers owe you." />
              <Row label="Inventory (Closing Stock)" value={inventoryAsset} hint={`AS 2 — lower of cost or NRV. ${fmt(inventory.closingQty, 2)} units on hand.`} />
              <Row label="GST Input Credit" value={Math.max(0, gstIn)} hint="GST paid on purchases — recoverable." />
              <Row label="Total Current Assets" value={currentAssets} bold />
              <Sep />
              <Section title="Non-Current Assets (Fixed Assets — AS 10)" />
              {Object.entries(faSummary.byCat).length === 0
                ? <div className="text-xs text-muted-foreground py-1">No fixed assets recorded. Add machinery, vehicles or equipment in the Fixed Assets page.</div>
                : Object.entries(faSummary.byCat).map(([cat, v]) => (
                    <Row key={cat} label={cat} value={v.gross - v.accDep} hint={`Gross ₹${fmt(v.gross)} − Accum dep ₹${fmt(v.accDep)}`} />
                  ))}
              {faSummary.gross > 0 && <Row label="Net Block (Fixed Assets)" value={faSummary.netBlock} bold />}
              <Sep /><Row label="Total Assets" value={totalAssets} bold />
            </CardContent></Card>
            <Card><CardHeader><CardTitle>Liabilities &amp; Equity</CardTitle></CardHeader><CardContent>
              <Section title="Current Liabilities" />
              <Row label="Accounts Payable" value={ap} hint="Owed to suppliers." />
              <Row label="GST Output Payable" value={Math.max(0, gstOut)} hint="GST collected on sales — payable to government." />
              <Row label="Total Current Liabilities" value={currentLiab} bold />
              <Sep />
              <Section title="Equity" />
              <Row label="Retained Earnings (Net Profit)" value={netProfit} hint="Cumulative profit reinvested." />
              <Sep /><Row label="Total Liabilities + Equity" value={totalLiab + equity} bold />
              <div className={`mt-2 text-xs flex items-center gap-1.5 ${balanceCheck ? "text-primary" : "text-destructive"}`}>
                {balanceCheck ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {balanceCheck ? "Balance sheet equation balances (A = L + E)." : `Imbalance of ${inr(totalAssets - (totalLiab + equity))} — review unposted entries.`}
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="wc" className="space-y-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Working Capital" value={inr(workingCapital)} tone={workingCapital >= 0 ? "good" : "bad"} hint="Current Assets − Current Liabilities." />
            <Kpi label="Current Ratio" value={isFinite(currentRatio) ? fmt(currentRatio, 2) : "∞"} tone={currentRatio >= 1.5 ? "good" : currentRatio >= 1 ? "warn" : "bad"} hint="CA ÷ CL." />
            <Kpi label="Quick (Acid Test)" value={isFinite(quickRatio) ? fmt(quickRatio, 2) : "∞"} tone={quickRatio >= 1 ? "good" : quickRatio >= 0.7 ? "warn" : "bad"} hint="(Cash+Bank+AR) ÷ CL." />
            <Kpi label="Cash Conversion Cycle" value={`${fmt(ccc, 0)} days`} tone={ccc <= 60 ? "good" : ccc <= 90 ? "warn" : "bad"} hint="DSO + DIO − DPO." />
          </div>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Working capital composition</CardTitle></CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Section title="Current Assets" />
                  <Row label="Cash in Hand" value={cash} />
                  <Row label="Bank Balance" value={bank} />
                  <Row label="Receivables (AR)" value={ar} />
                  <Row label="Inventory" value={inventoryAsset} />
                  <Row label="GST Input Credit" value={Math.max(0, gstIn)} />
                  <Row label="Total CA" value={currentAssets} bold />
                </div>
                <div>
                  <Section title="Current Liabilities" />
                  <Row label="Payables (AP)" value={ap} />
                  <Row label="GST Output Payable" value={Math.max(0, gstOut)} />
                  <Row label="Total CL" value={currentLiab} bold />
                  <Sep />
                  <Section title="Net Working Capital" />
                  <Row label="CA − CL" value={workingCapital} bold positive />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Activity ratios (cash cycle)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Row label="Days Sales Outstanding (DSO)" value={dso} hint="Average days to collect from buyers. Target: ≤45 days." />
              <Row label="Days Inventory Outstanding (DIO)" value={dio} hint="Days stock sits before being sold." />
              <Row label="Days Payable Outstanding (DPO)" value={dpo} hint="Days you take to pay suppliers." />
              <Row label="Cash Conversion Cycle (CCC)" value={ccc} bold hint="DSO + DIO − DPO. Lower is better." />
              <div className="text-xs text-muted-foreground pt-2 border-t mt-2">
                Suggestion: {ccc > 90
                  ? "Cycle is long — push for advance payments, tighten credit terms, clear slow-moving SKUs."
                  : ccc > 60
                  ? "Cycle is moderate — chase invoices >30 days old and negotiate longer supplier terms."
                  : "Cycle is tight — cash recycles well. Reinvest the freed-up cash into fast-moving inventory."}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Fixed Assets snapshot</CardTitle></CardHeader>
            <CardContent>
              {faSummary.gross === 0 ? (
                <div className="text-sm text-muted-foreground">No fixed assets capitalised yet. Add machinery, vehicles or equipment from the Fixed Assets page.</div>
              ) : (
                <div className="grid sm:grid-cols-3 gap-3">
                  <Kpi label="Gross block" value={inr(faSummary.gross)} hint="Total acquisition cost." />
                  <Kpi label="Accumulated depreciation" value={inr(faSummary.accDep)} tone="warn" hint="Wear-and-tear booked to date (AS 10)." />
                  <Kpi label="Net block" value={inr(faSummary.netBlock)} tone="good" hint="Gross − Accumulated dep." />
                </div>
              )}
            </CardContent>
          </Card>
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
              {tbBalanced ? "Trial balance is in balance." : "Trial balance is OUT of balance. Review recent journal entries."}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Row({ label, value, bold, positive, hint }: { label: string; value: number; bold?: boolean; positive?: boolean; hint?: string }) {
  return <div className={`flex items-center justify-between py-1.5 ${bold ? "border-t font-semibold" : ""}`}>
    <span className="flex items-center gap-1.5">
      {label}
      {hint && <HintTip text={hint} />}
    </span>
    <span className={`tabular-nums ${positive ? (value >= 0 ? "text-primary" : "text-destructive") : ""}`}>{inr(value)}</span>
  </div>;
}
function Sep() { return <div className="h-2" />; }
function Section({ title }: { title: string }) {
  return <div className="text-xs uppercase tracking-wide text-muted-foreground mt-2 mb-1">{title}</div>;
}

function HintTip({ text, small }: { text: string; small?: boolean }) {
  const size = small ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="More info" className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground focus:outline-none" onClick={(e) => e.stopPropagation()}>
          <Info className={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="max-w-xs text-xs leading-relaxed">{text}</PopoverContent>
    </Popover>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: "good" | "warn" | "bad" }) {
  const toneCls = tone === "good" ? "text-primary" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "bad" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
          {label}
          <HintTip text={hint} small />
        </div>
        <div className={`text-xl font-semibold tabular-nums mt-1 ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Headline({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const toneCls = tone === "good" ? "text-primary" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "bad" ? "text-destructive" : "";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${toneCls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function MeterCard({ label, value, status, meaning }: { label: string; value: string; status: "good" | "warn" | "bad"; meaning: string }) {
  const ring = status === "good" ? "border-l-primary" : status === "warn" ? "border-l-amber-500" : "border-l-destructive";
  const valueTone = status === "good" ? "text-primary" : status === "warn" ? "text-amber-600 dark:text-amber-400" : "text-destructive";
  return (
    <Card className={`border-l-4 ${ring}`}>
      <CardContent className="p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`text-xl font-semibold tabular-nums mt-1 ${valueTone}`}>{value}</div>
        <div className="text-xs text-muted-foreground mt-1 leading-snug">{meaning}</div>
      </CardContent>
    </Card>
  );
}

function statusFor(v: number, goodAt: number, warnAt: number): "good" | "warn" | "bad" {
  if (!isFinite(v)) return "good";
  if (v >= goodAt) return "good";
  if (v >= warnAt) return "warn";
  return "bad";
}

function IntegrityBadge({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${ok ? "text-primary" : "text-destructive"}`}>
      {ok ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
      <span className="font-medium">{ok ? okLabel : badLabel}</span>
    </span>
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
  if (x.grossMarginPct >= 20) out.push({ tone: "good", title: `Healthy gross margin (${fmt(x.grossMarginPct, 1)}%)`, body: "Pricing comfortably covers stock cost." });
  else if (x.grossMarginPct >= 10) out.push({ tone: "warn", title: `Thin gross margin (${fmt(x.grossMarginPct, 1)}%)`, body: "Stone trading typically runs 18–30%. Review buyer-wise discounts and wastage." });
  else out.push({ tone: "bad", title: `Critically low margin (${fmt(x.grossMarginPct, 1)}%)`, body: "Audit price lists, purchase rates and TP markups before raising more invoices." });

  if (x.netProfit >= 0) out.push({ tone: "good", title: `Profitable: net ${inr(x.netProfit)}`, body: `Net margin ${fmt(x.netMarginPct, 1)}%.` });
  else out.push({ tone: "bad", title: `Operating at a loss (${inr(x.netProfit)})`, body: "Gross profit isn't covering overheads." });

  if (x.runwayMonths >= 6) out.push({ tone: "good", title: `Strong cash runway (${fmt(x.runwayMonths, 1)} months)`, body: "Liquid cash covers more than six months of OPEX." });
  else if (x.runwayMonths >= 3) out.push({ tone: "warn", title: `Moderate runway (${fmt(x.runwayMonths, 1)} months)`, body: "Accelerate receivables; avoid large upfront purchases." });
  else out.push({ tone: "bad", title: `Tight runway`, body: "Prioritise collecting outstanding invoices and defer non-essential expenses." });

  if (isFinite(x.currentRatio)) {
    if (x.currentRatio >= 1.5) out.push({ tone: "good", title: `Liquidity comfortable (CR ${fmt(x.currentRatio, 2)})`, body: "Current assets safely exceed current liabilities." });
    else if (x.currentRatio >= 1) out.push({ tone: "warn", title: `Liquidity acceptable (${fmt(x.currentRatio, 2)})`, body: "Stay above 1.0; chase older receivables." });
    else out.push({ tone: "bad", title: `Liquidity strained (${fmt(x.currentRatio, 2)})`, body: "Current liabilities exceed current assets." });
  }

  const arApGap = x.ar - x.ap;
  if (arApGap > 0) out.push({ tone: "info", title: `Buyers owe ${inr(arApGap)} more than you owe suppliers`, body: "Funding supplier credit out of pocket. Tighten buyer terms." });
  else if (arApGap < 0) out.push({ tone: "good", title: `Supplier credit funding ${inr(-arApGap)} of WC`, body: "Suppliers are financing operations — good leverage." });

  if (x.revGrowthPct >= 10) out.push({ tone: "good", title: `Revenue growing ${fmt(x.revGrowthPct, 1)}% QoQ`, body: "Sales engine working." });
  else if (x.revGrowthPct <= -10) out.push({ tone: "bad", title: `Revenue declining ${fmt(Math.abs(x.revGrowthPct), 1)}% QoQ`, body: "Review buyer concentration and quote-conversion." });

  if (x.netGstPayable > 0) out.push({ tone: "info", title: `Net GST payable: ${inr(x.netGstPayable)}`, body: "Set aside before the 20th of next month (GSTR-3B)." });
  if (x.topExpense && x.topExpense.v > 0) out.push({ tone: "info", title: `Largest expense head: ${x.topExpense.k} (${inr(x.topExpense.v)})`, body: "First place to look for cost savings." });

  if (!x.tbBalanced) out.push({ tone: "bad", title: "Trial balance not balanced", body: "Every journal must post equal Dr/Cr." });
  if (!x.balanceCheck) out.push({ tone: "warn", title: "Balance sheet equation drifting", body: "Usually caused by un-posted inventory or GST entries." });

  return out;
}

function outlookNarrative(x: {
  revGrowthPct: number; netProfit: number; grossMarginPct: number; runwayMonths: number;
  currentRatio: number; arApDelta: number; netGstPayable: number;
}): string {
  const trend = x.revGrowthPct >= 10 ? "expanding" : x.revGrowthPct >= 0 ? "stable" : x.revGrowthPct >= -10 ? "softening" : "contracting";
  const profitability = x.netProfit >= 0 && x.grossMarginPct >= 15 ? "profitable" : x.netProfit >= 0 ? "marginally profitable" : "loss-making";
  const liquidity = isFinite(x.currentRatio) && x.currentRatio >= 1.5 ? "liquid and well-funded" : isFinite(x.currentRatio) && x.currentRatio >= 1 ? "adequately funded" : "liquidity-constrained";
  const direction = (x.revGrowthPct >= 0 && x.netProfit >= 0 && x.runwayMonths >= 3)
    ? "trending positively — compound the gains by reinvesting in fast-moving SKUs and tightening AR collection"
    : (x.netProfit < 0 || x.runwayMonths < 3)
      ? "heading into a stress zone — focus the next 30 days on collections, cost cuts and pausing low-margin TP deals"
      : "broadly sideways — protect cash and avoid new fixed overheads until margin improves";
  const wc = x.arApDelta > 0 ? `Working capital is tied up in buyer credit (${inr(x.arApDelta)} more in AR than AP). ` : "";
  const gst = x.netGstPayable > 0 ? `Reserve ${inr(x.netGstPayable)} for the upcoming GST cycle. ` : "";
  return `The business is currently ${profitability}, ${liquidity}, with revenue ${trend} over the last quarter. ${wc}${gst}On this trajectory the business is ${direction}.`;
}
