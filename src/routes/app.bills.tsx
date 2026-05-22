import { createFileRoute, Link, useSearch, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { cn } from "@/lib/utils";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Clock3, Eye, History, Printer, ShieldCheck, Trash2, X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ContactPicker } from "@/components/contact-picker";
import { DocDetail } from "@/routes/app.lookup";
import { lookupDoc, openDocsFor, type DocLookupResult } from "@/lib/doc-lookup";
import { toast } from "sonner";
import { useShortcut } from "@/lib/shortcuts";
import { exportStoneWorldPayment } from "@/lib/pdf-theme";
import { KpiGrid, KpiTile, SegmentedTabs } from "@/components/ui-tokens";

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
  cleared: boolean; cleared_at: string | null; cheque_no: string | null; bank_name: string | null; txn_id: string | null;
  status?: "pending" | "cleared" | "bounced" | null;
  kind?: "against_invoice" | "advance" | "on_account" | null;
};
type Alloc = { doc_kind: "sale" | "purchase" | "tp" | "tp_purchase"; doc_id: string; doc_no: string; amount: number; balance?: number; total?: number };
type PendingChequeLock = { doc_kind: string; doc_id: string; payment_id: string; payment_no: string; cheque_no: string | null; amount: number; date: string };

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

function ClearancePill({ cleared, mode, status }: { cleared: boolean; mode?: string | null; status?: string | null }) {
  const isCheque = mode === "Cheque";
  const isBounced = status === "bounced";
  const cls = isBounced
    ? "border-destructive/40 bg-destructive/5 text-destructive"
    : cleared
    ? "border-primary/30 bg-primary/5 text-primary"
    : "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {cleared ? <CheckCircle2 className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
      {isBounced ? "Bounced" : cleared ? "Cleared" : isCheque ? "Cheque pending" : "Pending"}
    </span>
  );
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
  const [pendingChequeLocks, setPendingChequeLocks] = useState<PendingChequeLock[]>([]);

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
  const [kind, setKind] = useState<"against_invoice" | "advance" | "on_account">("against_invoice");

  const openPreview = async (docNo: string) => {
    const r = await lookupDoc(docNo);
    if (r) setPreview(r);
  };

  const load = async () => {
    const [{ data: out }, { data: ph }, { data: locks }] = await Promise.all([
      supabase.from("outstanding_view" as never).select("*").gt("balance", 0).order("date", { ascending: true }) as any,
      supabase.from("payments").select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("pending_cheque_allocations_view" as never).select("doc_kind,doc_id,payment_id,payment_no,cheque_no,amount,date") as any,
    ]);
    setRows((out ?? []) as Row[]);
    setPays((ph ?? []) as PayRow[]);
    setPendingChequeLocks((locks ?? []) as PendingChequeLock[]);
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
  const lockMap = useMemo(() => {
    const m = new Map<string, PendingChequeLock>();
    pendingChequeLocks.forEach((l) => m.set(`${l.doc_kind}:${l.doc_id}`, l));
    return m;
  }, [pendingChequeLocks]);

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
    setKind("against_invoice");
    setPayOpen(true);
  };

  /* Click an outstanding bill → open dialog pre-filled to settle exactly that bill */
  const settleBill = async (r: Row) => {
    const lock = lockMap.get(`${r.doc_kind}:${r.doc_id}`);
    if (lock) {
      const pending = pays.find((p) => p.id === lock.payment_id);
      if (pending) openPayView(pending);
      else toast.error(`Pending cheque ${lock.payment_no} is already linked. Mark it cleared or bounced first.`);
      return;
    }
    const dir: "in" | "out" = sideOf(r.doc_kind) === "receivable" ? "in" : "out";
    setDirection(dir); setDate(todayISO()); setMode("Bank"); setNotes("");
    setChequeNo(""); setChequeDate(""); setTxnId(""); setBankName(""); setCleared(true);
    setContactId(r.party_id); setContactName(r.party_name);
    setAmount(Number(Number(r.balance).toFixed(2)));
    setAllocs([{ doc_kind: r.doc_kind, doc_id: r.doc_id, doc_no: r.doc_no, amount: Number(r.balance), balance: Number(r.balance), total: Number(r.total) }]);
    setKind("against_invoice");
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
    const lockedAlloc = allocs.find((a) => lockMap.has(`${a.doc_kind}:${a.doc_id}`));
    if (lockedAlloc) {
      const lock = lockMap.get(`${lockedAlloc.doc_kind}:${lockedAlloc.doc_id}`)!;
      toast.error(`Pending cheque ${lock.payment_no} is already linked to ${lockedAlloc.doc_no}. Open it and change cheque status instead.`);
      return;
    }
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
      if (mode === "Cheque") {
        toast.error(`Cheque/payment already recorded as ${dup[0].payment_no}. Open that entry and update its status.`);
        return;
      }
      const ok = confirm(`A ${direction === "in" ? "receipt" : "payment"} of ${inr(amount)} for this party on ${fmtDate(date)} already exists (${dup[0].payment_no}). Record another one anyway?`);
      if (!ok) return;
    }
    if (allocs.length > 0 && allocatedSum > amount + 0.01) {
      toast.error(`Allocated (${inr(allocatedSum)}) is more than amount (${inr(amount)}).`);
      return;
    }
    if (kind === "against_invoice" && allocs.length === 0) {
      toast.error(`"Against invoice" needs at least one bill selected. Switch to Advance or On-account if no specific bill applies.`);
      return;
    }
    if ((kind === "advance" || kind === "on_account") && allocs.length > 0) {
      toast.error(`${kind === "advance" ? "Advance" : "On-account"} entries cannot be tied to a specific bill. Clear selections or change kind to "Against invoice".`);
      return;
    }
    const finalCleared = mode === "Cheque" ? cleared : true;
    const finalStatus = mode === "Cheque" ? (finalCleared ? "cleared" : "pending") : "cleared";
    const { data: pay, error } = await supabase.from("payments").insert({
      user_id: user.id, direction, date, amount, mode, notes: notes || null,
      contact_id: contactId, contact_name: contactName,
      ref_doc: allocs.map(a => a.doc_no).join(", ") || null,
      cheque_no: chequeNo || null, cheque_date: chequeDate || null,
      txn_id: txnId || null, bank_name: bankName || null,
      cleared: finalCleared, cleared_at: finalCleared ? date : null, status: finalStatus,
      kind,
    } as never).select().single() as { data: any; error: any };
    if (error) { toast.error(error.message); return; }
    if (kind === "against_invoice" && allocs.length) {
      const rowsToInsert = allocs.filter(a => a.amount > 0).map(a => ({
        user_id: user.id, payment_id: pay.id, doc_kind: a.doc_kind, doc_id: a.doc_id, doc_no: a.doc_no, amount: a.amount,
      }));
      if (rowsToInsert.length) {
        const { error: e2 } = await supabase.from("payment_allocations" as never).insert(rowsToInsert as never);
        if (e2) toast.error("Saved, but allocation failed: " + e2.message);
      }
    } else if (kind === "against_invoice" && contactId) {
      const { error: e3 } = await supabase.rpc("auto_allocate_payment" as never, { _pid: pay.id } as never);
      if (e3) toast.error("Saved, but auto-allocation failed: " + e3.message);
      else toast.success("Auto-applied to oldest open dues");
    } else if (kind === "advance") {
      toast.success(`Parked as advance — auto-applies when you raise the next ${direction === "in" ? "invoice" : "purchase"} for this party.`);
    } else if (kind === "on_account") {
      toast.success("Recorded on account — allocate manually from outstanding bills.");
    }
    toast.success("Saved"); setPayOpen(false); load();
  };

  const delPay = async (id: string) => {
    if (!confirm("Delete payment?")) return;
    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const markPayCleared = async (p: PayRow) => {
    const { error } = await supabase.from("payments").update({ status: "cleared", cleared: true, cleared_at: todayISO() } as never).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Payment marked cleared");
    setViewPay({ ...p, status: "cleared", cleared: true, cleared_at: todayISO() });
    load();
  };

  const markPayBounced = async (p: PayRow) => {
    const { error } = await supabase.from("payments").update({ status: "bounced", cleared: false, cleared_at: null } as never).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Cheque marked bounced");
    setViewPay({ ...p, status: "bounced", cleared: false, cleared_at: null });
    load();
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
    <div className="min-w-0 max-w-full overflow-hidden">
      <PageHeader
        title="Money"
        description="Collect, pay and review only cleared settlements in one place."
        actions={
          <div className="grid w-full grid-cols-[auto_1fr_1fr] gap-2 sm:flex sm:w-auto sm:items-center sm:justify-end">
            <ExcelBar onExport={onExport} />
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => startNew("in")}>
              <ArrowDownLeft className="h-4 w-4" /> Receive
            </Button>
            <Button size="sm" className="rounded-full" onClick={() => startNew("out")}>
              <Plus className="h-4 w-4" /> Pay
            </Button>
          </div>
        }
      />

      <KpiGrid cols={2} className="mb-3 [&>*]:min-h-[96px] [&>*]:overflow-hidden">
        <KpiTile
          label="Collect"
          value={inr(kpis.recv)}
          tone="good"
          hint={kpis.recvOverdue > 0 ? `${inr(kpis.recvOverdue)} overdue` : "All on time"}
          active={tab === "receivable"}
          onClick={() => setTab("receivable")}
        />
        <KpiTile
          label="Pay"
          value={inr(kpis.pay)}
          tone="bad"
          hint={kpis.payOverdue > 0 ? `${inr(kpis.payOverdue)} overdue` : "All on time"}
          active={tab === "payable"}
          onClick={() => setTab("payable")}
        />
      </KpiGrid>
      <div className="mb-3 -mt-1 px-1 text-xs text-muted-foreground">
        Net position{" "}
        <span className={cn("font-medium tabular-nums", kpis.net >= 0 ? "text-primary" : "text-destructive")}>
          {inr(kpis.net)}
        </span>{" "}
        · {kpis.net >= 0 ? "Receivables ahead" : "Payables ahead"}
      </div>

      <div className="mb-3 min-w-0 overflow-hidden rounded-2xl border bg-card p-2 shadow-sm sm:p-3">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedTabs
            value={tab}
            onValueChange={(v) => setTab(v as any)}
            items={[
              { value: "receivable", label: "Receivable", icon: <ArrowDownLeft className="h-3.5 w-3.5" /> },
              { value: "payable", label: "Payable", icon: <ArrowUpRight className="h-3.5 w-3.5" /> },
              { value: "history", label: "History", icon: <History className="h-3.5 w-3.5" /> },
            ]}
          />
          {tab !== "history" && (
            <Select value={bucketFilter} onValueChange={(v) => setBucketFilter(v as any)}>
              <SelectTrigger className="h-9 w-full rounded-full sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ages</SelectItem>
                <SelectItem value="0–30">0–30 days</SelectItem>
                <SelectItem value="31–60">31–60 days</SelectItem>
                <SelectItem value="61–90">61–90 days</SelectItem>
                <SelectItem value="90+">90+ days</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        <Input className="mt-2 h-9 rounded-xl" placeholder={tab === "history" ? "Search payment, party, reference…" : "Search bill or party…"} value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {tab === "history" ? (
        filteredPays.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
          <div className="min-w-0 overflow-hidden rounded-2xl border bg-card shadow-sm divide-y">
            {filteredPays.map(p => (
              <button key={p.id} type="button" className="grid w-full min-w-0 grid-cols-[1fr_auto] items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 sm:px-4" onClick={() => openPayView(p)}>
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 max-w-full truncate font-mono text-sm font-medium">{p.payment_no}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(p.date)}</span>
                    {(p.mode === "Cheque" || p.cleared === false) && <ClearancePill cleared={p.cleared !== false} mode={p.mode} status={p.status} />}
                  </div>
                  <div className="mt-1 truncate text-sm">
                    {p.contact_name ?? "—"} <span className="text-muted-foreground">· {p.mode ?? "Mode not set"}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.ref_doc || p.cheque_no || p.txn_id || p.notes ? [p.ref_doc, p.cheque_no ? `Cheque ${p.cheque_no}` : null, p.txn_id ? `Txn ${p.txn_id}` : null, p.notes].filter(Boolean).join(" · ") : "Open details"}
                  </div>
                </div>
                <div className="min-w-0 text-right">
                  <div className={`truncate text-base font-semibold tabular-nums ${p.direction === "in" ? "text-primary" : "text-destructive"}`}>{p.direction === "in" ? "+" : "−"}{inr(p.amount)}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{p.direction === "in" ? "Receipt" : "Payment"}</div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? <Empty>No outstanding {tab === "receivable" ? "receivables" : "payables"}.</Empty> : (
        <>
        <div className="hidden rounded-2xl border bg-card shadow-sm overflow-x-auto md:block">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="text-left p-3">Bill</th>
                <th className="text-left p-3">Party</th>
                <th className="text-right p-3">Balance</th>
                <th className="text-left p-3 w-44">Settlement</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const d = ageDays(r.date); const b = bucket(d);
                const pct = r.total > 0 ? Math.min(100, Math.round((r.paid / r.total) * 100)) : 0;
                const st = payStatus(Number(r.total), Number(r.paid), d);
                const lock = lockMap.get(`${r.doc_kind}:${r.doc_id}`);
                return (
                  <tr key={`${r.doc_kind}-${r.doc_id}`} className="border-t transition-colors hover:bg-muted/35">
                    <td className="p-3">
                      <button onClick={() => openPreview(r.doc_no)} className="font-mono text-primary hover:underline">{r.doc_no}</button>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{docKindLabel(r.doc_kind)} · {fmtDate(r.date)}</div>
                    </td>
                    <td className="p-3 truncate max-w-[220px]">{r.party_name ?? "—"}</td>
                    <td className={`p-3 text-right tabular-nums text-base font-semibold ${tab === "receivable" ? "text-primary" : "text-destructive"}`}>{inr(r.balance)}</td>
                    <td className="p-3">
                      <PayProgress pct={pct} tab={tab} />
                      <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">{inr(r.paid)} of {inr(r.total)}</div>
                    </td>
                    <td className="p-3"><div className="flex items-center gap-1.5 flex-wrap"><StatusBadge s={st} /><Badge variant={bucketTone(b) as any} className="text-[10px]">{b}d</Badge>{lock && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">Cheque {lock.payment_no}</Badge>}</div></td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <Button size="sm" variant={lock ? "secondary" : "outline"} onClick={() => settleBill(r)}>
                        {lock ? "View cheque" : tab === "receivable" ? "Receive" : "Pay"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm divide-y md:hidden">
          {filtered.map(r => {
            const d = ageDays(r.date); const b = bucket(d);
            const pct = r.total > 0 ? Math.min(100, Math.round((r.paid / r.total) * 100)) : 0;
            const st = payStatus(Number(r.total), Number(r.paid), d);
            const lock = lockMap.get(`${r.doc_kind}:${r.doc_id}`);
            return (
              <div key={`${r.doc_kind}-${r.doc_id}`} className="min-w-0 space-y-2.5 p-3">
                <button type="button" onClick={() => openPreview(r.doc_no)} className="w-full text-left">
                  <div className="grid min-w-0 grid-cols-[1fr_auto] items-start gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{docKindLabel(r.doc_kind)} · {fmtDate(r.date)}</div>
                      <div className="mt-0.5 truncate font-mono text-sm font-medium">{r.doc_no}</div>
                      <div className="text-sm truncate text-muted-foreground">{r.party_name ?? "—"}</div>
                    </div>
                    <div className="min-w-0 text-right">
                      <div className={`truncate text-base font-semibold tabular-nums ${tab === "receivable" ? "text-primary" : "text-destructive"}`}>{inr(r.balance)}</div>
                      <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5"><StatusBadge s={st} /><Badge variant={bucketTone(b) as any} className="text-[10px]">{b}d</Badge></div>
                    </div>
                  </div>
                </button>
                <PayProgress pct={pct} tab={tab} />
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
                  <span>{inr(r.paid)} of {inr(r.total)} · {b}d</span>
                  {lock && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">Pending cheque</Badge>}
                </div>
                <div>
                  <Button size="sm" className="w-full rounded-full" variant={lock ? "secondary" : "default"} onClick={() => settleBill(r)}>
                    {tab === "receivable" ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                    {lock ? "View pending cheque" : tab === "receivable" ? "Receive" : "Pay"}
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
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto overflow-x-hidden rounded-2xl p-0 gap-0 sm:w-full">
          <div className="px-4 py-3 border-b">
            <DialogTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Bill preview</DialogTitle>
          </div>
          <div className="p-4">{preview && <DocDetail doc={preview} />}</div>
        </DialogContent>
      </Dialog>

      {/* Past payment detail dialog */}
      <Dialog open={!!viewPay} onOpenChange={(o) => !o && setViewPay(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto overflow-x-hidden rounded-2xl sm:w-full">
          <DialogHeader><DialogTitle className="flex min-w-0 items-center gap-2 pr-6 text-base"><Eye className="h-4 w-4 shrink-0" /><span className="truncate">{viewPay?.direction === "in" ? "Receipt" : "Payment"} · {viewPay?.payment_no}</span></DialogTitle></DialogHeader>
          {viewPay && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Date</div><div>{fmtDate(viewPay.date)}</div></div>
                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Mode</div><div>{viewPay.mode ?? "—"}</div></div>
                <div className="sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Applied as</div>
                  <Badge variant="outline" className="text-[10px]">
                    {viewPay.kind === "advance" ? "Advance payment" : viewPay.kind === "on_account" ? "On account" : "Against invoice"}
                  </Badge>
                </div>
                {(viewPay.mode === "Cheque" || viewPay.cleared === false) && <div className="sm:col-span-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Clearance</div><ClearancePill cleared={viewPay.cleared !== false} mode={viewPay.mode} status={viewPay.status} /></div>}
                <div className="min-w-0 sm:col-span-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{viewPay.direction === "in" ? "From buyer" : "To supplier"}</div><div className="truncate font-medium">{viewPay.contact_name ?? "—"}</div></div>
                <div className="min-w-0 rounded-xl border bg-muted/30 p-3 sm:col-span-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Amount</div>
                  <div className={`truncate text-2xl font-semibold tabular-nums ${viewPay.direction === "in" ? "text-primary" : "text-destructive"}`}>{inr(viewPay.amount)}</div>
                </div>
                {viewPay.notes && <div className="min-w-0 sm:col-span-2"><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Notes</div><div className="break-words">{viewPay.notes}</div></div>}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">Applied to</div>
                {viewAllocs.length === 0 ? (
                  <div className="text-xs text-muted-foreground border rounded-md p-2">Sitting as advance on ledger.</div>
                ) : (
                  <div className="border rounded-md divide-y">
                    {viewAllocs.map((a, i) => (
                      <div key={i} className="grid min-w-0 grid-cols-1 gap-1 p-2.5 text-sm sm:flex sm:items-center sm:gap-2">
                        <Badge variant="outline" className="text-[10px]">{a.doc_kind === "sale" ? "Invoice" : a.doc_kind === "purchase" ? "Purchase" : a.doc_kind === "tp" ? "TP sale" : "TP purchase"}</Badge>
                        <span className="truncate font-mono text-xs">{a.doc_no}</span>
                        <span className="tabular-nums font-semibold sm:ml-auto">{inr(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-col gap-2 pt-3 border-t">
            {viewPay?.cleared === false && (
              <Button variant="outline" className="w-full" onClick={() => viewPay && markPayCleared(viewPay)}>
                <CheckCircle2 className="h-4 w-4" /> Mark cleared and post accounts
              </Button>
            )}
            {viewPay?.mode === "Cheque" && viewPay.status !== "bounced" && viewPay.cleared === false && (
              <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" onClick={() => viewPay && markPayBounced(viewPay)}>
                <X className="h-4 w-4" /> Mark bounced and release bill
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => viewPay && exportStoneWorldPayment(viewPay, viewAllocs, company)}>
              <Printer className="h-4 w-4" /> Download Branded PDF
            </Button>
            <Button variant="outline" className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive" onClick={() => { if (viewPay) { delPay(viewPay.id); setViewPay(null); } }}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unified payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-3xl overflow-y-auto overflow-x-hidden rounded-2xl p-0 gap-0 sm:w-full">
          <DialogHeader>
            <div className="border-b px-4 py-4 sm:px-6">
              <DialogTitle className="flex items-center gap-2 pr-6 text-base">
                {direction === "in" ? <ArrowDownLeft className="h-4 w-4 shrink-0 text-primary" /> : <ArrowUpRight className="h-4 w-4 shrink-0 text-destructive" />}
                {direction === "in" ? "Record receipt" : "Record payment"}
              </DialogTitle>
              {mode === "Cheque" && !cleared && <p className="mt-1 text-xs text-muted-foreground">This cheque will remain pending until you mark it cleared.</p>}
            </div>
          </DialogHeader>

          <div className="space-y-5 p-4 sm:p-6">
          {/* Direction segmented switch */}
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted/60 p-1 ring-1 ring-border/60">
            <button type="button" onClick={() => { setDirection("in"); setAllocs([]); }}
              className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-full text-[13px] font-medium transition-colors ${direction === "in" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <ArrowDownLeft className="h-3.5 w-3.5 text-primary" /> Money in
            </button>
            <button type="button" onClick={() => { setDirection("out"); setAllocs([]); }}
              className={`inline-flex items-center justify-center gap-1.5 h-8 rounded-full text-[13px] font-medium transition-colors ${direction === "out" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <ArrowUpRight className="h-3.5 w-3.5 text-destructive" /> Money out
            </button>
          </div>

          {/* Transaction kind: against invoice / advance / on-account */}
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Apply as</Label>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                { v: "against_invoice", t: "Against invoice", d: "Knock off specific pending bill(s)." },
                { v: "advance", t: "Advance payment", d: direction === "in" ? "Park as Advance from Customers." : "Park as Advances to Suppliers." },
                { v: "on_account", t: "On account", d: "Sits open on the party ledger until allocated." },
              ] as const).map((k) => (
                <button key={k.v} type="button"
                  onClick={() => { setKind(k.v); if (k.v !== "against_invoice") setAllocs([]); }}
                  className={`rounded-xl border p-3 text-left transition-colors ${kind === k.v ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:bg-muted/40"}`}>
                  <div className="text-xs font-medium">{k.t}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{k.d}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="sm:col-span-2 space-y-1.5"><Label className="text-xs">{direction === "in" ? "From buyer" : "To supplier"}</Label>
              <ContactPicker filter={direction === "in" ? "buyer" : "supplier"} value={contactId} onChange={(id, n) => { setContactId(id); setContactName(n); setAllocs([]); }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{direction === "in" ? "Amount received" : "Amount paid"} (₹)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Total of this single receipt/payment, not per invoice.</p>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Mode</Label>
              <Select value={mode} onValueChange={(v) => { setMode(v); setCleared(v !== "Cheque"); }}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bank">Bank transfer (NEFT/RTGS/IMPS)</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="sm:col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

            {(mode === "Bank" || mode === "UPI" || mode === "Card") && (
              <>
                <div className="sm:col-span-1 space-y-1.5">
                  <Label className="text-xs">Bank / app name</Label>
                  <Input placeholder={mode === "UPI" ? "GPay, PhonePe…" : "HDFC ****1234"} value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
                <div className="sm:col-span-1 space-y-1.5">
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
                <div className="sm:col-span-2 space-y-1.5">
                  <Label className="text-xs">Drawee bank</Label>
                  <Input placeholder="Bank on the cheque" value={bankName} onChange={(e) => setBankName(e.target.value)} />
                </div>
                <label className="sm:col-span-2 flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                  <Checkbox checked={cleared} onCheckedChange={(v) => setCleared(!!v)} className="mt-0.5" />
                  <span>
                    <span className="block font-medium">Cheque is cleared</span>
                    <span className="block text-xs text-muted-foreground">Leave unchecked for in-transit or uncertain cheques. Pending cheques will not settle bills or change Cash/Bank ledgers.</span>
                  </span>
                </label>
              </>
            )}
          </div>

          {mode === "Cheque" && !cleared && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              This cheque will be saved as pending. Mark it cleared later before it affects accounts.
            </div>
          )}

          {contactId && kind === "against_invoice" && (
            <div className="mt-3">
              <div className="mb-2 grid gap-1 sm:flex sm:items-center sm:justify-between">
                <Label className="text-xs">Open bills · click to allocate</Label>
                <div className="text-xs text-muted-foreground">
                  Allocated <span className="font-semibold">{inr(allocatedSum)}</span> / Remaining <span className={remaining < 0 ? "text-destructive font-semibold" : "font-semibold"}>{inr(remaining)}</span>
                </div>
              </div>
              <div className="mb-2 grid gap-2 text-xs text-muted-foreground sm:flex sm:items-center sm:justify-between">
                <span>Open total: <span className="font-semibold text-foreground">{inr(totalOpen)}</span></span>
                <Button type="button" size="sm" variant="outline" className="h-8 rounded-full sm:h-7" onClick={autoAllocate} disabled={!amount || openDocs.length === 0}>Auto-allocate oldest</Button>
              </div>
              {openDocs.length === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-md p-2">No open bills for this party — will sit as advance.</div>
              ) : (
                <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                  {openDocs.map((d: any) => {
                    const picked = allocs.find(a => a.doc_id === d.doc_id);
                    const lock = lockMap.get(`${d.doc_kind}:${d.doc_id}`);
                    return (
                      <div key={`${d.doc_kind}-${d.doc_id}`} className={`p-2.5 ${lock ? "bg-amber-500/5 cursor-default" : "cursor-pointer"} ${picked ? "bg-primary/5" : ""}`} onClick={() => lock ? toast.error(`Pending cheque ${lock.payment_no} is already linked. Open it from history to clear or bounce.`) : toggleDoc(d)}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{docKindLabel(d.doc_kind)}</Badge>
                              <span className="font-mono text-xs">{d.doc_no}</span>
                              {lock && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">Locked by {lock.payment_no}</Badge>}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{fmtDate(d.date)} · balance <span className="font-semibold text-foreground">{inr(d.balance)}</span> of {inr(d.total)}</div>
                          </div>
                          <div className="flex items-center gap-2 sm:justify-end">
                            {lock ? <Button type="button" size="sm" variant="secondary" className="h-8" onClick={(e) => { e.stopPropagation(); const p = pays.find(x => x.id === lock.payment_id); if (p) openPayView(p); }}>Open cheque</Button> : picked ? (
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
          </div>
          <DialogFooter className="border-t px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button onClick={save}><ShieldCheck className="h-4 w-4" /> Save safely</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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