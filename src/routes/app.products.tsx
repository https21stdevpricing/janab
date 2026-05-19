import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Empty } from "@/components/empty";
import { fmt, inr } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Calculator, Boxes, ClipboardList, Info, Search, Package, Wallet, AlertTriangle, Tag } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel, importFromExcel, smartPick, num } from "@/lib/excel";

export const Route = createFileRoute("/app/products")({ component: ProductsPage });

type Row = {
  id: string; code: string; name: string; unit: string | null; hsn: string | null;
  purchase_rate: number | null; sale_rate: number | null; opening_stock: number | null; reorder_level: number | null;
  kind: "stocked" | "order_basis";
  category: string | null;
};
type StockMeta = { product_id: string; on_hand: number; purchased: number; sold: number };

const empty: Omit<Row, "id"> = { code: "", name: "", unit: "sqft", hsn: "", purchase_rate: 0, sale_rate: 0, opening_stock: 0, reorder_level: 0, kind: "stocked", category: "" };

const UNITS = ["sqft", "sqm", "pcs", "box", "bag", "kg", "g", "ton", "m", "ft", "running ft", "ltr"] as const;

// Dimension → sqft conversion. Returns area in square feet.
function toSqft(l: number, b: number, unit: "in" | "cm" | "mm" | "ft" | "m") {
  if (!l || !b) return 0;
  const toFt: Record<typeof unit, number> = { in: 1 / 12, cm: 1 / 30.48, mm: 1 / 304.8, ft: 1, m: 3.28084 };
  const f = toFt[unit];
  return l * f * b * f;
}

function ProductsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stock, setStock] = useState<Record<string, StockMeta>>({});
  const [tab, setTab] = useState<"stocked" | "order">("stocked");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<"name" | "code" | "on_hand_desc" | "value_desc" | "low_first">("name");
  const [valuation, setValuation] = useState<"cost" | "sale">("cost");
  const [cogsMethod, setCogsMethod] = useState<"weighted_average" | "fifo">("weighted_average");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id">>(empty);
  // dimension calculator
  const [dim, setDim] = useState<{ l: number; b: number; pieces: number; unit: "in" | "cm" | "mm" | "ft" | "m" }>({ l: 0, b: 0, pieces: 1, unit: "in" });

  const load = async () => {
    const [{ data, error }, { data: sv }, { data: st }] = await Promise.all([
      supabase.from("products").select("*").order("code"),
      supabase.from("stock_view").select("product_id,on_hand,purchased,sold") as any,
      supabase.from("settings").select("cogs_method").maybeSingle(),
    ]);
    if (error) toast.error(error.message); else setRows((data ?? []) as Row[]);
    const m: Record<string, StockMeta> = {};
    for (const r of (sv ?? []) as any[]) m[r.product_id] = { product_id: r.product_id, on_hand: Number(r.on_hand ?? 0), purchased: Number(r.purchased ?? 0), sold: Number(r.sold ?? 0) };
    setStock(m);
    if ((st as any)?.cogs_method === "fifo" || (st as any)?.cogs_method === "weighted_average") setCogsMethod((st as any).cogs_method);
  };
  useEffect(() => { load(); }, []);

  // Classification is now explicit via the `kind` column.
  const isOrderBasis = (r: Row) => r.kind === "order_basis";

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.category) s.add(r.category);
    return ["all", ...Array.from(s).sort()];
  }, [rows]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = rows.filter(r => {
      const ob = isOrderBasis(r);
      if (tab === "stocked" && ob) return false;
      if (tab === "order" && !ob) return false;
      if (category !== "all" && (r.category ?? "") !== category) return false;
      if (ql && !`${r.code} ${r.name} ${r.hsn ?? ""}`.toLowerCase().includes(ql)) return false;
      return true;
    });
    const rateOf = (r: Row) => valuation === "cost" ? Number(r.purchase_rate ?? 0) : Number(r.sale_rate ?? 0);
    const ohOf = (r: Row) => Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
    const sorted = [...list];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "code") sorted.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
    else if (sort === "on_hand_desc") sorted.sort((a, b) => ohOf(b) - ohOf(a));
    else if (sort === "value_desc") sorted.sort((a, b) => ohOf(b) * rateOf(b) - ohOf(a) * rateOf(a));
    else if (sort === "low_first") sorted.sort((a, b) => (ohOf(a) - Number(a.reorder_level ?? 0)) - (ohOf(b) - Number(b.reorder_level ?? 0)));
    return sorted;
  }, [rows, stock, tab, q, category, sort, valuation]);

  const counts = useMemo(() => {
    let stocked = 0, order = 0;
    for (const r of rows) (isOrderBasis(r) ? order++ : stocked++);
    return { stocked, order };
  }, [rows, stock]);

  const summary = useMemo(() => {
    // KPIs reflect the currently selected tab so users trust what they see.
    const inScope = rows.filter(r => tab === "stocked" ? !isOrderBasis(r) : isOrderBasis(r));
    let onHand = 0, valueCost = 0, valueSale = 0, low = 0, zero = 0;
    const skus = inScope.length;
    for (const r of inScope) {
      const oh = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
      onHand += oh;
      valueCost += oh * Number(r.purchase_rate ?? 0);
      valueSale += oh * Number(r.sale_rate ?? 0);
      if (!isOrderBasis(r)) {
        if (oh <= 0) zero++;
        else if (oh <= Number(r.reorder_level ?? 0)) low++;
      }
    }
    return { onHand, valueCost, valueSale, low, zero, skus };
  }, [rows, stock, tab]);

  const totals = useMemo(() => {
    let oh = 0, valC = 0, valS = 0;
    for (const r of filtered) {
      const q = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
      oh += q;
      valC += q * Number(r.purchase_rate ?? 0);
      valS += q * Number(r.sale_rate ?? 0);
    }
    return { oh, valC, valS };
  }, [filtered, stock]);

  const startNew = (kind: "stocked" | "order_basis") => {
    setEdit(null); setForm({ ...empty, kind }); setDim({ l: 0, b: 0, pieces: 1, unit: "in" }); setOpen(true);
  };
  const startEdit = (r: Row) => {
    setEdit(r);
    setForm({ code: r.code, name: r.name, unit: r.unit, hsn: r.hsn, purchase_rate: r.purchase_rate, sale_rate: r.sale_rate, opening_stock: r.opening_stock, reorder_level: r.reorder_level, kind: r.kind ?? "stocked", category: r.category ?? "" });
    setDim({ l: 0, b: 0, pieces: 1, unit: "in" });
    setOpen(true);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!form.name?.trim()) { toast.error("Name is required"); return; }
    // On-order products do not hold yard inventory — force zero so accounting stays clean.
    const safe = form.kind === "order_basis"
      ? { ...form, opening_stock: 0, reorder_level: 0 }
      : form;
    const payload = { ...safe, user_id: user.id } as any;
    const { error } = edit
      ? await supabase.from("products").update(payload).eq("id", edit.id)
      : await supabase.from("products").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const onExport = () => {
    exportToExcel({
      filename: `products-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Products",
      columns: [
        { header: "Code", key: "code" },
        { header: "Name", key: "name" },
        { header: "Kind", key: "kind" },
        { header: "Unit", key: "unit" },
        { header: "HSN", key: "hsn" },
        { header: "Purchase Rate", key: "purchase_rate" },
        { header: "Sale Rate", key: "sale_rate" },
        { header: "Opening Stock", key: "opening_stock" },
        { header: "Reorder Level", key: "reorder_level" },
      ],
      rows,
    });
  };

  const onImport = async (file: File) => {
    try {
      const data = await importFromExcel(file);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = data
        .map((r) => ({
          user_id: user.id,
          kind: (String(smartPick(r, ["Kind", "Type"]) || "").toLowerCase().startsWith("order") ? "order_basis" : "stocked"),
          code: smartPick(r, ["Code", "SKU", "Item Code", "Product Code"]) || "",
          name: smartPick(r, ["Name", "Product Name", "Item", "Description"]) || "",
          unit: smartPick(r, ["Unit", "UOM", "Units"]) || "sqft",
          hsn: smartPick(r, ["HSN", "HSN Code", "HSN/SAC"]) || null,
          purchase_rate: num(smartPick(r, ["Purchase Rate", "Purchase", "Cost", "Buying Price", "Cost Price"])),
          sale_rate: num(smartPick(r, ["Sale Rate", "Sale", "Selling Price", "Price", "MRP"])),
          opening_stock: num(smartPick(r, ["Opening Stock", "Stock", "Qty", "Quantity"])),
          reorder_level: num(smartPick(r, ["Reorder Level", "Reorder", "Min Stock", "Min Qty"])),
        }))
        .filter((r) => r.name);
      if (payload.length === 0) { toast.error("No rows with a Name column"); return; }
      const { error } = await supabase.from("products").insert(payload);
      if (error) toast.error(error.message);
      else { toast.success(`Imported ${payload.length} products`); load(); }
    } catch (e: any) { toast.error(e.message ?? "Import failed"); }
  };

  const computedArea = toSqft(dim.l, dim.b, dim.unit) * (dim.pieces || 1);
  const showCalc = (form.unit ?? "").toLowerCase() === "sqft" && form.kind === "stocked";

  return (
    <div>
      <PageHeader
        title="Products"
        description="Master catalogue of every SKU you buy, stock, or sell — split between yard-held inventory and on-order items."
        actions={
          <>
          <ExcelBar onExport={onExport} onImport={onImport} />
          <Button size="sm" variant="outline" onClick={() => startNew("stocked")} title="Add an item you keep in your yard">
            <Boxes className="h-4 w-4" /> <span className="hidden sm:inline">Add stocked</span>
          </Button>
          <Button size="sm" onClick={() => startNew("order_basis")} title="Add an item you sell only on order">
            <ClipboardList className="h-4 w-4" /> <span className="hidden sm:inline">Add on-order</span>
          </Button>
          </>
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Kpi icon={Package} label={tab === "stocked" ? "Stocked SKUs" : "On-order SKUs"} value={String(summary.skus)} sub={`${rows.length} total in catalogue`} />
        <Kpi icon={Boxes} label="Units on hand" value={fmt(summary.onHand)} sub={tab === "stocked" ? "Across all stocked items" : "On-order items hold no stock"} />
        <Kpi icon={Wallet} label="Value at cost" value={inr(summary.valueCost)} sub="AS 2: lower of cost or NRV" />
        <Kpi icon={Tag} label="Value at sale" value={inr(summary.valueSale)} sub="Indicative sell-through value" tone="good" />
        <Kpi icon={AlertTriangle} label="Need attention" value={String(summary.low + summary.zero)} sub={`${summary.zero} out of stock · ${summary.low} low`} tone={(summary.low + summary.zero) > 0 ? "bad" : undefined} />
      </div>

      {/* How these numbers are calculated */}
      <Accordion type="single" collapsible className="mb-3">
        <AccordionItem value="calc" className="rounded-md border bg-card px-3">
          <AccordionTrigger className="text-sm py-2.5 hover:no-underline">
            <span className="flex items-center gap-2"><Info className="h-3.5 w-3.5 text-primary" /> How these numbers are calculated</span>
          </AccordionTrigger>
          <AccordionContent className="text-xs space-y-2.5 pb-3 leading-relaxed">
            <Calc title="Stocked vs On-order" formula="Stocked = items physically in your yard (movement tracked). On-order = bought-to-order items that never hold yard stock; their Opening / Reorder are forced to 0." />
            <Calc title="On hand" formula="Opening Stock + Σ Purchase quantity − Σ Sale quantity (from stock_view)." />
            <Calc title="Value at cost" formula={`Σ (On hand × Purchase rate). Valuation method in use: ${cogsMethod === "fifo" ? "FIFO" : "Weighted Average"}, applied with the AS 2 lower-of-cost-or-NRV rule on the Reports page.`} />
            <Calc title="Value at sale" formula="Σ (On hand × Sale rate). Indicative only — not booked to accounts until a Sale invoice is raised." />
            <Calc title="Need attention" formula="Zero = On hand ≤ 0. Low = 0 < On hand ≤ Reorder level. On-order items are excluded." />
            <Calc title="Slab → sqft" formula="Area = Length × Breadth (both converted to feet) × Pieces. Conversions: in ÷ 12, cm ÷ 30.48, mm ÷ 304.8, m × 3.28084." />
            <p className="pt-1 text-muted-foreground">Standards followed: <b>AS 2</b> (inventory valuation), <b>HSN</b> codes for GST classification. KPI scope follows the currently selected tab.</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Toolbar */}
      <section className="rounded-md border bg-card p-3 mb-3 space-y-2.5">
        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="stocked" className="flex-1 sm:flex-none"><Boxes className="h-3.5 w-3.5 mr-1" /> Stocked <Badge variant="secondary" className="ml-1.5">{counts.stocked}</Badge></TabsTrigger>
            <TabsTrigger value="order" className="flex-1 sm:flex-none"><ClipboardList className="h-3.5 w-3.5 mr-1" /> On-order <Badge variant="secondary" className="ml-1.5">{counts.order}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <div className="sm:col-span-5 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by name, code or HSN…" className="pl-7" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:col-span-3"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c === "all" ? "All categories" : c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={v => setSort(v as any)}>
            <SelectTrigger className="sm:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="code">Sort: Code</SelectItem>
              <SelectItem value="on_hand_desc">Sort: Stock ↓</SelectItem>
              <SelectItem value="value_desc">Sort: Value ↓</SelectItem>
              <SelectItem value="low_first">Sort: Low first</SelectItem>
            </SelectContent>
          </Select>
          <Select value={valuation} onValueChange={v => setValuation(v as any)}>
            <SelectTrigger className="sm:col-span-2"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cost">Show: Cost</SelectItem>
              <SelectItem value="sale">Show: Sale</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{filtered.length} of {tab === "stocked" ? counts.stocked : counts.order} shown</span>
          <span>Valuing at <b className="text-foreground">{valuation === "cost" ? "purchase" : "sale"}</b> rate · COGS method: <b className="text-foreground">{cogsMethod === "fifo" ? "FIFO" : "Weighted Avg"}</b></span>
        </div>
      </section>

      {filtered.length === 0 ? (
        <Empty>No products yet — add your first SKU.</Empty>
      ) : (
        <>
        <div className="hidden md:block rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead>HSN</TableHead>
                <TableHead className="text-right">Buy ₹</TableHead><TableHead className="text-right">Sell ₹</TableHead>
                {tab === "stocked" && <>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Value ({valuation})</TableHead>
                </>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const oh = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
                const reorder = Number(r.reorder_level ?? 0);
                const zero = oh <= 0;
                const low = !zero && oh <= reorder;
                const rate = valuation === "cost" ? Number(r.purchase_rate ?? 0) : Number(r.sale_rate ?? 0);
                const lineVal = oh * rate;
                return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => startEdit(r)}>
                  <TableCell><div className="font-medium">{r.name}</div><div className="font-mono text-xs text-muted-foreground">{r.code || "Auto code"}</div></TableCell>
                  <TableCell>{r.category || "—"}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="font-mono text-xs">{r.hsn}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.purchase_rate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.sale_rate)}</TableCell>
                  {tab === "stocked" && <>
                    <TableCell className="text-right tabular-nums font-medium">
                      {fmt(oh)}{" "}
                      {zero ? <Badge variant="destructive" className="ml-1 text-[10px]">Zero</Badge>
                        : low ? <Badge variant="outline" className="ml-1 text-[10px] border-amber-500 text-amber-600">Low</Badge>
                        : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(lineVal)}</TableCell>
                  </>}
                  <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
            {tab === "stocked" && (
              <tfoot>
                <tr className="border-t bg-muted/30 text-xs font-medium">
                  <td colSpan={4} className="px-4 py-2">Totals (filtered)</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">—</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(totals.oh)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{inr(valuation === "cost" ? totals.valC : totals.valS)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </Table>
        </div>
        <div className="md:hidden space-y-2">
          {filtered.map((r) => {
            const oh = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
            const reorder = Number(r.reorder_level ?? 0);
            const zero = oh <= 0;
            const low = !zero && oh <= reorder;
            const rate = valuation === "cost" ? Number(r.purchase_rate ?? 0) : Number(r.sale_rate ?? 0);
            const lineVal = oh * rate;
            return (
              <div key={r.id} className="rounded-md border bg-card p-3 space-y-3">
                <button type="button" className="w-full text-left" onClick={() => startEdit(r)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium leading-snug">{r.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.code || "Auto code"} · {r.unit || "unit"}{r.hsn ? ` · HSN ${r.hsn}` : ""}</div>
                    </div>
                    {tab === "stocked" && (zero
                      ? <Badge variant="destructive" className="text-[10px] shrink-0">Zero</Badge>
                      : low ? <Badge variant="outline" className="text-[10px] shrink-0 border-amber-500 text-amber-600">Low</Badge>
                      : null)}
                  </div>
                </button>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Buy" value={inr(r.purchase_rate ?? 0)} />
                  <MiniStat label="Sell" value={inr(r.sale_rate ?? 0)} />
                  <MiniStat label={tab === "stocked" ? "On hand" : "Type"} value={tab === "stocked" ? fmt(oh) : "Order"} />
                  {tab === "stocked" && <MiniStat label={`Value (${valuation})`} value={inr(lineVal)} />}
                  <MiniStat label="Category" value={r.category || "—"} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 text-destructive hover:text-destructive" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {form.kind === "order_basis" ? <ClipboardList className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
              {edit ? "Edit product" : (form.kind === "order_basis" ? "New on-order product" : "New inventory product")}
            </DialogTitle>
          </DialogHeader>

          {/* Kind switcher (also editable when fixing a mis-tagged item) */}
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-1">
            <button
              type="button"
              className={`text-xs px-2 py-1.5 rounded ${form.kind === "stocked" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}
              onClick={() => setForm({ ...form, kind: "stocked" })}
            >Inventory (held in yard)</button>
            <button
              type="button"
              className={`text-xs px-2 py-1.5 rounded ${form.kind === "order_basis" ? "bg-background shadow font-medium" : "text-muted-foreground"}`}
              onClick={() => setForm({ ...form, kind: "order_basis", opening_stock: 0, reorder_level: 0 })}
            >On-order only</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Code (auto if empty)"><Input value={form.code} placeholder="P-####" onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Unit">
              <Select value={form.unit ?? "sqft"} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Name *" wide><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Black Galaxy Granite" /></Field>
            <Field label="HSN"><Input value={form.hsn ?? ""} onChange={(e) => setForm({ ...form, hsn: e.target.value })} placeholder="GST HSN code" /></Field>
            <Field label="Category" wide><Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Granite / Marble / Tiles — used to group price lists" /></Field>
            <Field label="Purchase rate (per unit)"><Input type="number" inputMode="decimal" value={form.purchase_rate ?? 0} onChange={(e) => setForm({ ...form, purchase_rate: +e.target.value })} /></Field>
            <Field label="Sale rate (per unit)" wide={form.kind === "order_basis"}><Input type="number" inputMode="decimal" value={form.sale_rate ?? 0} onChange={(e) => setForm({ ...form, sale_rate: +e.target.value })} /></Field>
            {form.kind === "stocked" && (
              <>
                <Field label="Opening stock"><Input type="number" inputMode="decimal" value={form.opening_stock ?? 0} onChange={(e) => setForm({ ...form, opening_stock: +e.target.value })} /></Field>
                <Field label="Reorder level"><Input type="number" inputMode="decimal" value={form.reorder_level ?? 0} onChange={(e) => setForm({ ...form, reorder_level: +e.target.value })} /></Field>
              </>
            )}
          </div>

          {showCalc && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="text-xs font-medium flex items-center gap-1.5"><Calculator className="h-3.5 w-3.5" /> Slab → sqft calculator</div>
              <div className="grid grid-cols-4 gap-2">
                <div className="space-y-1"><Label className="text-[10px]">Length</Label><Input type="number" inputMode="decimal" value={dim.l || ""} onChange={(e) => setDim({ ...dim, l: +e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-[10px]">Breadth</Label><Input type="number" inputMode="decimal" value={dim.b || ""} onChange={(e) => setDim({ ...dim, b: +e.target.value })} /></div>
                <div className="space-y-1"><Label className="text-[10px]">Unit</Label>
                  <Select value={dim.unit} onValueChange={(v) => setDim({ ...dim, unit: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["in", "cm", "mm", "ft", "m"] as const).map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label className="text-[10px]">Pieces</Label><Input type="number" inputMode="numeric" value={dim.pieces || ""} onChange={(e) => setDim({ ...dim, pieces: +e.target.value })} /></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Area: </span>
                  <span className="font-semibold tabular-nums">{fmt(computedArea)} sqft</span>
                  {dim.pieces > 1 && <span className="text-muted-foreground"> ({fmt(toSqft(dim.l, dim.b, dim.unit))} × {dim.pieces})</span>}
                </div>
                <Button size="sm" type="button" variant="outline" disabled={!computedArea}
                  onClick={() => setForm({ ...form, opening_stock: +computedArea.toFixed(2) })}>
                  Use as opening stock
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button onClick={save} className="w-full sm:w-auto">Save product</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2 space-y-1.5" : "space-y-1.5"}>
      <Label className="text-xs">{label}</Label>
      {children}
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

function Kpi({ icon: Icon, label, value, sub, tone }: { icon: any; label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{sub}</div>}
    </div>
  );
}

function Calc({ title, formula }: { title: string; formula: string }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="font-medium text-foreground">{title}</div>
      <div className="text-muted-foreground">{formula}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2 min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium truncate tabular-nums">{value}</div>
    </div>
  );
}