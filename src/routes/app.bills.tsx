import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { CollapseFilters } from "@/components/collapse-filters";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, Eye, Trash2, History, X, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContactPicker } from "@/components/contact-picker";
import { DocDetail } from "@/routes/app.lookup";
import { lookupDoc, openDocsFor, type DocLookupResult } from "@/lib/doc-lookup";
import { toast } from "sonner";
import { useShortcut } from "@/lib/shortcuts";
import { exportStoneWorldPayment } from "@/lib/pdf-theme";

export const Route = createFileRoute("/app/bills")({
  component: BillsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
    dir: s.dir === "out" ? ("out" as const) : s.dir === "in" ? ("in" as const) : undefined,
    party: typeof s.party === "string" ? s.party : undefined,
    new: s.new === "in" ? ("in" as const) : s.new === "out" ? ("out" as const) : undefined,
    tab: s.tab === "payable" ? ("payable" as const) : s.tab === "history" ? ("history" as const) : s.tab === "receivable" ? ("receivable" as const) : undefined,
  }),
});

type Row = {
  user_id: string;
  doc_kind: "sale" | "purchase" | "tp" | "tp_purchase";
  doc_id: string;
  doc_no: string;
  date: string;
  party_id: string | null;
  party_name: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
};

type PayRow = {
  id: string; payment_no: string; date: string; direction: "in" | "out";
  contact_id: string | null; contact_name: string | null; amount: number;
  mode: string | null; ref_doc: string | null; notes: string | null;
};
type Alloc = { doc_kind: "sale" | "purchase" | "tp" | "tp_purchase"; doc_id: string; doc_no: string; amount: number; balance?: number; total?: number };

const sideOf = (k: Row["doc_kind"]) => (k === "sale" || k === "tp" ? "receivable" : "payable");
const docKindLabel = (k: Row["doc_kind"]) => k === "sale" ? "Invoice" : k === "purchase" ? "Purchase" : k === "tp" ? "TP sale" : "TP purchase";

