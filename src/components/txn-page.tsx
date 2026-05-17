import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Empty } from "@/components/empty";
import { ContactPicker } from "@/components/contact-picker";
import { LineItemsEditor, type Item } from "@/components/line-items";
import { fmt, fmtDate, todayISO } from "@/lib/format";
import { nextDocNo } from "@/lib/auto-number";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Printer } from "lucide-react";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";

export type TxnConfig = {
  title: string;
  description: string;
  table: "sales" | "purchases" | "quotations" | "third_party";
  itemsTable: "sale_items" | "purchase_items" | "quotation_items" | "tp_items";
  itemsFk: "sale_id" | "purchase_id" | "quotation_id" | "tp_id";
  noField: "invoice_no" | "po_no" | "quote_no" | "tp_no";
  prefix: "INV" | "PO" | "QUO" | "TP";
  partyRole: "buyer" | "supplier" | "tp";
  printPath?: "invoice" | "quote" | null;
};

export function TxnPage({ cfg }: { cfg: TxnConfig }) {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [docNo, setDocNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [buyerId, setBuyerId] = useState<string | null>(null);
  const [buyerName, setBuyerName] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [validUntil, setValidUntil] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([]);

  const load = async () => {
    const { data } = await supabase.from(cfg.table).select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, [cfg.table]);

  const startNew = async () => {
    setEditing(null);
    setDate(todayISO()); setBuyerId(null); setBuyerName(null); setSupplierId(null); setSupplierName(null);
    setValidUntil(""); setNotes(""); setItems([cfg.partyRole === "tp" ? { qty: 1, rate: 0, gst_pct: 18, purchase_rate: 0, sale_rate: 0 } : { qty: 1, rate: 0, gst_pct: 18 }]);
    setDocNo(await nextDocNo(cfg.table, cfg.noField, cfg.prefix));
    setOpen(true);
  };

  const startEdit = async (r: any) => {
    setEditing(r);
    setDocNo(r[cfg.noField]); setDate(r.date);
    setBuyerId(r.buyer_id ?? null); setBuyerName(r.buyer_name ?? null);
    setSupplierId(r.supplier_id ?? null); setSupplierName(r.supplier_name ?? null);
    setValidUntil(r.valid_until ?? ""); setNotes(r.notes ?? "");
    const { data: its } = await supabase.from(cfg.itemsTable).select("*").eq(cfg.itemsFk as never, r.id).order("position");
    setItems((its ?? []).map((it: any) => ({
      product_id: it.product_id, product_name: it.product_name, unit: it.unit, qty: Number(it.qty),
      rate: Number(it.rate ?? 0), gst_pct: Number(it.gst_pct ?? 18),
      purchase_rate: Number(it.purchase_rate ?? 0), sale_rate: Number(it.sale_rate ?? 0),
    })));
    setOpen(true);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (items.length === 0) { toast.error("Add at least one line item"); return; }

    // Checkpoint: prevent overselling on Sales (sale_items with product_id reduce stock)
    if (cfg.table === "sales") {
      const ids = items.map(i => i.product_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data: stk } = await supabase
          .from("stock_view" as never).select("product_id,on_hand")
          .in("product_id" as never, ids) as any;
        // when editing, current line qty is already counted in stock_view as sold — add it back
        const prevQty: Record<string, number> = {};
        if (editing) {
          const { data: prev } = await supabase.from(cfg.itemsTable)
            .select("product_id,qty").eq(cfg.itemsFk as never, editing.id);
          for (const r of (prev ?? []) as any[]) if (r.product_id) prevQty[r.product_id] = (prevQty[r.product_id] ?? 0) + Number(r.qty ?? 0);
        }
        const onHand: Record<string, number> = {};
        for (const r of (stk ?? []) as any[]) onHand[r.product_id] = Number(r.on_hand ?? 0) + (prevQty[r.product_id] ?? 0);
        const want: Record<string, { qty: number; name: string }> = {};
        for (const it of items) {
          if (!it.product_id) continue;
          want[it.product_id] = { qty: (want[it.product_id]?.qty ?? 0) + Number(it.qty ?? 0), name: it.product_name ?? "" };
        }
        for (const [pid, w] of Object.entries(want)) {
          const avail = onHand[pid] ?? 0;
          if (w.qty > avail + 0.0001) {
            toast.error(`Insufficient stock for ${w.name || "item"}: need ${w.qty}, available ${avail.toFixed(2)}`);
            return;
          }
        }
      }
    }

    const header: any = { user_id: user.id, [cfg.noField]: docNo, date, notes };
    if (cfg.partyRole === "buyer") { header.buyer_id = buyerId; header.buyer_name = buyerName; }
    if (cfg.partyRole === "supplier") { header.supplier_id = supplierId; header.supplier_name = supplierName; }
    if (cfg.partyRole === "tp") { header.buyer_id = buyerId; header.buyer_name = buyerName; header.supplier_id = supplierId; header.supplier_name = supplierName; }
    if (cfg.table === "quotations") header.valid_until = validUntil || null;

    let id: string;
    if (editing) {
      const { error } = await supabase.from(cfg.table).update(header).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      id = editing.id;
      await supabase.from(cfg.itemsTable).delete().eq(cfg.itemsFk as never, id);
    } else {
      const { data: ins, error } = await supabase.from(cfg.table).insert(header).select().single();
      if (error || !ins) { toast.error(error?.message ?? "Failed"); return; }
      id = ins.id;
    }

    const itemRows = items.map((it, i) => {
      const base: any = {
        [cfg.itemsFk]: id, product_id: it.product_id ?? null, product_name: it.product_name ?? null,
        unit: it.unit ?? null, qty: it.qty, gst_pct: it.gst_pct, position: i,
      };
      if (cfg.partyRole === "tp") { base.purchase_rate = it.purchase_rate ?? 0; base.sale_rate = it.sale_rate ?? 0; }
      else { base.rate = it.rate; }
      return base;
    });
    const { error: e2 } = await supabase.from(cfg.itemsTable).insert(itemRows);
    if (e2) { toast.error(e2.message); return; }
    toast.success("Saved");
    setOpen(false); load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from(cfg.table).delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const onExport = async () => {
    const { data: its } = await supabase.from(cfg.itemsTable).select("*");
    const byDoc: Record<string, any[]> = {};
    for (const it of its ?? []) {
      const k = (it as any)[cfg.itemsFk] as string;
      (byDoc[k] ??= []).push(it);
    }
    const exportRows = rows.map((r) => {
      const list = byDoc[r.id] ?? [];
      let sub = 0, gst = 0;
      for (const it of list) {
        const rate = Number(it.sale_rate ?? it.rate ?? 0);
        const base = Number(it.qty ?? 0) * rate;
        sub += base;
        gst += base * Number(it.gst_pct ?? 0) / 100;
      }
      return {
        no: r[cfg.noField], date: r.date,
        party: cfg.partyRole === "tp"
          ? `${r.supplier_name ?? ""} -> ${r.buyer_name ?? ""}`
          : (r.buyer_name ?? r.supplier_name ?? ""),
        items: list.length,
        subtotal: +sub.toFixed(2),
        gst: +gst.toFixed(2),
        total: +(sub + gst).toFixed(2),
        notes: r.notes ?? "",
      };
    });
    exportToExcel({
      filename: `${cfg.table}-${new Date().toISOString().slice(0, 10)}`,
      sheetName: cfg.title,
      columns: [
        { header: "No.", key: "no" },
        { header: "Date", key: "date" },
        { header: "Party", key: "party" },
        { header: "Items", key: "items" },
        { header: "Subtotal", key: "subtotal" },
        { header: "GST", key: "gst" },
        { header: "Total", key: "total" },
        { header: "Notes", key: "notes" },
      ],
      rows: exportRows,
    });
  };

  return (
    <div>
      <PageHeader title={cfg.title} description={cfg.description} actions={
        <>
          <ExcelBar onExport={onExport} />
          <Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> New</Button>
        </>
      } />

      {rows.length === 0 ? <Empty>No entries yet.</Empty> : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="rounded-md border bg-card p-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">{r[cfg.noField]}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.date)}</span>
                </div>
                <div className="text-sm truncate">
                  {cfg.partyRole === "tp"
                    ? <>{r.supplier_name ?? "—"} → {r.buyer_name ?? "—"}</>
                    : (r.buyer_name ?? r.supplier_name ?? "—")}
                </div>
              </div>
              <div className="flex gap-1">
                {cfg.printPath && (
                  <Button asChild variant="ghost" size="icon" title="Print">
                    <Link to={"/app/print/" + cfg.printPath + "/$id" as any} params={{ id: r.id } as any}><Printer className="h-4 w-4" /></Link>
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? `Edit ${cfg.title.slice(0, -1) || cfg.title}` : `New ${cfg.title}`}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">No.</Label><Input value={docNo} onChange={(e) => setDocNo(e.target.value)} className="font-mono" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              {cfg.table === "quotations" && (
                <div className="space-y-1.5"><Label className="text-xs">Valid until</Label><Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></div>
              )}
              {(cfg.partyRole === "buyer" || cfg.partyRole === "tp") && (
                <div className="space-y-1.5 col-span-2"><Label className="text-xs">Buyer</Label><ContactPicker filter="buyer" value={buyerId} onChange={(id, n) => { setBuyerId(id); setBuyerName(n); }} /></div>
              )}
              {(cfg.partyRole === "supplier" || cfg.partyRole === "tp") && (
                <div className="space-y-1.5 col-span-2"><Label className="text-xs">Supplier</Label><ContactPicker filter="supplier" value={supplierId} onChange={(id, n) => { setSupplierId(id); setSupplierName(n); }} /></div>
              )}
            </div>
            <LineItemsEditor items={items} onChange={setItems} mode={cfg.partyRole === "tp" ? "tp" : "single"} />
            <div className="space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { fmt };