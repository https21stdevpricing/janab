import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty } from "@/components/empty";
import { ContactPicker } from "@/components/contact-picker";
import { Badge } from "@/components/ui/badge";
import { inr, fmt, fmtDate, todayISO } from "@/lib/format";
import { lookupDoc, openDocsFor } from "@/lib/doc-lookup";
import { toast } from "sonner";
import { Trash2, ArrowDownLeft, ArrowUpRight, X } from "lucide-react";

export const Route = createFileRoute("/app/payments")({ component: PaymentsPage });

type Row = { id: string; payment_no: string; date: string; direction: "in" | "out"; contact_id: string | null; contact_name: string | null; amount: number; mode: string | null; ref_doc: string | null; notes: string | null };
type Alloc = { doc_kind: "sale" | "purchase" | "tp"; doc_id: string; doc_no: string; amount: number; balance?: number; total?: number };

function PaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [q, setQ] = useState("");

  // Form state
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [date, setDate] = useState(todayISO());
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("Bank");
  const [notes, setNotes] = useState("");
  const [refLookup, setRefLookup] = useState("");
  const [openDocs, setOpenDocs] = useState<any[]>([]);
  const [allocs, setAllocs] = useState<Alloc[]>([]);

  const load = async () => {
    const { data } = await supabase.from("payments").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(r =>
    (filter === "all" || r.direction === filter) &&
    (q === "" || r.payment_no.toLowerCase().includes(q.toLowerCase()) || (r.contact_name ?? "").toLowerCase().includes(q.toLowerCase()))
  ), [rows, filter, q]);

  // When contact changes, load open docs
  useEffect(() => {
    if (!open || !contactId) { setOpenDocs([]); return; }
    openDocsFor(contactId, direction).then(setOpenDocs);
  }, [contactId, direction, open]);

  // Auto-allocate amount sequentially across selected docs
  const allocatedSum = allocs.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const remaining = (amount || 0) - allocatedSum;

  const toggleDoc = (d: any) => {
    if (allocs.some(a => a.doc_id === d.doc_id)) {
      setAllocs(allocs.filter(a => a.doc_id !== d.doc_id));
    } else {
      const take = Math.min(Number(d.balance), Math.max(0, remaining));
      setAllocs([...allocs, { doc_kind: d.doc_kind, doc_id: d.doc_id, doc_no: d.doc_no, amount: take, balance: Number(d.balance), total: Number(d.total) }]);
    }
  };

  const startNew = (dir: "in" | "out") => {
    setDirection(dir); setDate(todayISO()); setContactId(null); setContactName(null);
    setAmount(0); setMode("Bank"); setNotes(""); setRefLookup(""); setOpenDocs([]); setAllocs([]);
    setOpen(true);
  };

  // Auto-fill from ref doc id
  const fillFromDoc = async () => {
    if (!refLookup.trim()) return;
    const r = await lookupDoc(refLookup);
    if (!r) { toast.error("Document not found"); return; }
    if (r.party) { setContactId(r.party.id); setContactName(r.party.name); }
    if (r.outstanding && (r.kind === "sale" || r.kind === "purchase" || r.kind === "tp")) {
      setAmount(Number(r.outstanding.balance.toFixed(2)));
      setAllocs([{ doc_kind: r.kind, doc_id: r.header.id, doc_no: r.header.invoice_no ?? r.header.po_no ?? r.header.tp_no, amount: r.outstanding.balance, balance: r.outstanding.balance, total: r.outstanding.total }]);
    }
    toast.success(`Loaded ${refLookup.toUpperCase()}`);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!contactId) { toast.error("Pick a contact"); return; }
    if (amount <= 0) { toast.error("Amount must be > 0"); return; }
    const { data: pay, error } = await supabase.from("payments").insert({
      user_id: user.id, direction, date, amount, mode, notes: notes || null,
      contact_id: contactId, contact_name: contactName,
      ref_doc: allocs.map(a => a.doc_no).join(", ") || null,
    } as never).select().single() as { data: any; error: any };
    if (error) { toast.error(error.message); return; }
    if (allocs.length) {
      const rows = allocs.filter(a => a.amount > 0).map(a => ({
        user_id: user.id, payment_id: pay.id, doc_kind: a.doc_kind, doc_id: a.doc_id, doc_no: a.doc_no, amount: a.amount,
      }));
      if (rows.length) {
        const { error: e2 } = await supabase.from("payment_allocations" as never).insert(rows as never);
        if (e2) toast.error("Saved payment, but allocation failed: " + e2.message);
      }
    }
    toast.success("Saved"); setOpen(false); load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  return (
    <div>
      <PageHeader title="Payments" description="Money in (receipts) and out — auto-allocated against invoices" actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => startNew("in")}><ArrowDownLeft className="h-4 w-4" /> Receipt</Button>
          <Button size="sm" onClick={() => startNew("out")}><ArrowUpRight className="h-4 w-4" /> Payment</Button>
        </div>
      } />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Input className="max-w-xs" placeholder="Search no / party…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="in">Receipts</SelectItem>
            <SelectItem value="out">Payments</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">{filtered.length} entries</div>
      </div>

      {filtered.length === 0 ? <Empty>No payments match.</Empty> : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="rounded-md border bg-card p-3 flex items-center gap-3">
              <Badge variant={r.direction === "in" ? "default" : "secondary"}>{r.direction === "in" ? "IN" : "OUT"}</Badge>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm">{r.payment_no}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.date)}</span>
                  {r.ref_doc && <span className="text-xs text-muted-foreground">· {r.ref_doc}</span>}
                </div>
                <div className="text-sm truncate">{r.contact_name ?? "—"} <span className="text-muted-foreground">via {r.mode}</span></div>
                {r.notes && <div className="text-xs text-muted-foreground truncate">{r.notes}</div>}
              </div>
              <div className={`text-base font-semibold tabular-nums ${r.direction === "in" ? "text-primary" : "text-destructive"}`}>{inr(r.amount)}</div>
              <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{direction === "in" ? "Receive payment" : "Make payment"}</DialogTitle></DialogHeader>

          {/* Quick autofill */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <Label className="text-xs">Auto-fill from invoice / PO / TP id</Label>
            <div className="flex gap-2">
              <Input className="font-mono" placeholder="e.g. INV-0001" value={refLookup}
                onChange={(e) => setRefLookup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fillFromDoc())} />
              <Button type="button" variant="outline" onClick={fillFromDoc}>Fetch</Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="space-y-1.5"><Label className="text-xs">No.</Label>
              <Input className="font-mono" placeholder="Auto" disabled value="(auto)" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">{direction === "in" ? "From buyer" : "To supplier"}</Label>
              <ContactPicker filter={direction === "in" ? "buyer" : "supplier"} value={contactId} onChange={(id, n) => { setContactId(id); setContactName(n); setAllocs([]); }} />
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Amount ₹</Label><Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={setMode}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Bank">Bank</SelectItem><SelectItem value="Cash">Cash</SelectItem><SelectItem value="UPI">UPI</SelectItem><SelectItem value="Cheque">Cheque</SelectItem></SelectContent>
              </Select></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>

          {/* Outstanding docs */}
          {contactId && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Open documents · click to allocate</Label>
                <div className="text-xs text-muted-foreground">
                  Allocated <span className="font-semibold">{inr(allocatedSum)}</span> / Remaining <span className={remaining < 0 ? "text-destructive font-semibold" : "font-semibold"}>{inr(remaining)}</span>
                </div>
              </div>
              {openDocs.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-md p-2">No open documents.</div>
              ) : (
                <div className="border rounded-md divide-y">
                  {openDocs.map((d: any) => {
                    const picked = allocs.find(a => a.doc_id === d.doc_id);
                    return (
                      <div key={d.doc_id} className={`p-2 flex items-center gap-2 cursor-pointer ${picked ? "bg-primary/5" : ""}`} onClick={() => toggleDoc(d)}>
                        <Badge variant="outline" className="uppercase">{d.doc_kind}</Badge>
                        <span className="font-mono text-xs">{d.doc_no}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(d.date)}</span>
                        <div className="ml-auto text-xs tabular-nums">
                          Bal <span className="font-semibold">{inr(d.balance)}</span> / {inr(d.total)}
                        </div>
                        {picked && (
                          <Input type="number" className="w-24 h-8 ml-2" value={picked.amount}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const v = +e.target.value;
                              setAllocs(allocs.map(a => a.doc_id === d.doc_id ? { ...a, amount: v } : a));
                            }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {allocs.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {allocs.map(a => (
                    <Badge key={a.doc_id} variant="secondary" className="gap-1">
                      {a.doc_no}: {inr(a.amount)}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => setAllocs(allocs.filter(x => x.doc_id !== a.doc_id))} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// suppress unused warnings
void fmt;