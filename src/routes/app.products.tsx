import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Empty } from "@/components/empty";
import { fmt } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel, importFromExcel, pick, num } from "@/lib/excel";

export const Route = createFileRoute("/app/products")({ component: ProductsPage });

type Row = {
  id: string; code: string; name: string; unit: string | null; hsn: string | null;
  purchase_rate: number | null; sale_rate: number | null; opening_stock: number | null; reorder_level: number | null;
};

const empty: Omit<Row, "id"> = { code: "", name: "", unit: "sqft", hsn: "", purchase_rate: 0, sale_rate: 0, opening_stock: 0, reorder_level: 0 };

function ProductsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id">>(empty);

  const load = async () => {
    const { data, error } = await supabase.from("products").select("*").order("code");
    if (error) toast.error(error.message); else setRows((data ?? []) as Row[]);
  };
  useEffect(() => { load(); }, []);

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
          code: pick(r, "Code", "code") || "",
          name: pick(r, "Name", "name") || "",
          unit: pick(r, "Unit", "unit") || "sqft",
          hsn: pick(r, "HSN", "hsn") || null,
          purchase_rate: num(pick(r, "Purchase Rate", "purchase_rate", "Purchase")),
          sale_rate: num(pick(r, "Sale Rate", "sale_rate", "Sale")),
          opening_stock: num(pick(r, "Opening Stock", "opening_stock", "Stock")),
          reorder_level: num(pick(r, "Reorder Level", "reorder_level", "Reorder")),
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
        description="Stones / slabs / SKUs you trade in"
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
      {rows.length === 0 ? (
        <Empty>No products yet — add your first SKU.</Empty>
      ) : (
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Unit</TableHead><TableHead>HSN</TableHead>
                <TableHead className="text-right">Purchase ₹</TableHead><TableHead className="text-right">Sale ₹</TableHead>
                <TableHead className="text-right">Opening</TableHead><TableHead className="text-right">Reorder</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="font-mono text-xs">{r.hsn}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.purchase_rate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.sale_rate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.opening_stock)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.reorder_level)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
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