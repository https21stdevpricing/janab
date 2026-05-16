import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate, inr } from "@/lib/format";
import { Printer } from "lucide-react";

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

  if (!doc) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  const subtotal = items.reduce((a, it) => a + Number(it.qty) * Number(it.rate), 0);
  const gst = items.reduce((a, it) => a + Number(it.qty) * Number(it.rate) * Number(it.gst_pct ?? 0) / 100, 0);
  const total = subtotal + gst;

  const sameState = company?.state && buyer?.state && company.state.toLowerCase() === buyer.state.toLowerCase();
  const cgst = sameState ? gst / 2 : 0;
  const sgst = sameState ? gst / 2 : 0;
  const igst = sameState ? 0 : gst;

  return (
    <div>
      <div className="flex justify-end gap-2 mb-3 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / Save PDF</Button>
      </div>
      <div id="print-area" className="bg-white text-black mx-auto max-w-[820px] p-6 md:p-10 rounded-md border print:border-0 print:max-w-full print:rounded-none">
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{company?.company_name ?? "Your Company"}</h1>
            <div className="text-xs text-gray-600 mt-1 whitespace-pre-line">{company?.address}</div>
            <div className="text-xs text-gray-600">{company?.phone} {company?.email && ` · ${company.email}`}</div>
            {company?.gstin && <div className="text-xs text-gray-700 mt-1">GSTIN: <span className="font-mono">{company.gstin}</span></div>}
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-widest text-gray-500">{kind === "invoice" ? "Tax Invoice" : "Quotation"}</div>
            <div className="text-xl font-bold font-mono mt-1">{doc.invoice_no ?? doc.quote_no}</div>
            <div className="text-xs text-gray-600 mt-1">Date: {fmtDate(doc.date)}</div>
            {doc.valid_until && <div className="text-xs text-gray-600">Valid until: {fmtDate(doc.valid_until)}</div>}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide text-gray-500">{kind === "invoice" ? "Bill To" : "Quoted To"}</div>
          <div className="font-semibold mt-1">{doc.buyer_name ?? buyer?.name ?? "—"}</div>
          {buyer && <>
            <div className="text-xs text-gray-700">{buyer.address}</div>
            <div className="text-xs text-gray-700">{buyer.state} {buyer.gstin ? `· GSTIN: ${buyer.gstin}` : ""}</div>
          </>}
        </div>

        <table className="w-full text-sm mt-5 border-collapse">
          <thead>
            <tr className="border-y bg-gray-50">
              <th className="text-left p-2 w-8">#</th>
              <th className="text-left p-2">Description</th>
              <th className="text-right p-2 w-20">Qty</th>
              <th className="text-left p-2 w-14">Unit</th>
              <th className="text-right p-2 w-24">Rate</th>
              <th className="text-right p-2 w-16">GST%</th>
              <th className="text-right p-2 w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b">
                <td className="p-2 text-gray-500">{i + 1}</td>
                <td className="p-2">{it.product_name}</td>
                <td className="p-2 text-right tabular-nums">{fmt(it.qty)}</td>
                <td className="p-2">{it.unit}</td>
                <td className="p-2 text-right tabular-nums">{fmt(it.rate)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(it.gst_pct)}</td>
                <td className="p-2 text-right tabular-nums">{fmt(Number(it.qty) * Number(it.rate))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mt-4">
          <div className="w-72 text-sm space-y-1">
            <Line label="Subtotal" value={subtotal} />
            {sameState ? <>
              <Line label="CGST" value={cgst} /><Line label="SGST" value={sgst} />
            </> : <Line label="IGST" value={igst} />}
            <div className="border-t pt-1 mt-1 flex justify-between font-semibold text-base">
              <span>Total</span><span className="tabular-nums">{inr(total)}</span>
            </div>
          </div>
        </div>

        {doc.notes && <div className="mt-6 text-xs text-gray-700"><strong>Notes:</strong> {doc.notes}</div>}
        <div className="mt-10 grid grid-cols-2 text-xs text-gray-600">
          <div>Thank you for your business.</div>
          <div className="text-right">For {company?.company_name ?? "Your Company"}<br /><br /><br />Authorised Signatory</div>
        </div>
      </div>
      <style>{`@media print { @page { size: A4; margin: 12mm; } body { background: white; } .print\\:hidden { display: none !important; } }`}</style>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span className="text-gray-600">{label}</span><span className="tabular-nums">{inr(value)}</span></div>;
}