import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { inr, fmtDate, todayISO } from "@/lib/format";
import { toast } from "sonner";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollapseFilters } from "@/components/collapse-filters";
import { useDraft } from "@/hooks/use-draft";

export const Route = createFileRoute("/app/bank")({ component: BankPage });

function StatusPill({ status }: { status: "pending" | "cleared" | "bounced" }) {
  if (status === "cleared") return <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400">✓ Cleared</Badge>;
  if (status === "bounced") return <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">✗ Bounced</Badge>;
  return <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400">⏳ Pending</Badge>;
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
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm, draft] = useDraft<Form>("bank:new", EMPTY);
  const [cashBal, setCashBal] = useState(0);
  const [bankBal, setBankBal] = useState(0);

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
    return { dep, wd };
  }, [filtered]);

  const startNew = (k: Kind) => {
    setForm({ ...EMPTY, kind: k, date: todayISO() });
    setOpen(true);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (form.amount <= 0) { toast.error("Amount must be > 0"); return; }
    if (form.kind === "cheque_deposit" && !form.cheque_no.trim()) { toast.error("Cheque number is required"); return; }
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
      cleared: form.cleared,
      cleared_at: form.cleared ? form.date : null,
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
    const { error } = await supabase.from("bank_transfers" as never)
      .update({ status } as never).eq("id" as never, r.id);
    if (error) toast.error(error.message);
    else { toast.success(status === "cleared" ? "Marked cleared" : status === "bounced" ? "Marked bounced" : "Set to pending"); load(); }
  };

  return (
    <div>
      <PageHeader
        title="Bank & cash"
        description="Deposits, withdrawals and cheques between your cash drawer and bank"
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => startNew("cash_deposit")}><ArrowDownToLine className="h-4 w-4" /> Cash deposit</Button>
            <Button size="sm" variant="outline" onClick={() => startNew("cheque_deposit")}><Banknote className="h-4 w-4" /> Cheque deposit</Button>
            <Button size="sm" onClick={() => startNew("cash_withdrawal")}><ArrowUpFromLine className="h-4 w-4" /> Withdraw cash</Button>
          </>
        }
      />

      <div className="mb-3 rounded-2xl border border-border/70 bg-card overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border/60">
          <Link to="/app/ledger" className="px-4 py-3 hover:bg-muted/40 transition-colors">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Cash on hand</div>
            <div className={`mt-1 text-base sm:text-lg font-semibold tabular-nums leading-tight ${cashBal < 0 ? "text-destructive" : ""}`}>{inr(cashBal)}</div>
          </Link>
          <Link to="/app/ledger" className="px-4 py-3 hover:bg-muted/40 transition-colors">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Bank balance</div>
            <div className={`mt-1 text-base sm:text-lg font-semibold tabular-nums leading-tight ${bankBal < 0 ? "text-destructive" : "text-primary"}`}>{inr(bankBal)}</div>
          </Link>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as any)} className="mb-3">
        <TabsList className="w-full sm:w-auto flex-wrap h-auto">
          <TabsTrigger value="all" className="flex-1 sm:flex-none">All</TabsTrigger>
          <TabsTrigger value="cash_deposit" className="flex-1 sm:flex-none">Deposits</TabsTrigger>
          <TabsTrigger value="cheque_deposit" className="flex-1 sm:flex-none">Cheques</TabsTrigger>
          <TabsTrigger value="cash_withdrawal" className="flex-1 sm:flex-none">Withdrawals</TabsTrigger>
        </TabsList>
      </Tabs>

      <CollapseFilters
        summary={`${filtered.length} of ${rows.length} entries · Deposits ${inr(totals.dep)} · Withdrawals ${inr(totals.wd)}`}
        active={q ? 1 : 0}
        onClear={() => setQ("")}
      >
        <Input placeholder="Search no / bank / cheque / txn id…" value={q} onChange={(e) => setQ(e.target.value)} />
      </CollapseFilters>

      {filtered.length === 0 ? (
        <Empty>No bank entries yet. Record a cash deposit or cheque deposit to begin.</Empty>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const st = (r.status ?? (r.cleared ? "cleared" : "pending")) as Status;
            const isOut = r.kind === "cash_withdrawal";
            return (
              <div key={r.id} className="rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
                {/* Top row: meta + amount */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      {KIND_LABEL[r.kind]} · {fmtDate(r.date)}
                    </div>
                    <div className="font-mono text-sm font-medium mt-0.5">{r.transfer_no}</div>
                    {r.bank_name && <div className="text-xs text-muted-foreground truncate mt-0.5">{r.bank_name}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-lg font-semibold tabular-nums leading-tight ${isOut ? "text-destructive" : "text-primary"}`}>
                      {isOut ? "−" : "+"}{inr(r.amount)}
                    </div>
                    <div className="mt-1 flex justify-end"><StatusPill status={st} /></div>
                  </div>
                </div>

                {(r.cheque_no || r.txn_id || r.notes) && (
                  <div className="mt-2 text-[11px] text-muted-foreground truncate">
                    {r.cheque_no && <>Cheque #{r.cheque_no}{r.cheque_date ? ` · ${fmtDate(r.cheque_date)}` : ""}</>}
                    {r.txn_id && <>{r.cheque_no ? " · " : ""}Txn {r.txn_id}</>}
                    {r.notes && <>{(r.cheque_no || r.txn_id) ? " · " : ""}{r.notes}</>}
                  </div>
                )}

                {/* Bottom: status control + delete */}
                <div className="mt-3 flex items-center gap-2 pt-2 border-t border-border/50">
                  <Select value={st} onValueChange={(v) => changeStatus(r, v as Status)}>
                    <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="cleared">Cleared</SelectItem>
                      <SelectItem value="bounced">Bounced</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => del(r.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) draft.clear(); }}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {KIND_LABEL[form.kind]}
            </DialogTitle>
          </DialogHeader>
          {draft.hasDraft && (
            <div className="text-[11px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300 px-2 py-1">
              Resumed an unsaved draft. <button className="underline" onClick={() => { draft.discard(); }}>Discard</button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
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
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Transaction / reference ID</Label>
                <Input placeholder="UPI / NEFT / RTGS reference (optional)" value={form.txn_id} onChange={(e) => setForm({ ...form, txn_id: e.target.value })} /></div>
            )}

            <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>

            <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={form.cleared} onChange={(e) => setForm({ ...form, cleared: e.target.checked })} />
              Already cleared (uncheck for pending cheque)
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { draft.discard(); setOpen(false); }}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}