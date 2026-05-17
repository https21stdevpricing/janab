import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/empty";
import { fmt, inr } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel, importFromExcel, smartPick, num } from "@/lib/excel";

export const Route = createFileRoute("/app/products")({ component: ProductsPage });

type Row = {
  id: string; code: string; name: string; unit: string | null; hsn: string | null;
  purchase_rate: number | null; sale_rate: number | null; opening_stock: number | null; reorder_level: number | null;
};
type StockMeta = { product_id: string; on_hand: number; purchased: number; sold: number };

const empty: Omit<Row, "id"> = { code: "", name: "", unit: "sqft", hsn: "", purchase_rate: 0, sale_rate: 0, opening_stock: 0, reorder_level: 0 };

function ProductsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stock, setStock] = useState<Record<string, StockMeta>>({});
  const [tab, setTab] = useState<"stocked" | "order">("stocked");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id">>(empty);

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

  // Classify: a product is "Order-basis" when it has no opening stock AND no movements
  // (you sell it but don't keep yard inventory). Anything with stock or any in/out is "Stocked".
  const isOrderBasis = (r: Row) => {
    const m = stock[r.id];
    const moved = (m?.purchased ?? 0) + (m?.sold ?? 0);
    return Number(r.opening_stock ?? 0) === 0 && moved === 0;
  };

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

  const startNew = () => { setEdit(null); setForm(empty); setOpen(true); };
  const startEdit = (r: Row) => { setEdit(r); setForm({ code: r.code, name: r.name, unit: r.unit, hsn: r.hsn, purchase_rate: r.purchase_rate, sale_rate: r.sale_rate, opening_stock: r.opening_stock, reorder_level: r.reorder_level }); setOpen(true); };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = { ...form, user_id: user.id };
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

  return (
    <div>
      <PageHeader
        title="Products"
        description="Stones / slabs / SKUs. Split between items you stock and items you sell on order."
        actions={
          <>
          <ExcelBar onExport={onExport} onImport={onImport} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> New Product</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{edit ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
                <Field label="Unit"><Input value={form.unit ?? ""} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
                <Field label="Name" wide><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="HSN"><Input value={form.hsn ?? ""} onChange={(e) => setForm({ ...form, hsn: e.target.value })} /></Field>
                <Field label="Reorder level"><Input type="number" value={form.reorder_level ?? 0} onChange={(e) => setForm({ ...form, reorder_level: +e.target.value })} /></Field>
                <Field label="Purchase rate"><Input type="number" value={form.purchase_rate ?? 0} onChange={(e) => setForm({ ...form, purchase_rate: +e.target.value })} /></Field>
                <Field label="Sale rate"><Input type="number" value={form.sale_rate ?? 0} onChange={(e) => setForm({ ...form, sale_rate: +e.target.value })} /></Field>
                <Field label="Opening stock"><Input type="number" value={form.opening_stock ?? 0} onChange={(e) => setForm({ ...form, opening_stock: +e.target.value })} /></Field>
              </div>
              <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Tile label="SKUs" value={String(summary.skus)} />
        <Tile label="Units on hand" value={fmt(summary.onHand)} />
        <Tile label="Inventory value (cost)" value={inr(summary.valueCost)} />
        <Tile label="Inventory value (sale)" value={inr(summary.valueSale)} tone="good" />
        <Tile label="Low stock" value={String(summary.low)} tone={summary.low > 0 ? "bad" : undefined} />
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="stocked">Stocked <Badge variant="secondary" className="ml-1.5">{counts.stocked}</Badge></TabsTrigger>
            <TabsTrigger value="order">On-order only <Badge variant="secondary" className="ml-1.5">{counts.order}</Badge></TabsTrigger>
          </TabsList>
          <Input placeholder="Search code / name / HSN…" className="max-w-xs" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {tab === "stocked"
            ? "Items you hold in your yard. Inventory value and low-stock alerts are computed here."
            : "Items you sell on order — no opening stock, no movements. They don't affect inventory value or stock movements."}
        </p>
      </Tabs>

      {filtered.length === 0 ? (
        <Empty>No products yet — add your first SKU.</Empty>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Unit</TableHead><TableHead>HSN</TableHead>
                <TableHead className="text-right">Purchase ₹</TableHead><TableHead className="text-right">Sale ₹</TableHead>
                {tab === "stocked" && <>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Value (cost)</TableHead>
                </>}
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const oh = Number(stock[r.id]?.on_hand ?? r.opening_stock ?? 0);
                const low = oh <= Number(r.reorder_level ?? 0);
                const cost = oh * Number(r.purchase_rate ?? 0);
                return (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
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
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
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