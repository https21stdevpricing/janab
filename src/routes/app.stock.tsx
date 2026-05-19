import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt, fmtDate, inr } from "@/lib/format";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, X, History, Info, AlertTriangle, PackageCheck, Wallet, Layers } from "lucide-react";
import { lookupDoc, type DocLookupResult } from "@/lib/doc-lookup";
import { DocDetail } from "@/routes/app.lookup";

export const Route = createFileRoute("/app/stock")({ component: StockPage });

type StockRow = {
  product_id: string; code: string; name: string; unit: string;
  opening_stock: number; purchased: number; sold: number; on_hand: number;
  reorder_level: number;
};
type ProdMeta = { purchase_rate: number; sale_rate: number; category: string | null };
type Move = {
  date: string; kind: "Purchase" | "Sale"; doc_no: string; party: string;
  qty: number; rate: number;
};

function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [meta, setMeta] = useState<Record<string, ProdMeta>>({});
  const [q, setQ] = useState("");
  const [showLow, setShowLow] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "on_hand_desc" | "value_desc" | "low_first">("name");
  const [valuation, setValuation] = useState<"cost" | "sale">("cost");
  const [cogsMethod, setCogsMethod] = useState<"weighted_average" | "fifo">("weighted_average");
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [preview, setPreview] = useState<DocLookupResult | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: sv }, { data: ps }, { data: st }] = await Promise.all([
        supabase.from("stock_view").select("*").order("name"),
        supabase.from("products").select("id,purchase_rate,sale_rate,category"),
        supabase.from("settings").select("cogs_method").maybeSingle(),
      ]);
      setRows((sv ?? []) as any);
      const m: Record<string, ProdMeta> = {};
      for (const p of (ps ?? []) as any[]) m[p.id] = { purchase_rate: Number(p.purchase_rate ?? 0), sale_rate: Number(p.sale_rate ?? 0), category: p.category ?? null };
      setMeta(m);
      if (st?.cogs_method === "fifo" || st?.cogs_method === "weighted_average") setCogsMethod(st.cogs_method);
    })();
  }, []);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) { const c = meta[r.product_id]?.category; if (c) s.add(c); }
    return Array.from(s).sort();
  }, [rows, meta]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = rows.filter(r => {
      if (showLow && Number(r.on_hand) > Number(r.reorder_level ?? 0)) return false;
      if (category !== "all" && (meta[r.product_id]?.category ?? "") !== category) return false;
      if (ql && !`${r.code} ${r.name}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      const pa = meta[a.product_id], pb = meta[b.product_id];
      const rateA = pa ? (valuation === "cost" ? pa.purchase_rate : pa.sale_rate) : 0;
      const rateB = pb ? (valuation === "cost" ? pb.purchase_rate : pb.sale_rate) : 0;
      switch (sort) {
        case "on_hand_desc": return Number(b.on_hand) - Number(a.on_hand);
        case "value_desc": return (Number(b.on_hand) * rateB) - (Number(a.on_hand) * rateA);
        case "low_first": {
          const la = Number(a.on_hand) <= Number(a.reorder_level ?? 0) ? 0 : 1;
          const lb = Number(b.on_hand) <= Number(b.reorder_level ?? 0) ? 0 : 1;
          return la - lb || a.name.localeCompare(b.name);
        }
        default: return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [rows, q, showLow, category, sort, valuation, meta]);

  const summary = useMemo(() => {
    let onHand = 0, valueCost = 0, valueSale = 0, lowCount = 0, skus = rows.length, zero = 0;
    for (const r of rows) {
      onHand += Number(r.on_hand);
      const pm = meta[r.product_id];
      if (pm) { valueCost += Number(r.on_hand) * pm.purchase_rate; valueSale += Number(r.on_hand) * pm.sale_rate; }
      if (Number(r.on_hand) <= Number(r.reorder_level ?? 0)) lowCount++;
      if (Number(r.on_hand) <= 0) zero++;
    }
    return { onHand, valueCost, valueSale, lowCount, skus, zero };
  }, [rows, meta]);

  const openMovements = async (r: StockRow) => {
    setSelected(r); setMoves([]);
    const [{ data: pi }, { data: si }] = await Promise.all([
      supabase.from("purchase_items").select("qty,rate,purchases!inner(po_no,date,supplier_name)").eq("product_id", r.product_id) as any,
      supabase.from("sale_items").select("qty,rate,sales!inner(invoice_no,date,buyer_name)").eq("product_id", r.product_id) as any,
    ]);
    const arr: Move[] = [];
    for (const x of (pi ?? []) as any[]) arr.push({ date: x.purchases.date, kind: "Purchase", doc_no: x.purchases.po_no, party: x.purchases.supplier_name ?? "—", qty: Number(x.qty), rate: Number(x.rate ?? 0) });
    for (const x of (si ?? []) as any[]) arr.push({ date: x.sales.date, kind: "Sale", doc_no: x.sales.invoice_no, party: x.sales.buyer_name ?? "—", qty: Number(x.qty), rate: Number(x.rate ?? 0) });
    arr.sort((a, b) => (a.date < b.date ? 1 : -1));
    setMoves(arr);
  };

  const onExport = () => exportToExcel({
    filename: `stock-${new Date().toISOString().slice(0, 10)}`,
    sheetName: "Stock",
    columns: [
      { header: "Code", key: "code" }, { header: "Name", key: "name" }, { header: "Unit", key: "unit" },
      { header: "Opening", key: "opening_stock" }, { header: "Purchased", key: "purchased" },
      { header: "Sold", key: "sold" }, { header: "On Hand", key: "on_hand" },
      { header: "Reorder", key: "reorder_level" },
      { header: "Cost Value", key: "cost", get: (r: StockRow) => Number(r.on_hand) * (meta[r.product_id]?.purchase_rate ?? 0) },
      { header: "Sale Value", key: "sale", get: (r: StockRow) => Number(r.on_hand) * (meta[r.product_id]?.sale_rate ?? 0) },
    ],
    rows: filtered,
  });

  // Running on-hand for movement table (chronological order)
  const movementsWithRun = useMemo(() => {
    const opening = selected ? Number(selected.opening_stock ?? 0) : 0;
    const chrono = [...moves].sort((a, b) => (a.date < b.date ? -1 : 1));
    let run = opening;
    const annotated = chrono.map(m => {
      run += m.kind === "Purchase" ? m.qty : -m.qty;
      return { ...m, running: run };
    });
    return annotated.reverse();
  }, [moves, selected]);

  return (
    <div>
      <PageHeader title={<span className="inline-flex items-center gap-2"><Boxes className="h-4 w-4" /> Inventory</span>}
        description="Live on-hand, valuation, low-stock alerts and full movement history per SKU. Third-party trades are excluded — those goods never enter your yard."
        actions={<ExcelBar onExport={onExport} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Tile icon={<Layers className="h-3.5 w-3.5" />} label="SKUs tracked" sub={`${summary.zero} at zero`} value={String(summary.skus)} />
        <Tile icon={<PackageCheck className="h-3.5 w-3.5" />} label="Units on hand" sub="Across all SKUs" value={fmt(summary.onHand)} />
        <Tile icon={<Wallet className="h-3.5 w-3.5" />} label={valuation === "cost" ? "Inventory value (cost)" : "Inventory value (sale)"}
              sub={valuation === "cost" ? "AS 2 · lower of cost / NRV" : "At current sale rate"}
              value={inr(valuation === "cost" ? summary.valueCost : summary.valueSale)} tone={valuation === "sale" ? "good" : undefined} />
        <Tile icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Low-stock items" sub={`${summary.lowCount} need attention`}
              value={String(summary.lowCount)} tone={summary.lowCount > 0 ? "bad" : undefined} />
      </div>

      {/* How this is calculated */}
      <Accordion type="single" collapsible className="rounded-md border bg-card mb-3">
        <AccordionItem value="calc" className="border-0">
          <AccordionTrigger className="px-3 py-2 hover:no-underline">
            <span className="inline-flex items-center gap-2 text-xs font-medium">
              <Info className="h-3.5 w-3.5 text-primary" /> How these numbers are calculated
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-3 pb-3">
            <div className="grid gap-3 sm:grid-cols-2 text-xs text-muted-foreground">
              <Calc title="On hand (per SKU)" formula="opening_stock + Σ purchase_qty − Σ sale_qty"
                    note="Third-party (TP) trades never enter or leave your yard, so they are excluded by design." />
              <Calc title="Units on hand (total)" formula="Σ on_hand across all SKUs" note="Mixed units are summed numerically — group by unit in the table when comparing." />
              <Calc title={`Inventory value — cost (${cogsMethod === "fifo" ? "FIFO" : "Weighted Average"})`}
                    formula="on_hand × unit_cost"
                    note={cogsMethod === "fifo"
                      ? "FIFO: remaining stock is valued from the newest purchase lots backward (oldest costs flow to COGS first). Per AS 2, each SKU is capped at NRV (Net Realisable Value ≈ current sale rate)."
                      : "Weighted Average: unit_cost = (opening_value + Σ purchase_value) ÷ (opening_qty + Σ purchase_qty). Per AS 2, each SKU is capped at the lower of cost or NRV (≈ sale rate)."} />
              <Calc title="Inventory value — sale" formula="on_hand × current sale_rate"
                    note="Indicative top-line if all stock were sold today at the saved sale rate. Not a book value." />
              <Calc title="Low-stock flag" formula="on_hand ≤ reorder_level"
                    note="Edit reorder_level on the product card. SKUs with no reorder level set use 0 (never trigger)." />
              <Calc title="Movement running balance" formula="opening_stock + Σ in − Σ out (chronological)"
                    note="Open any SKU to audit every Purchase / Sale that touched its on-hand position." />
            </div>
            <div className="mt-3 text-[11px] text-muted-foreground border-t pt-2">
              Standards applied: <b>AS 2 Inventory Valuation</b> (lower of cost or NRV) ·
              COGS method active: <b className="text-foreground">{cogsMethod === "fifo" ? "FIFO" : "Weighted Average"}</b>
              {" — change it in Reports → Settings."}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Toolbar */}
      <div className="rounded-md border bg-card p-2 mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Search code or name…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs h-8" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={v => setSort(v as any)}>
          <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name (A→Z)</SelectItem>
            <SelectItem value="on_hand_desc">Sort: On hand (high→low)</SelectItem>
            <SelectItem value="value_desc">Sort: Value (high→low)</SelectItem>
            <SelectItem value="low_first">Sort: Low-stock first</SelectItem>
          </SelectContent>
        </Select>
        <Select value={valuation} onValueChange={v => setValuation(v as any)}>
          <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cost">Value at cost</SelectItem>
            <SelectItem value="sale">Value at sale</SelectItem>
          </SelectContent>
        </Select>
        <Button variant={showLow ? "default" : "outline"} size="sm" onClick={() => setShowLow(v => !v)}>
          <AlertTriangle className="h-3.5 w-3.5" /> Only low-stock
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} of {rows.length} shown</div>
      </div>

      {filtered.length === 0 ? <Empty>No products match.</Empty> : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-2">Product</th>
                <th className="text-right p-2">Opening</th>
                <th className="text-right p-2">In</th>
                <th className="text-right p-2">Out</th>
                <th className="text-right p-2">On hand</th>
                <th className="text-right p-2">Unit {valuation === "cost" ? "cost" : "sale"}</th>
                <th className="text-right p-2">Line value</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const low = Number(r.on_hand) <= Number(r.reorder_level ?? 0);
                const pm = meta[r.product_id];
                const rate = pm ? (valuation === "cost" ? pm.purchase_rate : pm.sale_rate) : 0;
                const lineV = Number(r.on_hand) * rate;
                return (
                  <tr key={r.product_id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{r.code} · {r.unit}{pm?.category ? ` · ${pm.category}` : ""}</div>
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(r.opening_stock)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">+{fmt(r.purchased)}</td>
                    <td className="p-2 text-right tabular-nums text-destructive">−{fmt(r.sold)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {fmt(r.on_hand)} {low && <Badge variant="destructive" className="ml-1 text-[10px]">Low</Badge>}
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{inr(rate)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">{inr(lineV)}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openMovements(r)}><History className="h-3.5 w-3.5" /> Movements</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 text-xs">
                <td className="p-2 font-medium">Totals (filtered)</td>
                <td className="p-2 text-right tabular-nums">{fmt(filtered.reduce((s, r) => s + Number(r.opening_stock), 0))}</td>
                <td className="p-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">+{fmt(filtered.reduce((s, r) => s + Number(r.purchased), 0))}</td>
                <td className="p-2 text-right tabular-nums text-destructive">−{fmt(filtered.reduce((s, r) => s + Number(r.sold), 0))}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{fmt(filtered.reduce((s, r) => s + Number(r.on_hand), 0))}</td>
                <td className="p-2"></td>
                <td className="p-2 text-right tabular-nums font-semibold">{inr(filtered.reduce((s, r) => {
                  const pm = meta[r.product_id]; const rate = pm ? (valuation === "cost" ? pm.purchase_rate : pm.sale_rate) : 0;
                  return s + Number(r.on_hand) * rate;
                }, 0))}</td>
                <td className="p-2"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <DialogTitle className="text-sm font-medium">
              {selected?.name} <span className="font-mono text-xs text-muted-foreground">{selected?.code}</span>
            </DialogTitle>
            <button className="rounded-md p-1 hover:bg-muted" onClick={() => setSelected(null)} aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          {selected && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Tile label="Opening" value={fmt(selected.opening_stock)} />
                <Tile label="Purchased" value={fmt(selected.purchased)} tone="good" />
                <Tile label="Sold" value={fmt(selected.sold)} tone="bad" />
                <Tile label="On hand" value={fmt(selected.on_hand)} />
              </div>
              {movementsWithRun.length === 0 ? <Empty>No movements yet.</Empty> : (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-muted/40 text-xs uppercase">
                      <tr>
                        <th className="text-left p-2">Date</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Doc</th>
                        <th className="text-left p-2">Party</th>
                        <th className="text-right p-2">Qty</th>
                        <th className="text-right p-2">Rate</th>
                        <th className="text-right p-2">Running</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movementsWithRun.map((m, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 whitespace-nowrap">{fmtDate(m.date)}</td>
                          <td className="p-2">
                            {m.kind === "Purchase"
                              ? <Badge variant="secondary"><ArrowDownToLine className="h-3 w-3 mr-1" /> In</Badge>
                              : <Badge variant="outline" className="text-destructive border-destructive/40"><ArrowUpFromLine className="h-3 w-3 mr-1" /> Out</Badge>}
                          </td>
                          <td className="p-2">
                            <button className="font-mono text-primary hover:underline" onClick={async () => { const r = await lookupDoc(m.doc_no); if (r) setPreview(r); }}>{m.doc_no}</button>
                          </td>
                          <td className="p-2 truncate max-w-[200px]">{m.party}</td>
                          <td className={`p-2 text-right tabular-nums ${m.kind === "Purchase" ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                            {m.kind === "Purchase" ? "+" : "−"}{fmt(m.qty)}
                          </td>
                          <td className="p-2 text-right tabular-nums">{fmt(m.rate)}</td>
                          <td className="p-2 text-right tabular-nums font-medium">{fmt(m.running)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <DialogTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Document preview</DialogTitle>
            <button className="rounded-md p-1 hover:bg-muted" onClick={() => setPreview(null)} aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          {preview && <DocDetail doc={preview} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({ label, value, tone, sub, icon }: { label: string; value: string; tone?: "good" | "bad"; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase text-muted-foreground inline-flex items-center gap-1">{icon}{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Calc({ title, formula, note }: { title: string; formula: string; note: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="text-xs font-medium text-foreground">{title}</div>
      <div className="font-mono text-[11px] mt-1 text-foreground/80">{formula}</div>
      <div className="text-[11px] mt-1 leading-relaxed">{note}</div>
    </div>
  );
}
