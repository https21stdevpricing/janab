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
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { inr } from "@/lib/format";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel, importFromExcel, smartPick, num } from "@/lib/excel";

export const Route = createFileRoute("/app/contacts")({ component: ContactsPage });

type Row = { id: string; type: "buyer" | "supplier" | "both"; name: string; gstin: string | null; state: string | null; phone: string | null; email: string | null; address: string | null; opening_balance: number | null; credit_limit: number | null };

const empty: Omit<Row, "id"> = { type: "buyer", name: "", gstin: "", state: "Rajasthan", phone: "", email: "", address: "", opening_balance: 0, credit_limit: 0 };

function ContactsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [form, setForm] = useState<Omit<Row, "id">>(empty);

  const load = async () => {
    const { data } = await supabase.from("contacts").select("*").order("name");
    setRows((data ?? []) as Row[]);
    const { data: led } = await supabase.from("ledger_view").select("party,account,debit,credit");
    const bal: Record<string, number> = {};
    for (const r of led ?? []) {
      const p = r.party as string;
      const acct = r.account as string;
      if (acct === "Accounts Receivable" || acct === "Accounts Payable") {
        bal[p] = (bal[p] ?? 0) + Number(r.debit ?? 0) - Number(r.credit ?? 0);
      }
    }
    setBalances(bal);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = { ...form, user_id: user.id };
    const { error } = edit
      ? await supabase.from("contacts").update(payload).eq("id", edit.id)
      : await supabase.from("contacts").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("Saved"); setOpen(false); load(); }
  };
  const del = async (id: string) => {
    if (!confirm("Delete contact?")) return;
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Deleted"); load(); }
  };

  const onExport = () => {
    exportToExcel({
      filename: `contacts-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Contacts",
      columns: [
        { header: "Code", key: "id", get: (r: any) => r.code ?? "" },
        { header: "Type", key: "type" },
        { header: "Name", key: "name" },
        { header: "State", key: "state" },
        { header: "GSTIN", key: "gstin" },
        { header: "Phone", key: "phone" },
        { header: "Email", key: "email" },
        { header: "Address", key: "address" },
        { header: "Opening Balance", key: "opening_balance" },
        { header: "Credit Limit", key: "credit_limit" },
        { header: "Net Balance", key: "name", get: (r) => balances[r.name] ?? 0 },
      ],
      rows,
    });
  };

  const onImport = async (file: File) => {
    try {
      const data = await importFromExcel(file);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = data
        .map((r) => {
          let type = String(smartPick(r, ["Type", "Category", "Party Type"]) ?? "buyer").toLowerCase();
          if (!["buyer", "supplier", "both"].includes(type)) type = "buyer";
          if (type === "customer" || type === "client") type = "buyer";
          if (type === "vendor") type = "supplier";
          return {
            user_id: user.id,
            type: type as Row["type"],
            name: smartPick(r, ["Name", "Party Name", "Contact Name", "Company"]) || "",
            state: smartPick(r, ["State", "Region"]) || "Rajasthan",
            gstin: smartPick(r, ["GSTIN", "GST No", "GST Number", "GST"]) || null,
            phone: String(smartPick(r, ["Phone", "Mobile", "Contact", "Phone No"]) ?? "") || null,
            email: smartPick(r, ["Email", "Email Id", "E-mail"]) || null,
            address: smartPick(r, ["Address", "Billing Address", "Location"]) || null,
            opening_balance: num(smartPick(r, ["Opening Balance", "Opening", "Balance"])),
            credit_limit: num(smartPick(r, ["Credit Limit", "Limit"])),
          };
        })
        .filter((r) => r.name);
      if (payload.length === 0) { toast.error("No rows with a Name"); return; }
      const { error } = await supabase.from("contacts").insert(payload);
      if (error) toast.error(error.message);
      else { toast.success(`Imported ${payload.length} contacts`); load(); }
    } catch (e: any) { toast.error(e.message ?? "Import failed"); }
  };

  return (
    <div>
      <PageHeader title="Contacts" description="Buyers, suppliers, and both" actions={
        <>
        <ExcelBar onExport={onExport} onImport={onImport} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" onClick={() => { setEdit(null); setForm(empty); setOpen(true); }}><Plus className="h-4 w-4" /> New</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{edit ? "Edit contact" : "New contact"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as Row["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer</SelectItem><SelectItem value="supplier">Supplier</SelectItem><SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select></div>
              <div className="space-y-1.5"><Label className="text-xs">State</Label><Input value={form.state ?? ""} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">GSTIN</Label><Input value={form.gstin ?? ""} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Phone</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="col-span-2 space-y-1.5"><Label className="text-xs">Address</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Opening balance</Label><Input type="number" value={form.opening_balance ?? 0} onChange={(e) => setForm({ ...form, opening_balance: +e.target.value })} /></div>
              <div className="space-y-1.5"><Label className="text-xs">Credit limit</Label><Input type="number" value={form.credit_limit ?? 0} onChange={(e) => setForm({ ...form, credit_limit: +e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        </>
      } />
      {rows.length === 0 ? <Empty>No contacts yet.</Empty> : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {rows.map(r => {
            const bal = balances[r.name] ?? 0;
            const openEdit = () => { setEdit(r); setForm({ type: r.type, name: r.name, gstin: r.gstin, state: r.state, phone: r.phone, email: r.email, address: r.address, opening_balance: r.opening_balance, credit_limit: r.credit_limit }); setOpen(true); };
            return (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={openEdit}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEdit(); } }}
                className="rounded-md border bg-card p-3 cursor-pointer hover:bg-muted/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.state} {r.gstin ? `· ${r.gstin}` : ""}</div>
                  </div>
                  <Badge variant="secondary" className="capitalize">{r.type}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-2 truncate">{r.phone} {r.email ? `· ${r.email}` : ""}</div>
                <div className="flex items-center justify-between mt-3" onClick={(e) => e.stopPropagation()}>
                  <div className="text-xs">
                    <div className="text-muted-foreground">Net balance</div>
                    <div className={`font-semibold tabular-nums ${bal > 0 ? "text-primary" : bal < 0 ? "text-destructive" : ""}`}>{inr(bal)}</div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={openEdit}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}