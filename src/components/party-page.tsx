import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { inr, fmtDate } from "@/lib/format";
import { Link, useNavigate } from "@tanstack/react-router";
import { Wallet, ShoppingCart, Truck, FileSpreadsheet, ArrowUpDown, Phone, MapPin } from "lucide-react";

export type PartyRole = "buyer" | "supplier";

type Contact = {
  id: string; name: string; code: string | null; type: string;
  state: string | null; gstin: string | null; phone: string | null; email: string | null;
};
type Summary = { contact_id: string; total_sales: number; total_purchases: number; receivable: number; payable: number; last_txn: string | null };
type Aging = { party_id: string; side: string; b_0_30: number; b_31_60: number; b_61_90: number; b_90p: number; total_balance: number; open_docs: number };

export function PartyPage({ role }: { role: PartyRole }) {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [summary, setSummary] = useState<Record<string, Summary>>({});
  const [aging, setAging] = useState<Record<string, Aging>>({});
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "balance" | "last">("balance");
  const [picked, setPicked] = useState<Contact | null>(null);

  const wantSide = role === "buyer" ? "receivable" : "payable";
  const wantTypes = role === "buyer" ? ["buyer", "both"] : ["supplier", "both"];

  const load = async () => {
    const [{ data: cs }, { data: ps }, { data: ag }] = await Promise.all([
      supabase.from("contacts").select("id,name,code,type,state,gstin,phone,email").in("type", wantTypes).order("name"),
      supabase.from("party_summary_view" as never).select("contact_id,total_sales,total_purchases,receivable,payable,last_txn"),
      supabase.from("party_aging_view" as never).select("party_id,side,b_0_30,b_31_60,b_61_90,b_90p,total_balance,open_docs").eq("side" as never, wantSide),
    ]);
    setContacts((cs ?? []) as Contact[]);
    const sm: Record<string, Summary> = {};
    for (const r of (ps ?? []) as any[]) sm[r.contact_id] = r;
    setSummary(sm);
    const am: Record<string, Aging> = {};
    for (const r of (ag ?? []) as any[]) am[r.party_id] = r;
    setAging(am);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [role]);

  // Realtime refresh
  useEffect(() => {
    const ch = supabase.channel(`party-${role}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line
  }, [role]);

  const rows = useMemo(() => {
    const filtered = contacts.filter(c => {
      if (!q) return true;
      const s = (c.name + " " + (c.code ?? "") + " " + (c.gstin ?? "") + " " + (c.phone ?? "") + " " + (c.state ?? "")).toLowerCase();
      return s.includes(q.toLowerCase());
    });
    return filtered.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "balance") {
        const av = role === "buyer" ? (summary[a.id]?.receivable ?? 0) : (summary[a.id]?.payable ?? 0);
        const bv = role === "buyer" ? (summary[b.id]?.receivable ?? 0) : (summary[b.id]?.payable ?? 0);
        return bv - av;
      }
      return (summary[b.id]?.last_txn ?? "").localeCompare(summary[a.id]?.last_txn ?? "");
    });
  }, [contacts, summary, q, sortBy, role]);

  const totals = useMemo(() => {
    let bal = 0, txn = 0, opens = 0;
    for (const c of rows) {
      bal += role === "buyer" ? (summary[c.id]?.receivable ?? 0) : (summary[c.id]?.payable ?? 0);
      txn += role === "buyer" ? (summary[c.id]?.total_sales ?? 0) : (summary[c.id]?.total_purchases ?? 0);
      opens += aging[c.id]?.open_docs ?? 0;
    }
    return { bal, txn, opens };
  }, [rows, summary, aging, role]);

  const onExport = () => exportToExcel({
    filename: `${role}s-${new Date().toISOString().slice(0, 10)}`,
    sheetName: role === "buyer" ? "Buyers" : "Suppliers",
    columns: [
      { header: "Code", key: "code" },
      { header: "Name", key: "name" },
      { header: "State", key: "state" },
      { header: "GSTIN", key: "gstin" },
      { header: "Phone", key: "phone" },
      { header: "Email", key: "email" },
      { header: role === "buyer" ? "Total Sales" : "Total Purchases", key: "id", get: (r) => role === "buyer" ? (summary[r.id]?.total_sales ?? 0) : (summary[r.id]?.total_purchases ?? 0) },
      { header: role === "buyer" ? "Receivable" : "Payable", key: "id", get: (r) => role === "buyer" ? (summary[r.id]?.receivable ?? 0) : (summary[r.id]?.payable ?? 0) },
      { header: "0-30", key: "id", get: (r) => aging[r.id]?.b_0_30 ?? 0 },
      { header: "31-60", key: "id", get: (r) => aging[r.id]?.b_31_60 ?? 0 },
      { header: "61-90", key: "id", get: (r) => aging[r.id]?.b_61_90 ?? 0 },
      { header: "90+", key: "id", get: (r) => aging[r.id]?.b_90p ?? 0 },
      { header: "Open Docs", key: "id", get: (r) => aging[r.id]?.open_docs ?? 0 },
      { header: "Last Txn", key: "id", get: (r) => summary[r.id]?.last_txn ?? "" },
    ],
    rows,
  });

  const title = role === "buyer" ? "Buyers" : "Suppliers";
  const desc = role === "buyer"
    ? "All buyers with sales, receivables, aging and quick actions"
    : "All suppliers with purchases, payables, aging and quick actions";

  return (
    <div>
      <PageHeader title={title} description={desc} actions={
        <>
          <ExcelBar onExport={onExport} />
          <Button asChild size="sm" variant="outline"><Link to="/app/contacts">Manage</Link></Button>
        </>
      } />

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3">
        <Tile label={role === "buyer" ? "Receivable" : "Payable"} value={inr(totals.bal)} tone={role === "buyer" ? "text-primary" : "text-destructive"} />
        <Tile label={role === "buyer" ? "Total Sales" : "Total Purchases"} value={inr(totals.txn)} />
        <Tile label="Open Docs" value={String(totals.opens)} />
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <Input className="max-w-xs" placeholder="Search name, GSTIN, phone, state…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => setSortBy(sortBy === "balance" ? "name" : sortBy === "name" ? "last" : "balance")}>
          <ArrowUpDown className="h-4 w-4" /> Sort: {sortBy}
        </Button>
      </div>

      {rows.length === 0 ? <Empty>No {title.toLowerCase()} yet.</Empty> : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-2 sticky left-0 bg-muted/80 backdrop-blur z-10">Name</th>
                <th className="text-left p-2">State / GSTIN</th>
                <th className="text-left p-2">Phone</th>
                <th className="text-right p-2">{role === "buyer" ? "Sales" : "Purchases"}</th>
                <th className="text-right p-2">{role === "buyer" ? "Receivable" : "Payable"}</th>
                <th className="text-left p-2">Aging</th>
                <th className="text-left p-2">Last</th>
                <th className="text-right p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const ag = aging[c.id];
                const bal = role === "buyer" ? (summary[c.id]?.receivable ?? 0) : (summary[c.id]?.payable ?? 0);
                const txn = role === "buyer" ? (summary[c.id]?.total_sales ?? 0) : (summary[c.id]?.total_purchases ?? 0);
                const dir = role === "buyer" ? "in" : "out";
                const goPay = () => navigate({ to: "/app/payments", search: { party: c.id, dir } as any });
                const goNew = () => navigate({ to: role === "buyer" ? "/app/sales" : "/app/purchases" });
                return (
                  <tr key={c.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setPicked(c)}>
                    <td className="p-2 sticky left-0 bg-card z-10">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{c.code}</div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.state ?? "—"}</div>
                      <div className="font-mono">{c.gstin ?? "—"}</div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground"><div className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone ?? "—"}</div></td>
                    <td className="p-2 text-right tabular-nums">{inr(txn)}</td>
                    <td className={`p-2 text-right tabular-nums font-semibold ${bal > 0 ? (role === "buyer" ? "text-primary" : "text-destructive") : ""}`}>{inr(bal)}</td>
                    <td className="p-2">
                      {ag && ag.total_balance > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {ag.b_0_30 > 0 && <Badge variant="outline" className="text-[10px]">0-30: {inr(ag.b_0_30)}</Badge>}
                          {ag.b_31_60 > 0 && <Badge variant="secondary" className="text-[10px]">31-60</Badge>}
                          {ag.b_61_90 > 0 && <Badge className="text-[10px] bg-amber-500">61-90</Badge>}
                          {ag.b_90p > 0 && <Badge variant="destructive" className="text-[10px]">90+: {inr(ag.b_90p)}</Badge>}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">{summary[c.id]?.last_txn ? fmtDate(summary[c.id]!.last_txn!) : "—"}</td>
                    <td className="p-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {bal > 0 && <Button size="sm" onClick={goPay}><Wallet className="h-3 w-3" /> {role === "buyer" ? "Receive" : "Pay"}</Button>}
                        <Button size="sm" variant="outline" onClick={goNew}>{role === "buyer" ? <ShoppingCart className="h-3 w-3" /> : <Truck className="h-3 w-3" />}</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!picked} onOpenChange={(o) => !o && setPicked(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {picked && <PartyDrawer contact={picked} role={role} summary={summary[picked.id]} aging={aging[picked.id]} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base sm:text-lg font-semibold tabular-nums mt-1 ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function PartyDrawer({ contact, role, summary, aging }: { contact: Contact; role: PartyRole; summary?: Summary; aging?: Aging }) {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      if (role === "buyer") {
        const [{ data: s }, { data: t }, { data: d }] = await Promise.all([
          supabase.from("outstanding_view" as never).select("*").eq("party_id" as never, contact.id).in("doc_kind" as never, ["sale", "tp"] as never).order("date" as never, { ascending: false }).limit(50),
          supabase.from("third_party").select("id,tp_no,date,buyer_name,supplier_name").eq("buyer_id", contact.id).order("date", { ascending: false }).limit(20),
          supabase.from("deliveries").select("delivery_no,date,status,invoice_no").eq("buyer_id", contact.id).order("date", { ascending: false }).limit(20),
        ]);
        setDocs((s ?? []) as any[]);
        setDeliveries((d ?? []) as any[]);
      } else {
        const { data: s } = await supabase.from("outstanding_view" as never).select("*").eq("party_id" as never, contact.id).eq("doc_kind" as never, "purchase" as never).order("date" as never, { ascending: false }).limit(50);
        setDocs((s ?? []) as any[]);
        setDeliveries([]);
      }
      const { data: py } = await supabase.from("payments").select("*").eq("contact_id", contact.id).order("date", { ascending: false }).limit(30);
      setPayments((py ?? []) as any[]);
    })();
  }, [contact.id, role]);

  const dir = role === "buyer" ? "in" : "out";
  const exportStmt = () => exportToExcel({
    filename: `statement-${contact.code ?? contact.name}-${new Date().toISOString().slice(0, 10)}`,
    sheetName: "Statement",
    columns: [
      { header: "Date", key: "date" },
      { header: "Doc", key: "doc_no" },
      { header: "Kind", key: "doc_kind" },
      { header: "Total", key: "total" },
      { header: "Paid", key: "paid" },
      { header: "Balance", key: "balance" },
      { header: "Status", key: "status" },
    ],
    rows: docs,
  });

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-lg">{contact.name}</SheetTitle>
      </SheetHeader>
      <div className="text-xs text-muted-foreground mt-1">
        <span className="font-mono">{contact.code}</span> · {contact.state ?? "—"} {contact.gstin ? `· ${contact.gstin}` : ""}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <Tile label={role === "buyer" ? "Receivable" : "Payable"} value={inr(role === "buyer" ? (summary?.receivable ?? 0) : (summary?.payable ?? 0))} tone={role === "buyer" ? "text-primary" : "text-destructive"} />
        <Tile label={role === "buyer" ? "Lifetime Sales" : "Lifetime Purchases"} value={inr(role === "buyer" ? (summary?.total_sales ?? 0) : (summary?.total_purchases ?? 0))} />
      </div>
      {aging && aging.total_balance > 0 && (
        <div className="mt-3 rounded-md border p-2 text-xs grid grid-cols-4 gap-2 text-center">
          <div><div className="text-muted-foreground">0-30</div><div className="font-semibold tabular-nums">{inr(aging.b_0_30)}</div></div>
          <div><div className="text-muted-foreground">31-60</div><div className="font-semibold tabular-nums">{inr(aging.b_31_60)}</div></div>
          <div><div className="text-muted-foreground">61-90</div><div className="font-semibold tabular-nums">{inr(aging.b_61_90)}</div></div>
          <div><div className="text-muted-foreground">90+</div><div className="font-semibold tabular-nums text-destructive">{inr(aging.b_90p)}</div></div>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" onClick={() => navigate({ to: "/app/payments", search: { party: contact.id, dir } as any })}><Wallet className="h-3 w-3" /> {role === "buyer" ? "Receive" : "Pay"}</Button>
        <Button size="sm" variant="outline" onClick={() => navigate({ to: role === "buyer" ? "/app/sales" : "/app/purchases" })}>{role === "buyer" ? <ShoppingCart className="h-3 w-3" /> : <Truck className="h-3 w-3" />} New {role === "buyer" ? "Sale" : "Purchase"}</Button>
        {role === "buyer" && <Button size="sm" variant="outline" onClick={() => navigate({ to: "/app/deliveries" })}><Truck className="h-3 w-3" /> Deliveries</Button>}
        <Button size="sm" variant="outline" onClick={exportStmt}><FileSpreadsheet className="h-3 w-3" /> Statement</Button>
      </div>

      <h3 className="text-sm font-semibold mt-4 mb-1">Open Documents</h3>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr><th className="p-2 text-left">Doc</th><th className="p-2 text-left">Date</th><th className="p-2 text-right">Total</th><th className="p-2 text-right">Balance</th><th className="p-2 text-left">Status</th></tr>
          </thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground text-xs">No documents</td></tr>}
            {docs.map((d) => (
              <tr key={d.doc_id} className="border-t cursor-pointer hover:bg-muted/30" onClick={() => navigate({ to: "/app/lookup", search: { q: d.doc_no } as any })}>
                <td className="p-2 font-mono text-xs">{d.doc_no}</td>
                <td className="p-2 text-xs">{fmtDate(d.date)}</td>
                <td className="p-2 text-right tabular-nums">{inr(d.total)}</td>
                <td className="p-2 text-right tabular-nums font-medium">{inr(d.balance)}</td>
                <td className="p-2"><Badge variant={d.status === "paid" ? "default" : d.status === "partial" ? "secondary" : "outline"} className="capitalize text-[10px]">{d.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {payments.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mt-4 mb-1">Recent Payments</h3>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{p.payment_no}</td>
                    <td className="p-2 text-xs">{fmtDate(p.date)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{p.mode}</td>
                    <td className="p-2 text-right tabular-nums font-medium">{p.direction === "in" ? "+" : "-"}{inr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {role === "buyer" && deliveries.length > 0 && (
        <>
          <h3 className="text-sm font-semibold mt-4 mb-1">Deliveries</h3>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.delivery_no} className="border-t">
                    <td className="p-2 font-mono text-xs">{d.delivery_no}</td>
                    <td className="p-2 text-xs">{fmtDate(d.date)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{d.invoice_no}</td>
                    <td className="p-2"><Badge variant="outline" className="capitalize text-[10px]">{d.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}