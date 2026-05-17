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
import { ContactPicker } from "@/components/contact-picker";
import { fmt, inr, todayISO, fmtDate } from "@/lib/format";
import { exportToExcel } from "@/lib/excel";
import { toast } from "sonner";
import { Plus, Trash2, Tag, Calculator, Download, Pencil, FileSpreadsheet, Layers, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import swLogo from "@/assets/sw-logo.png";

// Stone World brand
const BRAND_TEAL: [number, number, number] = [26, 182, 188];
const BRAND_DARK: [number, number, number] = [15, 23, 42];
const BRAND_SOFT: [number, number, number] = [236, 253, 254];

export const Route = createFileRoute("/app/price-lists")({ component: PriceListsPage });

type Product = {
  id: string; code: string; name: string; unit: string | null; hsn: string | null;
  category: string | null; kind: "stocked" | "order_basis";
  purchase_rate: number | null; sale_rate: number | null;
};
type PriceList = {
  id: string; name: string; effective_from: string; currency: string; notes: string | null;
  created_at: string;
  buyer_id: string | null; buyer_name: string | null; buyer_phone: string | null; buyer_address: string | null;
  category: string | null; valid_until: string | null; terms: string | null;
};
type Item = {
  id?: string; product_id: string | null; product_code: string | null; product_name: string;
  category: string | null; hsn: string | null; unit: string | null;
  cost_rate: number; mrp: number; list_rate: number; discount_pct: number; margin_pct: number;
  gst_pct: number; min_qty: number; position: number;
};
type Settings = {
  company_name: string; address: string | null; phone: string | null; email: string | null;
  gstin: string | null; state: string | null;
};

const n = (x: any) => Number(x ?? 0) || 0;
const r2 = (x: number) => Math.round(x * 100) / 100;

function PriceListsPage() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const [includeOrder, setIncludeOrder] = useState(true);
  const [search, setSearch] = useState("");

  const [strategy, setStrategy] = useState<"markup_cost" | "discount_mrp" | "fixed_pct_sale" | "manual">("markup_cost");
  const [pct, setPct] = useState<number>(25);
  const [rounding, setRounding] = useState<"none" | "1" | "10" | "50" | "100">("none");
  const [defaultGst, setDefaultGst] = useState<number>(18);
  const [defaultMinQty, setDefaultMinQty] = useState<number>(1);

  const [openNew, setOpenNew] = useState(false);
  const [newForm, setNewForm] = useState<{ name: string; effective_from: string; valid_until: string; notes: string; terms: string; category: string; buyer_id: string | null; buyer_name: string | null; buyer_phone: string; buyer_address: string }>(
    { name: "", effective_from: todayISO(), valid_until: "", notes: "", terms: "Prices inclusive of GST unless mentioned. Valid for the period specified. Subject to stock availability.", category: "", buyer_id: null, buyer_name: null, buyer_phone: "", buyer_address: "" }
  );

  const load = async () => {
    const [{ data: pls }, { data: prods }, { data: st }] = await Promise.all([
      supabase.from("price_lists").select("*").order("created_at", { ascending: false }),
      supabase.from("products").select("id,code,name,unit,hsn,category,kind,purchase_rate,sale_rate").order("category").order("name"),
      supabase.from("settings").select("company_name,address,phone,email,gstin,state").maybeSingle(),
    ]);
    setLists((pls ?? []) as PriceList[]);
    setProducts((prods ?? []) as Product[]);
    setSettings((st as Settings) ?? null);
  };
  useEffect(() => { load(); }, []);

  const loadItems = async (id: string) => {
    const { data } = await supabase.from("price_list_items").select("*").eq("price_list_id", id).order("position");
    setItems((data ?? []) as Item[]);
  };
  useEffect(() => { if (activeId) loadItems(activeId); else setItems([]); }, [activeId]);

  const active = lists.find((l) => l.id === activeId) ?? null;

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) set.add((p.category ?? "Uncategorised").trim() || "Uncategorised");
    return Array.from(set).sort();
  }, [products]);

  const catProducts = useMemo(() => {
    if (!active?.category) return [];
    const ql = search.trim().toLowerCase();
    const want = active.category.trim().toLowerCase();
    return products.filter((p) => {
      const c = ((p.category ?? "Uncategorised").trim() || "Uncategorised").toLowerCase();
      if (c !== want) return false;
      if (!includeOrder && p.kind === "order_basis") return false;
      if (ql && !`${p.code} ${p.name} ${p.hsn ?? ""}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [products, active, includeOrder, search]);

  const computeRate = (cost: number, mrp: number, sale: number) => {
    let v = 0;
    if (strategy === "markup_cost") v = cost * (1 + pct / 100);
    else if (strategy === "discount_mrp") v = mrp * (1 - pct / 100);
    else if (strategy === "fixed_pct_sale") v = sale * (1 + pct / 100);
    else v = sale || mrp || cost;
    if (rounding !== "none") { const step = Number(rounding); v = Math.round(v / step) * step; }
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

  const addAllCategory = () => {
    if (!activeId) { toast.error("Create or select a price list first"); return; }
    if (!active?.category) { toast.error("This list has no category set — edit it first"); return; }
    const existing = new Set(items.map((i) => i.product_id).filter(Boolean));
    const next: Item[] = [...items];
    let pos = items.length;
    for (const p of catProducts) {
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

  const addOne = (p: Product) => {
    if (items.some((i) => i.product_id === p.id)) { toast.info("Already added"); return; }
    const cost = n(p.purchase_rate), mrp = n(p.sale_rate);
    const list = computeRate(cost, mrp, mrp);
    setItems((rows) => [...rows, {
      product_id: p.id, product_code: p.code, product_name: p.name,
      category: p.category, hsn: p.hsn, unit: p.unit,
      cost_rate: cost, mrp, list_rate: list,
      discount_pct: mrp > 0 ? r2(((mrp - list) / mrp) * 100) : 0,
      margin_pct: cost > 0 ? r2(((list - cost) / cost) * 100) : 0,
      gst_pct: defaultGst, min_qty: defaultMinQty, position: rows.length,
    }]);
  };

  const updateItem = (idx: number, patch: Partial<Item>) => {
    setItems((rows) => rows.map((r, i) => {
      if (i !== idx) return r;
      const m = { ...r, ...patch };
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
    toast.success("Saved");
    loadItems(activeId);
  };

  const createList = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!newForm.name.trim()) { toast.error("Name required"); return; }
    if (!newForm.category.trim()) { toast.error("Category required"); return; }
    const { data, error } = await supabase.from("price_lists").insert({
      user_id: user.id, name: newForm.name.trim(),
      effective_from: newForm.effective_from,
      valid_until: newForm.valid_until || null,
      notes: newForm.notes || null, terms: newForm.terms || null,
      category: newForm.category.trim(),
      buyer_id: newForm.buyer_id, buyer_name: newForm.buyer_name,
      buyer_phone: newForm.buyer_phone || null, buyer_address: newForm.buyer_address || null,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setOpenNew(false);
    setNewForm({ ...newForm, name: "", buyer_id: null, buyer_name: null, buyer_phone: "", buyer_address: "" });
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

  const editMeta = async (patch: Partial<PriceList>) => {
    if (!activeId) return;
    const { error } = await supabase.from("price_lists").update(patch).eq("id", activeId);
    if (error) { toast.error(error.message); return; }
    await load();
  };

  const totals = useMemo(() => {
    let cost = 0, list = 0, mrp = 0, gst = 0;
    for (const it of items) { cost += it.cost_rate; list += it.list_rate; mrp += it.mrp; gst += it.list_rate * (it.gst_pct / 100); }
    return { cost, list, mrp, gst, count: items.length };
  }, [items]);

  const onExcel = () => {
    if (!active) return;
    exportToExcel({
      filename: `price-list-${active.name.replace(/\s+/g, "_")}-${active.effective_from}`,
      sheetName: (active.category ?? "List").slice(0, 28),
      columns: [
        { header: "Code", key: "product_code" },
        { header: "Product", key: "product_name" },
        { header: "HSN", key: "hsn" },
        { header: "Unit", key: "unit" },
        { header: "MRP", key: "mrp" },
        { header: "Your Price", key: "list_rate" },
        { header: "Discount %", key: "discount_pct" },
        { header: "GST %", key: "gst_pct" },
        { header: "Min Qty", key: "min_qty" },
      ],
      rows: items,
    });
  };

  const onPdf = () => {
    if (!active) return;
    if (!items.length) { toast.error("Add items first"); return; }
    void exportPdf(active, items, totals, settings);
  };

  const downloadListPdf = async (pl: PriceList) => {
    const { data } = await supabase.from("price_list_items").select("*").eq("price_list_id", pl.id).order("position");
    const rows = (data ?? []) as Item[];
    if (!rows.length) { toast.error("This list has no items yet"); return; }
    let cost = 0, list = 0, mrp = 0, gst = 0;
    for (const it of rows) { cost += it.cost_rate; list += it.list_rate; mrp += it.mrp; gst += it.list_rate * (it.gst_pct / 100); }
    exportPdf(pl, rows, { cost, list, mrp, gst, count: rows.length }, settings);
  };

  return (
    <div>
      <PageHeader
        title="Price Lists"
        description="Build a customer-specific price list for one product category and share it as a branded PDF."
        actions={
          <>
            {active && <Button size="sm" variant="outline" onClick={onExcel}><FileSpreadsheet className="h-4 w-4" /> <span className="hidden sm:inline">Excel</span></Button>}
            {active && <Button size="sm" variant="outline" onClick={onPdf}><FileText className="h-4 w-4" /> <span className="hidden sm:inline">PDF</span></Button>}
            <Button size="sm" onClick={() => setOpenNew(true)}><Plus className="h-4 w-4" /> <span className="hidden sm:inline">New list</span></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Tile label="Lists" value={String(lists.length)} />
        <Tile label="Items" value={String(totals.count)} />
        <Tile label="List total" value={inr(totals.list)} tone="good" />
        <Tile label="GST (est.)" value={inr(totals.gst)} />
        <Tile label="Inclusive" value={inr(totals.list + totals.gst)} tone="good" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3">
        <div className="rounded-md border bg-card p-2 space-y-1">
          <div className="flex items-center justify-between px-2 py-1">
            <div className="text-[10px] uppercase text-muted-foreground">My price lists</div>
            {activeId && <button onClick={() => setActiveId(null)} className="text-[10px] text-muted-foreground hover:text-foreground underline">Collapse</button>}
          </div>
          {lists.length === 0 && <div className="text-xs text-muted-foreground px-2 py-3">No price lists yet</div>}
          {lists.map((pl) => (
            <div key={pl.id} className={`group rounded text-sm hover:bg-muted ${activeId === pl.id ? "bg-muted" : ""}`}>
              <button onClick={() => setActiveId(activeId === pl.id ? null : pl.id)} className="w-full text-left px-2 py-1.5">
                <div className={`flex items-center gap-1.5 ${activeId === pl.id ? "font-medium" : ""}`}><Tag className="h-3.5 w-3.5" /> {pl.name}</div>
                <div className="text-[10px] text-muted-foreground truncate">{pl.buyer_name || "—"} · {pl.category || "no cat"}</div>
                <div className="text-[10px] text-muted-foreground">w.e.f. {fmtDate(pl.effective_from)}</div>
              </button>
              <div className="px-2 pb-1.5">
                <Button size="sm" variant="outline" className="h-6 w-full text-[11px]" onClick={(e) => { e.stopPropagation(); downloadListPdf(pl); }}>
                  <Download className="h-3 w-3" /> PDF
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {!active ? (
            <Empty>Create a price list to begin.</Empty>
          ) : (
            <>
              {/* Meta editor */}
              <div className="rounded-md border bg-card p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    <div>
                      <div className="font-semibold">{active.name}</div>
                      <div className="text-[11px] text-muted-foreground">For {active.buyer_name || "—"} · {active.category || "no category"} · w.e.f. {fmtDate(active.effective_from)}</div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={deleteList} className="text-destructive"><Trash2 className="h-4 w-4" /> Delete</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <Label className="text-[11px]">Customer</Label>
                    <ContactPicker value={active.buyer_id} filter="buyer" onChange={(id, name) => editMeta({ buyer_id: id, buyer_name: name })} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Category</Label>
                    <Select value={active.category ?? ""} onValueChange={(v) => editMeta({ category: v })}>
                      <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                      <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Valid till</Label>
                    <Input type="date" value={active.valid_until ?? ""} onChange={(e) => editMeta({ valid_until: e.target.value || null })} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Customer phone (PDF)</Label>
                    <Input value={active.buyer_phone ?? ""} onChange={(e) => editMeta({ buyer_phone: e.target.value })} placeholder="optional" />
                  </div>
                  <div className="md:col-span-4">
                    <Label className="text-[11px]">Customer address (PDF)</Label>
                    <Input value={active.buyer_address ?? ""} onChange={(e) => editMeta({ buyer_address: e.target.value })} placeholder="optional" />
                  </div>
                  <div className="md:col-span-4">
                    <Label className="text-[11px]">Terms (printed on PDF)</Label>
                    <Textarea rows={2} value={active.terms ?? ""} onChange={(e) => editMeta({ terms: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Pricing controls */}
              <div className="rounded-md border bg-card p-3 space-y-3">
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
                  <span className="text-xs text-muted-foreground">{catProducts.length} products in this category</span>
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={recomputeAll} disabled={!items.length}><Calculator className="h-4 w-4" /> Recompute</Button>
                    <Button size="sm" variant="outline" onClick={addAllCategory} disabled={!active.category}><Plus className="h-4 w-4" /> Add all in category</Button>
                    <Button size="sm" onClick={save}><Download className="h-4 w-4" /> Save</Button>
                  </div>
                </div>
              </div>

              {/* Product picker */}
              {active.category && catProducts.length > 0 && (
                <div className="rounded-md border bg-card">
                  <div className="px-3 py-2 border-b bg-muted/30 text-xs font-medium">Available in “{active.category}” — click + to add</div>
                  <div className="max-h-56 overflow-y-auto divide-y">
                    {catProducts.map(p => {
                      const added = items.some((i) => i.product_id === p.id);
                      return (
                        <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm">
                          <div className="min-w-0">
                            <div className="truncate"><span className="font-mono text-[11px] text-muted-foreground mr-2">{p.code}</span>{p.name}</div>
                            <div className="text-[11px] text-muted-foreground">MRP {fmt(p.sale_rate)} · Cost {fmt(p.purchase_rate)} · {p.unit}</div>
                          </div>
                          <Button size="sm" variant={added ? "ghost" : "outline"} disabled={added} onClick={() => addOne(p)}>{added ? "Added" : <><Plus className="h-3.5 w-3.5" /> Add</>}</Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items */}
              {items.length === 0 ? (
                <Empty>Pick "Add all in category" or add items individually.</Empty>
              ) : (
                <div className="rounded-md border bg-card overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead><TableHead>Product</TableHead><TableHead>Unit</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">MRP</TableHead>
                        <TableHead className="text-right">Your Price</TableHead>
                        <TableHead className="text-right">Disc %</TableHead>
                        <TableHead className="text-right">Margin %</TableHead>
                        <TableHead className="text-right">GST %</TableHead>
                        <TableHead className="text-right">Min Qty</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, idx) => (
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" /> New price list</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Name *</Label><Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="e.g. Granite — Aman Interiors Q1" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category *</Label>
                <Select value={newForm.category} onValueChange={(v) => setNewForm({ ...newForm, category: v })}>
                  <SelectTrigger><SelectValue placeholder="Pick category" /></SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 && <div className="p-2 text-xs text-muted-foreground">No categories yet. Add one on a Product first.</div>}
                    {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Customer</Label>
                <ContactPicker value={newForm.buyer_id} filter="buyer" onChange={(id, name) => setNewForm({ ...newForm, buyer_id: id, buyer_name: name })} />
              </div>
              <div className="space-y-1.5"><Label className="text-xs">Effective from</Label><Input type="date" value={newForm.effective_from} onChange={(e) => setNewForm({ ...newForm, effective_from: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Valid until</Label><Input type="date" value={newForm.valid_until} onChange={(e) => setNewForm({ ...newForm, valid_until: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Customer phone</Label><Input value={newForm.buyer_phone} onChange={(e) => setNewForm({ ...newForm, buyer_phone: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Customer address</Label><Input value={newForm.buyer_address} onChange={(e) => setNewForm({ ...newForm, buyer_address: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Terms</Label><Textarea rows={2} value={newForm.terms} onChange={(e) => setNewForm({ ...newForm, terms: e.target.value })} /></div>
            </div>
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

function exportPdf(active: PriceList, items: Item[], totals: { cost: number; list: number; mrp: number; gst: number; count: number }, settings: Settings | null) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const co = settings ?? { company_name: "Stone World", address: "", phone: "", email: "", gstin: "", state: "" };

  // ===== HEADER =====
  // Teal accent stripe
  doc.setFillColor(...BRAND_TEAL);
  doc.rect(0, 0, W, 6, "F");
  // Dark header band
  doc.setFillColor(...BRAND_DARK);
  doc.rect(0, 6, W, 78, "F");

  // Logo (left)
  try { doc.addImage(swLogo, "PNG", M, 18, 56, 56); } catch {}

  // Company info (next to logo)
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(20);
  doc.text(co.company_name || "Stone World", M + 70, 40);
  doc.setFont("helvetica", "normal").setFontSize(8.5);
  doc.setTextColor(200, 230, 232);
  const coLine = [co.address, co.state].filter(Boolean).join(", ");
  if (coLine) doc.text(coLine, M + 70, 55);
  const coLine2 = [co.phone && `Ph: ${co.phone}`, co.email, co.gstin && `GSTIN: ${co.gstin}`].filter(Boolean).join("   |   ");
  if (coLine2) doc.text(coLine2, M + 70, 68);

  // Title pill on right
  doc.setFillColor(...BRAND_TEAL);
  doc.roundedRect(W - M - 150, 24, 150, 44, 4, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold").setFontSize(14);
  doc.text("PRICE LIST", W - M - 75, 44, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(8);
  doc.text(active.category || "All categories", W - M - 75, 58, { align: "center" });

  // ===== CUSTOMER + META BOX =====
  let y = 100;
  doc.setFillColor(...BRAND_SOFT);
  doc.setDrawColor(...BRAND_TEAL);
  doc.setLineWidth(0.8);
  doc.roundedRect(M, y, W - M * 2, 72, 4, 4, "FD");

  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...BRAND_TEAL);
  doc.text("PREPARED FOR", M + 12, y + 16);
  doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...BRAND_DARK);
  doc.text(active.buyer_name || "Walk-in Customer", M + 12, y + 34);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60, 60, 60);
  if (active.buyer_address) doc.text(doc.splitTextToSize(active.buyer_address, (W - M * 2) / 2 - 24), M + 12, y + 50);
  if (active.buyer_phone) doc.text(`Phone: ${active.buyer_phone}`, M + 12, y + 64);

  // Right column
  const rx = W - M - 12;
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...BRAND_TEAL);
  doc.text("LIST DETAILS", rx, y + 16, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...BRAND_DARK);
  doc.text(`Reference: ${active.name}`, rx, y + 32, { align: "right" });
  doc.text(`Effective: ${fmtDate(active.effective_from)}`, rx, y + 46, { align: "right" });
  doc.text(active.valid_until ? `Valid until: ${fmtDate(active.valid_until)}` : `Date: ${fmtDate(todayISO())}`, rx, y + 60, { align: "right" });

  // ===== ITEMS TABLE =====
  autoTable(doc, {
    startY: y + 86,
    margin: { left: M, right: M, bottom: 96 },
    head: [["#", "Code", "Product", "HSN", "Unit", "MRP", "Your Price", "Disc %", "GST %", "Min Qty"]],
    body: items.map((it, i) => [
      String(i + 1),
      it.product_code ?? "—",
      it.product_name,
      it.hsn ?? "—",
      it.unit ?? "—",
      n(it.mrp) ? `Rs. ${fmt(it.mrp)}` : "—",
      `Rs. ${fmt(it.list_rate)}`,
      n(it.discount_pct) ? `${fmt(it.discount_pct)}%` : "—",
      `${fmt(it.gst_pct)}%`,
      fmt(it.min_qty, 0),
    ]),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: [30, 30, 30], lineColor: [230, 230, 230], lineWidth: 0.3 },
    headStyles: { fillColor: BRAND_DARK, textColor: 255, fontStyle: "bold", fontSize: 9, halign: "left" },
    alternateRowStyles: { fillColor: [248, 252, 252] },
    columnStyles: {
      0: { halign: "right", cellWidth: 22, textColor: [120, 120, 120] },
      1: { cellWidth: 58, font: "courier", fontSize: 8 },
      2: { cellWidth: "auto", fontStyle: "bold" },
      3: { cellWidth: 48, font: "courier", fontSize: 8, halign: "center" },
      4: { cellWidth: 38, halign: "center" },
      5: { halign: "right", cellWidth: 56 },
      6: { halign: "right", cellWidth: 68, fontStyle: "bold", textColor: BRAND_TEAL },
      7: { halign: "right", cellWidth: 44 },
      8: { halign: "right", cellWidth: 38 },
      9: { halign: "right", cellWidth: 44 },
    },
    didDrawPage: () => {
      // Footer band - drawn per page
      doc.setFillColor(...BRAND_DARK);
      doc.rect(0, H - 28, W, 28, "F");
      doc.setFillColor(...BRAND_TEAL);
      doc.rect(0, H - 32, W, 4, "F");
      doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(200, 230, 232);
      doc.text(co.company_name || "Stone World", M, H - 11);
      const pageStr = `Page ${doc.getCurrentPageInfo().pageNumber}`;
      doc.text(pageStr, W - M, H - 11, { align: "right" });
    },
  });

  // ===== TOTALS + TERMS on last page =====
  const finalY = (doc as any).lastAutoTable?.finalY ?? (y + 200);
  const remaining = H - 100 - finalY;
  let blockY = finalY + 16;
  if (remaining < 130) { doc.addPage(); blockY = 40; }

  // Totals box (right)
  const tw = 220;
  doc.setDrawColor(...BRAND_TEAL); doc.setLineWidth(0.8);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W - M - tw, blockY, tw, 86, 4, 4, "FD");
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...BRAND_TEAL);
  doc.text("SUMMARY", W - M - tw + 12, blockY + 16);
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(60, 60, 60);
  doc.text(`Items listed`, W - M - tw + 12, blockY + 34);
  doc.text(String(totals.count), W - M - 12, blockY + 34, { align: "right" });
  doc.text(`List value (excl. GST)`, W - M - tw + 12, blockY + 50);
  doc.text(inr(totals.list), W - M - 12, blockY + 50, { align: "right" });
  doc.text(`Est. GST`, W - M - tw + 12, blockY + 64);
  doc.text(inr(totals.gst), W - M - 12, blockY + 64, { align: "right" });
  doc.setDrawColor(...BRAND_TEAL); doc.line(W - M - tw + 12, blockY + 70, W - M - 12, blockY + 70);
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(...BRAND_DARK);
  doc.text(`Inclusive Total`, W - M - tw + 12, blockY + 82);
  doc.text(inr(totals.list + totals.gst), W - M - 12, blockY + 82, { align: "right" });

  // Terms block (left)
  const termsW = W - M * 2 - tw - 16;
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...BRAND_TEAL);
  doc.text("TERMS & CONDITIONS", M, blockY + 12);
  doc.setDrawColor(...BRAND_TEAL); doc.line(M, blockY + 16, M + 110, blockY + 16);
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(60, 60, 60);
  const termsTxt = active.terms || "Prices are subject to availability and may change without prior notice. Quoted rates are exclusive of transport and installation unless specified. Payment terms as agreed. E&OE.";
  const lines = doc.splitTextToSize(termsTxt, termsW);
  doc.text(lines, M, blockY + 30);

  // Signature line
  doc.setDrawColor(180); doc.setLineWidth(0.4);
  doc.line(M, H - 60, M + 160, H - 60);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(120);
  doc.text(`For ${co.company_name || "Stone World"} — Authorised Signatory`, M, H - 48);

  const fname = `PriceList_${(active.buyer_name || "Customer").replace(/\s+/g, "_")}_${(active.category || "list").replace(/\s+/g, "_")}_${active.effective_from}.pdf`;
  doc.save(fname);
}