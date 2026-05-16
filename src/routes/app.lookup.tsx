import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { fmt, fmtDate, inr } from "@/lib/format";
import { lookupDoc, prefixOf, type DocLookupResult } from "@/lib/doc-lookup";
import { Search, Printer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/lookup")({ component: LookupPage });

type SearchHit =
  | { kind: "contact"; row: any }
  | { kind: "product"; row: any }
  | { kind: "doc"; row: any; docKind: string; no: string; date: string; party: string };

function LookupPage() {
  const [q, setQ] = useState("");
  const [doc, setDoc] = useState<DocLookupResult | null>(null);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);

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
    const [{ data: cs }, { data: ps }, { data: ss }, { data: pos }, { data: tps }, { data: qs }, { data: pys }] = await Promise.all([
      supabase.from("contacts").select("*").or(`name.ilike.${like},phone.ilike.${like},gstin.ilike.${like},code.ilike.${like}`).limit(20),
      supabase.from("products").select("*").or(`name.ilike.${like},code.ilike.${like},hsn.ilike.${like}`).limit(20),
      supabase.from("sales").select("id,invoice_no,date,buyer_name").or(`invoice_no.ilike.${like},buyer_name.ilike.${like}`).limit(10),
      supabase.from("purchases").select("id,po_no,date,supplier_name").or(`po_no.ilike.${like},supplier_name.ilike.${like}`).limit(10),
      supabase.from("third_party").select("id,tp_no,date,buyer_name,supplier_name").or(`tp_no.ilike.${like},buyer_name.ilike.${like},supplier_name.ilike.${like}`).limit(10),
      supabase.from("quotations").select("id,quote_no,date,buyer_name").or(`quote_no.ilike.${like},buyer_name.ilike.${like}`).limit(10),
      supabase.from("payments").select("id,payment_no,date,contact_name,direction").or(`payment_no.ilike.${like},contact_name.ilike.${like}`).limit(10),
    ]);
    for (const r of cs ?? []) out.push({ kind: "contact", row: r });
    for (const r of ps ?? []) out.push({ kind: "product", row: r });
    for (const r of ss ?? []) out.push({ kind: "doc", docKind: "Sale", no: r.invoice_no, date: r.date, party: r.buyer_name ?? "—", row: r });
    for (const r of pos ?? []) out.push({ kind: "doc", docKind: "Purchase", no: r.po_no, date: r.date, party: r.supplier_name ?? "—", row: r });
    for (const r of tps ?? []) out.push({ kind: "doc", docKind: "TP", no: r.tp_no, date: r.date, party: `${r.supplier_name ?? "—"} → ${r.buyer_name ?? "—"}`, row: r });
    for (const r of qs ?? []) out.push({ kind: "doc", docKind: "Quote", no: r.quote_no, date: r.date, party: r.buyer_name ?? "—", row: r });
    for (const r of pys ?? []) out.push({ kind: "doc", docKind: r.direction === "in" ? "Receipt" : "Payment", no: r.payment_no, date: r.date, party: r.contact_name ?? "—", row: r });
    setHits(out);
    if (out.length === 0) toast.error("Nothing found");
    setBusy(false);
  };

  const pickHit = async (h: SearchHit) => {
    if (h.kind === "doc") { setQ(h.no); const r = await lookupDoc(h.no); if (r) setDoc(r); }
  };

  return (
    <div>
      <PageHeader title="Lookup" description="Search invoices, POs, TPs, quotes, payments, buyers/suppliers, products" />
      <div className="flex gap-2 mb-4 max-w-xl">
        <Input className="font-mono" placeholder="ID, name, phone, GSTIN, HSN…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <Button onClick={run} disabled={busy}><Search className="h-4 w-4" /> Find</Button>
      </div>

      {doc && <DocDetail doc={doc} />}

      {hits.length > 0 && (
        <div className="rounded-md border bg-card divide-y mt-4">
          {hits.map((h, i) => (
            <div key={i} className="p-3 flex items-center gap-3 hover:bg-muted/40 cursor-pointer" onClick={() => pickHit(h)}>
              {h.kind === "contact" && <>
                <Badge variant="outline" className="capitalize">{h.row.type}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{h.row.name} <span className="font-mono text-xs text-muted-foreground">{h.row.code}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{h.row.state} {h.row.phone ? `· ${h.row.phone}` : ""} {h.row.gstin ? `· ${h.row.gstin}` : ""}</div>
                </div>
              </>}
              {h.kind === "product" && <>
                <Badge variant="outline">Product</Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{h.row.name} <span className="font-mono text-xs text-muted-foreground">{h.row.code}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{h.row.unit} · HSN {h.row.hsn ?? "—"} · Sale ₹{fmt(h.row.sale_rate)}</div>
                </div>
              </>}
              {h.kind === "doc" && <>
                <Badge>{h.docKind}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm">{h.no}</div>
                  <div className="text-xs text-muted-foreground truncate">{fmtDate(h.date)} · {h.party ?? "—"}</div>
                </div>
              </>}
            </div>
          ))}
        </div>
      )}

      {!doc && hits.length === 0 && <Empty>Type an ID, name, phone, GSTIN or HSN and press Find.</Empty>}
    </div>
  );
}

function DocDetail({ doc }: { doc: DocLookupResult }) {
  const h = doc.header;
  const no = h.invoice_no ?? h.po_no ?? h.tp_no ?? h.quote_no ?? h.payment_no;
  const printable = doc.kind === "sale" ? "invoice" : doc.kind === "quote" ? "quote" : null;
  return (
    <div className="rounded-md border bg-card">
      <div className="p-4 border-b flex items-start gap-3">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{doc.kind}</div>
          <div className="text-lg font-semibold font-mono">{no}</div>
          <div className="text-sm text-muted-foreground mt-1">{fmtDate(h.date)} · {h.buyer_name ?? h.supplier_name ?? h.contact_name ?? "—"}</div>
          {doc.party && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {doc.party.code} · {doc.party.state} {doc.party.gstin ? `· ${doc.party.gstin}` : ""} {doc.party.phone ? `· ${doc.party.phone}` : ""}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-base font-semibold">{inr(doc.totals.total)}</div>
          {doc.outstanding && doc.outstanding.balance > 0 && (
            <div className="text-xs text-destructive">Balance {inr(doc.outstanding.balance)}</div>
          )}
          {doc.outstanding && (
            <Badge variant={doc.outstanding.status === "paid" ? "default" : doc.outstanding.status === "partial" ? "secondary" : "outline"} className="mt-1 capitalize">{doc.outstanding.status}</Badge>
          )}
          {printable && (
            <div className="mt-2"><Button asChild size="sm" variant="outline"><Link to={"/app/print/" + printable + "/$id" as any} params={{ id: h.id } as any}><Printer className="h-3 w-3" /> Print</Link></Button></div>
          )}
        </div>
      </div>
      {doc.totals.margin != null && (
        <div className="px-4 py-2 border-b text-xs flex gap-4">
          <span>Cost: <span className="font-medium tabular-nums">{inr(doc.totals.cost!)}</span></span>
          <span>Sale: <span className="font-medium tabular-nums">{inr(doc.totals.subtotal)}</span></span>
          <span className="text-emerald-600 dark:text-emerald-400">Margin: <span className="font-semibold tabular-nums">{inr(doc.totals.margin)}</span> ({doc.totals.subtotal ? ((doc.totals.margin / doc.totals.subtotal) * 100).toFixed(1) : "0"}%)</span>
        </div>
      )}
      {doc.items.length > 0 && (
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
    </div>
  );
}