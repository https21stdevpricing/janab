import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty } from "@/components/empty";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Eye, ShieldCheck, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDraft } from "@/hooks/use-draft";
import { Checkbox } from "@/components/ui/checkbox";
import { ActionStack, KpiGrid, KpiTile, SegmentedTabs } from "@/components/ui-tokens";

export const Route = createFileRoute("/app/bank")({ component: BankPage });

function StatusPill({ status }: { status: "pending" | "cleared" | "bounced" }) {
  const cls =
    status === "cleared"
      ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5"
      : status === "bounced"
      ? "border-destructive/50 text-destructive bg-destructive/5"
      : "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5";
  const label = status === "cleared" ? "Cleared" : status === "bounced" ? "Bounced" : "Pending";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${cls}`}>{label}</span>;
}

type Kind = "cash_deposit" | "cash_withdrawal" | "cheque_deposit";
type Status = "pending" | "cleared" | "bounced";
type Row = {
  id: string; transfer_no: string; date: string; kind: Kind; amount: number;
  bank_name: string | null; cheque_no: string | null; cheque_date: string | null;
  txn_id: string | null; notes: string | null; cleared: boolean; cleared_at: string | null;
  status: Status;
};

const KIND_LABEL: Record<Kind, string> = {
  cash_deposit: "Cash deposit",
  cash_withdrawal: "Cash withdrawal",
  cheque_deposit: "Cheque deposit",
};

type Form = {
  kind: Kind; date: string; amount: number; bank_name: string;
  cheque_no: string; cheque_date: string; txn_id: string; notes: string;
  cleared: boolean;
};
const EMPTY: Form = {
  kind: "cash_deposit", date: todayISO(), amount: 0, bank_name: "",
  cheque_no: "", cheque_date: "", txn_id: "", notes: "", cleared: true,
};

function BankPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm, draft] = useDraft<Form>("bank:new", EMPTY);
  const [cashBal, setCashBal] = useState(0);
  const [bankBal, setBankBal] = useState(0);
  const [viewRow, setViewRow] = useState<Row | null>(null);

  const load = async () => {
    const [{ data }, { data: lv }] = await Promise.all([
      supabase.from("bank_transfers" as never).select("*").order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("ledger_view" as never).select("account,debit,credit").in("account" as never, ["Cash","Bank"]),
    ]);
    setRows((data ?? []) as Row[]);
    let c = 0, b = 0;
    for (const r of (lv ?? []) as any[]) {
      const net = Number(r.debit||0) - Number(r.credit||0);
      if (r.account === "Cash") c += net;
      else if (r.account === "Bank") b += net;
    }
    setCashBal(c); setBankBal(b);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("bank-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "bank_transfers" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => rows.filter(r =>
    (filter === "all" || r.kind === filter) &&
    (q === "" || [r.transfer_no, r.bank_name, r.cheque_no, r.txn_id, r.notes].some(v => (v ?? "").toLowerCase().includes(q.toLowerCase())))
  ), [rows, filter, q]);

  const totals = useMemo(() => {
    const dep = filtered.filter(r => r.kind !== "cash_withdrawal").reduce((a,r) => a + Number(r.amount||0), 0);
    const wd  = filtered.filter(r => r.kind === "cash_withdrawal").reduce((a,r) => a + Number(r.amount||0), 0);
    const pending = rows.filter(r => (r.status ?? (r.cleared ? "cleared" : "pending")) === "pending").reduce((a,r) => a + Number(r.amount||0), 0);
    return { dep, wd, pending };
  }, [filtered, rows]);

  const startNew = (k: Kind) => {
    setForm({ ...EMPTY, kind: k, date: todayISO(), cleared: k !== "cheque_deposit" });
    setOpen(true);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (form.amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (form.kind === "cheque_deposit" && !form.cheque_no.trim()) { toast.error("Cheque number is required"); return; }
    if (form.kind === "cheque_deposit") {
      const { data: dup } = await supabase.from("bank_transfers" as never)
        .select("transfer_no,status").eq("kind" as never, "cheque_deposit").eq("cheque_no" as never, form.cheque_no.trim()).limit(1) as any;
      if (dup && dup.length) { toast.error(`Cheque already recorded as ${dup[0].transfer_no}. Open that entry and update its status.`); return; }
    }
    const finalCleared = form.kind === "cheque_deposit" ? form.cleared : true;
    const payload: any = {
      user_id: user.id,
      kind: form.kind,
      date: form.date,
      amount: form.amount,
      bank_name: form.bank_name || null,
      cheque_no: form.cheque_no || null,
      cheque_date: form.cheque_date || null,
      txn_id: form.txn_id || null,
      notes: form.notes || null,
      cleared: finalCleared,
      status: finalCleared ? "cleared" : "pending",
      cleared_at: finalCleared ? form.date : null,
    };
    const { error } = await supabase.from("bank_transfers" as never).insert(payload as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    draft.clear();
    setOpen(false); load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("bank_transfers" as never).delete().eq("id" as never, id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const changeStatus = async (r: Row, status: Status) => {
    const nextCleared = status === "cleared";
    const { error } = await supabase.from("bank_transfers" as never)
      .update({ status, cleared: nextCleared, cleared_at: nextCleared ? todayISO() : null } as never).eq("id" as never, r.id);
    if (error) toast.error(error.message);
    else { toast.success(status === "cleared" ? "Marked cleared" : status === "bounced" ? "Marked bounced" : "Set to pending"); setViewRow(viewRow?.id === r.id ? { ...r, status, cleared: nextCleared, cleared_at: nextCleared ? todayISO() : null } : viewRow); load(); }
  };

  return (
    <div>
      <PageHeader title="Deposits" description="Track bank, cash and cheque clearance without mixing pending money into balances." />

      <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_280px]">
        <KpiGrid cols={2}>
          <KpiTile
            label="Cash"
            value={inr(cashBal)}
            tone={cashBal < 0 ? "bad" : undefined}
            hint={`Pending cheques ${inr(totals.pending)}`}
            onClick={() => navigate({ to: "/app/ledger" })}
          />
          <KpiTile
            label="Bank"
            value={inr(bankBal)}
            tone={bankBal < 0 ? "bad" : "good"}
            hint="View ledger"
            onClick={() => navigate({ to: "/app/ledger" })}
          />
        </KpiGrid>
        <ActionStack
          title="New entry"
          items={[
            { label: "Cash deposit", icon: <ArrowDownToLine className="h-4 w-4" />, onClick: () => startNew("cash_deposit") },
            { label: "Cheque deposit", icon: <Banknote className="h-4 w-4" />, onClick: () => startNew("cheque_deposit") },
            { label: "Withdraw cash", icon: <ArrowUpFromLine className="h-4 w-4" />, onClick: () => startNew("cash_withdrawal"), primary: true },
          ]}
        />
      </div>

      <div className="mb-3 space-y-3">
        <SegmentedTabs
          value={filter}
          onValueChange={(v) => setFilter(v as any)}
          items={[
            { value: "all", label: "All" },
            { value: "cash_deposit", label: "Deposits" },
            { value: "cheque_deposit", label: "Cheques" },
            { value: "cash_withdrawal", label: "Withdrawals" },
          ]}
        />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
          <Input className="h-10" placeholder="Search entry, bank, cheque, UTR…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="text-xs text-muted-foreground sm:text-right">
            {filtered.length} entries · In {inr(totals.dep)} · Out {inr(totals.wd)}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty>No bank entries yet. Record a cash deposit or cheque deposit to begin.</Empty>
      ) : (
        <div className="surface overflow-hidden">
          {filtered.map(r => {
            const st = (r.status ?? (r.cleared ? "cleared" : "pending")) as Status;
            const isOut = r.kind === "cash_withdrawal";
            return (
              <div key={r.id} className="grid gap-3 border-b border-border/60 p-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center cursor-pointer transition-colors hover:bg-muted/30" onClick={() => setViewRow(r)}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">{r.transfer_no}</span>
                    <StatusPill status={st} />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {KIND_LABEL[r.kind]} · {fmtDate(r.date)}{r.bank_name ? ` · ${r.bank_name}` : ""}
                    {r.cheque_no ? ` · Cheque ${r.cheque_no}` : ""}{r.txn_id ? ` · Txn ${r.txn_id}` : ""}
                  </div>
                </div>
                <div className={`text-left text-base font-semibold tabular-nums sm:text-right ${isOut ? "text-destructive" : "text-primary"}`}>
                  {isOut ? "−" : "+"}{inr(r.amount)}
                </div>
                <div className="flex items-center gap-2 sm:w-48" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => setViewRow(r)} aria-label="View details">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Select value={st} onValueChange={(v) => changeStatus(r, v as Status)}>
                    <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="cleared">Cleared</SelectItem>
                      <SelectItem value="bounced">Bounced</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => del(r.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) draft.clear(); }}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 gap-0">
          <DialogHeader>
            <div className="border-b px-4 py-4 sm:px-6">
              <DialogTitle className="flex items-center gap-2 text-base">
                {form.kind === "cheque_deposit" ? <Banknote className="h-4 w-4" /> : form.kind === "cash_withdrawal" ? <ArrowUpFromLine className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}
                {KIND_LABEL[form.kind]}
              </DialogTitle>
              {form.kind === "cheque_deposit" && !form.cleared && (
                <p className="mt-1 text-xs text-muted-foreground">This cheque will stay pending until bank clearance is confirmed.</p>
              )}
            </div>
          </DialogHeader>
          <div className="space-y-4 p-4 sm:p-6">
          {draft.hasDraft && (
            <div className="text-[11px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-2 py-1">
              Resumed an unsaved draft. <button className="underline" onClick={() => { draft.discard(); }}>Discard</button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as Kind })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash_deposit">Cash deposit (Cash → Bank)</SelectItem>
                  <SelectItem value="cash_withdrawal">Cash withdrawal (Bank → Cash)</SelectItem>
                  <SelectItem value="cheque_deposit">Cheque deposit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Amount (₹)</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Bank name</Label>
              <Input placeholder="e.g. HDFC – ****1234" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} /></div>

            {form.kind === "cheque_deposit" && (
              <>
                <div className="space-y-1.5"><Label className="text-xs">Cheque number *</Label>
                  <Input placeholder="6-digit cheque no." value={form.cheque_no} onChange={(e) => setForm({ ...form, cheque_no: e.target.value })} /></div>
                <div className="space-y-1.5"><Label className="text-xs">Cheque date</Label>
                  <Input type="date" value={form.cheque_date} onChange={(e) => setForm({ ...form, cheque_date: e.target.value })} /></div>
              </>
            )}

            {form.kind !== "cheque_deposit" && (
              <div className="sm:col-span-2 space-y-1.5"><Label className="text-xs">Transaction / reference ID</Label>
                <Input placeholder="UPI / NEFT / RTGS reference (optional)" value={form.txn_id} onChange={(e) => setForm({ ...form, txn_id: e.target.value })} /></div>
            )}

            <div className="sm:col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

            {form.kind === "cheque_deposit" && (
              <label className="sm:col-span-2 flex items-start gap-3 rounded-lg border bg-muted/20 p-3 text-sm">
                <Checkbox checked={form.cleared} onCheckedChange={(v) => setForm({ ...form, cleared: !!v })} className="mt-0.5" />
                <span>
                  <span className="block font-medium">Cheque is cleared</span>
                  <span className="block text-xs text-muted-foreground">Leave unchecked while the cheque is in transit or not confirmed. It will not post to accounts until marked cleared.</span>
                </span>
              </label>
            )}
          </div>
          {form.kind === "cheque_deposit" && !form.cleared && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              Pending cheque: saved for tracking only. Mark cleared from the list once confirmed by the bank.
            </div>
          )}
          </div>
          <DialogFooter className="border-t px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => { draft.discard(); setOpen(false); }}>Cancel</Button>
            <Button onClick={save}><ShieldCheck className="h-4 w-4" /> Save safely</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewRow} onOpenChange={(o) => !o && setViewRow(null)}>
        <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
          {viewRow && (
            <>
              <div className="border-b px-4 py-4 sm:px-6">
                <DialogTitle className="flex items-center gap-2 text-base">
                  {viewRow.kind === "cheque_deposit" ? <Banknote className="h-4 w-4" /> : viewRow.kind === "cash_withdrawal" ? <ArrowUpFromLine className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}
                  {viewRow.transfer_no}
                </DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">{KIND_LABEL[viewRow.kind]} · {fmtDate(viewRow.date)}</p>
              </div>
              <div className="space-y-4 p-4 sm:p-6 text-sm">
                <div className="rounded-lg border bg-muted/20 p-3">
                  <div className="eyebrow">Amount</div>
                  <div className={`mt-1 text-2xl font-semibold tabular-nums ${viewRow.kind === "cash_withdrawal" ? "text-destructive" : "text-primary"}`}>{viewRow.kind === "cash_withdrawal" ? "−" : "+"}{inr(viewRow.amount)}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Detail label="Status"><StatusPill status={(viewRow.status ?? (viewRow.cleared ? "cleared" : "pending")) as Status} /></Detail>
                  <Detail label="Bank">{viewRow.bank_name ?? "—"}</Detail>
                  {viewRow.cheque_no && <Detail label="Cheque no.">{viewRow.cheque_no}</Detail>}
                  {viewRow.cheque_date && <Detail label="Cheque date">{fmtDate(viewRow.cheque_date)}</Detail>}
                  {viewRow.txn_id && <Detail label="Txn / UTR">{viewRow.txn_id}</Detail>}
                  {viewRow.cleared_at && <Detail label="Cleared on">{fmtDate(viewRow.cleared_at)}</Detail>}
                </div>
                {viewRow.notes && <Detail label="Notes">{viewRow.notes}</Detail>}
              </div>
              <div className="border-t p-3 grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => changeStatus(viewRow, "pending")}>Pending</Button>
                <Button variant="outline" size="sm" onClick={() => changeStatus(viewRow, "bounced")}>Bounced</Button>
                <Button size="sm" onClick={() => changeStatus(viewRow, "cleared")}>Cleared</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div><div className="font-medium break-words">{children}</div></div>;
}