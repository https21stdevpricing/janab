import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmt, fmtDate, inr } from "@/lib/format";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { ArrowDownToLine, ArrowUpFromLine, Boxes, X, History, Wrench } from "lucide-react";
import { lookupDoc, type DocLookupResult } from "@/lib/doc-lookup";
import { DocDetail } from "@/routes/app.lookup";
import { CollapseFilters } from "@/components/collapse-filters";
import { KpiGrid, KpiTile } from "@/components/ui-tokens";

export const Route = createFileRoute("/app/stock")({ component: StockPage });

type StockRow = {
  product_id: string; code: string; name: string; unit: string;
  opening_stock: number; purchased: number; sold: number; on_hand: number;
  reorder_level: number;
};
type ProdMeta = { purchase_rate: number; sale_rate: number };
type Move = {
  date: string; kind: "Purchase" | "Sale" | "Adjustment"; doc_no: string; party: string;
  qty: number; rate: number;
};

function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [meta, setMeta] = useState<Record<string, ProdMeta>>({});
  const [q, setQ] = useState("");
  const [showLow, setShowLow] = useState(false);
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [preview, setPreview] = useState<DocLookupResult | null>(null);
  const [adjustFor, setAdjustFor] = useState<StockRow | null>(null);
  const [adjQty, setAdjQty] = useState<number>(1);
  const [adjReason, setAdjReason] = useState<"damage" | "theft" | "sample" | "correction" | "other">("damage");
  const [adjNotes, setAdjNotes] = useState("");
  const [adjDate, setAdjDate] = useState(new Date().toISOString().slice(0, 10));

  const loadAll = async () => {
    const [{ data: sv }, { data: ps }] = await Promise.all([
      supabase.from("stock_view").select("*").order("name"),
      supabase.from("products").select("id,purchase_rate,sale_rate"),
    ]);
    setRows((sv ?? []) as any);
    const m: Record<string, ProdMeta> = {};
    for (const p of (ps ?? []) as any[]) m[p.id] = { purchase_rate: Number(p.purchase_rate ?? 0), sale_rate: Number(p.sale_rate ?? 0) };
    setMeta(m);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase.channel("stock-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_adjustments" as any }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchase_items" }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_items" }, () => loadAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (showLow && Number(r.on_hand) > Number(r.reorder_level ?? 0)) return false;
    if (q && !`${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [rows, q, showLow]);

  const summary = useMemo(() => {
    let onHand = 0, valueCost = 0, valueSale = 0, lowCount = 0;
    for (const r of rows) {
      onHand += Number(r.on_hand);
      const pm = meta[r.product_id];
      if (pm) { valueCost += Number(r.on_hand) * pm.purchase_rate; valueSale += Number(r.on_hand) * pm.sale_rate; }
      if (Number(r.on_hand) <= Number(r.reorder_level ?? 0)) lowCount++;
    }
    return { onHand, valueCost, valueSale, lowCount };
  }, [rows, meta]);

  const openMovements = async (r: StockRow) => {
    setSelected(r); setMoves([]);
    const [{ data: pi }, { data: si }, { data: sa }] = await Promise.all([
      supabase.from("purchase_items").select("qty,rate,purchases!inner(po_no,date,supplier_name)").eq("product_id", r.product_id) as any,
      supabase.from("sale_items").select("qty,rate,sales!inner(invoice_no,date,buyer_name)").eq("product_id", r.product_id) as any,
      supabase.from("stock_adjustments" as never).select("date,qty,reason,notes,unit_cost").eq("product_id" as never, r.product_id) as any,
    ]);
    const arr: Move[] = [];
    for (const x of (pi ?? []) as any[]) arr.push({ date: x.purchases.date, kind: "Purchase", doc_no: x.purchases.po_no, party: x.purchases.supplier_name ?? "—", qty: Number(x.qty), rate: Number(x.rate ?? 0) });
    for (const x of (si ?? []) as any[]) arr.push({ date: x.sales.date, kind: "Sale", doc_no: x.sales.invoice_no, party: x.sales.buyer_name ?? "—", qty: Number(x.qty), rate: Number(x.rate ?? 0) });
    for (const x of (sa ?? []) as any[]) arr.push({ date: x.date, kind: "Adjustment", doc_no: `ADJ · ${x.reason}`, party: x.notes ?? "—", qty: Number(x.qty), rate: Number(x.unit_cost ?? 0) });
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
      run += m.kind === "Purchase" ? m.qty : -m.qty; // Sale & Adjustment both reduce stock
      return { ...m, running: run };
    });
    return annotated.reverse();
  }, [moves, selected]);

  const openAdjust = (r: StockRow) => {
    setAdjustFor(r);
    setAdjQty(1); setAdjReason("damage"); setAdjNotes("");
    setAdjDate(new Date().toISOString().slice(0, 10));
  };
  const saveAdjust = async () => {
    if (!adjustFor) return;
    if (!adjQty || adjQty === 0) { toast.error("Quantity must not be zero"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const cost = meta[adjustFor.product_id]?.purchase_rate ?? 0;
    const { error } = await supabase.from("stock_adjustments" as never).insert({
      user_id: user.id,
      product_id: adjustFor.product_id,
      date: adjDate,
      qty: adjQty,        // positive = out (loss); enter negative for "found"
      reason: adjReason,
      notes: adjNotes || null,
      unit_cost: cost,
    } as never);
    if (error) { toast.error(error.message); return; }
    toast.success(`Stock adjusted (${adjQty > 0 ? "−" : "+"}${Math.abs(adjQty)})`);
    setAdjustFor(null); loadAll();
    if (selected?.product_id === adjustFor.product_id) openMovements(adjustFor);
  };

  return (
    <div>
      <PageHeader title={<span className="inline-flex items-center gap-2"><Boxes className="h-4 w-4" /> Stock movements</span>}
        description="Live on-hand, inventory value and full movement history per product. Third-party trades are excluded — those goods never enter your yard."
        actions={<ExcelBar onExport={onExport} />}
      />

      <KpiGrid cols={4} className="mb-3">
        <KpiTile label="Total units on hand" value={fmt(summary.onHand)} />
        <KpiTile label="Inventory value (cost)" value={inr(summary.valueCost)} />
        <KpiTile label="Inventory value (sale)" value={inr(summary.valueSale)} tone="good" />
        <KpiTile label="Low-stock items" value={String(summary.lowCount)} tone={summary.lowCount > 0 ? "bad" : undefined} />
      </KpiGrid>

      <CollapseFilters
        summary={`${filtered.length} of ${rows.length} SKUs`}
        active={(q ? 1 : 0) + (showLow ? 1 : 0)}
        onClear={() => { setQ(""); setShowLow(false); }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search code or name…" value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
          <Button variant={showLow ? "default" : "outline"} size="sm" onClick={() => setShowLow(v => !v)}>Only low-stock</Button>
        </div>
      </CollapseFilters>

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
                <th className="text-right p-2">Cost value</th>
                <th className="text-right p-2">Sale value</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const low = Number(r.on_hand) <= Number(r.reorder_level ?? 0);
                const pm = meta[r.product_id];
                const costV = pm ? Number(r.on_hand) * pm.purchase_rate : 0;
                const saleV = pm ? Number(r.on_hand) * pm.sale_rate : 0;
                return (
                  <tr key={r.product_id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{r.code} · {r.unit}</div>
                    </td>
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{fmt(r.opening_stock)}</td>
                    <td className="p-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400">+{fmt(r.purchased)}</td>
                    <td className="p-2 text-right tabular-nums text-destructive">−{fmt(r.sold)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">
                      {fmt(r.on_hand)} {low && <Badge variant="destructive" className="ml-1 text-[10px]">Low</Badge>}
                    </td>
                    <td className="p-2 text-right tabular-nums">{inr(costV)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(saleV)}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openMovements(r)}><History className="h-3.5 w-3.5" /> Movements</Button>
                      <Button size="sm" variant="ghost" onClick={() => openAdjust(r)} title="Write off / adjust stock"><Wrench className="h-3.5 w-3.5" /> Adjust</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 [&>button]:hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <DialogTitle className="text-sm font-medium">
              {selected?.name} <span className="font-mono text-xs text-muted-foreground">{selected?.code}</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {selected && <Button size="sm" variant="outline" onClick={() => openAdjust(selected)}><Wrench className="h-3.5 w-3.5" /> Adjust</Button>}
              <button className="rounded-md p-1 hover:bg-muted" onClick={() => setSelected(null)} aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
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
                              : m.kind === "Adjustment"
                                ? <Badge variant="outline" className="text-amber-700 border-amber-500/40 dark:text-amber-300"><Wrench className="h-3 w-3 mr-1" /> Adj</Badge>
                                : <Badge variant="outline" className="text-destructive border-destructive/40"><ArrowUpFromLine className="h-3 w-3 mr-1" /> Out</Badge>}
                          </td>
                          <td className="p-2">
                            {m.kind === "Adjustment"
                              ? <span className="font-mono text-xs text-muted-foreground">{m.doc_no}</span>
                              : <button className="font-mono text-primary hover:underline" onClick={async () => { const r = await lookupDoc(m.doc_no); if (r) setPreview(r); }}>{m.doc_no}</button>}
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

      {/* Stock adjustment dialog */}
      <Dialog open={!!adjustFor} onOpenChange={o => !o && setAdjustFor(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Adjust stock · {adjustFor?.name}</DialogTitle>
          <div className="text-xs text-muted-foreground">Current on-hand: <span className="font-semibold text-foreground tabular-nums">{adjustFor ? fmt(adjustFor.on_hand) : "—"}</span> {adjustFor?.unit}</div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Quantity lost</Label>
              <Input type="number" step="0.01" value={adjQty} onChange={e => setAdjQty(+e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Enter a positive number to reduce stock; negative to add stock you found.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" value={adjDate} onChange={e => setAdjDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Reason</Label>
              <Select value={adjReason} onValueChange={(v) => setAdjReason(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="damage">Damage / breakage</SelectItem>
                  <SelectItem value="theft">Theft / shrinkage</SelectItem>
                  <SelectItem value="sample">Sample / giveaway</SelectItem>
                  <SelectItem value="correction">Count correction</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="e.g. dropped slab during loading" />
            </div>
            {adjustFor && (
              <div className="col-span-2 rounded-md border bg-muted/30 p-2.5 text-xs">
                After save · on-hand will become <span className="font-semibold tabular-nums">{fmt(Number(adjustFor.on_hand) - Number(adjQty || 0))}</span> {adjustFor.unit}.
                Cost moved out of stock: <span className="font-semibold">{inr(Math.abs((meta[adjustFor.product_id]?.purchase_rate ?? 0) * (adjQty || 0)))}</span>.
              </div>
            )}
          </div>
          <DialogFooter className="mt-3">
            <Button variant="ghost" onClick={() => setAdjustFor(null)}>Cancel</Button>
            <Button onClick={saveAdjust}>Save adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0 [&>button]:hidden">
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

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
