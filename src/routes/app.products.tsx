import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/empty";
import { fmt, inr } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Calculator, Boxes, ClipboardList, Search, ListPlus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel, importFromExcel, smartPick, num } from "@/lib/excel";
import { CollapseFilters } from "@/components/collapse-filters";
import { KpiGrid, KpiTile, SegmentedTabs } from "@/components/ui-tokens";

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
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id">>(empty);
  // bulk add
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkKind, setBulkKind] = useState<"stocked" | "order_basis">("stocked");
  // dimension calculator
  const [dim, setDim] = useState<{ l: number; b: number; pieces: number; unit: "in" | "cm" | "mm" | "ft" | "m" }>({ l: 0, b: 0, pieces: 1, unit: "in" });

  const load = async () => {
    const [{ data, error }, { data: sv }] = await Promise.all([
      supabase.from("products").select("*").order("code"),
      supabase.from("stock_view").select("product_id,on_hand,purchased,sold") as any,
    ]);
    if (error) toast.error(error.message); else setRows((data ?? []) as Row[]);
    const m: Record<string, StockMeta> = {};
    for (const r of (sv ?? []) as any[]) m[r.product_id] = { product_id: r.product_id, on_hand: Number(r.on_hand ?? 0), purchased: Number(r.purchased ?? 0), sold: Number(r.sold ?? 0) };
    setStock(m);
  };
  useEffect(() => { load(); }, []);

  // Classification is now explicit via the `kind` column.
  const isOrderBasis = (r: Row) => r.kind === "order_basis";

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter(r => {
      const ob = isOrderBasis(r);
      if (tab === "stocked" && ob) return false;
      if (tab === "order" && !ob) return false;
      if (ql && !`${r.code} ${r.name} ${r.hsn ?? ""}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [rows, stock, tab, q]);

  const counts = useMemo(() => {
    let stocked = 0, order = 0;
    for (const r of rows) (isOrderBasis(r) ? order++ : stocked++);
    return { stocked, order };
  }, [rows, stock]);

  const summary = useMemo(() => {
    let onHand = 0, valueCost = 0, valueSale = 0, low = 0, skus = rows.length;
    for (const r of rows) {
      const oh = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
      onHand += oh;
      valueCost += oh * Number(r.purchase_rate ?? 0);
      valueSale += oh * Number(r.sale_rate ?? 0);
      if (!isOrderBasis(r) && oh <= Number(r.reorder_level ?? 0)) low++;
    }
    return { onHand, valueCost, valueSale, low, skus };
  }, [rows, stock]);

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

  const saveBulk = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Sign-in required"); return; }
    const lines = bulkText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) { toast.error("Paste at least one row"); return; }
    const payload: any[] = [];
    for (const ln of lines) {
      // Accept tab / comma / pipe separators
      const parts = ln.split(/[\t|,]/).map(p => p.trim());
      const [name, unit, qty, purchase, sale, hsn] = parts;
      if (!name) continue;
      payload.push({
        user_id: user.id,
        kind: bulkKind,
        name,
        code: "",
        unit: unit || "sqft",
        hsn: hsn || null,
        purchase_rate: Number(purchase) || 0,
        sale_rate: Number(sale) || 0,
        opening_stock: bulkKind === "order_basis" ? 0 : (Number(qty) || 0),
        reorder_level: 0,
      });
    }
    if (payload.length === 0) { toast.error("No valid rows"); return; }
    const { error } = await supabase.from("products").insert(payload as never);
    if (error) { toast.error(error.message); return; }
    toast.success(`Added ${payload.length} products`);
    setBulkText(""); setBulkOpen(false); load();
  };

  const computedArea = toSqft(dim.l, dim.b, dim.unit) * (dim.pieces || 1);
  const showCalc = (form.unit ?? "").toLowerCase() === "sqft" && form.kind === "stocked";

  return (
    <div>
      <PageHeader
        title="Products"
        description="Your catalog of stones, slabs and SKUs — both items you stock and items you sell on order."
        actions={
          <>
            <ExcelBar onExport={onExport} onImport={onImport} />
            <Button size="sm" variant="outline" onClick={() => { setBulkKind(tab === "order" ? "order_basis" : "stocked"); setBulkOpen(true); }}>
              <ListPlus className="h-4 w-4" /> Bulk add
            </Button>
            <Button size="sm" onClick={() => startNew(tab === "order" ? "order_basis" : "stocked")}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          </>
        }
      />

      {/* Top KPI strip — same shared tiles used across Stock / Money / Reports */}
      <KpiGrid cols={4} className="mb-4">
        <KpiTile label="Total SKUs" value={String(summary.skus)} hint={`${counts.stocked} stocked · ${counts.order} on-order`} />
        <KpiTile label="Units on hand" value={fmt(summary.onHand)} hint="Across all stocked items" />
        <KpiTile label="Inventory value" value={inr(summary.valueCost)} hint={`Sale value ${inr(summary.valueSale)}`} />
        <KpiTile label="Low stock" value={String(summary.low)} tone={summary.low > 0 ? "bad" : "good"} hint={summary.low > 0 ? "Action needed" : "All above reorder"} />
      </KpiGrid>

      {/* Kind selector — shared segmented pill, same as Money page */}
      <div className="mb-3">
        <SegmentedTabs
          value={tab}
          onValueChange={(v) => setTab(v as any)}
          items={[
            { value: "stocked", label: <span>Stocked <span className="ml-1 text-muted-foreground">{counts.stocked}</span></span>, icon: <Boxes className="h-3.5 w-3.5" /> },
            { value: "order", label: <span>On-order <span className="ml-1 text-muted-foreground">{counts.order}</span></span>, icon: <ClipboardList className="h-3.5 w-3.5" /> },
          ]}
        />
      </div>

      <CollapseFilters
        summary={`${filtered.length} shown`}
        active={q ? 1 : 0}
        onClear={() => setQ("")}
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search name, code, category or HSN…" className="pl-8" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </CollapseFilters>

      {/* Context strip — short explanation of current tab */}
      <div className="text-xs text-muted-foreground mb-3 px-1">
        {tab === "stocked"
          ? "Stocked items live in your yard. They affect inventory value, stock movement reports and low-stock alerts."
          : "On-order items are billed directly from supplier to buyer (drop-ship). They do not hold any yard stock."}
      </div>

      {filtered.length === 0 ? (
        <Empty>No products yet — add your first SKU.</Empty>
      ) : (
        <>
        <div className="hidden md:block rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead>HSN</TableHead>
                <TableHead className="text-right">Purchase ₹</TableHead><TableHead className="text-right">Sale ₹</TableHead>
                {tab === "stocked" && <>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Value (cost)</TableHead>
                </>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const oh = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
                const low = oh <= Number(r.reorder_level ?? 0);
                const cost = oh * Number(r.purchase_rate ?? 0);
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
                      {fmt(oh)} {low && <Badge variant="destructive" className="ml-1 text-[10px]">Low</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inr(cost)}</TableCell>
                  </>}
                  <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="md:hidden space-y-2">
          {filtered.map((r) => {
            const oh = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
            const low = oh <= Number(r.reorder_level ?? 0);
            const cost = oh * Number(r.purchase_rate ?? 0);
            return (
              <div key={r.id} className="rounded-md border bg-card p-3 space-y-3">
                <button type="button" className="w-full text-left" onClick={() => startEdit(r)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium leading-snug">{r.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.code || "Auto code"} · {r.unit || "unit"}{r.hsn ? ` · HSN ${r.hsn}` : ""}</div>
                    </div>
                    {tab === "stocked" && low && <Badge variant="destructive" className="text-[10px] shrink-0">Low</Badge>}
                  </div>
                </button>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Buy" value={inr(r.purchase_rate ?? 0)} />
                  <MiniStat label="Sell" value={inr(r.sale_rate ?? 0)} />
                  <MiniStat label={tab === "stocked" ? "On hand" : "Type"} value={tab === "stocked" ? fmt(oh) : "Order"} />
                  {tab === "stocked" && <MiniStat label="Cost value" value={inr(cost)} />}
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

      {/* Bulk add */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ListPlus className="h-4 w-4" /> Bulk add products</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-1">
              <button type="button" className={`text-xs px-2 py-1.5 rounded ${bulkKind === "stocked" ? "bg-background shadow font-medium" : "text-muted-foreground"}`} onClick={() => setBulkKind("stocked")}>Inventory</button>
              <button type="button" className={`text-xs px-2 py-1.5 rounded ${bulkKind === "order_basis" ? "bg-background shadow font-medium" : "text-muted-foreground"}`} onClick={() => setBulkKind("order_basis")}>On-order</button>
            </div>
            <div className="text-xs text-muted-foreground">
              One product per line. Separate fields with <span className="font-mono">tab</span>, <span className="font-mono">,</span> or <span className="font-mono">|</span>.<br />
              <span className="font-mono">Name | Unit | Qty | PurchaseRate | SaleRate | HSN</span>
            </div>
            <Textarea
              rows={10}
              className="font-mono text-xs"
              placeholder={"Italian Marble 24x24 | sqft | 1200 | 95 | 145 | 6802\nGreen Granite | sqft | 800 | 75 | 110 | 6802\nKota Stone | sqft | 0 | 40 | 65 | 6802"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="text-[11px] text-muted-foreground">{bulkText.split(/\r?\n/).filter(l => l.trim()).length} row(s) ready</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={saveBulk}>Add products</Button>
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2 min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-medium truncate tabular-nums">{value}</div>
    </div>
  );
}