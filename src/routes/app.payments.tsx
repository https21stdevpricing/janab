import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty } from "@/components/empty";
import { ContactPicker } from "@/components/contact-picker";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { nextDocNo } from "@/lib/auto-number";
import { toast } from "sonner";
import { Plus, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/app/payments")({ component: PaymentsPage });

type Row = { id: string; payment_no: string; date: string; direction: "in" | "out"; contact_name: string | null; amount: number; mode: string | null; ref_doc: string | null; notes: string | null };

function PaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [payNo, setPayNo] = useState("");
  const [date, setDate] = useState(todayISO());
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("Bank");
  const [refDoc, setRefDoc] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    const { data } = await supabase.from("payments").select("*").order("date", { ascending: false });
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => { load(); }, []);

  const startNew = async (dir: "in" | "out") => {
    setDirection(dir); setDate(todayISO()); setContactId(null); setContactName(null);
    setAmount(0); setMode("Bank"); setRefDoc(""); setNotes("");
    setPayNo(await nextDocNo("payments", "payment_no", dir === "in" ? "RI" : "PY"));
    setOpen(true);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("payments").insert({
      user_id: user.id, payment_no: payNo, direction, date, amount,
      mode, ref_doc: refDoc || null, notes: notes || null,
      contact_id: contactId, contact_name: contactName,
    });
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setOpen(false); load(); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div>
      <PageHeader title="Payments" description="Money in (receipts) and out" actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => startNew("in")}><ArrowDownLeft className="h-4 w-4" /> Receipt</Button>
          <Button size="sm" onClick={() => startNew("out")}><ArrowUpRight className="h-4 w-4" /> Payment</Button>
        </div>
      } />
      {rows.length === 0 ? <Empty>No payments yet.</Empty> : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="rounded-md border bg-card p-3 flex items-center gap-3">
              <Badge variant={r.direction === "in" ? "default" : "secondary"}>{r.direction === "in" ? "IN" : "OUT"}</Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm">{r.payment_no}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.date)}</span>
                  {r.ref_doc && <span className="text-xs text-muted-foreground">· {r.ref_doc}</span>}
                </div>
                <div className="text-sm truncate">{r.contact_name ?? "—"} <span className="text-muted-foreground">via {r.mode}</span></div>
              </div>
              <div className={`text-base font-semibold tabular-nums ${r.direction === "in" ? "text-primary" : "text-destructive"}`}>{inr(r.amount)}</div>
              <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{direction === "in" ? "Receive payment" : "Make payment"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs">No.</Label><Input className="font-mono" value={payNo} onChange={(e) => setPayNo(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">{direction === "in" ? "From buyer" : "To supplier"}</Label>
              <ContactPicker filter={direction === "in" ? "buyer" : "supplier"} value={contactId} onChange={(id, n) => { setContactId(id); setContactName(n); }} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Amount ₹</Label><Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={setMode}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Bank">Bank</SelectItem><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="Cheque">Cheque</SelectItem></SelectContent>
              </Select></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Reference doc</Label><Input value={refDoc} onChange={(e) => setRefDoc(e.target.value)} placeholder="INV-0001, PO-0002…" /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}