import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { inr } from "@/lib/format";
import { toast } from "sonner";
import { Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Landmark, Boxes, Users, FileText, Building2, Plus, X, Trash2 } from "lucide-react";

export const Route = createFileRoute("/app/onboarding")({
  component: OnboardingPage,
  validateSearch: (s: Record<string, unknown>) => ({
    force: s.force === "1" ? ("1" as const) : undefined,
  }),
});

type Step = 1 | 2 | 3 | 4 | 5;

type Partner = { name: string; share: number; pan?: string };

function OnboardingPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  // Step 1 — business identity (legal + tax)
  const [biz, setBiz] = useState({
    company_name: "", business_type: "proprietorship", owner_name: "",
    pan: "", gstin: "", state: "Rajasthan", phone: "", email: "", address: "",
  });
  const [partners, setPartners] = useState<Partner[]>([]);

  // Step 2 — bank + opening cash/bank
  const [bank, setBank] = useState({ bank_name: "", bank_account_no: "", bank_ifsc: "" });
  const [cashOpen, setCashOpen] = useState(0);
  const [bankOpen, setBankOpen] = useState(0);

  // Counts for context
  const [counts, setCounts] = useState({ products: 0, openingStockValue: 0, recv: 0, pay: 0 });

  // Step 3 — inline product rows
  type ProdRow = { id?: string; name: string; unit: string; opening_stock: number; purchase_rate: number; _dirty?: boolean };
  const [prods, setProds] = useState<ProdRow[]>([]);

  // Step 4 — inline contact rows
  type ContactRow = { id?: string; name: string; type: "buyer" | "supplier"; opening_balance: number; phone?: string; _dirty?: boolean };
  const [contacts, setContacts] = useState<ContactRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data: st } = await supabase.from("settings").select("*").maybeSingle();
      if (st) setBiz({
        company_name: st.company_name ?? "",
        business_type: (st as any).business_type ?? "proprietorship",
        owner_name: (st as any).owner_name ?? "",
        pan: (st as any).pan ?? "",
        gstin: st.gstin ?? "", state: st.state ?? "Rajasthan",
        phone: st.phone ?? "", email: st.email ?? "", address: st.address ?? "",
      });
      if (st) setBank({
        bank_name: (st as any).bank_name ?? "",
        bank_account_no: (st as any).bank_account_no ?? "",
        bank_ifsc: (st as any).bank_ifsc ?? "",
      });
      if (st && Array.isArray((st as any).partners)) setPartners((st as any).partners as Partner[]);
      await refreshInline();
    })();
  }, []);

  const refreshInline = async () => {
    const { data: ps } = await supabase.from("products").select("id,name,unit,opening_stock,purchase_rate").order("name");
    const { data: cs } = await supabase.from("contacts").select("id,name,type,opening_balance,phone").order("name");
    const prodRows = (ps ?? []).map((p: any) => ({ id: p.id, name: p.name ?? "", unit: p.unit ?? "pc", opening_stock: Number(p.opening_stock || 0), purchase_rate: Number(p.purchase_rate || 0) }));
    setProds(prodRows);
    setContacts((cs ?? []).map((c: any) => ({ id: c.id, name: c.name ?? "", type: c.type, opening_balance: Number(c.opening_balance || 0), phone: c.phone ?? "" })));
    const osv = prodRows.reduce((a, p) => a + p.opening_stock * p.purchase_rate, 0);
    const recv = (cs ?? []).filter((c: any) => c.type === "buyer").reduce((a: number, c: any) => a + Number(c.opening_balance || 0), 0);
    const pay  = (cs ?? []).filter((c: any) => c.type === "supplier").reduce((a: number, c: any) => a + Number(c.opening_balance || 0), 0);
    setCounts({ products: prodRows.length, openingStockValue: osv, recv, pay });
  };

  const liveOpeningStockValue = useMemo(() => prods.reduce((a, p) => a + Number(p.opening_stock || 0) * Number(p.purchase_rate || 0), 0), [prods]);
  const liveRecv = useMemo(() => contacts.filter(c => c.type === "buyer").reduce((a, c) => a + Number(c.opening_balance || 0), 0), [contacts]);
  const livePay  = useMemo(() => contacts.filter(c => c.type === "supplier").reduce((a, c) => a + Number(c.opening_balance || 0), 0), [contacts]);

  const saveProducts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dirty = prods.filter(p => p._dirty || !p.id);
    if (dirty.length === 0) { setStep(4); return; }
    setBusy(true);
    try {
      const inserts = dirty.filter(p => !p.id && p.name.trim()).map(p => ({ user_id: user.id, name: p.name.trim(), unit: p.unit || "pc", opening_stock: Number(p.opening_stock || 0), purchase_rate: Number(p.purchase_rate || 0) }));
      const updates = dirty.filter(p => p.id);
      if (inserts.length) {
        const { error } = await supabase.from("products").insert(inserts as never);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await supabase.from("products").update({ name: u.name, unit: u.unit, opening_stock: Number(u.opening_stock || 0), purchase_rate: Number(u.purchase_rate || 0) } as never).eq("id", u.id!);
        if (error) throw error;
      }
      await refreshInline();
      toast.success("Opening stock saved");
      setStep(4);
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  };

  const saveContacts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const dirty = contacts.filter(c => c._dirty || !c.id);
    if (dirty.length === 0) { setStep(5); return; }
    setBusy(true);
    try {
      const inserts = dirty.filter(c => !c.id && c.name.trim()).map(c => ({ user_id: user.id, name: c.name.trim(), type: c.type, opening_balance: Number(c.opening_balance || 0), phone: c.phone || null }));
      const updates = dirty.filter(c => c.id);
      if (inserts.length) {
        const { error } = await supabase.from("contacts").insert(inserts as never);
        if (error) throw error;
      }
      for (const u of updates) {
        const { error } = await supabase.from("contacts").update({ name: u.name, opening_balance: Number(u.opening_balance || 0), phone: u.phone || null } as never).eq("id", u.id!);
        if (error) throw error;
      }
      await refreshInline();
      toast.success("Opening balances saved");
      setStep(5);
    } catch (e: any) { toast.error(e?.message ?? "Save failed"); }
    finally { setBusy(false); }
  };

  const validatePAN = (p: string) => !p || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p.toUpperCase());
  const validateGSTIN = (g: string) => !g || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/.test(g.toUpperCase());
  const validateIFSC = (i: string) => !i || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(i.toUpperCase());
  const needsPartners = biz.business_type === "partnership" || biz.business_type === "llp";

  const saveBiz = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!biz.company_name.trim()) { toast.error("Company name is required"); return; }
    if (!biz.owner_name.trim() && !needsPartners) { toast.error("Owner / proprietor name is required"); return; }
    if (!validatePAN(biz.pan)) { toast.error("PAN looks invalid (e.g. ABCDE1234F)"); return; }
    if (!validateGSTIN(biz.gstin)) { toast.error("GSTIN looks invalid (15 chars)"); return; }
    if (needsPartners && partners.length < 2) { toast.error("Partnership/LLP needs at least 2 partners"); return; }
    if (needsPartners) {
      const total = partners.reduce((a, p) => a + Number(p.share || 0), 0);
      if (Math.abs(total - 100) > 0.01) { toast.error(`Partner shares must total 100% (currently ${total}%)`); return; }
    }
    const payload: any = { user_id: user.id, ...biz, partners };
    const { error } = await supabase.from("settings").upsert(payload as never, { onConflict: "user_id" } as never);
    if (error) { toast.error(error.message); return; }
    setStep(2);
  };

  const saveBank = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (bank.bank_ifsc && !validateIFSC(bank.bank_ifsc)) { toast.error("IFSC looks invalid (e.g. HDFC0001234)"); return; }
    await supabase.from("settings").update({ ...bank } as never).eq("user_id" as never, user.id);
    setStep(3);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Mark onboarding done; opening balances are posted only if user provided
      const hasAny = cashOpen > 0 || bankOpen > 0 || counts.openingStockValue > 0 || counts.recv > 0 || counts.pay > 0;
      if (hasAny) {
        // Use yesterday so it sits before normal txns
        const d = new Date(); d.setDate(d.getDate() - 1);
        const yday = d.toISOString().slice(0, 10);

        const { data: je, error: jeErr } = await supabase.from("journal_entries").insert({
          user_id: user.id, date: yday,
          source_kind: "opening", source_id: crypto.randomUUID(),
          source_no: "OB-0001",
          narration: "Opening balances",
          is_opening: true,
        } as never).select().single();
        if (jeErr) throw jeErr;

        const lines: any[] = [];
        const push = (account: string, debit: number, credit: number, party?: string) => {
          if (debit === 0 && credit === 0) return;
          lines.push({ entry_id: (je as any).id, user_id: user.id, date: yday, account, debit, credit, party: party ?? null, ref_no: "OB-0001", narration: "Opening balance" });
        };
        if (cashOpen > 0) push("Cash", cashOpen, 0);
        if (bankOpen > 0) push("Bank", bankOpen, 0);
        // Note: opening inventory is auto-balanced on the Balance Sheet via
        // "Opening Capital" — no journal needed (avoids double-counting with
        // the inventory valuation engine that reads products.opening_stock).
        if (counts.recv > 0) push("Accounts Receivable", counts.recv, 0);
        if (counts.pay > 0)  push("Accounts Payable", 0, counts.pay);

        const totalDr = lines.reduce((a, l) => a + l.debit, 0);
        const totalCr = lines.reduce((a, l) => a + l.credit, 0);
        const equity = totalDr - totalCr; // positive = credit owner's capital to balance
        if (equity > 0) push("Owner's Capital", 0, equity);
        else if (equity < 0) push("Owner's Capital", -equity, 0);

        const { error: lErr } = await supabase.from("journal_lines").insert(lines as never);
        if (lErr) throw lErr;
      }
      await supabase.from("settings").update({ onboarding_done: true } as never).eq("user_id" as never, user.id);
      toast.success("All set — welcome aboard!");
      nav({ to: "/app" });
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
    } finally { setBusy(false); }
  };

  const skip = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("settings").update({ onboarding_done: true } as never).eq("user_id" as never, user.id);
    nav({ to: "/app" });
  };

  return (
    <div className="max-w-2xl mx-auto py-2">
      <PageHeader
        title={<span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> First-time setup</span>}
        description="Five quick steps so your books start clean. Nothing posts until the final confirm."
      />

      {/* Progress */}
      <div className="flex items-center gap-1 mb-6">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className={`h-1 flex-1 rounded-full transition-all ${n <= step ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-6 sm:p-8 space-y-5">
        {step === 1 && (
          <>
            <Header n={1} title="Your business" hint="Legal identity for invoices, GST returns and reports." icon={Building2} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Company name *"><Input value={biz.company_name} onChange={e => setBiz({ ...biz, company_name: e.target.value })} placeholder="StoneWorld Marble" /></Field>
              <Field label="Business type *">
                <Select value={biz.business_type} onValueChange={v => setBiz({ ...biz, business_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proprietorship">Sole Proprietorship</SelectItem>
                    <SelectItem value="partnership">Partnership</SelectItem>
                    <SelectItem value="llp">LLP</SelectItem>
                    <SelectItem value="pvtltd">Private Limited</SelectItem>
                    <SelectItem value="public">Public Limited</SelectItem>
                    <SelectItem value="huf">HUF</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {!needsPartners && (
                <Field label="Proprietor name *"><Input value={biz.owner_name} onChange={e => setBiz({ ...biz, owner_name: e.target.value })} placeholder="Full legal name" /></Field>
              )}
              <Field label="PAN"><Input value={biz.pan} onChange={e => setBiz({ ...biz, pan: e.target.value.toUpperCase() })} placeholder="ABCDE1234F" maxLength={10} /></Field>
              <Field label="GSTIN"><Input value={biz.gstin} onChange={e => setBiz({ ...biz, gstin: e.target.value })} placeholder="08AAAAA0000A1Z5" /></Field>
              <Field label="State"><Input value={biz.state} onChange={e => setBiz({ ...biz, state: e.target.value })} /></Field>
              <Field label="Phone"><Input value={biz.phone} onChange={e => setBiz({ ...biz, phone: e.target.value })} /></Field>
              <Field label="Email"><Input value={biz.email} onChange={e => setBiz({ ...biz, email: e.target.value })} /></Field>
              <div className="sm:col-span-2"><Field label="Address"><Input value={biz.address} onChange={e => setBiz({ ...biz, address: e.target.value })} /></Field></div>
            </div>

            {needsPartners && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Partners ({biz.business_type === "llp" ? "LLP" : "Partnership"})</div>
                  <Button size="sm" variant="outline" onClick={() => setPartners([...partners, { name: "", share: 0 }])}><Plus className="h-3.5 w-3.5" /> Add partner</Button>
                </div>
                {partners.length === 0 && <div className="text-xs text-muted-foreground">Add at least 2 partners. Shares must total 100%.</div>}
                {partners.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_80px_110px_auto] gap-2 items-end">
                    <Field label={i === 0 ? "Name" : ""}><Input value={p.name} onChange={e => { const c = [...partners]; c[i] = { ...c[i], name: e.target.value }; setPartners(c); }} /></Field>
                    <Field label={i === 0 ? "Share %" : ""}><Input type="number" value={p.share} onChange={e => { const c = [...partners]; c[i] = { ...c[i], share: +e.target.value }; setPartners(c); }} /></Field>
                    <Field label={i === 0 ? "PAN" : ""}><Input value={p.pan ?? ""} onChange={e => { const c = [...partners]; c[i] = { ...c[i], pan: e.target.value.toUpperCase() }; setPartners(c); }} maxLength={10} /></Field>
                    <Button size="icon" variant="ghost" onClick={() => setPartners(partners.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                {partners.length > 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    Total share: <span className={Math.abs(partners.reduce((a, p) => a + Number(p.share || 0), 0) - 100) < 0.01 ? "text-primary font-medium" : "text-destructive font-medium"}>
                      {partners.reduce((a, p) => a + Number(p.share || 0), 0)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            <Foot>
              <Button variant="ghost" onClick={skip}>Skip setup</Button>
              <Button onClick={saveBiz}>Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 2 && (
          <>
            <Header n={2} title="Bank & cash" hint="Your primary bank account plus opening balances. Used on invoices and bank reconciliation." icon={Landmark} />
            <div className="rounded-lg border p-3 bg-muted/10 space-y-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Primary bank account</div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Bank name"><Input value={bank.bank_name} onChange={e => setBank({ ...bank, bank_name: e.target.value })} placeholder="HDFC Bank" /></Field>
                <Field label="Account number"><Input value={bank.bank_account_no} onChange={e => setBank({ ...bank, bank_account_no: e.target.value })} /></Field>
                <Field label="IFSC"><Input value={bank.bank_ifsc} onChange={e => setBank({ ...bank, bank_ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" maxLength={11} /></Field>
              </div>
            </div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-1">Opening balances</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Cash on hand (₹)"><Input type="number" value={cashOpen} onChange={e => setCashOpen(+e.target.value)} /></Field>
              <Field label="Bank balance (₹)"><Input type="number" value={bankOpen} onChange={e => setBankOpen(+e.target.value)} /></Field>
            </div>
            <Note>These post as a single "Opening balances" journal voucher dated yesterday with Owner's Capital as the matching credit. Your trial balance stays balanced.</Note>
            <Foot>
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={saveBank}>Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 3 && (
          <>
            <Header n={3} title="Opening stock" hint="Add each product with current quantity and purchase rate. Edit inline — no need to leave this page." icon={Boxes} />
            <div className="rounded-lg border bg-muted/10">
              <div className="grid grid-cols-[1fr_70px_90px_110px_32px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                <div>Product</div><div>Unit</div><div className="text-right">Qty</div><div className="text-right">Rate ₹</div><div></div>
              </div>
              <div className="max-h-[40vh] overflow-y-auto divide-y">
                {prods.length === 0 && <div className="px-3 py-6 text-center text-xs text-muted-foreground">No products yet. Add your first below.</div>}
                {prods.map((p, i) => (
                  <div key={p.id ?? `n-${i}`} className="grid grid-cols-[1fr_70px_90px_110px_32px] gap-2 px-3 py-1.5 items-center">
                    <Input className="h-8 text-sm" value={p.name} placeholder="e.g. Marble 24×24" onChange={e => { const c = [...prods]; c[i] = { ...c[i], name: e.target.value, _dirty: true }; setProds(c); }} />
                    <Input className="h-8 text-sm" value={p.unit} onChange={e => { const c = [...prods]; c[i] = { ...c[i], unit: e.target.value, _dirty: true }; setProds(c); }} />
                    <Input className="h-8 text-sm text-right tabular-nums" type="number" value={p.opening_stock} onChange={e => { const c = [...prods]; c[i] = { ...c[i], opening_stock: +e.target.value, _dirty: true }; setProds(c); }} />
                    <Input className="h-8 text-sm text-right tabular-nums" type="number" value={p.purchase_rate} onChange={e => { const c = [...prods]; c[i] = { ...c[i], purchase_rate: +e.target.value, _dirty: true }; setProds(c); }} />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={async () => { if (p.id) { if (!confirm(`Delete "${p.name}"?`)) return; await supabase.from("products").delete().eq("id", p.id); } setProds(prods.filter((_, j) => j !== i)); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
              <div className="border-t flex items-center justify-between px-3 py-2 bg-card">
                <Button size="sm" variant="outline" onClick={() => setProds([...prods, { name: "", unit: "pc", opening_stock: 0, purchase_rate: 0, _dirty: true }])}><Plus className="h-3.5 w-3.5" /> Add product</Button>
                <div className="text-xs">Stock value: <span className="font-semibold tabular-nums">{inr(liveOpeningStockValue)}</span></div>
              </div>
            </div>
            <Note>Saved here directly. Full management later in <Link className="underline" to="/app/products">Products</Link>.</Note>
            <Foot>
              <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={saveProducts} disabled={busy}>Save & Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 4 && (
          <>
            <Header n={4} title="Who owes you / who you owe" hint="Add buyers and suppliers with their opening balance. Edit inline — no detour." icon={Users} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Receivable (Buyers)" value={inr(liveRecv)} tone="good" />
              <Stat label="Payable (Suppliers)" value={inr(livePay)} tone="bad" />
            </div>
            <InlineContacts kind="buyer" rows={contacts} setRows={setContacts} />
            <InlineContacts kind="supplier" rows={contacts} setRows={setContacts} />
            <Note>Saved here directly. Full management later in <Link className="underline" to="/app/buyers">Buyers</Link> / <Link className="underline" to="/app/suppliers">Suppliers</Link>.</Note>
            <Foot>
              <Button variant="ghost" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={saveContacts} disabled={busy}>Save & Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 5 && (
          <>
            <Header n={5} title="Confirm & post" hint="One opening voucher will be created. The plug goes to Opening Balance Equity so debits = credits." icon={FileText} />
            <div className="rounded-lg border divide-y text-sm">
              <Line label="Cash on hand" value={inr(cashOpen)} side="Dr" />
              <Line label="Bank balance" value={inr(bankOpen)} side="Dr" />
              <Line label="Inventory (from products — auto)" value={inr(liveOpeningStockValue)} side="" />
              <Line label="Accounts Receivable (from buyers)" value={inr(liveRecv)} side="Dr" />
              <Line label="Accounts Payable (from suppliers)" value={inr(livePay)} side="Cr" />
              <Line label="Owner's Capital" value="Auto-balanced" side="Cr" />
            </div>
            <Note>Inventory carries from your Products page directly to the Balance Sheet (matched by Opening Capital). Cash, bank and party balances post as one journal voucher.</Note>
            <Foot>
              <Button variant="ghost" onClick={() => setStep(4)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={finish} disabled={busy}><CheckCircle2 className="h-4 w-4" /> Post & finish</Button>
            </Foot>
          </>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground text-center mt-4">
        You can re-run this any time from <Link to="/app/settings" className="underline">Settings → Opening balances</Link>.
      </div>
    </div>
  );
}

function Header({ n, title, hint, icon: Icon }: { n: number; title: string; hint: string; icon?: any }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Step {n} of 5</div>
      <h2 className="text-xl font-semibold tracking-tight mt-1 inline-flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-primary" />} {title}
      </h2>
      <p className="text-sm text-muted-foreground mt-1">{hint}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function Foot({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between pt-2">{children}</div>;
}
function Note({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-muted-foreground rounded-md border bg-muted/30 px-3 py-2">{children}</div>;
}
function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
function Line({ label, value, side }: { label: string; value: string; side: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-6">{side}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}