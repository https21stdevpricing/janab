import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { fmt, inr, fmtDate, todayISO } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, Calculator, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/fixed-assets")({ component: FixedAssetsPage });

const CATEGORIES = ["Land","Building","Machinery","Vehicle","Furniture","Equipment","Computer","Other"] as const;
const METHODS = [
  { v: "straight_line", l: "Straight Line (equal each year)" },
  { v: "wdv", l: "Written Down Value (declining)" },
  { v: "none", l: "No depreciation (e.g. Land)" },
] as const;

type FA = {
  id: string; asset_no: string; name: string; category: string;
  purchase_date: string; cost: number; salvage_value: number;
  useful_life_years: number; depreciation_method: string; wdv_rate_pct: number;
  accumulated_depreciation: number; paid_via: string;
  supplier_name: string | null; disposed_at: string | null; disposal_value: number | null;
  notes: string | null;
};

const empty = {
  name: "", category: "Machinery", purchase_date: todayISO(), cost: 0, salvage_value: 0,
  useful_life_years: 10, depreciation_method: "straight_line", wdv_rate_pct: 15,
  paid_via: "Bank", supplier_name: "", notes: "",
};

function FixedAssetsPage() {
  const [rows, setRows] = useState<FA[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<FA | null>(null);
  const [form, setForm] = useState<any>(empty);
  const [disposeId, setDisposeId] = useState<string | null>(null);
  const [disposeVal, setDisposeVal] = useState<{ disposed_at: string; disposal_value: number }>({ disposed_at: todayISO(), disposal_value: 0 });

  const load = async () => {
    const { data, error } = await (supabase as any).from("fixed_assets").select("*").order("purchase_date", { ascending: false });
    if (error) toast.error(error.message); else setRows((data ?? []) as FA[]);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => rows.filter(r =>
    !q || `${r.asset_no} ${r.name} ${r.category}`.toLowerCase().includes(q.toLowerCase())
  ), [rows, q]);

  const summary = useMemo(() => {
    let gross = 0, accDep = 0, active = 0, disposed = 0;
    for (const r of rows) {
      if (r.disposed_at) { disposed++; continue; }
      active++;
      gross += Number(r.cost ?? 0);
      accDep += Number(r.accumulated_depreciation ?? 0);
    }
    return { gross, accDep, netBlock: gross - accDep, active, disposed };
  }, [rows]);

  const startNew = () => { setEdit(null); setForm(empty); setOpen(true); };
  const startEdit = (r: FA) => {
    setEdit(r);
    setForm({
      name: r.name, category: r.category, purchase_date: r.purchase_date,
      cost: r.cost, salvage_value: r.salvage_value, useful_life_years: r.useful_life_years,
      depreciation_method: r.depreciation_method, wdv_rate_pct: r.wdv_rate_pct,
      paid_via: r.paid_via, supplier_name: r.supplier_name ?? "", notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!form.name?.trim()) { toast.error("Name is required"); return; }
    if (Number(form.cost) <= 0) { toast.error("Cost must be greater than zero"); return; }
    const payload: any = { ...form, user_id: user.id, cost: Number(form.cost), salvage_value: Number(form.salvage_value || 0), useful_life_years: Number(form.useful_life_years || 1), wdv_rate_pct: Number(form.wdv_rate_pct || 0) };
    const { error } = edit
      ? await (supabase as any).from("fixed_assets").update(payload).eq("id", edit.id)
      : await (supabase as any).from("fixed_assets").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(edit ? "Asset updated" : "Asset capitalised — journal posted");
    setOpen(false); load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this asset? Its journal entry will be reversed.")) return;
    const { error } = await (supabase as any).from("fixed_assets").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const dispose = async () => {
    if (!disposeId) return;
    const { error } = await (supabase as any).from("fixed_assets").update({
      disposed_at: disposeVal.disposed_at,
      disposal_value: Number(disposeVal.disposal_value || 0),
    }).eq("id", disposeId);
    if (error) toast.error(error.message);
    else { toast.success("Disposed — gain/loss booked to ledger"); setDisposeId(null); load(); }
  };

  const bookDep = async () => {
    const period = prompt("Book depreciation up to (YYYY-MM-DD)?", todayISO());
    if (!period) return;
    const { data, error } = await (supabase as any).rpc("book_depreciation", { _period_end: period });
    if (error) toast.error(error.message);
    else { toast.success(`Posted depreciation for ${data ?? 0} assets`); load(); }
  };

  return (
    <div>
      <PageHeader
        title={<span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" /> Fixed Assets</span>}
        description="Machinery, vehicles, equipment, buildings — capitalised to the Balance Sheet and depreciated per AS 10."
        actions={
          <>
            <Button size="sm" variant="outline" onClick={bookDep} title="Post a month of depreciation for every active asset">
              <Calculator className="h-4 w-4" /> <span className="hidden sm:inline">Book depreciation</span>
            </Button>
            <Button size="sm" onClick={startNew}><Plus className="h-4 w-4" /> New asset</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Tile label="Gross block (cost)" value={inr(summary.gross)} />
        <Tile label="Accumulated depreciation" value={inr(summary.accDep)} tone="bad" />
        <Tile label="Net block (book value)" value={inr(summary.netBlock)} tone="good" />
        <Tile label="Active assets" value={`${summary.active} live · ${summary.disposed} disposed`} />
      </div>

      <div className="rounded-md border bg-card p-3 mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <div className="text-xs text-muted-foreground flex-1">
          Every asset auto-posts to <span className="font-medium text-foreground">Fixed Assets: &lt;category&gt;</span> on the Balance Sheet. Use "Book depreciation" monthly so the P&amp;L shows the wear-and-tear expense.
        </div>
        <Input placeholder="Search assets…" value={q} onChange={e => setQ(e.target.value)} className="sm:max-w-xs h-8" />
      </div>

      {filtered.length === 0 ? <Empty>No fixed assets yet. Add your first machine, vehicle or piece of equipment.</Empty> : (
        <>
        <div className="hidden md:block rounded-md border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Acquired</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Accum. dep.</TableHead>
                <TableHead className="text-right">Book value</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const book = Number(r.cost ?? 0) - Number(r.accumulated_depreciation ?? 0);
                return (
                  <TableRow key={r.id} className={r.disposed_at ? "opacity-60" : ""}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{r.asset_no}</div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{r.category}</Badge></TableCell>
                    <TableCell>{fmtDate(r.purchase_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(r.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{inr(r.accumulated_depreciation)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{inr(book)}</TableCell>
                    <TableCell className="text-xs">
                      {r.disposed_at ? <Badge variant="outline">Disposed {fmtDate(r.disposed_at)}</Badge>
                        : r.depreciation_method === "straight_line" ? `SL · ${r.useful_life_years}y`
                        : r.depreciation_method === "wdv" ? `WDV · ${r.wdv_rate_pct}%`
                        : "None"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      {!r.disposed_at && <Button variant="ghost" size="sm" onClick={() => { setDisposeId(r.id); setDisposeVal({ disposed_at: todayISO(), disposal_value: 0 }); }}>Dispose</Button>}
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => del(r.id)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="md:hidden space-y-2">
          {filtered.map(r => {
            const book = Number(r.cost ?? 0) - Number(r.accumulated_depreciation ?? 0);
            return (
              <div key={r.id} className={`rounded-md border bg-card p-3 space-y-2 ${r.disposed_at ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{r.asset_no} · {fmtDate(r.purchase_date)}</div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{r.category}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <MiniStat label="Cost" value={inr(r.cost)} />
                  <MiniStat label="Dep." value={inr(r.accumulated_depreciation)} />
                  <MiniStat label="Book" value={inr(book)} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => startEdit(r)}>Edit</Button>
                  {!r.disposed_at && <Button variant="outline" size="sm" className="flex-1" onClick={() => { setDisposeId(r.id); setDisposeVal({ disposed_at: todayISO(), disposal_value: 0 }); }}>Dispose</Button>}
                  <Button variant="outline" size="sm" className="flex-1 text-destructive" onClick={() => del(r.id)}>Delete</Button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{edit ? "Edit asset" : "Capitalise new asset"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Asset name *" className="col-span-2"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. CNC Bridge Saw" /></Field>
            <Field label="Category">
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Purchase date"><Input type="date" value={form.purchase_date} onChange={e => setForm({ ...form, purchase_date: e.target.value })} /></Field>
            <Field label="Cost (₹) *"><Input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></Field>
            <Field label="Salvage value (₹)"><Input type="number" value={form.salvage_value} onChange={e => setForm({ ...form, salvage_value: e.target.value })} /></Field>
            <Field label="Depreciation method">
              <Select value={form.depreciation_method} onValueChange={v => setForm({ ...form, depreciation_method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            {form.depreciation_method === "straight_line" && (
              <Field label="Useful life (years)"><Input type="number" value={form.useful_life_years} onChange={e => setForm({ ...form, useful_life_years: e.target.value })} /></Field>
            )}
            {form.depreciation_method === "wdv" && (
              <Field label="WDV rate (% p.a.)"><Input type="number" value={form.wdv_rate_pct} onChange={e => setForm({ ...form, wdv_rate_pct: e.target.value })} /></Field>
            )}
            <Field label="Paid via">
              <Select value={form.paid_via} onValueChange={v => setForm({ ...form, paid_via: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bank">Bank</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Credit">On credit (Accounts Payable)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Supplier name (optional)" className="col-span-2"><Input value={form.supplier_name} onChange={e => setForm({ ...form, supplier_name: e.target.value })} /></Field>
            <Field label="Notes" className="col-span-2"><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Serial no., warranty, etc." /></Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{edit ? "Save" : "Capitalise"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!disposeId} onOpenChange={o => !o && setDisposeId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Dispose asset</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Disposal date"><Input type="date" value={disposeVal.disposed_at} onChange={e => setDisposeVal({ ...disposeVal, disposed_at: e.target.value })} /></Field>
            <Field label="Sale proceeds (₹)"><Input type="number" value={disposeVal.disposal_value} onChange={e => setDisposeVal({ ...disposeVal, disposal_value: Number(e.target.value) })} /></Field>
            <p className="text-xs text-muted-foreground">Gain/loss will be auto-calculated against book value and posted to the P&amp;L.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposeId(null)}>Cancel</Button>
            <Button onClick={dispose}>Dispose</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold tabular-nums ${tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
function MiniStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-muted/40 px-2 py-1"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><Label className="text-xs">{label}</Label>{children}</div>;
}
