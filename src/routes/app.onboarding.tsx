import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { inr, todayISO } from "@/lib/format";
import { toast } from "sonner";
import { Sparkles, ArrowRight, ArrowLeft, CheckCircle2, Landmark, Boxes, Users, FileText } from "lucide-react";

export const Route = createFileRoute("/app/onboarding")({
  component: OnboardingPage,
  validateSearch: (s: Record<string, unknown>) => ({
    force: s.force === "1" ? ("1" as const) : undefined,
  }),
});

type Step = 1 | 2 | 3 | 4 | 5;

function OnboardingPage() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  // Step 1 — business info
  const [biz, setBiz] = useState({ company_name: "", gstin: "", state: "Rajasthan", phone: "", email: "", address: "" });

  // Step 2 — opening balances
  const [cashOpen, setCashOpen] = useState(0);
  const [bankOpen, setBankOpen] = useState(0);

  // Counts for context
  const [counts, setCounts] = useState({ products: 0, openingStockValue: 0, recv: 0, pay: 0 });

  useEffect(() => {
    (async () => {
      const { data: st } = await supabase.from("settings").select("*").maybeSingle();
      if (st) setBiz({
        company_name: st.company_name ?? "", gstin: st.gstin ?? "", state: st.state ?? "Rajasthan",
        phone: st.phone ?? "", email: st.email ?? "", address: st.address ?? "",
      });
      const { data: ps } = await supabase.from("products").select("opening_stock,purchase_rate");
      const osv = (ps ?? []).reduce((a: number, p: any) => a + Number(p.opening_stock || 0) * Number(p.purchase_rate || 0), 0);
      const { data: cs } = await supabase.from("contacts").select("type,opening_balance");
      const recv = (cs ?? []).filter((c: any) => c.type === "buyer").reduce((a: number, c: any) => a + Number(c.opening_balance || 0), 0);
      const pay  = (cs ?? []).filter((c: any) => c.type === "supplier").reduce((a: number, c: any) => a + Number(c.opening_balance || 0), 0);
      setCounts({ products: (ps ?? []).length, openingStockValue: osv, recv, pay });
    })();
  }, []);

  const saveBiz = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (!biz.company_name.trim()) { toast.error("Company name is required"); return; }
    const { error } = await supabase.from("settings").upsert({ user_id: user.id, ...biz } as never, { onConflict: "user_id" } as never);
    if (error) { toast.error(error.message); return; }
    setStep(2);
  };

  const finish = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Mark onboarding done; opening balances are posted only if user provided
      const hasAny = cashOpen > 0 || bankOpen > 0 || counts.openingStockValue > 0 || counts.recv > 0 || counts.pay > 0;
      if (hasAny) {
        const date = todayISO();
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
        if (counts.openingStockValue > 0) push("Inventory", counts.openingStockValue, 0);
        if (counts.recv > 0) push("Accounts Receivable", counts.recv, 0);
        if (counts.pay > 0)  push("Accounts Payable", 0, counts.pay);

        const totalDr = lines.reduce((a, l) => a + l.debit, 0);
        const totalCr = lines.reduce((a, l) => a + l.credit, 0);
        const equity = totalDr - totalCr; // positive = credit equity to balance
        if (equity > 0) push("Opening Balance Equity", 0, equity);
        else if (equity < 0) push("Opening Balance Equity", -equity, 0);

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
            <Header n={1} title="Your business" hint="Goes on invoices, quotes and reports." />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Company name *"><Input value={biz.company_name} onChange={e => setBiz({ ...biz, company_name: e.target.value })} placeholder="StoneWorld Marble" /></Field>
              <Field label="GSTIN"><Input value={biz.gstin} onChange={e => setBiz({ ...biz, gstin: e.target.value })} placeholder="08AAAAA0000A1Z5" /></Field>
              <Field label="State"><Input value={biz.state} onChange={e => setBiz({ ...biz, state: e.target.value })} /></Field>
              <Field label="Phone"><Input value={biz.phone} onChange={e => setBiz({ ...biz, phone: e.target.value })} /></Field>
              <Field label="Email"><Input value={biz.email} onChange={e => setBiz({ ...biz, email: e.target.value })} /></Field>
              <Field label="Address"><Input value={biz.address} onChange={e => setBiz({ ...biz, address: e.target.value })} /></Field>
            </div>
            <Foot>
              <Button variant="ghost" onClick={skip}>Skip setup</Button>
              <Button onClick={saveBiz}>Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 2 && (
          <>
            <Header n={2} title="Opening cash & bank" hint="How much you have on hand today. Leave blank for zero." />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Cash on hand (₹)"><Input type="number" value={cashOpen} onChange={e => setCashOpen(+e.target.value)} /></Field>
              <Field label="Bank balance (₹)"><Input type="number" value={bankOpen} onChange={e => setBankOpen(+e.target.value)} /></Field>
            </div>
            <Note>These post as a single "Opening balances" journal voucher dated yesterday. Your trial balance will start balanced.</Note>
            <Foot>
              <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={() => setStep(3)}>Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 3 && (
          <>
            <Header n={3} title="Opening stock" hint="Pre-load your existing inventory. Each product carries an opening qty and a purchase rate." icon={Boxes} />
            <div className="rounded-lg border p-4 bg-muted/20 text-sm space-y-2">
              <div>You currently have <b>{counts.products}</b> products. Opening stock value: <b className="tabular-nums">{inr(counts.openingStockValue)}</b>.</div>
              <div className="text-muted-foreground text-xs">Open the Products page, set <b>Opening stock</b> and <b>Purchase rate</b> on each item. Come back here when done — that value will post into Inventory automatically.</div>
            </div>
            <Button variant="outline" asChild className="w-full"><Link to="/app/products">Open Products →</Link></Button>
            <Foot>
              <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={() => setStep(4)}>Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 4 && (
          <>
            <Header n={4} title="Who owes you / who you owe" hint="Set opening balances on each contact." icon={Users} />
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Receivable" value={inr(counts.recv)} tone="good" />
              <Stat label="Payable" value={inr(counts.pay)} tone="bad" />
            </div>
            <div className="text-xs text-muted-foreground">Open <Link to="/app/buyers" className="underline">Buyers</Link> and <Link to="/app/suppliers" className="underline">Suppliers</Link> and set the <b>Opening balance</b> on each party. They'll be posted into Accounts Receivable / Payable.</div>
            <Foot>
              <Button variant="ghost" onClick={() => setStep(3)}><ArrowLeft className="h-4 w-4" /> Back</Button>
              <Button onClick={() => setStep(5)}>Next <ArrowRight className="h-4 w-4" /></Button>
            </Foot>
          </>
        )}

        {step === 5 && (
          <>
            <Header n={5} title="Confirm & post" hint="One opening voucher will be created. The plug goes to Opening Balance Equity so debits = credits." icon={FileText} />
            <div className="rounded-lg border divide-y text-sm">
              <Line label="Cash on hand" value={inr(cashOpen)} side="Dr" />
              <Line label="Bank balance" value={inr(bankOpen)} side="Dr" />
              <Line label="Inventory (from products)" value={inr(counts.openingStockValue)} side="Dr" />
              <Line label="Accounts Receivable (from buyers)" value={inr(counts.recv)} side="Dr" />
              <Line label="Accounts Payable (from suppliers)" value={inr(counts.pay)} side="Cr" />
              <Line label="Opening Balance Equity" value="Auto-balanced" side="" />
            </div>
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