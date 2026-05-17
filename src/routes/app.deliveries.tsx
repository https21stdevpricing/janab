import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/empty";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fmtDate, fmt } from "@/lib/format";
import { toast } from "sonner";
import { Truck, ChevronRight, Search, Pencil, MapPin, Phone, FileText } from "lucide-react";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";

export const Route = createFileRoute("/app/deliveries")({ component: DeliveriesPage });

type Delivery = { id: string; delivery_no: string; sale_id: string | null; invoice_no: string | null; date: string;
  buyer_id: string | null; buyer_name: string | null; ship_address: string | null; vehicle_no: string | null;
  driver_name: string | null; driver_phone: string | null; transporter: string | null; lr_no: string | null;
  status: string; dispatched_at: string | null; delivered_at: string | null; notes: string | null };
type DItem = { id: string; product_name: string | null; unit: string | null; qty_ordered: number; qty_delivered: number; position: number };

const STATUSES = ["pending", "packed", "dispatched", "delivered", "cancelled"];
const badgeFor = (s: string) => s === "delivered" ? "default" : s === "dispatched" ? "secondary" : s === "cancelled" ? "destructive" : "outline";

function DeliveriesPage() {
  const [rows, setRows] = useState<Delivery[]>([]);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [edit, setEdit] = useState<Delivery | null>(null);
  const [items, setItems] = useState<DItem[]>([]);
  const [findInv, setFindInv] = useState("");
  const [previewMode, setPreviewMode] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("deliveries" as never).select("*").order("date", { ascending: false }).order("created_at" as never, { ascending: false }) as any;
    setRows((data ?? []) as Delivery[]);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("deliveries-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => rows.filter(r =>
    (statusF === "all" || r.status === statusF) &&
    (q === "" || r.delivery_no.toLowerCase().includes(q.toLowerCase()) ||
      (r.invoice_no ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (r.buyer_name ?? "").toLowerCase().includes(q.toLowerCase()))
  ), [rows, q, statusF]);

  const openEdit = async (d: Delivery) => {
    setEdit(d);
    setPreviewMode(true);
    const { data } = await supabase.from("delivery_items" as never).select("*").eq("delivery_id" as never, d.id).order("position") as any;
    setItems((data ?? []) as DItem[]);
  };

  const save = async () => {
    if (!edit) return;
    const { error } = await supabase.from("deliveries" as never).update({
      vehicle_no: edit.vehicle_no, driver_name: edit.driver_name, driver_phone: edit.driver_phone,
      transporter: edit.transporter, lr_no: edit.lr_no, ship_address: edit.ship_address,
      notes: edit.notes, status: edit.status,
    } as never).eq("id" as never, edit.id);
    if (error) { toast.error(error.message); return; }
    for (const it of items) {
      await supabase.from("delivery_items" as never).update({ qty_delivered: it.qty_delivered } as never).eq("id" as never, it.id);
    }
    toast.success("Delivery saved"); setPreviewMode(true); load();
    // refresh local edit row from db
    const { data: fresh } = await supabase.from("deliveries" as never).select("*").eq("id" as never, edit.id).maybeSingle() as any;
    if (fresh) setEdit(fresh as Delivery);
  };

  const findByInvoice = async () => {
    const t = findInv.trim().toUpperCase();
    if (!t) return;
    const { data } = await supabase.from("deliveries" as never).select("*").eq("invoice_no" as never, t).maybeSingle() as any;
    if (!data) { toast.error("No delivery for " + t); return; }
    openEdit(data as Delivery);
  };

  const onExport = () => exportToExcel({
    filename: `deliveries-${new Date().toISOString().slice(0,10)}`, sheetName: "Deliveries",
    columns: [
      { header: "No.", key: "delivery_no" }, { header: "Date", key: "date" },
      { header: "Invoice", key: "invoice_no" }, { header: "Buyer", key: "buyer_name" },
      { header: "Status", key: "status" }, { header: "Vehicle", key: "vehicle_no" },
      { header: "Driver", key: "driver_name" }, { header: "Phone", key: "driver_phone" },
      { header: "Transporter", key: "transporter" }, { header: "LR", key: "lr_no" },
    ], rows: filtered,
  });

  return (
    <div>
      <PageHeader title="Deliveries" description="Auto-created from every sale, editable here"
        actions={<ExcelBar onExport={onExport} />} />

      <div className="rounded-md border bg-muted/30 p-3 mb-3">
        <Label className="text-xs">Find delivery by invoice id</Label>
        <div className="flex gap-2 mt-1">
          <Input className="font-mono max-w-xs" placeholder="e.g. INV-0001" value={findInv}
            onChange={e => setFindInv(e.target.value)}
            onKeyDown={e => e.key === "Enter" && (e.preventDefault(), findByInvoice())} />
          <Button variant="outline" onClick={findByInvoice}><Search className="h-4 w-4" /> Open</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Input className="max-w-xs" placeholder="Search no, invoice, buyer…" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} deliveries</div>
      </div>

      {filtered.length === 0 ? <Empty>No deliveries match.</Empty> : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="rounded-md border bg-card p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40" onClick={() => openEdit(r)}>
              <Truck className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-medium">{r.delivery_no}</span>
                  {r.invoice_no && <Link to={"/app/lookup" as any} className="text-xs text-muted-foreground hover:underline" onClick={e => e.stopPropagation()}>· {r.invoice_no}</Link>}
                  <span className="text-xs text-muted-foreground">{fmtDate(r.date)}</span>
                </div>
                <div className="text-sm truncate">{r.buyer_name ?? "—"}{r.vehicle_no ? ` · ${r.vehicle_no}` : ""}</div>
              </div>
              <Badge variant={badgeFor(r.status) as any} className="capitalize">{r.status}</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              {edit?.delivery_no} {edit?.invoice_no ? `· ${edit.invoice_no}` : ""}
              {edit && <Badge variant={badgeFor(edit.status) as any} className="capitalize ml-2">{edit.status}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {edit && previewMode && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2 rounded-md border bg-muted/30 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground">Buyer</div>
                  <div className="font-medium">{edit.buyer_name ?? "—"}</div>
                  {edit.ship_address && <div className="text-xs text-muted-foreground flex items-start gap-1 mt-1"><MapPin className="h-3 w-3 mt-0.5" /> {edit.ship_address}</div>}
                </div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Date</div><div>{fmtDate(edit.date)}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Vehicle</div><div>{edit.vehicle_no || "—"}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Driver</div><div>{edit.driver_name || "—"}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Phone</div><div className="flex items-center gap-1">{edit.driver_phone ? <><Phone className="h-3 w-3" />{edit.driver_phone}</> : "—"}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Transporter</div><div>{edit.transporter || "—"}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">LR no</div><div>{edit.lr_no || "—"}</div></div>
                {edit.notes && <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground">Notes</div><div className="flex items-start gap-1"><FileText className="h-3 w-3 mt-0.5" />{edit.notes}</div></div>}
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Items</div>
                {items.length === 0 ? <div className="text-xs text-muted-foreground border rounded-md p-2">No items yet.</div> : (
                  <div className="border rounded-md overflow-x-auto">
                    <table className="w-full text-sm min-w-[420px]">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                        <tr><th className="text-left p-2">Product</th><th className="text-right p-2">Ordered</th><th className="text-right p-2">Delivered</th></tr>
                      </thead>
                      <tbody>
                        {items.map(it => (
                          <tr key={it.id} className="border-t">
                            <td className="p-2">{it.product_name}</td>
                            <td className="p-2 text-right tabular-nums">{fmt(it.qty_ordered)} {it.unit}</td>
                            <td className="p-2 text-right tabular-nums">{fmt(it.qty_delivered)} {it.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          {edit && !previewMode && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><Label className="text-xs">Buyer</Label>
                  <Input value={edit.buyer_name ?? ""} disabled /></div>
                <div className="col-span-2"><Label className="text-xs">Ship address</Label>
                  <Input value={edit.ship_address ?? ""} onChange={e => setEdit({ ...edit, ship_address: e.target.value })} /></div>
                <div><Label className="text-xs">Vehicle no</Label>
                  <Input value={edit.vehicle_no ?? ""} onChange={e => setEdit({ ...edit, vehicle_no: e.target.value })} /></div>
                <div><Label className="text-xs">Transporter</Label>
                  <Input value={edit.transporter ?? ""} onChange={e => setEdit({ ...edit, transporter: e.target.value })} /></div>
                <div><Label className="text-xs">Driver name</Label>
                  <Input value={edit.driver_name ?? ""} onChange={e => setEdit({ ...edit, driver_name: e.target.value })} /></div>
                <div><Label className="text-xs">Driver phone</Label>
                  <Input value={edit.driver_phone ?? ""} onChange={e => setEdit({ ...edit, driver_phone: e.target.value })} /></div>
                <div><Label className="text-xs">LR no</Label>
                  <Input value={edit.lr_no ?? ""} onChange={e => setEdit({ ...edit, lr_no: e.target.value })} /></div>
                <div><Label className="text-xs">Status</Label>
                  <Select value={edit.status} onValueChange={v => setEdit({ ...edit, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label className="text-xs">Notes</Label>
                  <Input value={edit.notes ?? ""} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></div>
              </div>

              <div>
                <Label className="text-xs">Items</Label>
                {items.length === 0 ? <div className="text-xs text-muted-foreground border rounded-md p-2 mt-1">No items yet.</div> : (
                  <div className="border rounded-md mt-1 overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                        <tr><th className="text-left p-2">Product</th><th className="text-right p-2">Ordered</th><th className="text-right p-2">Delivered</th></tr>
                      </thead>
                      <tbody>
                        {items.map(it => (
                          <tr key={it.id} className="border-t">
                            <td className="p-2">{it.product_name}</td>
                            <td className="p-2 text-right tabular-nums">{fmt(it.qty_ordered)} {it.unit}</td>
                            <td className="p-2 text-right">
                              <Input type="number" className="h-8 w-24 ml-auto text-right" value={it.qty_delivered}
                                onChange={e => setItems(items.map(x => x.id === it.id ? { ...x, qty_delivered: +e.target.value } : x))} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            {previewMode ? (
              <>
                <Button variant="outline" onClick={() => setEdit(null)}>Close</Button>
                <Button onClick={() => setPreviewMode(false)}><Pencil className="h-4 w-4" /> Edit</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setPreviewMode(true)}>Cancel</Button>
                <Button onClick={save}>Save delivery</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}