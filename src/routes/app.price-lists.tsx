import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/empty";
import { fmt, inr, todayISO, fmtDate } from "@/lib/format";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { Plus, Trash2, Tag, Calculator, Download, Pencil, FileSpreadsheet, Layers } from "lucide-react";

export const Route = createFileRoute("/app/price-lists")({ component: PriceListsPage });

type Product = {
  id: string; code: string; name: string; unit: string | null; hsn: string | null;
  category: string | null; kind: "stocked" | "order_basis";
  purchase_rate: number | null; sale_rate: number | null;
};
type PriceList = { id: string; name: string; effective_from: string; currency: string; notes: string | null; created_at: string };
type Item = {
  id?: string; product_id: string | null; product_code: string | null; product_name: string;
  category: string | null; hsn: string | null; unit: string | null;
  cost_rate: number; mrp: number; list_rate: number; discount_pct: number; margin_pct: number;
  gst_pct: number; min_qty: number; position: number;
};

const n = (x: any) => Number(x ?? 0) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

function PriceListsPage() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  // builder/filter state
  const [selCats, setSelCats] = useState<Record<string, boolean>>({});
  const [includeOrder, setIncludeOrder] = useState(true);
  const [search, setSearch] = useState("");

  // pricing strategy
  const [strategy, setStrategy] = useState<"markup_cost" | "discount_mrp" | "fixed_pct_sale" | "manual">("markup_cost");
  const [pct, setPct] = useState<number>(25);
  const [rounding, setRounding] = useState<"none" | "1" | "10" | "50" | "100">("none");
  const [defaultGst, setDefaultGst] = useState<number>(18);
  const [defaultMinQty, setDefaultMinQty] = useState<number>(1);

  // new list dialog
  const [openNew, setOpenNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: "", effective_from: todayISO(), notes: "" });

  const load = async () => {
    const [{ data: pls }, { data: prods }] = await Promise.all([
      supabase.from("price_lists").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("id,code,name,unit,hsn,category,kind,purchase_rate,sale_rate").order("category").order("name"),
    ]);
    setLists((pls ?? []) as PriceList[]);
    setProducts((prods ?? []) as Product[]);
    if (!activeId && pls && pls.length) setActiveId(pls[0].id);
  };
  useEffect(() => { load(); }, []);

  const loadItems = async (id: string) => {
    const { data } = await supabase.from("price_list_items").select("*").eq("price_list_id", id).order("position");
    setItems((data ?? []) as Item[]);
  };
  useEffect(() => { if (activeId) loadItems(activeId); else setItems([]); }, [activeId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add((p.category ?? "Uncategorised").trim() || "Uncategorised");
    return Array.from(set).sort();
  }, [products]);

  const grouped = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) {
      const c = (p.category ?? "Uncategorised").trim() || "Uncategorised";
      m[c] = (m[c] ?? 0) + 1;
    }
    return m;
  }, [products]);

  const pickedProducts = useMemo(() => {
    const ql = search.trim().toLowerCase();
    return products.filter((p) => {
      const c = (p.category ?? "Uncategorised").trim() || "Uncategorised";
      if (!selCats[c]) return false;
      if (!includeOrder && p.kind === "order_basis") return false;
      if (ql && !`${p.code} ${p.name} ${p.hsn ?? ""}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [products, selCats, includeOrder, search]);

  const computeRate = (cost: number, mrp: number, sale: number) => {
    let v = 0;
    if (strategy === "markup_cost") v = cost * (1 + pct / 100);
    else if (strategy === "discount_mrp") v = mrp * (1 - pct / 100);
    else if (strategy === "fixed_pct_sale") v = sale * (1 + pct / 100);
    else v = sale || mrp || cost;
    if (rounding !== "none") {
      const step = Number(rounding);
      v = Math.round(v / step) * step;
    }
    return r2(v);
  };

  const recomputeAll = () => {
    setItems((rows) => rows.map((it) => {
      const list = computeRate(it.cost_rate, it.mrp, it.mrp || it.list_rate);
      const margin = it.cost_rate > 0 ? ((list - it.cost_rate) / it.cost_rate) * 100 : 0;
      const disc = it.mrp > 0 ? ((it.mrp - list) / it.mrp) * 100 : 0;
      return { ...it, list_rate: list, margin_pct: r2(margin), discount_pct: r2(disc) };
    }));
  };

  const addPicked = () => {
    if (!activeId) { toast.error("Create or select a price list first"); return; }
    const existing = new Set(items.map((i) => i.product_id).filter(Boolean));
    const next: Item[] = [...items];
    let pos = items.length;
    for (const p of pickedProducts) {
      if (existing.has(p.id)) continue;
      const cost = n(p.purchase_rate), mrp = n(p.sale_rate);
      const list = computeRate(cost, mrp, mrp);
      next.push({
        product_id: p.id, product_code: p.code, product_name: p.name,
        category: p.category, hsn: p.hsn, unit: p.unit,
        cost_rate: cost, mrp, list_rate: list,
        discount_pct: mrp > 0 ? r2(((mrp - list) / mrp) * 100) : 0,
        margin_pct: cost > 0 ? r2(((list - cost) / cost) * 100) : 0,
        gst_pct: defaultGst, min_qty: defaultMinQty, position: pos++,
      });
    }
    setItems(next);
    toast.success(`Added ${next.length - items.length} item(s)`);
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((rows) => rows.map((r, i) => {
      if (i !== idx) return r;
      const m = { ...r, ...patch };
      // recompute derived
      if (patch.list_rate != null || patch.cost_rate != null || patch.mrp != null) {
        m.margin_pct = m.cost_rate > 0 ? r2(((m.list_rate - m.cost_rate) / m.cost_rate) * 100) : 0;
        m.discount_pct = m.mrp > 0 ? r2(((m.mrp - m.list_rate) / m.mrp) * 100) : 0;
      }
      return m;
    }));
  };

  const removeItem = (idx: number) => setItems((rows) => rows.filter((_, i) => i !== idx));

  const save = async () => {
    if (!activeId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // wipe & reinsert (simple, atomic per list)
    const del = await supabase.from("price_list_items").delete().eq("price_list_id", activeId);
    if (del.error) { toast.error(del.error.message); return; }
    if (items.length) {
      const payload = items.map((it, i) => ({
        price_list_id: activeId,
        product_id: it.product_id, product_code: it.product_code, product_name: it.product_name,
        category: it.category, hsn: it.hsn, unit: it.unit,
        cost_rate: it.cost_rate, mrp: it.mrp, list_rate: it.list_rate,
        discount_pct: it.discount_pct, margin_pct: it.margin_pct,
        gst_pct: it.gst_pct, min_qty: it.min_qty, position: i,
      }));
      const { error } = await supabase.from("price_list_items").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Price list saved");
    loadItems(activeId);
  };

  const createList = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!newForm.name.trim()) { toast.error("Name required"); return; }
    const { data, error } = await supabase.from("price_lists").insert({
      user_id: user.id, name: newForm.name.trim(),
      effective_from: newForm.effective_from, notes: newForm.notes || null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setOpenNew(false); setNewForm({ name: "", effective_from: todayISO(), notes: "" });
    await load();
    setActiveId((data as any).id);
  };

  const deleteList = async () => {
    if (!activeId) return;
    if (!confirm("Delete this price list and all its rows?")) return;
    const { error } = await supabase.from("price_lists").delete().eq("id", activeId);
    if (error) { toast.error(error.message); return; }
    setActiveId(null); load();
  };

  const active = lists.find((l) => l.id === activeId);

  const totals = useMemo(() => {
    let cost = 0, list = 0, mrp = 0, gst = 0;
    for (const it of items) {
      cost += it.cost_rate; list += it.list_rate; mrp += it.mrp;
      gst += it.list_rate * (it.gst_pct / 100);
    }
    const avgMargin = items.length ? items.reduce((s, i) => s + i.margin_pct, 0) / items.length : 0;
    return { cost, list, mrp, gst, avgMargin, count: items.length };
  }, [items]);

  const onExport = () => {
    if (!active) return;
    exportToExcel({
      filename: `price-list-${active.name.replace(/\s+/g, "_")}-${active.effective_from}`,
      sheetName: active.name.slice(0, 28),
      columns: [
        { header: "Category", key: "category" },
        { header: "Code", key: "product_code" },
        { header: "Product", key: "product_name" },
        { header: "HSN", key: "hsn" },
        { header: "Unit", key: "unit" },
        { header: "Cost", key: "cost_rate" },
        { header: "MRP", key: "mrp" },
        { header: "List Rate", key: "list_rate" },
        { header: "Discount %", key: "discount_pct" },
        { header: "Margin %", key: "margin_pct" },
        { header: "GST %", key: "gst_pct" },
        { header: "Min Qty", key: "min_qty" },
      ],
      rows: items,
    });
  };

  const itemsByCat = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const it of items) {
      const c = (it.category ?? "Uncategorised").trim() || "Uncategorised";
      (m[c] ??= []).push(it);
    }
    return m;
  }, [items]);

  return (
    <div>
      <PageHeader
        title="Price Lists"
        description="Build bulk price lists by category with margin, discount and rounding rules. Save, revise and export."
        actions={
          <>
            {active && <Button size="sm" variant="outline" onClick={onExport}><Download className="h-4 w-4" /> <span className="hidden sm:inline">Export</span></Button>}
            <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" /> <span className="hidden sm:inline">New list</span></Button>
          </>
        }
      />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Tile label="Lists" value={String(lists.length)} />
        <Tile label="Items" value={String(totals.count)} />
        <Tile label="List total" value={inr(totals.list)} tone="good" />
        <Tile label="MRP total" value={inr(totals.mrp)} />
        <Tile label="Avg margin" value={`${fmt(totals.avgMargin)}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
        {/* Lists sidebar */}
        <div className="rounded-md border bg-card p-2 space-y-1">
          <div className="text-[10px] uppercase text-muted-foreground px-2 py-1">My price lists</div>
          {lists.length === 0 && <div className="text-xs text-muted-foreground px-2 py-3">No price lists yet</div>}
          {lists.map((pl) => (
            <button key={pl.id} onClick={() => setActiveId(pl.id)}
              className={`w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted ${activeId === pl.id ? "bg-muted font-medium" : ""}`}>
              <div className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> {pl.name}</div>
              <div className="text-[10px] text-muted-foreground">w.e.f. {fmtDate(pl.effective_from)}</div>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {!active ? (
            <Empty>Create a price list to begin.</Empty>
          ) : (
            <>
              {/* Builder controls */}
              <div className="rounded-md border bg-card p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    <div>
                      <div className="font-semibold">{active.name}</div>
                      <div className="text-[11px] text-muted-foreground">Effective {fmtDate(active.effective_from)} · {active.currency}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={deleteList} className="text-destructive"><Trash2 className="h-4 w-4" /> Delete list</Button>
                </div>

                {/* Category picker */}
                <div>
                  <Label className="text-xs">Pick categories</Label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {categories.map((c) => (
                      <label key={c} className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs cursor-pointer ${selCats[c] ? "bg-primary/10 border-primary" : "bg-background"}`}>
                        <Checkbox checked={!!selCats[c]} onCheckedChange={(v) => setSelCats((s) => ({ ...s, [c]: !!v }))} />
                        {c} <Badge variant="secondary" className="ml-0.5">{grouped[c] ?? 0}</Badge>
                      </label>
                    ))}
                    {categories.length === 0 && <span className="text-xs text-muted-foreground">No categories on products yet. Add a category in Products → Edit.</span>}
                  </div>
                </div>

                {/* Strategy */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <div className="col-span-2">
                    <Label className="text-[11px]">Pricing strategy</Label>
                    <Select value={strategy} onValueChange={(v) => setStrategy(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="markup_cost">Markup % over cost</SelectItem>
                        <SelectItem value="discount_mrp">Discount % off MRP</SelectItem>
                        <SelectItem value="fixed_pct_sale">% over sale rate</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">{strategy === "discount_mrp" ? "Discount %" : "Percent %"}</Label>
                    <Input type="number" value={pct} onChange={(e) => setPct(+e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Rounding</Label>
                    <Select value={rounding} onValueChange={(v) => setRounding(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="1">₹1</SelectItem>
                        <SelectItem value="10">₹10</SelectItem>
                        <SelectItem value="50">₹50</SelectItem>
                        <SelectItem value="100">₹100</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Default GST %</Label>
                    <Input type="number" value={defaultGst} onChange={(e) => setDefaultGst(+e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Min Qty</Label>
                    <Input type="number" value={defaultMinQty} onChange={(e) => setDefaultMinQty(+e.target.value)} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs">
                    <Checkbox checked={includeOrder} onCheckedChange={(v) => setIncludeOrder(!!v)} />
                    Include on-order items
                  </label>
                  <Input placeholder="Filter products…" className="max-w-xs h-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <span className="text-xs text-muted-foreground">{pickedProducts.length} match selected categories</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={recomputeAll} disabled={!items.length}><Calculator className="h-4 w-4" /> Recompute</Button>
                    <Button size="sm" variant="outline" onClick={addPicked} disabled={!pickedProducts.length}><Plus className="h-4 w-4" /> Add picked</Button>
                    <Button size="sm" onClick={save}><FileSpreadsheet className="h-4 w-4" /> Save</Button>
                  </div>
                </div>
              </div>

              {/* Items grouped by category */}
              {items.length === 0 ? (
                <Empty>Pick categories above and click "Add picked" to populate.</Empty>
              ) : (
                Object.entries(itemsByCat).map(([cat, rows]) => {
                  const catTotal = rows.reduce((s, it) => s + it.list_rate, 0);
                  const catMrp = rows.reduce((s, it) => s + it.mrp, 0);
                  return (
                  <div key={cat} className="rounded-md border bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b bg-muted/30">
                      <div className="font-medium text-sm flex items-center gap-2"><Tag className="h-3.5 w-3.5" /> {cat} <Badge variant="secondary">{rows.length}</Badge></div>
                      <div className="text-xs text-muted-foreground">List: <b className="text-foreground">{inr(catTotal)}</b> · MRP: {inr(catMrp)}</div>
                    </div>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead><TableHead>Product</TableHead><TableHead>Unit</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">MRP</TableHead>
                          <TableHead className="text-right">List ₹</TableHead>
                          <TableHead className="text-right">Disc %</TableHead>
                          <TableHead className="text-right">Margin %</TableHead>
                          <TableHead className="text-right">GST %</TableHead>
                          <TableHead className="text-right">Min Qty</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((it) => {
                          const idx = items.indexOf(it);
                          return (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-xs">{it.product_code}</TableCell>
                            <TableCell className="font-medium">{it.product_name}</TableCell>
                            <TableCell className="text-xs">{it.unit}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{fmt(it.cost_rate)}</TableCell>
                            <TableCell className="text-right"><Input type="number" className="h-7 text-right tabular-nums w-24 ml-auto" value={it.mrp} onChange={(e) => updateItem(idx, { mrp: +e.target.value })} /></TableCell>
                            <TableCell className="text-right"><Input type="number" className="h-7 text-right tabular-nums w-24 ml-auto font-semibold" value={it.list_rate} onChange={(e) => updateItem(idx, { list_rate: +e.target.value })} /></TableCell>
                            <TableCell className={`text-right tabular-nums text-xs ${it.discount_pct < 0 ? "text-destructive" : ""}`}>{fmt(it.discount_pct)}</TableCell>
                            <TableCell className={`text-right tabular-nums text-xs ${it.margin_pct < 0 ? "text-destructive" : it.margin_pct > 0 ? "text-primary" : ""}`}>{fmt(it.margin_pct)}</TableCell>
                            <TableCell className="text-right"><Input type="number" className="h-7 text-right tabular-nums w-16 ml-auto" value={it.gst_pct} onChange={(e) => updateItem(idx, { gst_pct: +e.target.value })} /></TableCell>
                            <TableCell className="text-right"><Input type="number" className="h-7 text-right tabular-nums w-16 ml-auto" value={it.min_qty} onChange={(e) => updateItem(idx, { min_qty: +e.target.value })} /></TableCell>
                            <TableCell className="text-right"><Button size="icon" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> New price list</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Name *</Label><Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="e.g. Dealer 2026-Q1" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Effective from</Label><Input type="date" value={newForm.effective_from} onChange={(e) => setNewForm({ ...newForm, effective_from: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Textarea rows={3} value={newForm.notes} onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })} placeholder="Validity, terms, audience…" /></div>
          </div>
          <DialogFooter><Button onClick={createList} className="w-full sm:w-auto">Create</Button></DialogFooter>
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