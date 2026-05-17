import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
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
import { Trash2, ArrowDownLeft, ArrowUpRight, X, Eye, Pencil } from "lucide-react";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

function daysBetween(iso: string) {
  const d = new Date(iso); const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000));
}
function ageBadge(days: number) {
  if (days <= 0) return { label: "today", tone: "muted" } as const;
  if (days <= 30) return { label: `${days}d`, tone: "muted" } as const;
  if (days <= 60) return { label: `${days}d`, tone: "warn" } as const;
  return { label: `${days}d`, tone: "bad" } as const;
}

export const Route = createFileRoute("/app/payments")({
  component: PaymentsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
    dir: s.dir === "out" ? "out" as const : s.dir === "in" ? "in" as const : undefined,
    party: typeof s.party === "string" ? s.party : undefined,
  }),
});

type Row = { id: string; payment_no: string; date: string; direction: "in" | "out"; contact_id: string | null; contact_name: string | null; amount: number; mode: string | null; ref_doc: string | null; notes: string | null };
type Alloc = { doc_kind: "sale" | "purchase" | "tp"; doc_id: string; doc_no: string; amount: number; balance?: number; total?: number };

function PaymentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const search = useSearch({ from: "/app/payments" });
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [q, setQ] = useState("");
  // View (detail preview) state
  const [viewRow, setViewRow] = useState<Row | null>(null);
  const [viewAllocs, setViewAllocs] = useState<Array<{ doc_kind: string; doc_no: string; amount: number }>>([]);
  // Aggregate receivable / payable totals
  const [totalRecv, setTotalRecv] = useState(0);
  const [totalPay, setTotalPay] = useState(0);

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
    const { data: ag } = await supabase.from("party_aging_view" as never).select("side,total_balance") as any;
    let r = 0, p = 0;
    for (const x of (ag ?? []) as any[]) {
      if (x.side === "receivable") r += Number(x.total_balance || 0);
      else p += Number(x.total_balance || 0);
    }
    setTotalRecv(r); setTotalPay(p);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("payments-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Autofill from ?ref=&dir= (e.g. opened from Lookup)
  useEffect(() => {
    if (search.ref && !open) {
      setDirection(search.dir ?? "in");
      setDate(todayISO()); setContactId(null); setContactName(null);
      setAmount(0); setMode("Bank"); setNotes(""); setOpenDocs([]); setAllocs([]);
      setRefLookup(search.ref);
      setOpen(true);
      setTimeout(() => { fillFromDoc(); }, 0);
      navigate({ to: "/app/payments", search: {} as any, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.ref]);

  // Autofill from ?party= (from Buyers/Suppliers pages)
  useEffect(() => {
    if (search.party && !open) {
      (async () => {
        const { data: c } = await supabase.from("contacts").select("id,name").eq("id", search.party!).maybeSingle();
        setDirection(search.dir ?? "in");
        setDate(todayISO()); setAmount(0); setMode("Bank"); setNotes(""); setRefLookup("");
        setContactId(search.party!);
        setContactName(c?.name ?? null);
        setOpen(true);
        navigate({ to: "/app/payments", search: {} as any, replace: true });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.party]);

  const filtered = useMemo(() => rows.filter(r =>
    (filter === "all" || r.direction === filter) &&
    (q === "" || r.payment_no.toLowerCase().includes(q.toLowerCase()) || (r.contact_name ?? "").toLowerCase().includes(q.toLowerCase()))
  ), [rows, filter, q]);

  const totals = useMemo(() => {
    const inSum = filtered.filter(r => r.direction === "in").reduce((a, r) => a + Number(r.amount || 0), 0);
    const outSum = filtered.filter(r => r.direction === "out").reduce((a, r) => a + Number(r.amount || 0), 0);
    return { inSum, outSum, net: inSum - outSum };
  }, [filtered]);

  // When contact changes, load open docs
  useEffect(() => {
    if (!open || !contactId) { setOpenDocs([]); return; }
    openDocsFor(contactId, direction).then(setOpenDocs);
  }, [contactId, direction, open]);

  // Auto-allocate amount sequentially across selected docs
  const allocatedSum = allocs.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const remaining = (amount || 0) - allocatedSum;

  const totalOpen = openDocs.reduce((a: number, d: any) => a + Number(d.balance || 0), 0);
  const overdueDocs = openDocs.filter((d: any) => daysBetween(d.date) > 30);
  const overdueAmt = overdueDocs.reduce((a: number, d: any) => a + Number(d.balance || 0), 0);

  const suggestions: { tone: "warn" | "bad" | "info"; text: string }[] = [];
  if (amount > 0 && remaining < -0.5) suggestions.push({ tone: "bad", text: `Over-allocated by ${inr(-remaining)} — reduce a line or raise the amount.` });
  if (amount > 0 && remaining > 0.5 && allocs.length > 0) suggestions.push({ tone: "warn", text: `${inr(remaining)} unallocated — will sit as advance on ledger.` });
  if (amount > 0 && allocs.length === 0 && openDocs.length > 0) suggestions.push({ tone: "warn", text: `${openDocs.length} open document(s) — click to allocate, or use Auto-allocate.` });
  if (amount > totalOpen + 0.5 && totalOpen > 0) suggestions.push({ tone: "warn", text: `Amount exceeds total outstanding (${inr(totalOpen)}).` });
  if (overdueAmt > 0) suggestions.push({ tone: "bad", text: `${overdueDocs.length} document(s) overdue > 30 days · ${inr(overdueAmt)}.` });

  const autoAllocate = () => {
    if (!amount || openDocs.length === 0) return;
    let left = amount;
    const next: Alloc[] = [];
    for (const d of openDocs) {
      if (left <= 0) break;
      const take = Math.min(Number(d.balance), left);
      next.push({ doc_kind: d.doc_kind, doc_id: d.doc_id, doc_no: d.doc_no, amount: +take.toFixed(2), balance: Number(d.balance), total: Number(d.total) });
      left -= take;
    }
    setAllocs(next);
  };

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
    } else if (contactId) {
      // No manual allocations — auto-apply to oldest open documents for this contact (FIFO).
      const { error: e3 } = await supabase.rpc("auto_allocate_payment" as never, { _pid: pay.id } as never);
      if (e3) toast.error("Saved payment, but auto-allocation failed: " + e3.message);
      else toast.success("Auto-applied to oldest open dues");
    }
    toast.success("Saved"); setOpen(false); load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const openView = async (r: Row) => {
    setViewRow(r);
    const { data } = await supabase.from("payment_allocations" as never)
      .select("doc_kind,doc_no,amount").eq("payment_id" as never, r.id) as any;
    setViewAllocs((data ?? []) as any);
  };

  const editFromView = () => {
    if (!viewRow) return;
    const r = viewRow;
    setDirection(r.direction); setDate(r.date); setContactId(r.contact_id); setContactName(r.contact_name);
    setAmount(Number(r.amount)); setMode(r.mode ?? "Bank"); setNotes(r.notes ?? ""); setRefLookup("");
    setAllocs(viewAllocs.map(a => ({ doc_kind: a.doc_kind as any, doc_id: "", doc_no: a.doc_no, amount: Number(a.amount) })));
    setViewRow(null); setOpen(true);
  };

  const onExport = () => {
    exportToExcel({
      filename: `payments-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Payments",
      columns: [
        { header: "No.", key: "payment_no" },
        { header: "Date", key: "date" },
        { header: "Direction", key: "direction", get: (r) => r.direction === "in" ? "Receipt" : "Payment" },
        { header: "Party", key: "contact_name" },
        { header: "Amount", key: "amount" },
        { header: "Mode", key: "mode" },
        { header: "Ref Doc", key: "ref_doc" },
        { header: "Notes", key: "notes" },
      ],
      rows: filtered,
    });
  };

  return (
    <div>
      <PageHeader title="Payments" description="Money in (receipts) and out — auto-allocated against invoices" actions={
        <>
          <ExcelBar onExport={onExport} />
          <Button size="sm" variant="outline" onClick={() => startNew("in")}><ArrowDownLeft className="h-4 w-4" /> Receipt</Button>
          <Button size="sm" onClick={() => startNew("out")}><ArrowUpRight className="h-4 w-4" /> Payment</Button>
        </>
      } />

      {/* Bills outstanding summary */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-md border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Bills receivable (from buyers)</div>
          <div className="text-base sm:text-lg font-semibold text-primary tabular-nums">{inr(totalRecv)}</div>
        </div>
        <div className="rounded-md border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground">Bills payable (to suppliers)</div>
          <div className="text-base sm:text-lg font-semibold text-destructive tabular-nums">{inr(totalPay)}</div>
        </div>
      </div>

      {/* Tabs + search */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="in">Receipts ↙</TabsTrigger>
            <TabsTrigger value="out">Payments ↗</TabsTrigger>
          </TabsList>
          <Input className="max-w-xs" placeholder="Search no / party…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ml-auto text-xs text-muted-foreground">{filtered.length} entries</div>
        </div>
      </Tabs>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-md border bg-card p-3"><div className="text-[10px] uppercase text-muted-foreground">Received</div><div className="text-base sm:text-lg font-semibold text-primary tabular-nums">{inr(totals.inSum)}</div></div>
        <div className="rounded-md border bg-card p-3"><div className="text-[10px] uppercase text-muted-foreground">Paid</div><div className="text-base sm:text-lg font-semibold text-destructive tabular-nums">{inr(totals.outSum)}</div></div>
        <div className="rounded-md border bg-card p-3"><div className="text-[10px] uppercase text-muted-foreground">Net</div><div className={`text-base sm:text-lg font-semibold tabular-nums ${totals.net >= 0 ? "text-primary" : "text-destructive"}`}>{inr(totals.net)}</div></div>
      </div>

      {filtered.length === 0 ? <Empty>No payments match.</Empty> : (
        <div className="space-y-2">
          {filtered.map(r => (
            <div key={r.id} className="rounded-md border bg-card p-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40" onClick={() => openView(r)}>
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
              <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); del(r.id); }}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}

      {/* Detail / preview dialog */}
      <Dialog open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              {viewRow?.direction === "in" ? "Receipt" : "Payment"} · {viewRow?.payment_no}
            </DialogTitle>
          </DialogHeader>
          {viewRow && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><div className="text-[10px] uppercase text-muted-foreground">Date</div><div>{fmtDate(viewRow.date)}</div></div>
                <div><div className="text-[10px] uppercase text-muted-foreground">Mode</div><div>{viewRow.mode ?? "—"}</div></div>
                <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground">{viewRow.direction === "in" ? "From buyer" : "To supplier"}</div><div className="font-medium">{viewRow.contact_name ?? "—"}</div></div>
                <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground">Amount</div><div className={`text-xl font-semibold tabular-nums ${viewRow.direction === "in" ? "text-primary" : "text-destructive"}`}>{inr(viewRow.amount)}</div></div>
                {viewRow.notes && <div className="col-span-2"><div className="text-[10px] uppercase text-muted-foreground">Notes</div><div>{viewRow.notes}</div></div>}
              </div>
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Applied to</div>
                {viewAllocs.length === 0 ? (
                  <div className="text-xs text-muted-foreground border rounded-md p-2">Sitting as advance on ledger (no document allocations).</div>
                ) : (
                  <div className="border rounded-md divide-y">
                    {viewAllocs.map((a, i) => (
                      <div key={i} className="p-2 flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="uppercase text-[10px]">{a.doc_kind}</Badge>
                        <span className="font-mono text-xs">{a.doc_no}</span>
                        <span className="ml-auto tabular-nums font-semibold">{inr(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (viewRow) { del(viewRow.id); setViewRow(null); } }}><Trash2 className="h-4 w-4" /> Delete</Button>
            <Button onClick={() => setViewRow(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{direction === "in" ? "Receive payment" : "Make payment"}</DialogTitle></DialogHeader>

          {/* Quick autofill */}
          <div className="rounded-md border bg-muted/30 p-3 space-y-2">
            <Label className="text-xs">Settling a specific invoice / PO? Paste its id</Label>
            <div className="flex gap-2">
              <Input className="font-mono" placeholder="e.g. INV-0001" value={refLookup}
                onChange={(e) => setRefLookup(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), fillFromDoc())} />
              <Button type="button" variant="outline" onClick={fillFromDoc}>Fetch</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Or just pick the party below and enter the total amount — we'll auto-apply it to the oldest open dues.</p>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="space-y-1.5"><Label className="text-xs">No.</Label>
              <Input className="font-mono" placeholder="Auto" disabled value="(auto)" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">{direction === "in" ? "From buyer" : "To supplier"}</Label>
              <ContactPicker filter={direction === "in" ? "buyer" : "supplier"} value={contactId} onChange={(id, n) => { setContactId(id); setContactName(n); setAllocs([]); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{direction === "in" ? "Amount received" : "Amount paid"} (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Total of this single receipt/payment, not per invoice.</p>
            </div>
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
              <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                <span>Open total: <span className="font-semibold text-foreground">{inr(totalOpen)}</span>{overdueAmt > 0 && <span className="ml-2 text-destructive">· Overdue {inr(overdueAmt)}</span>}</span>
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={autoAllocate} disabled={!amount || openDocs.length === 0}>Auto-allocate oldest</Button>
              </div>
              {openDocs.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-md p-2">No open documents.</div>
              ) : (
                <div className="border rounded-md divide-y">
                  {openDocs.map((d: any) => {
                    const picked = allocs.find(a => a.doc_id === d.doc_id);
                    const age = ageBadge(daysBetween(d.date));
                    return (
                      <div key={d.doc_id} className={`p-2 flex items-center gap-2 cursor-pointer ${picked ? "bg-primary/5" : ""}`} onClick={() => toggleDoc(d)}>
                        <Badge variant="outline" className="uppercase">{d.doc_kind}</Badge>
                        <span className="font-mono text-xs">{d.doc_no}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(d.date)}</span>
                        <Badge variant={age.tone === "bad" ? "destructive" : age.tone === "warn" ? "secondary" : "outline"} className="text-[10px] py-0">{age.label}</Badge>
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
              {suggestions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {suggestions.map((s, i) => (
                    <div key={i} className={`text-xs rounded-md border px-2 py-1 ${s.tone === "bad" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                      {s.text}
                    </div>
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