import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { fmt, fmtDate, inr } from "@/lib/format";
import { lookupDoc, prefixOf, type DocLookupResult } from "@/lib/doc-lookup";
import { Search, Printer, Wallet, Truck, X, ArrowRight, Command, Landmark } from "lucide-react";
import { toast } from "sonner";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { exportStoneWorldDocument } from "@/lib/pdf-theme";

export const Route = createFileRoute("/app/lookup")({
  component: LookupPage,
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s.q === "string" ? s.q : undefined }),
});

type SearchHit =
  | { kind: "contact"; row: any }
  | { kind: "product"; row: any }
  | { kind: "doc"; row: any; docKind: string; no: string; date: string; party: string };

type ContactEnrich = { receivable: number; payable: number; open_docs: number };
type ProductEnrich = { on_hand: number; reorder_level: number };

function LookupPage() {
  const search = (Route.useSearch?.() ?? {}) as { q?: string };
  const [q, setQ] = useState(search.q ?? "");
  const [doc, setDoc] = useState<DocLookupResult | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [contactInfo, setContactInfo] = useState<Record<string, ContactEnrich>>({});
  const [productInfo, setProductInfo] = useState<Record<string, ProductEnrich>>({});
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<SearchHit[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const suggestTimer = useRef<number | null>(null);

  const run = async () => {
    const term = q.trim();
    if (!term) return;
    setBusy(true); setDoc(null); setHits([]);
    // If looks like a doc id, try exact lookup first
    if (prefixOf(term)) {
      const r = await lookupDoc(term);
      if (r) { setDoc(r); setBusy(false); return; }
    }
    // Otherwise broad search
    const like = `%${term}%`;
    const out: SearchHit[] = [];
    const [{ data: cs }, { data: ps }, { data: ss }, { data: pos }, { data: tps }, { data: qs }, { data: pys }, { data: bts }] = await Promise.all([
      supabase.from("contacts").select("*").or(`name.ilike.${like},phone.ilike.${like},gstin.ilike.${like},code.ilike.${like}`).limit(20),
      supabase.from("products").select("*").or(`name.ilike.${like},code.ilike.${like},hsn.ilike.${like}`).limit(20),
      supabase.from("sales").select("id,invoice_no,date,buyer_name").or(`invoice_no.ilike.${like},buyer_name.ilike.${like}`).limit(10),
      supabase.from("purchases").select("id,po_no,date,supplier_name").or(`po_no.ilike.${like},supplier_name.ilike.${like}`).limit(10),
      supabase.from("third_party").select("id,tp_no,date,buyer_name,supplier_name").or(`tp_no.ilike.${like},buyer_name.ilike.${like},supplier_name.ilike.${like}`).limit(10),
      supabase.from("quotations").select("id,quote_no,date,buyer_name").or(`quote_no.ilike.${like},buyer_name.ilike.${like}`).limit(10),
      supabase.from("payments").select("id,payment_no,date,contact_name,direction").or(`payment_no.ilike.${like},contact_name.ilike.${like}`).limit(10),
      supabase.from("bank_transfers" as never).select("id,transfer_no,date,kind,amount,bank_name,cheque_no,txn_id,notes").or(`transfer_no.ilike.${like},bank_name.ilike.${like},cheque_no.ilike.${like},txn_id.ilike.${like},notes.ilike.${like}`).limit(10) as any,
    ]);
    for (const r of cs ?? []) out.push({ kind: "contact", row: r });
    for (const r of ps ?? []) out.push({ kind: "product", row: r });
    for (const r of ss ?? []) out.push({ kind: "doc", docKind: "Sale", no: r.invoice_no, date: r.date, party: r.buyer_name ?? "—", row: r });
    for (const r of pos ?? []) out.push({ kind: "doc", docKind: "Purchase", no: r.po_no, date: r.date, party: r.supplier_name ?? "—", row: r });
    for (const r of tps ?? []) out.push({ kind: "doc", docKind: "TP", no: r.tp_no, date: r.date, party: `${r.supplier_name ?? "—"} → ${r.buyer_name ?? "—"}`, row: r });
    for (const r of qs ?? []) out.push({ kind: "doc", docKind: "Quote", no: r.quote_no, date: r.date, party: r.buyer_name ?? "—", row: r });
    for (const r of pys ?? []) out.push({ kind: "doc", docKind: r.direction === "in" ? "Receipt" : "Payment", no: r.payment_no, date: r.date, party: r.contact_name ?? "—", row: r });
    for (const r of bts ?? []) out.push({ kind: "doc", docKind: r.kind === "cash_withdrawal" ? "Withdrawal" : (r.kind === "cheque_deposit" ? "Cheque" : "Deposit"), no: r.transfer_no, date: r.date, party: r.bank_name ?? "—", row: r });
    setHits(out);
    if (out.length === 0) toast.error("Nothing found");
    setBusy(false);
    // Enrich asynchronously
    const cids = (cs ?? []).map((c: any) => c.id);
    const pids = (ps ?? []).map((p: any) => p.id);
    if (cids.length) {
      const { data: ag } = await supabase
        .from("party_aging_view" as never)
        .select("party_id,side,total_balance,open_docs")
        .in("party_id" as never, cids) as any;
      const acc: Record<string, ContactEnrich> = {};
      for (const r of (ag ?? []) as any[]) {
        acc[r.party_id] ??= { receivable: 0, payable: 0, open_docs: 0 };
        if (r.side === "receivable") acc[r.party_id].receivable += Number(r.total_balance ?? 0);
        else acc[r.party_id].payable += Number(r.total_balance ?? 0);
        acc[r.party_id].open_docs += Number(r.open_docs ?? 0);
      }
      setContactInfo(acc);
    } else setContactInfo({});
    if (pids.length) {
      const { data: st } = await supabase
        .from("stock_view")
        .select("product_id,on_hand,reorder_level")
        .in("product_id", pids);
      const acc: Record<string, ProductEnrich> = {};
      for (const r of (st ?? []) as any[]) acc[r.product_id] = { on_hand: Number(r.on_hand ?? 0), reorder_level: Number(r.reorder_level ?? 0) };
      setProductInfo(acc);
    } else setProductInfo({});
  };

  useEffect(() => { if (search.q) { setQ(search.q); setTimeout(() => run(), 0); } /* eslint-disable-next-line */ }, [search.q]);

  const pickHit = async (h: SearchHit) => {
    if (h.kind === "doc") { setQ(h.no); const r = await lookupDoc(h.no); if (r) setDoc(r); }
  };

  // Autocomplete (debounced)
  useEffect(() => {
    if (suggestTimer.current) window.clearTimeout(suggestTimer.current);
    const term = q.trim();
    if (term.length < 2) { setSuggest([]); return; }
    suggestTimer.current = window.setTimeout(async () => {
      const like = `%${term}%`;
      const out: SearchHit[] = [];
      const [{ data: cs }, { data: ps }, { data: ss }, { data: pos }, { data: tps }, { data: pys }, { data: bts }] = await Promise.all([
        supabase.from("contacts").select("id,name,code,type,state,phone,gstin").or(`name.ilike.${like},phone.ilike.${like},gstin.ilike.${like},code.ilike.${like}`).limit(5),
        supabase.from("products").select("id,name,code,unit,hsn,sale_rate").or(`name.ilike.${like},code.ilike.${like},hsn.ilike.${like}`).limit(5),
        supabase.from("sales").select("id,invoice_no,date,buyer_name").or(`invoice_no.ilike.${like},buyer_name.ilike.${like}`).limit(4),
        supabase.from("purchases").select("id,po_no,date,supplier_name").or(`po_no.ilike.${like},supplier_name.ilike.${like}`).limit(4),
        supabase.from("third_party").select("id,tp_no,date,buyer_name,supplier_name").or(`tp_no.ilike.${like},buyer_name.ilike.${like},supplier_name.ilike.${like}`).limit(3),
        supabase.from("payments").select("id,payment_no,date,contact_name,direction").or(`payment_no.ilike.${like},contact_name.ilike.${like}`).limit(3),
        supabase.from("bank_transfers" as never).select("id,transfer_no,date,kind,amount,bank_name,cheque_no").or(`transfer_no.ilike.${like},bank_name.ilike.${like},cheque_no.ilike.${like}`).limit(3) as any,
      ]);
      for (const r of cs ?? []) out.push({ kind: "contact", row: r });
      for (const r of ps ?? []) out.push({ kind: "product", row: r });
      for (const r of ss ?? []) out.push({ kind: "doc", docKind: "Sale", no: r.invoice_no, date: r.date, party: r.buyer_name ?? "—", row: r });
      for (const r of pos ?? []) out.push({ kind: "doc", docKind: "Purchase", no: r.po_no, date: r.date, party: r.supplier_name ?? "—", row: r });
      for (const r of tps ?? []) out.push({ kind: "doc", docKind: "TP", no: r.tp_no, date: r.date, party: `${r.supplier_name ?? "—"} → ${r.buyer_name ?? "—"}`, row: r });
      for (const r of pys ?? []) out.push({ kind: "doc", docKind: r.direction === "in" ? "Receipt" : "Payment", no: r.payment_no, date: r.date, party: r.contact_name ?? "—", row: r });
      for (const r of bts ?? []) out.push({ kind: "doc", docKind: r.kind === "cash_withdrawal" ? "Withdrawal" : (r.kind === "cheque_deposit" ? "Cheque" : "Deposit"), no: r.transfer_no, date: r.date, party: r.bank_name ?? "—", row: r });
      setSuggest(out.slice(0, 12));
    }, 220);
    return () => { if (suggestTimer.current) window.clearTimeout(suggestTimer.current); };
  }, [q]);

  const pickSuggestion = async (h: SearchHit) => {
    setShowSuggest(false);
    if (h.kind === "doc") { setQ(h.no); const r = await lookupDoc(h.no); if (r) setDoc(r); return; }
    setQ(h.kind === "contact" ? h.row.name : h.row.name);
    setHits([h]);
  };

  return (
    <LookupView
      q={q}
      setQ={setQ}
      busy={busy}
      run={run}
      doc={doc}
      setDoc={setDoc}
      hits={hits}
      contactInfo={contactInfo}
      productInfo={productInfo}
      suggest={suggest}
      showSuggest={showSuggest}
      setShowSuggest={setShowSuggest}
      pickHit={pickHit}
      pickSuggestion={pickSuggestion}
    />
  );
}

type LookupViewProps = {
  q: string;
  setQ: (v: string) => void;
  busy: boolean;
  run: () => void;
  doc: DocLookupResult | null;
  setDoc: (d: DocLookupResult | null) => void;
  hits: SearchHit[];
  contactInfo: Record<string, ContactEnrich>;
  productInfo: Record<string, ProductEnrich>;
  suggest: SearchHit[];
  showSuggest: boolean;
  setShowSuggest: (v: boolean) => void;
  pickHit: (h: SearchHit) => void;
  pickSuggestion: (h: SearchHit) => void;
};

function LookupView(p: LookupViewProps) {
  const groups = useMemo(() => {
    const docs = p.hits.filter((h) => h.kind === "doc");
    const contacts = p.hits.filter((h) => h.kind === "contact");
    const products = p.hits.filter((h) => h.kind === "product");
    return { docs, contacts, products };
  }, [p.hits]);

  const hasResults = p.doc || p.hits.length > 0;

  return (
    <div className="-mx-3 sm:-mx-4 lg:-mx-6 -mt-3 sm:-mt-4 lg:-mt-6">
      {/* Hero search */}
      <section className={`relative px-4 sm:px-8 pt-10 sm:pt-16 pb-6 sm:pb-10 transition-all ${hasResults ? "" : "min-h-[55vh] flex flex-col justify-center"}`}>
        <div className="mx-auto w-full max-w-3xl">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight">Find anything.</h1>
            <p className="mt-2 text-sm sm:text-base text-muted-foreground">
              Invoices, POs, TPs, quotes, payments, parties, products — one search.
            </p>
          </div>
          <div className="relative">
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-card shadow-sm focus-within:border-foreground/30 focus-within:shadow-md transition-all px-3 sm:px-4 py-2 sm:py-3">
              <Search className="h-5 w-5 text-muted-foreground shrink-0" />
              <Input
                autoFocus
                className="border-0 bg-transparent shadow-none focus-visible:ring-0 text-base sm:text-lg h-auto px-1 placeholder:text-muted-foreground/70"
                placeholder="ID, name, phone, GSTIN, HSN…"
                value={p.q}
                onChange={(e) => { p.setQ(e.target.value); p.setShowSuggest(true); }}
                onFocus={() => p.setShowSuggest(true)}
                onBlur={() => setTimeout(() => p.setShowSuggest(false), 150)}
                onKeyDown={(e) => { if (e.key === "Enter") { p.setShowSuggest(false); p.run(); } if (e.key === "Escape") p.setShowSuggest(false); }}
              />
              {p.q && (
                <button onClick={() => p.setQ("")} className="rounded-full p-1 text-muted-foreground hover:bg-muted" aria-label="Clear">
                  <X className="h-4 w-4" />
                </button>
              )}
              <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground border-l pl-2 ml-1">
                <Command className="h-3 w-3" /> <span>↵</span>
              </div>
              <Button size="sm" onClick={() => { p.setShowSuggest(false); p.run(); }} disabled={p.busy} className="rounded-full">
                Find <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            {p.showSuggest && p.suggest.length > 0 && (
              <div className="absolute z-30 left-0 right-0 top-full mt-2 rounded-xl border border-border/70 bg-popover shadow-lg overflow-hidden max-h-96 overflow-y-auto">
                {p.suggest.map((h, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-4 py-2.5 hover:bg-muted/60 flex items-center gap-3 border-b border-border/40 last:border-b-0"
                    onMouseDown={(e) => { e.preventDefault(); p.pickSuggestion(h); }}
                  >
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground w-16 shrink-0">
                      {h.kind === "contact" ? h.row.type : h.kind === "product" ? "product" : h.docKind}
                    </span>
                    <span className="font-medium truncate flex-1">
                      {h.kind === "doc" ? <span className="font-mono">{h.no}</span> : h.row.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate max-w-[40%]">
                      {h.kind === "doc" ? h.party : h.kind === "contact" ? h.row.code : h.row.code}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Quick hints when idle */}
          {!hasResults && !p.busy && (
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {["INV-", "PO-", "TP-", "QUO-", "RI-", "PY-"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => { p.setQ(tag); setTimeout(() => p.run(), 0); }}
                  className="rounded-full border border-border/60 bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors font-mono"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Doc preview dialog */}
      <Dialog open={!!p.doc} onOpenChange={(o) => !o && p.setDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <DialogTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Document preview</DialogTitle>
            <button className="rounded-md p-1 hover:bg-muted" onClick={() => p.setDoc(null)} aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          {p.doc && <DocDetail doc={p.doc} />}
        </DialogContent>
      </Dialog>

      {/* Results */}
      {p.hits.length > 0 && (
        <section className="px-4 sm:px-8 pb-16">
          <div className="mx-auto w-full max-w-3xl space-y-10">
            {groups.docs.length > 0 && (
              <ResultGroup title="Documents" count={groups.docs.length}>
                {groups.docs.map((h, i) => h.kind === "doc" && (
                  <button key={i} onClick={() => p.pickHit(h)} className="group w-full flex items-center gap-4 py-3.5 text-left">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-20 shrink-0">{h.docKind}</span>
                    <span className="font-mono text-sm font-medium w-32 truncate">{h.no}</span>
                    <span className="flex-1 text-sm text-muted-foreground truncate">{h.party ?? "—"}</span>
                    <span className="text-xs text-muted-foreground tabular-nums hidden sm:block">{fmtDate(h.date)}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </button>
                ))}
              </ResultGroup>
            )}

            {groups.contacts.length > 0 && (
              <ResultGroup title="Parties" count={groups.contacts.length}>
                {groups.contacts.map((h, i) => h.kind === "contact" && (
                  <div key={i} className="flex items-center gap-4 py-3.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-20 shrink-0">{h.row.type}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{h.row.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        <span className="font-mono">{h.row.code}</span>
                        {h.row.state ? ` · ${h.row.state}` : ""}
                        {h.row.phone ? ` · ${h.row.phone}` : ""}
                        {h.row.gstin ? ` · ${h.row.gstin}` : ""}
                      </div>
                      {p.contactInfo[h.row.id] && (p.contactInfo[h.row.id].receivable > 0 || p.contactInfo[h.row.id].payable > 0) && (
                        <div className="text-xs mt-1 flex flex-wrap gap-3">
                          {p.contactInfo[h.row.id].receivable > 0 && <span className="text-primary tabular-nums">Recv {inr(p.contactInfo[h.row.id].receivable)}</span>}
                          {p.contactInfo[h.row.id].payable > 0 && <span className="text-destructive tabular-nums">Pay {inr(p.contactInfo[h.row.id].payable)}</span>}
                          {p.contactInfo[h.row.id].open_docs > 0 && <span className="text-muted-foreground">{p.contactInfo[h.row.id].open_docs} open</span>}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" asChild className="rounded-full">
                      <Link to={h.row.type === "supplier" ? "/app/suppliers" : "/app/buyers"}>
                        Open <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </ResultGroup>
            )}

            {groups.products.length > 0 && (
              <ResultGroup title="Products" count={groups.products.length}>
                {groups.products.map((h, i) => h.kind === "product" && (
                  <div key={i} className="flex items-center gap-4 py-3.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground w-20 shrink-0">product</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{h.row.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        <span className="font-mono">{h.row.code}</span> · {h.row.unit} · HSN {h.row.hsn ?? "—"} · ₹{fmt(h.row.sale_rate)}
                      </div>
                    </div>
                    {p.productInfo[h.row.id] && (
                      <div className="text-xs text-right tabular-nums">
                        <div className={p.productInfo[h.row.id].on_hand <= p.productInfo[h.row.id].reorder_level ? "text-destructive font-medium" : "text-foreground"}>
                          {fmt(p.productInfo[h.row.id].on_hand)} {h.row.unit}
                        </div>
                        {p.productInfo[h.row.id].on_hand <= p.productInfo[h.row.id].reorder_level && (
                          <div className="text-destructive">Low</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </ResultGroup>
            )}
          </div>
        </section>
      )}

      {!p.doc && p.hits.length === 0 && p.q && !p.busy && (
        <section className="px-4 sm:px-8 pb-16">
          <div className="mx-auto w-full max-w-3xl">
            <Empty>No matches. Try a different ID, name, phone, GSTIN or HSN.</Empty>
          </div>
        </section>
      )}
    </div>
  );
}

function ResultGroup({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1 border-b border-border/60 pb-2">
        <h2 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      </div>
      <div className="divide-y divide-border/40">{children}</div>
    </div>
  );
}

export function DocDetail({ doc }: { doc: DocLookupResult }) {
  const h = doc.header;
  const no = h.invoice_no ?? h.po_no ?? h.tp_no ?? h.quote_no ?? h.payment_no;
  const printable = doc.kind === "sale" ? "invoice" : doc.kind === "quote" ? "quote" : null;
  const navigate = useNavigate();
  const payable = doc.kind === "sale" || doc.kind === "purchase" || doc.kind === "tp";
  const payDir = doc.kind === "purchase" ? "out" : "in";
  const goPay = () => navigate({ to: "/app/payments", search: { ref: no, dir: payDir } as any });
  const goPaySupplier = () => navigate({ to: "/app/payments", search: { ref: no, dir: "out" } as any });
  const goDelivery = () => navigate({ to: "/app/deliveries" });
  const [journal, setJournal] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [partyDocs, setPartyDocs] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { data: jl } = await supabase.from("journal_lines")
        .select("date,account,party,debit,credit,narration,ref_no")
        .eq("ref_no", no).order("date");
      setJournal(jl ?? []);
      const { data: st } = await supabase.from("settings").select("company_name,address,phone,email,gstin,state").maybeSingle();
      setCompany(st);
      const { data: al } = await supabase.from("payment_allocations" as never)
        .select("amount,doc_no,payment_id,doc_kind").eq("doc_id" as never, h.id) as any;
      if (al && al.length) {
        const ids = al.map((a: any) => a.payment_id);
        const { data: pys } = await supabase.from("payments").select("*").in("id", ids);
        setPayments((pys ?? []).map((p: any) => ({
          ...p,
          allocated: al.find((a: any) => a.payment_id === p.id)?.amount,
          alloc_side: al.find((a: any) => a.payment_id === p.id)?.doc_kind,
        })));
      } else setPayments([]);
      if (doc.party) {
        const partyId = doc.party.id;
        const [{ data: s }, { data: p }, { data: t }] = await Promise.all([
          supabase.from("sales").select("id,invoice_no,date,buyer_name").eq("buyer_id", partyId).order("date", { ascending: false }).limit(10),
          supabase.from("purchases").select("id,po_no,date,supplier_name").eq("supplier_id", partyId).order("date", { ascending: false }).limit(10),
          supabase.from("third_party").select("id,tp_no,date,buyer_name,supplier_name").or(`buyer_id.eq.${partyId},supplier_id.eq.${partyId}`).order("date", { ascending: false }).limit(10),
        ]);
        const merged = [
          ...(s ?? []).map((r: any) => ({ kind: "Sale", no: r.invoice_no, date: r.date, party: r.buyer_name })),
          ...(p ?? []).map((r: any) => ({ kind: "Purchase", no: r.po_no, date: r.date, party: r.supplier_name })),
          ...(t ?? []).map((r: any) => ({ kind: "TP", no: r.tp_no, date: r.date, party: `${r.supplier_name} → ${r.buyer_name}` })),
        ].sort((a, b) => (a.date < b.date ? 1 : -1));
        setPartyDocs(merged);
      }
    })();
  }, [no, h.id]);

  const exportDoc = () => exportToExcel({
    filename: `${no}`,
    sheetName: doc.kind,
    columns: [
      { header: "Product", key: "product_name" },
      { header: "Unit", key: "unit" },
      { header: "Qty", key: "qty" },
      { header: "Rate", key: "rate", get: (r: any) => Number(r.sale_rate ?? r.rate ?? 0) },
      { header: "Purchase Rate", key: "purchase_rate" },
      { header: "GST %", key: "gst_pct" },
      { header: "Line Total", key: "qty", get: (r: any) => {
        const rate = Number(r.sale_rate ?? r.rate ?? 0);
        return +(Number(r.qty) * rate * (1 + Number(r.gst_pct ?? 0) / 100)).toFixed(2);
      } },
    ],
    rows: doc.items,
  });

  return (
    <div className="rounded-md border bg-card">
      <div className="p-4 border-b flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            {doc.kind === "deposit" && <Landmark className="h-3 w-3" />}
            {doc.kind === "deposit" ? (h.kind === "cash_withdrawal" ? "Cash withdrawal" : h.kind === "cheque_deposit" ? "Cheque deposit" : "Cash deposit") : doc.kind}
          </div>
          <div className="text-lg font-semibold font-mono">{no}</div>
          <div className="text-sm text-muted-foreground mt-1">
            {fmtDate(h.date)}
            {doc.kind === "deposit"
              ? <>{h.bank_name ? ` · ${h.bank_name}` : ""}{h.cheque_no ? ` · Cheque #${h.cheque_no}` : ""}{h.txn_id ? ` · Txn ${h.txn_id}` : ""}</>
              : <> · {h.buyer_name ?? h.supplier_name ?? h.contact_name ?? "—"}</>
            }
          </div>
          {doc.party && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {doc.party.code} · {doc.party.state} {doc.party.gstin ? `· ${doc.party.gstin}` : ""} {doc.party.phone ? `· ${doc.party.phone}` : ""}
            </div>
          )}
          {doc.kind === "deposit" && h.notes && (
            <div className="text-xs text-muted-foreground mt-1 italic">{h.notes}</div>
          )}
        </div>
        <div className="text-right">
          <div className="text-base font-semibold">{inr(doc.totals.total)}</div>
          {doc.kind !== "tp" && doc.outstanding && doc.outstanding.balance > 0 && (
            <div className="text-xs text-destructive">Balance {inr(doc.outstanding.balance)}</div>
          )}
          {doc.kind !== "tp" && doc.outstanding && (
            <Badge variant={doc.outstanding.status === "paid" ? "default" : doc.outstanding.status === "partial" ? "secondary" : "outline"} className="mt-1 capitalize">{doc.outstanding.status}</Badge>
          )}
          <div className="mt-2 flex flex-col items-end gap-1">
            {printable && (
              <Button asChild size="sm" variant="outline"><Link to={"/app/print/" + printable + "/$id" as any} params={{ id: h.id } as any}><Printer className="h-3 w-3" /> Print</Link></Button>
            )}
            {doc.kind !== "payment" && doc.kind !== "deposit" && (
              <Button size="sm" variant="outline" onClick={() => exportStoneWorldDocument(doc, company)}><Printer className="h-3 w-3" /> PDF</Button>
            )}
            {payable && doc.kind !== "tp" && doc.outstanding && doc.outstanding.balance > 0 && (
              <Button size="sm" onClick={goPay}><Wallet className="h-3 w-3" /> {payDir === "in" ? "Receive" : "Pay"} {inr(doc.outstanding.balance)}</Button>
            )}
            {doc.kind === "tp" && doc.outstanding && doc.outstanding.balance > 0 && (
              <Button size="sm" onClick={goPay}><Wallet className="h-3 w-3" /> Receive from buyer {inr(doc.outstanding.balance)}</Button>
            )}
            {doc.kind === "tp" && doc.supplierOutstanding && doc.supplierOutstanding.balance > 0 && (
              <Button size="sm" variant="secondary" onClick={goPaySupplier}><Wallet className="h-3 w-3" /> Pay supplier {inr(doc.supplierOutstanding.balance)}</Button>
            )}
            {doc.kind === "sale" && (
              <Button size="sm" variant="outline" onClick={goDelivery}><Truck className="h-3 w-3" /> Delivery</Button>
            )}
            <ExcelBar onExport={exportDoc} exportLabel="Excel" />
          </div>
        </div>
      </div>
      {doc.kind === "tp" && (doc.party || doc.supplier) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 border-b bg-muted/10">
          <div className="rounded-md border bg-card p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Buyer (receivable)</div>
            <div className="text-sm font-medium">{doc.party?.name ?? h.buyer_name ?? "—"}</div>
            {doc.party && <div className="text-xs text-muted-foreground">{doc.party.code} · {doc.party.state ?? ""} {doc.party.phone ? `· ${doc.party.phone}` : ""}</div>}
            {doc.outstanding && (
              <div className="mt-2 flex gap-3 text-xs">
                <span>Total <span className="font-semibold tabular-nums">{inr(doc.outstanding.total)}</span></span>
                <span className="text-primary">Recv <span className="font-semibold tabular-nums">{inr(doc.outstanding.paid)}</span></span>
                <span className={doc.outstanding.balance > 0 ? "text-destructive" : "text-primary"}>Bal <span className="font-semibold tabular-nums">{inr(doc.outstanding.balance)}</span></span>
                <Badge variant="outline" className="capitalize text-[10px] h-5">{doc.outstanding.status}</Badge>
              </div>
            )}
          </div>
          <div className="rounded-md border bg-card p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Supplier (payable)</div>
            <div className="text-sm font-medium">{doc.supplier?.name ?? h.supplier_name ?? "—"}</div>
            {doc.supplier && <div className="text-xs text-muted-foreground">{doc.supplier.code} · {doc.supplier.state ?? ""} {doc.supplier.phone ? `· ${doc.supplier.phone}` : ""}</div>}
            {doc.supplierOutstanding && (
              <div className="mt-2 flex gap-3 text-xs">
                <span>Total <span className="font-semibold tabular-nums">{inr(doc.supplierOutstanding.total)}</span></span>
                <span className="text-primary">Paid <span className="font-semibold tabular-nums">{inr(doc.supplierOutstanding.paid)}</span></span>
                <span className={doc.supplierOutstanding.balance > 0 ? "text-destructive" : "text-primary"}>Bal <span className="font-semibold tabular-nums">{inr(doc.supplierOutstanding.balance)}</span></span>
                <Badge variant="outline" className="capitalize text-[10px] h-5">{doc.supplierOutstanding.status}</Badge>
              </div>
            )}
          </div>
        </div>
      )}
      {doc.totals.margin != null && (
        <div className="px-4 py-2 border-b text-xs flex gap-4">
          <span>Cost: <span className="font-medium tabular-nums">{inr(doc.totals.cost!)}</span></span>
          <span>Sale: <span className="font-medium tabular-nums">{inr(doc.totals.subtotal)}</span></span>
          <span className="text-emerald-600 dark:text-emerald-400">Margin: <span className="font-semibold tabular-nums">{inr(doc.totals.margin)}</span> ({doc.totals.subtotal ? ((doc.totals.margin / doc.totals.subtotal) * 100).toFixed(1) : "0"}%)</span>
        </div>
      )}
      {doc.kind !== "tp" && doc.outstanding && (
        <div className="grid grid-cols-3 gap-2 p-3 border-b bg-muted/20">
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Total</div>
            <div className="text-sm font-semibold tabular-nums">{inr(doc.outstanding.total)}</div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Paid</div>
            <div className="text-sm font-semibold tabular-nums text-primary">{inr(doc.outstanding.paid)}</div>
          </div>
          <div className="rounded-md border bg-card p-2">
            <div className="text-[10px] uppercase text-muted-foreground">Balance</div>
            <div className={`text-sm font-semibold tabular-nums ${doc.outstanding.balance > 0 ? "text-destructive" : "text-primary"}`}>{inr(doc.outstanding.balance)}</div>
          </div>
        </div>
      )}
      {doc.items.length > 0 && doc.kind === "tp" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-2">Product</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Buy rate</th>
                <th className="text-right p-2">Sell rate</th>
                <th className="text-right p-2">GST%</th>
                <th className="text-right p-2">Cost</th>
                <th className="text-right p-2">Sale</th>
                <th className="text-right p-2">Margin</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it, i) => {
                const qty = Number(it.qty || 0);
                const buy = Number(it.purchase_rate || 0);
                const sell = Number(it.sale_rate || 0);
                const cost = qty * buy;
                const sale = qty * sell;
                const margin = sale - cost;
                return (
                  <tr key={i} className="border-t">
                    <td className="p-2">{it.product_name}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(qty)} {it.unit}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(buy)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(sell)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(it.gst_pct)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(cost)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(sale)}</td>
                    <td className={`p-2 text-right tabular-nums font-medium ${margin >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{fmt(margin)}</td>
                  </tr>
                );
              })}
              <tr className="border-t bg-muted/30 font-semibold">
                <td className="p-2" colSpan={5}>Totals</td>
                <td className="p-2 text-right tabular-nums">{fmt(doc.totals.cost ?? 0)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(doc.totals.subtotal)}</td>
                <td className={`p-2 text-right tabular-nums ${(doc.totals.margin ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>{fmt(doc.totals.margin ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {doc.items.length > 0 && doc.kind !== "tp" && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr><th className="text-left p-2">Product</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Rate</th><th className="text-right p-2">GST%</th><th className="text-right p-2">Total</th></tr>
            </thead>
            <tbody>
              {doc.items.map((it, i) => {
                const rate = it.sale_rate ?? it.rate ?? 0;
                const total = Number(it.qty) * Number(rate) * (1 + Number(it.gst_pct ?? 0) / 100);
                return (
                  <tr key={i} className="border-t">
                    <td className="p-2">{it.product_name}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(it.qty)} {it.unit}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(rate)}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(it.gst_pct)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">{fmt(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {h.notes && <div className="px-4 py-2 text-sm border-t"><span className="text-muted-foreground">Notes: </span>{h.notes}</div>}

      {payments.length > 0 && (
        <div className="border-t">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/30">Payments applied</div>
          <table className="w-full text-sm">
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2 font-mono text-xs">
                    <Link to="/app/lookup" search={{ q: p.payment_no } as any} className="text-primary hover:underline">{p.payment_no}</Link>
                  </td>
                  <td className="p-2">{fmtDate(p.date)}</td>
                  <td className="p-2 text-muted-foreground">{p.mode}</td>
                  {doc.kind === "tp" && (
                    <td className="p-2"><Badge variant="outline" className="text-[10px]">{p.alloc_side === "tp_purchase" ? "supplier" : "buyer"}</Badge></td>
                  )}
                  <td className="p-2 text-right tabular-nums font-medium">{inr(p.allocated ?? p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {journal.length > 0 && (
        <div className="border-t">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/30">Journal postings</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-xs uppercase text-muted-foreground"><tr>
                <th className="text-left p-2">Account</th><th className="text-left p-2">Party</th>
                <th className="text-right p-2">Debit</th><th className="text-right p-2">Credit</th>
              </tr></thead>
              <tbody>
                {journal.map((j, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{j.account}</td>
                    <td className="p-2 text-muted-foreground">{j.party ?? ""}</td>
                    <td className="p-2 text-right tabular-nums">{Number(j.debit) ? fmt(j.debit) : ""}</td>
                    <td className="p-2 text-right tabular-nums">{Number(j.credit) ? fmt(j.credit) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {partyDocs.length > 1 && (
        <div className="border-t">
          <div className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground bg-muted/30">Other documents for this party</div>
          <div className="divide-y">
            {partyDocs.filter((d) => d.no !== no).slice(0, 10).map((d, i) => (
              <div key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                <Badge variant="outline">{d.kind}</Badge>
                <Link to="/app/lookup" search={{ q: d.no } as any} className="font-mono text-xs text-primary hover:underline">{d.no}</Link>
                <span className="text-xs text-muted-foreground">{fmtDate(d.date)}</span>
                <span className="text-xs text-muted-foreground truncate ml-auto">{d.party}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}