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
import { inr, fmtDate, todayISO } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/expenses")({ component: ExpensesPage });
const CATS = ["General", "Transport", "Labour", "Rent", "Utilities", "Office", "Travel", "Marketing", "Repair", "Tax"];

function ExpensesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState("General");
  const [amount, setAmount] = useState(0);
  const [mode, setMode] = useState("Cash");
  const [notes, setNotes] = useState("");

  const load = async () => {
    const { data } = await supabase.from("expenses").select("*").order("date", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("expenses").insert({ user_id: user.id, date, category, amount, mode, notes });
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setOpen(false); setAmount(0); setNotes(""); load(); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete?")) return;
    await supabase.from("expenses").delete().eq("id", id); load();
  };

  const total = rows.reduce((a, r) => a + Number(r.amount ?? 0), 0);

  return (
    <div>
      <PageHeader title="Expenses" description={`Total: ${inr(total)}`} actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4" /> New</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New expense</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Category</Label>
                <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label className="text-xs">Amount ₹</Label><Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Mode</Label>
                <Select value={mode} onValueChange={setMode}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Bank">Bank</SelectItem></SelectContent>
                </Select></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      } />
      {rows.length === 0 ? <Empty>No expenses yet.</Empty> : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.id} className="rounded-md border bg-card p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{r.category}</span>
                  <span className="text-xs text-muted-foreground">{fmtDate(r.date)} · {r.mode}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate">{r.notes}</div>
              </div>
              <div className="font-semibold tabular-nums">{inr(r.amount)}</div>
              <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}