import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate, inr } from "@/lib/format";
import { Printer } from "lucide-react";
import swLogo from "@/assets/sw-logo.png";

export function PrintDoc({ kind, id }: { kind: "invoice" | "quote"; id: string }) {
  const [doc, setDoc] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [buyer, setBuyer] = useState<any>(null);

  useEffect(() => { (async () => {
    const table = kind === "invoice" ? "sales" : "quotations";
    const itemsTable = kind === "invoice" ? "sale_items" : "quotation_items";
    const fk = kind === "invoice" ? "sale_id" : "quotation_id";
    const { data: h } = await supabase.from(table).select("*").eq("id", id).maybeSingle() as { data: any };
    setDoc(h);
    if (h) {
      const { data: its } = await supabase.from(itemsTable as never).select("*").eq(fk as never, id).order("position");
      setItems(its ?? []);
      if (h.buyer_id) {
        const { data: b } = await supabase.from("contacts").select("*").eq("id", h.buyer_id).maybeSingle();
        setBuyer(b);
      }
    }
    const { data: c } = await supabase.from("settings").select("*").maybeSingle();
    setCompany(c);
  })(); }, [kind, id]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((a, it) => a + Number(it.qty || 0) * Number(it.rate || 0), 0);
    const gst = items.reduce((a, it) => a + Number(it.qty || 0) * Number(it.rate || 0) * Number(it.gst_pct ?? 0) / 100, 0);
    return { subtotal, gst, total: subtotal + gst };
  }, [items]);

  if (!doc) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  const sameState = company?.state && buyer?.state && company.state.toLowerCase() === buyer.state.toLowerCase();
  const documentNo = doc.invoice_no ?? doc.quote_no;
  const title = kind === "invoice" ? "Tax Invoice" : "Quotation";
  const address = [company?.address, company?.state].filter(Boolean).join(", ");
  const partyAddress = [buyer?.address, buyer?.state].filter(Boolean).join(", ");

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / Save PDF</Button>
      </div>

      <article id="print-area" className="sw-print-doc bg-white text-[#121826] mx-auto max-w-[820px] rounded-md border border-slate-200 shadow-sm overflow-hidden print:border-0 print:shadow-none print:max-w-full print:rounded-none">
        <div className="h-2 bg-[#00abb5]" />
        <header className="px-9 pt-7 pb-5 border-b border-slate-200">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0">
              <img src={swLogo} alt="StoneWorld Traders logo" className="h-16 w-16 object-contain shrink-0" />
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold tracking-normal leading-tight text-[#121826]">{company?.company_name ?? "StoneWorld Traders"}</h1>
                {address && <p className="mt-1 text-[11px] leading-4 text-[#566070] max-w-[360px]">{address}</p>}
                <p className="mt-1 text-[11px] leading-4 text-[#566070]">
                  {[company?.phone && `Ph: ${company.phone}`, company?.email, company?.gstin && `GSTIN: ${company.gstin}`].filter(Boolean).join("  |  ")}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#007e87]">{title}</div>
              <div className="mt-1 text-2xl font-extrabold font-mono tracking-normal text-[#121826]">{documentNo}</div>
              <div className="mt-2 text-[11px] leading-4 text-[#566070]">Date: {fmtDate(doc.date)}</div>
              {doc.valid_until && <div className="text-[11px] leading-4 text-[#566070]">Valid until: {fmtDate(doc.valid_until)}</div>}
            </div>
          </div>
        </header>

        <section className="px-9 py-5 grid grid-cols-2 gap-4 border-b border-slate-200">
          <InfoPanel title={kind === "invoice" ? "Bill To" : "Quoted To"} rows={[
            ["Customer", doc.buyer_name ?? buyer?.name ?? "—"],
            ["Address", partyAddress],
            ["GSTIN", buyer?.gstin],
            ["Phone", buyer?.phone],
          ]} />
          <InfoPanel title="Document Details" rows={[
            ["Document No", documentNo],
            ["Date", fmtDate(doc.date)],
            ["GST Type", sameState ? "CGST + SGST" : "IGST"],
            ["Status", kind === "invoice" ? "Original for recipient" : "Customer quote"],
          ]} />
        </section>

        <section className="px-9 py-5">
          <table className="w-full border-collapse text-[12px] leading-4">
            <thead>
              <tr className="bg-[#f4fcfd] text-[#007e87] uppercase text-[10px] tracking-normal border-y border-slate-200">
                <th className="text-center py-2.5 px-2 w-8">#</th>
                <th className="text-left py-2.5 px-2">Description</th>
                <th className="text-right py-2.5 px-2 w-16">Qty</th>
                <th className="text-center py-2.5 px-2 w-14">Unit</th>
                <th className="text-right py-2.5 px-2 w-20">Rate</th>
                <th className="text-right py-2.5 px-2 w-14">GST</th>
                <th className="text-right py-2.5 px-2 w-24">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const base = Number(it.qty || 0) * Number(it.rate || 0);
                return (
                  <tr key={i} className="border-b border-slate-100 break-inside-avoid">
                    <td className="py-3 px-2 text-center text-[#566070]">{i + 1}</td>
                    <td className="py-3 px-2 font-semibold text-[#121826]">{it.product_name ?? "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{fmt(it.qty)}</td>
                    <td className="py-3 px-2 text-center text-[#566070]">{it.unit ?? "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums font-semibold">{fmt(it.rate)}</td>
                    <td className="py-3 px-2 text-right tabular-nums text-[#566070]">{fmt(it.gst_pct, Number(it.gst_pct ?? 0) % 1 === 0 ? 0 : 2)}%</td>
                    <td className="py-3 px-2 text-right tabular-nums font-semibold text-[#007e87]">{fmt(base)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-6 flex items-start justify-between gap-6 break-inside-avoid">
            <div className="max-w-[360px] text-[11px] leading-4 text-[#566070]">
              {doc.notes && <p><span className="font-bold text-[#121826]">Notes: </span>{doc.notes}</p>}
              <p className="mt-3 font-bold uppercase text-[#007e87]">Terms & Conditions</p>
              <p className="mt-1">Goods are subject to stock availability, shade variation and final confirmation. GST and statutory charges apply as shown. E&OE.</p>
            </div>
            <div className="w-[260px] rounded-md border border-slate-200 overflow-hidden text-[12px]">
              <SummaryLine label="Subtotal" value={totals.subtotal} />
              {sameState ? <><SummaryLine label="CGST" value={totals.gst / 2} /><SummaryLine label="SGST" value={totals.gst / 2} /></> : <SummaryLine label="IGST" value={totals.gst} />}
              <div className="flex justify-between items-center bg-[#00abb5] text-white px-4 py-3 font-extrabold text-[13px]">
                <span>Total</span><span className="tabular-nums">{inr(totals.total)}</span>
              </div>
            </div>
          </div>

          <div className="mt-14 grid grid-cols-2 text-[11px] text-[#566070] break-inside-avoid">
            <div>Thank you for your business.</div>
            <div className="text-right">For {company?.company_name ?? "StoneWorld Traders"}<br /><br /><br /><span className="border-t border-slate-300 pt-2 inline-block min-w-[180px]">Authorised Signatory</span></div>
          </div>
        </section>
      </article>

      <style>{`@media print { @page { size: A4; margin: 10mm; } body { background: white !important; } .print\\:hidden { display: none !important; } #print-area { width: 190mm; } .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; } }`}</style>
    </div>
  );
}

function InfoPanel({ title, rows }: { title: string; rows: Array<[string, any]> }) {
  return (
    <div className="rounded-md border border-slate-200 bg-[#f4fcfd] p-4 min-h-[112px]">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#007e87] mb-2">{title}</div>
      <div className="space-y-1.5">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="grid grid-cols-[76px_1fr] gap-2 text-[11px] leading-4">
            <span className="text-[#566070]">{label}:</span>
            <span className="font-semibold text-[#121826] break-words">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between px-4 py-2 border-b border-slate-100"><span className="text-[#566070]">{label}</span><span className="tabular-nums font-semibold">{inr(value)}</span></div>;
}