function ageDays(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
function bucket(d: number) {
  if (d <= 30) return "0–30";
  if (d <= 60) return "31–60";
  if (d <= 90) return "61–90";
  return "90+";
}
function bucketTone(b: string) {
  return b === "0–30" ? "secondary" : b === "31–60" ? "default" : "destructive";
}

function payStatus(total: number, paid: number, ageDaysVal: number): { label: string; tone: "warn" | "info" | "bad" | "good" } {
  if (paid <= 0) return ageDaysVal > 30 ? { label: "Overdue", tone: "bad" } : { label: "Unpaid", tone: "warn" };
  if (paid < total) return ageDaysVal > 30 ? { label: "Overdue · Partial", tone: "bad" } : { label: "Partial", tone: "info" };
  return { label: "Paid", tone: "good" };
}

function StatusBadge({ s }: { s: { label: string; tone: "warn" | "info" | "bad" | "good" } }) {
  const cls = s.tone === "bad" ? "border-destructive/40 text-destructive bg-destructive/5"
    : s.tone === "warn" ? "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5"
    : s.tone === "info" ? "border-primary/30 text-primary bg-primary/5"
    : "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}>{s.label}</span>;
}

function BillsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [pays, setPays] = useState<PayRow[]>([]);
  const search = useSearch({ from: "/app/bills" });
  const navigate = useNavigate();
  const [tab, setTab] = useState<"receivable" | "payable" | "history">(search.tab ?? "receivable");
  const [q, setQ] = useState("");
  const [bucketFilter, setBucketFilter] = useState<"all" | "0–30" | "31–60" | "61–90" | "90+">("all");
  const [preview, setPreview] = useState<DocLookupResult | null>(null);
  const [viewPay, setViewPay] = useState<PayRow | null>(null);
  const [viewAllocs, setViewAllocs] = useState<Array<{ doc_kind: string; doc_no: string; amount: number }>>([]);
  const [company, setCompany] = useState<any>(null);

  /* ---------- payment dialog state ---------- */
  const [payOpen, setPayOpen] = useState(false);
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [date, setDate] = useState(todayISO());
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("Bank");
  const [notes, setNotes] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [txnId, setTxnId] = useState("");
  const [bankName, setBankName] = useState("");
  const [cleared, setCleared] = useState(true);
  const [openDocs, setOpenDocs] = useState<any[]>([]);
  const [allocs, setAllocs] = useState<Alloc[]>([]);

  const openPreview = async (docNo: string) => {
    const r = await lookupDoc(docNo);
    if (r) setPreview(r);
  };

  const load = async () => {
    const [{ data: out }, { data: ph }] = await Promise.all([
      supabase.from("outstanding_view" as never).select("*").gt("balance", 0).order("date", { ascending: true }) as any,
      supabase.from("payments").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    setRows((out ?? []) as Row[]);
    setPays((ph ?? []) as PayRow[]);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("bills-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_allocations" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "third_party" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  /* ---------- pre-fill from query params (legacy /app/payments redirects here) ---------- */
  useEffect(() => {
    if (search.ref && !payOpen) {
      const dir = search.dir ?? "in";
      startNew(dir);
      setTimeout(() => fillFromDoc(search.ref!), 0);
      navigate({ to: "/app/bills", search: {} as any, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.ref]);
  useEffect(() => {
    if (search.new && !payOpen) {
      startNew(search.new);
      navigate({ to: "/app/bills", search: {} as any, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.new]);
  useEffect(() => {
    if (search.party && !payOpen) {
      (async () => {
        const { data: c } = await supabase.from("contacts").select("id,name").eq("id", search.party!).maybeSingle();
        const dir = search.dir ?? "in";
        startNew(dir);
        setContactId(search.party!);
        setContactName(c?.name ?? null);
        navigate({ to: "/app/bills", search: {} as any, replace: true });
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.party]);

  /* ---------- open docs for chosen contact ---------- */
  useEffect(() => {
    if (!payOpen || !contactId) { setOpenDocs([]); return; }
    openDocsFor(contactId, direction).then(setOpenDocs);
  }, [contactId, direction, payOpen]);

  const sideRows = useMemo(() => tab === "history" ? [] : rows.filter(r => sideOf(r.doc_kind) === tab), [rows, tab]);
  const filtered = useMemo(() => sideRows.filter(r => {
    if (q && !`${r.doc_no} ${r.party_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (bucketFilter !== "all" && bucket(ageDays(r.date)) !== bucketFilter) return false;
    return true;
  }), [sideRows, q, bucketFilter]);

  /* ---------- KPIs across full outstanding (not just current tab) ---------- */
  const kpis = useMemo(() => {
    let recv = 0, pay = 0, recvOverdue = 0, payOverdue = 0;
    for (const r of rows) {
      const side = sideOf(r.doc_kind);
      const bal = Number(r.balance || 0);
      const overdue = ageDays(r.date) > 30;
      if (side === "receivable") { recv += bal; if (overdue) recvOverdue += bal; }
      else { pay += bal; if (overdue) payOverdue += bal; }
    }
    return { recv, pay, net: recv - pay, recvOverdue, payOverdue, overdue: recvOverdue + payOverdue };
  }, [rows]);

  const totals = useMemo(() => {
    const t = { total: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    for (const r of sideRows) {
      t.total += Number(r.balance || 0);
      const b = bucket(ageDays(r.date));
      if (b === "0–30") t.b1 += r.balance;
      else if (b === "31–60") t.b2 += r.balance;
      else if (b === "61–90") t.b3 += r.balance;
      else t.b4 += r.balance;
    }
    return t;
  }, [sideRows]);

  /* ---------- history filtering ---------- */
  const filteredPays = useMemo(() => pays.filter(p =>
    q === "" || p.payment_no.toLowerCase().includes(q.toLowerCase()) || (p.contact_name ?? "").toLowerCase().includes(q.toLowerCase())
  ), [pays, q]);

  const onExport = () => {
    if (tab === "history") {
      exportToExcel({
        filename: `payment-history-${new Date().toISOString().slice(0, 10)}`,
        sheetName: "Payments",
        columns: [
          { header: "No.", key: "payment_no" },
          { header: "Date", key: "date" },
          { header: "Direction", key: "direction", get: (r: PayRow) => r.direction === "in" ? "Receipt" : "Payment" },
          { header: "Party", key: "contact_name" },
          { header: "Amount", key: "amount" },
          { header: "Mode", key: "mode" },
          { header: "Ref Doc", key: "ref_doc" },
          { header: "Notes", key: "notes" },
        ],
        rows: filteredPays,
      });
      return;
    }
    exportToExcel({
      filename: `bills-${tab}-${new Date().toISOString().slice(0, 10)}`,
      sheetName: tab === "receivable" ? "Receivable" : "Payable",
      columns: [
        { header: "Doc No", key: "doc_no" },
        { header: "Type", key: "doc_kind" },
        { header: "Date", key: "date" },
        { header: "Party", key: "party_name" },
        { header: "Total", key: "total" },
        { header: "Paid", key: "paid" },
        { header: "Balance", key: "balance" },
        { header: "Age (days)", key: "age", get: (r: Row) => ageDays(r.date) },
        { header: "Status", key: "status" },
      ],
      rows: filtered.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    });
  };

  /* ---------- payment helpers ---------- */
  const startNew = (dir: "in" | "out") => {
    setDirection(dir); setDate(todayISO()); setContactId(null); setContactName(null);
    setAmount(0); setMode("Bank"); setNotes(""); setOpenDocs([]); setAllocs([]);
    setChequeNo(""); setChequeDate(""); setTxnId(""); setBankName(""); setCleared(true);
    setPayOpen(true);
  };

  /* Click an outstanding bill → open dialog pre-filled to settle exactly that bill */
  const settleBill = async (r: Row) => {
    const dir: "in" | "out" = sideOf(r.doc_kind) === "receivable" ? "in" : "out";
    setDirection(dir); setDate(todayISO()); setMode("Bank"); setNotes("");
    setChequeNo(""); setChequeDate(""); setTxnId(""); setBankName(""); setCleared(true);
    setContactId(r.party_id); setContactName(r.party_name);
    setAmount(Number(Number(r.balance).toFixed(2)));
    setAllocs([{ doc_kind: r.doc_kind, doc_id: r.doc_id, doc_no: r.doc_no, amount: Number(r.balance), balance: Number(r.balance), total: Number(r.total) }]);
    setPayOpen(true);
  };

  const fillFromDoc = async (refStr: string) => {
    if (!refStr.trim()) return;
    const r = await lookupDoc(refStr);
    if (!r) { toast.error("Document not found"); return; }
    const isTpPayable = r.kind === "tp" && direction === "out";
    const selectedParty = isTpPayable ? r.supplier : r.party;
    const selectedOutstanding = isTpPayable ? r.supplierOutstanding : r.outstanding;
    if (selectedParty) { setContactId(selectedParty.id); setContactName(selectedParty.name); }
    if (selectedOutstanding && (r.kind === "sale" || r.kind === "purchase" || r.kind === "tp")) {
      const docKind = isTpPayable ? "tp_purchase" : r.kind;
      setAmount(Number(selectedOutstanding.balance.toFixed(2)));
      setAllocs([{ doc_kind: docKind as any, doc_id: r.header.id, doc_no: (r.header.invoice_no ?? r.header.po_no ?? (r.header as any).tp_no) as string, amount: selectedOutstanding.balance, balance: selectedOutstanding.balance, total: selectedOutstanding.total }]);
    }
    toast.success(`Loaded ${refStr.toUpperCase()}`);
  };

  const allocatedSum = allocs.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const remaining = (amount || 0) - allocatedSum;
  const totalOpen = openDocs.reduce((a, d: any) => a + Number(d.balance || 0), 0);

  const toggleDoc = (d: any) => {
    if (allocs.some(a => a.doc_id === d.doc_id)) setAllocs(allocs.filter(a => a.doc_id !== d.doc_id));
    else {
      const take = Math.min(Number(d.balance), Math.max(0, remaining));
      setAllocs([...allocs, { doc_kind: d.doc_kind, doc_id: d.doc_id, doc_no: d.doc_no, amount: take, balance: Number(d.balance), total: Number(d.total) }]);
    }
  };
  const autoAllocate = () => {
    if (!amount || openDocs.length === 0) return;
    let left = amount; const next: Alloc[] = [];
    for (const d of openDocs) {
      if (left <= 0) break;
      const take = Math.min(Number(d.balance), left);
      next.push({ doc_kind: d.doc_kind, doc_id: d.doc_id, doc_no: d.doc_no, amount: +take.toFixed(2), balance: Number(d.balance), total: Number(d.total) });
      left -= take;
    }
    setAllocs(next);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!contactId) { toast.error("Pick a party"); return; }
    if (amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (mode === "Cheque" && !chequeNo.trim()) { toast.error("Cheque number is required"); return; }
    // Strict duplicate guard — block any identical party + amount + date + direction recorded already.
    // Allows intentional duplicates only on explicit confirmation.
    const { data: dup } = await supabase
      .from("payments")
      .select("id,payment_no")
      .eq("contact_id", contactId)
      .eq("direction", direction)
      .eq("date", date)
      .eq("amount", amount)
      .limit(1);
    if (dup && dup.length > 0) {
      const ok = confirm(`A ${direction === "in" ? "receipt" : "payment"} of ${inr(amount)} for this party on ${fmtDate(date)} already exists (${dup[0].payment_no}). Record another one anyway?`);
      if (!ok) return;
    }
    if (allocs.length > 0 && allocatedSum > amount + 0.01) {
      toast.error(`Allocated (${inr(allocatedSum)}) is more than amount (${inr(amount)}).`);
      return;
    }
    const { data: pay, error } = await supabase.from("payments").insert({
      user_id: user.id, direction, date, amount, mode, notes: notes || null,
      contact_id: contactId, contact_name: contactName,
      ref_doc: allocs.map(a => a.doc_no).join(", ") || null,
      cheque_no: chequeNo || null, cheque_date: chequeDate || null,
      txn_id: txnId || null, bank_name: bankName || null,
      cleared, cleared_at: cleared ? date : null,
    } as never).select().single() as { data: any; error: any };
    if (error) { toast.error(error.message); return; }
    if (allocs.length) {
      const rowsToInsert = allocs.filter(a => a.amount > 0).map(a => ({
        user_id: user.id, payment_id: pay.id, doc_kind: a.doc_kind, doc_id: a.doc_id, doc_no: a.doc_no, amount: a.amount,
      }));
      if (rowsToInsert.length) {
        const { error: e2 } = await supabase.from("payment_allocations" as never).insert(rowsToInsert as never);
        if (e2) toast.error("Saved, but allocation failed: " + e2.message);
      }
    } else if (contactId) {
      const { error: e3 } = await supabase.rpc("auto_allocate_payment" as never, { _pid: pay.id } as never);
      if (e3) toast.error("Saved, but auto-allocation failed: " + e3.message);
      else toast.success("Auto-applied to oldest open dues");
    }
    toast.success("Saved"); setPayOpen(false); load();
  };

  const delPay = async (id: string) => {
    if (!confirm("Delete payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const openPayView = async (r: PayRow) => {
    setViewPay(r);
    const [{ data }, { data: st }] = await Promise.all([
      supabase.from("payment_allocations" as never).select("doc_kind,doc_no,amount").eq("payment_id" as never, r.id) as any,
      supabase.from("settings").select("company_name,address,phone,email,gstin,state").maybeSingle(),
    ]);
    setViewAllocs((data ?? []) as any);
    setCompany(st);
  };

  useShortcut("r", () => { if (!payOpen) startNew("in"); }, !payOpen);
  useShortcut("p", () => { if (!payOpen) startNew("out"); }, !payOpen);

  return (
    <div>
      <PageHeader
        title="Money"
        description="Receivables, payables and every settlement."
        actions={
          <>
            <ExcelBar onExport={onExport} />
            <Button size="sm" variant="outline" onClick={() => startNew("in")} title="Receipt (R)"><ArrowDownLeft className="h-4 w-4" /> Receive</Button>
            <Button size="sm" onClick={() => startNew("out")} title="Payment (P)"><ArrowUpRight className="h-4 w-4" /> Pay</Button>
          </>
        }
      />

      {/* Minimal hero — one calm summary card with three balances */}
      <div className="mb-4 rounded-2xl border border-border/70 bg-card overflow-hidden">
        <div className="grid grid-cols-3 divide-x divide-border/60">
          <HeroCell label="Receivable" value={inr(kpis.recv)} tone="good" active={tab === "receivable"} onClick={() => setTab("receivable")} />
          <HeroCell label="Payable" value={inr(kpis.pay)} tone="bad" active={tab === "payable"} onClick={() => setTab("payable")} />
          <HeroCell label="Net" value={inr(kpis.net)} tone={kpis.net >= 0 ? "good" : "bad"} />
        </div>
        {kpis.overdue > 0 && (
          <div className="px-4 py-2 border-t border-border/60 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-500/5">
            {inr(kpis.overdue)} overdue · {">"} 30 days
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="mb-3">
        <TabsList className="w-full rounded-full bg-muted p-1 sm:w-auto">
          <TabsTrigger value="receivable" className="flex-1 sm:flex-none gap-1"><ArrowDownLeft className="h-3.5 w-3.5" /> Receivable</TabsTrigger>
          <TabsTrigger value="payable" className="flex-1 sm:flex-none gap-1"><ArrowUpRight className="h-3.5 w-3.5" /> Payable</TabsTrigger>
          <TabsTrigger value="history" className="flex-1 sm:flex-none gap-1"><History className="h-3.5 w-3.5" /> History</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* aging buckets folded into filter chips below — surfaced only when needed */}

      <CollapseFilters
        summary={tab === "history" ? `${filteredPays.length} of ${pays.length} entries` : `${filtered.length} of ${sideRows.length} ${tab}`}
        active={(q ? 1 : 0) + (bucketFilter !== "all" ? 1 : 0)}
        onClear={() => { setQ(""); setBucketFilter("all"); }}
      >
        <div className="space-y-3">
          <Input placeholder={tab === "history" ? "Search receipt / payment no / party…" : "Search document or party…"} value={q} onChange={e => setQ(e.target.value)} />
          {tab !== "history" && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Aging bucket</div>
              <div className="flex flex-wrap gap-1">
                {(["all", "0–30", "31–60", "61–90", "90+"] as const).map(b => (
                  <Button key={b} size="sm" variant={bucketFilter === b ? "default" : "outline"} onClick={() => setBucketFilter(b)}>{b}</Button>
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {tab === "receivable" && "Money buyers owe you. Tap a row to record what you've received — we pre-fill amount, party and the bill it settles."}
            {tab === "payable" && "Money you owe suppliers. Tap a row to record a payment — fully pre-filled and allocated."}
            {tab === "history" && "Every receipt and payment ever recorded. Click an entry to see what it settled."}
          </p>
        </div>
      </CollapseFilters>

      {tab === "history" ? (
        filteredPays.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
          <div className="grid gap-2 lg:grid-cols-2">
            {filteredPays.map(p => (
              <div key={p.id} className="rounded-2xl border bg-card p-3 flex items-center gap-3 cursor-pointer transition-colors hover:bg-muted/40" onClick={() => openPayView(p)}>
                <Badge variant={p.direction === "in" ? "default" : "secondary"} className="shrink-0">{p.direction === "in" ? "IN" : "OUT"}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm">{p.payment_no}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(p.date)}</span>
                    {p.ref_doc && (
                      <span className="text-xs text-muted-foreground flex flex-wrap gap-1">
                        {p.ref_doc.split(",").map(s => s.trim()).filter(Boolean).map((ref, idx) => (
                          <span key={idx} className="font-mono">{ref}</span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="text-sm truncate">{p.contact_name ?? "—"} <span className="text-muted-foreground">via {p.mode}</span></div>
                  {p.notes && <div className="text-xs text-muted-foreground truncate">{p.notes}</div>}
                </div>
                <div className={`text-base font-semibold tabular-nums ${p.direction === "in" ? "text-primary" : "text-destructive"}`}>{inr(p.amount)}</div>
              </div>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? <Empty>No outstanding {tab === "receivable" ? "receivables" : "payables"}.</Empty> : (
        <>
        <div className="hidden md:block rounded-2xl border bg-card overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="text-left p-2">Doc</th>
                <th className="text-left p-2">Party</th>
                <th className="text-right p-2">Remaining</th>
                <th className="text-left p-2 w-40">Paid / Total</th>
                <th className="text-left p-2">Status</th>
                <th className="text-right p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const d = ageDays(r.date); const b = bucket(d);
                const pct = r.total > 0 ? Math.min(100, Math.round((r.paid / r.total) * 100)) : 0;
                const st = payStatus(Number(r.total), Number(r.paid), d);
                return (
                  <tr key={`${r.doc_kind}-${r.doc_id}`} className="border-t transition-colors hover:bg-muted/35">
                    <td className="p-2">
                      <button onClick={() => openPreview(r.doc_no)} className="font-mono text-primary hover:underline">{r.doc_no}</button>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{docKindLabel(r.doc_kind)} · {fmtDate(r.date)}</div>
                    </td>
                    <td className="p-2 truncate max-w-[220px]">{r.party_name ?? "—"}</td>
                    <td className={`p-2 text-right tabular-nums text-base font-semibold ${tab === "receivable" ? "text-primary" : "text-destructive"}`}>{inr(r.balance)}</td>
                    <td className="p-2">
                      <PayProgress pct={pct} tab={tab} />
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{inr(r.paid)} of {inr(r.total)}</div>
                    </td>
                    <td className="p-2"><div className="flex items-center gap-1.5 flex-wrap"><StatusBadge s={st} /><Badge variant={bucketTone(b) as any} className="text-[10px]">{b}d</Badge></div></td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => openPreview(r.doc_no)} title="Preview bill"><Eye className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" onClick={() => settleBill(r)}>
                        {tab === "receivable" ? "Receive" : "Pay"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-2">
          {filtered.map(r => {
            const d = ageDays(r.date); const b = bucket(d);
            const pct = r.total > 0 ? Math.min(100, Math.round((r.paid / r.total) * 100)) : 0;
            const st = payStatus(Number(r.total), Number(r.paid), d);
            return (
              <div key={`${r.doc_kind}-${r.doc_id}`} className="rounded-2xl border bg-card p-3 space-y-3">
                <button type="button" onClick={() => openPreview(r.doc_no)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{docKindLabel(r.doc_kind)} · {fmtDate(r.date)}</div>
                      <div className="font-mono text-sm font-medium mt-0.5">{r.doc_no}</div>
                      <div className="text-sm truncate text-muted-foreground">{r.party_name ?? "—"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-semibold tabular-nums">{inr(r.balance)}</div>
                      <div className="mt-1 flex justify-end"><StatusBadge s={st} /></div>
                    </div>
                  </div>
                </button>
                <PayProgress pct={pct} tab={tab} />
                <div className="text-[11px] text-muted-foreground tabular-nums">{inr(r.paid)} of {inr(r.total)} · {b}d</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => openPreview(r.doc_no)}><Eye className="h-3.5 w-3.5" /> Preview</Button>
                  <Button size="sm" onClick={() => settleBill(r)}>
                    {tab === "receivable" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    {tab === "receivable" ? "Receive" : "Pay"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {/* Bill preview dialog */}
      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <div className="px-4 py-3 border-b">
            <DialogTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Bill preview</DialogTitle>
          </div>
          <div className="p-4">{preview && <DocDetail doc={preview} />}</div>
          <div className="px-4 py-3 border-t flex justify-end">
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Past payment detail dialog */}
      <Dialog open={!!viewPay} onOpenChange={(o) => !o && setViewPay(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />{viewPay?.direction === "in" ? "Receipt" : "Payment"} · {viewPay?.payment_no}</DialogTitle></DialogHeader>
          {viewPay && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Date</div><div>{fmtDate(viewPay.date)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Mode</div><div>{viewPay.mode ?? "—"}</div></div>
                <div className="col-span-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{viewPay.direction === "in" ? "From buyer" : "To supplier"}</div><div className="font-medium">{viewPay.contact_name ?? "—"}</div></div>
                <div className="col-span-2 rounded-md border bg-muted/30 p-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Amount</div>
                  <div className={`text-2xl font-semibold tabular-nums ${viewPay.direction === "in" ? "text-primary" : "text-destructive"}`}>{inr(viewPay.amount)}</div>
                </div>
                {viewPay.notes && <div className="col-span-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Notes</div><div>{viewPay.notes}</div></div>}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Applied to</div>
                {viewAllocs.length === 0 ? (
                  <div className="text-xs text-muted-foreground border rounded-md p-2">Sitting as advance on ledger.</div>
                ) : (
                  <div className="border rounded-md divide-y">
                    {viewAllocs.map((a, i) => (
                      <div key={i} className="p-2.5 flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="text-[10px]">{a.doc_kind === "sale" ? "Invoice" : a.doc_kind === "purchase" ? "Purchase" : a.doc_kind === "tp" ? "TP sale" : "TP purchase"}</Badge>
                        <span className="font-mono text-xs">{a.doc_no}</span>
                        <span className="ml-auto tabular-nums font-semibold">{inr(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-col gap-2 pt-3 border-t">
            <Button variant="outline" className="w-full" onClick={() => viewPay && exportStoneWorldPayment(viewPay, viewAllocs, company)}>
              <Printer className="h-4 w-4" /> Download Branded PDF
            </Button>
            <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" onClick={() => { if (viewPay) { delPay(viewPay.id); setViewPay(null); } }}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button className="w-full" onClick={() => setViewPay(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unified payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {direction === "in" ? <ArrowDownLeft className="h-4 w-4 text-primary" /> : <ArrowUpRight className="h-4 w-4 text-destructive" />}
              {direction === "in" ? "Receive payment" : "Make payment"}
            </DialogTitle>
          </DialogHeader>

          {/* Direction switch inside dialog */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setDirection("in"); setAllocs([]); }}
              className={`rounded-md border p-2.5 text-left transition-colors ${direction === "in" ? "border-primary bg-primary/5" : "hover:bg-muted/40"}`}>
              <div className="flex items-center gap-2 text-xs font-medium"><ArrowDownLeft className="h-3.5 w-3.5 text-primary" /> Money in (receipt)</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">From a buyer / customer</div>
            </button>
            <button type="button" onClick={() => { setDirection("out"); setAllocs([]); }}
              className={`rounded-md border p-2.5 text-left transition-colors ${direction === "out" ? "border-destructive bg-destructive/5" : "hover:bg-muted/40"}`}>
              <div className="flex items-center gap-2 text-xs font-medium"><ArrowUpRight className="h-3.5 w-3.5 text-destructive" /> Money out (payment)</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">To a supplier / vendor</div>
            </button>
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
                <SelectContent>
                  <SelectItem value="Bank">Bank transfer (NEFT/RTGS/IMPS)</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

            {(mode === "Bank" || mode === "UPI" || mode === "Card") && (
              <>
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label className="text-xs">Bank / app name</Label>
                  <Input placeholder={mode === "UPI" ? "GPay, PhonePe…" : "HDFC ****1234"} value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
                <div className="col-span-2 sm:col-span-1 space-y-1.5">
                  <Label className="text-xs">Transaction ID / UTR</Label>
                  <Input placeholder="UTR / UPI ref no." value={txnId} onChange={(e) => setTxnId(e.target.value)} />
                </div>
              </>
            )}

            {mode === "Cheque" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cheque number *</Label>
                  <Input placeholder="e.g. 045123" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cheque date</Label>
                  <Input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Drawee bank</Label>
                  <Input placeholder="Bank on the cheque" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
                <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)} />
                  Already cleared (uncheck if cheque is in transit)
                </label>
              </>
            )}
          </div>

          {contactId && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Open bills · click to allocate</Label>
                <div className="text-xs text-muted-foreground">
                  Allocated <span className="font-semibold">{inr(allocatedSum)}</span> / Remaining <span className={remaining < 0 ? "text-destructive font-semibold" : "font-semibold"}>{inr(remaining)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                <span>Open total: <span className="font-semibold text-foreground">{inr(totalOpen)}</span></span>
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={autoAllocate} disabled={!amount || openDocs.length === 0}>Auto-allocate oldest</Button>
              </div>
              {openDocs.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-md p-2">No open bills for this party — will sit as advance.</div>
              ) : (
                <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                  {openDocs.map((d: any) => {
                    const picked = allocs.find(a => a.doc_id === d.doc_id);
                    return (
                      <div key={`${d.doc_kind}-${d.doc_id}`} className={`p-2.5 cursor-pointer ${picked ? "bg-primary/5" : ""}`} onClick={() => toggleDoc(d)}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{docKindLabel(d.doc_kind)}</Badge>
                              <span className="font-mono text-xs">{d.doc_no}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{fmtDate(d.date)} · balance <span className="font-semibold text-foreground">{inr(d.balance)}</span> of {inr(d.total)}</div>
                          </div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            {picked ? (
                              <Input type="number" className="w-28 h-8 text-right" value={picked.amount}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => { const v = +e.target.value; setAllocs(allocs.map(a => a.doc_id === d.doc_id ? { ...a, amount: v } : a)); }} />
                            ) : <Button type="button" size="sm" variant="outline" className="h-8">Select</Button>}
                          </div>
                        </div>
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

function KpiTile({ label, value, sub, tone, onClick, active }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "muted"; onClick?: () => void; active?: boolean }) {
  const valueClr = tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : "text-foreground";
  const ring = active ? "ring-2 ring-primary/50" : "";
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className={`text-left rounded-2xl border border-border/70 bg-background p-3 transition-all ${onClick ? "hover:bg-muted/40 active:scale-[0.99]" : ""} ${ring}`}>
      <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className={`text-base sm:text-lg font-semibold tabular-nums truncate ${valueClr}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </button>
  );
}

function HeroCell({ label, value, tone, active, onClick }: { label: string; value: string; tone?: "good" | "bad"; active?: boolean; onClick?: () => void }) {
  const clr = tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`text-left px-3 py-3 sm:px-4 sm:py-4 transition-colors ${onClick ? "hover:bg-muted/40 active:bg-muted/60" : ""} ${active ? "bg-primary/5" : ""}`}
    >
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className={`mt-1 font-semibold tabular-nums leading-tight text-[15px] sm:text-lg ${clr}`} style={{ wordBreak: "break-word" }}>{value}</div>
    </button>
  );
}

function MiniBucket({ label, value, tone }: { label: string; value: number; tone?: "warn" | "bad" }) {
  const clr = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  return (
    <div className="rounded-2xl border bg-card px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xs sm:text-sm font-semibold tabular-nums truncate ${clr}`}>{inr(value)}</div>
    </div>
  );
}

function PayProgress({ pct, tab }: { pct: number; tab: "receivable" | "payable" | "history" }) {
  const bar = tab === "receivable" ? "bg-primary" : "bg-destructive";
  return (
    <div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5"><span>{pct}% paid</span><span>{100 - pct}% due</span></div>
    </div>
  );
}

// suppress unused warnings
void Link;