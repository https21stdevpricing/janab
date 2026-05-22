import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate, inr } from "@/lib/format";
import { Printer } from "lucide-react";
import swLogo from "@/assets/sw-logo.png";
import { exportStoneWorldDocument } from "@/lib/pdf-theme";
import { lookupDocById } from "@/lib/doc-lookup";
import { DEFAULT_PRINT_DESIGN, fileToDataUrl, loadPrintDesign, savePrintDesign, type PrintDesign } from "@/lib/print-customizer";

export function PrintDoc({ kind, id }: { kind: "invoice" | "quote"; id: string }) {
  const [doc, setDoc] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [buyer, setBuyer] = useState<any>(null);
  const [design, setDesign] = useState<PrintDesign>(DEFAULT_PRINT_DESIGN);

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
    setDesign(loadPrintDesign());
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
  const downloadPdf = async () => {
    const result = await lookupDocById(kind === "invoice" ? "sale" : "quote", id);
    if (result) exportStoneWorldDocument(result, company, design);
  };

  const updateDesign = (next: PrintDesign) => { setDesign(next); savePrintDesign(next); };
  const uploadLogo = async (file?: File) => { if (file) updateDesign({ ...design, logoDataUrl: await fileToDataUrl(file) }); };
  const uploadFooterLogos = async (files?: FileList | null) => {
    if (!files) return;
    const add = await Promise.all(Array.from(files).slice(0, 20 - design.footerLogos.length).map(fileToDataUrl));
    updateDesign({ ...design, footerLogos: [...design.footerLogos, ...add].slice(0, 20) });
  };

  const footerCols = Math.ceil(design.footerLogos.length / design.footerRows) || 1;
  const watermarkOpacity = Math.max(0, Math.min(100, design.watermarkOpacity)) / 100;
  const footerLogoBlock = design.footerLogos.length > 0 && (
    <div
      className="mt-8 border-t border-slate-200 pt-4 grid gap-3 items-center break-inside-avoid"
      style={{ gridTemplateColumns: `repeat(${Math.max(1, footerCols)}, minmax(0, 1fr))` }}
    >
      {design.footerLogos.map((src, i) => (
        <img
          key={i}
          src={src}
          alt={`Footer brand logo ${i + 1}`}
          className="max-w-full object-contain justify-self-center opacity-80"
          style={{ height: `${design.footerLogoSize}px` }}
        />
      ))}
    </div>
  );

  return (
    <div>
      <div className="grid gap-3 mb-3 print:hidden lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="surface p-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><div className="eyebrow">Document design</div><div className="text-[11px] text-muted-foreground">Edits apply live to the preview and the branded PDF.</div></div>
            <Button variant="outline" size="sm" onClick={() => updateDesign(DEFAULT_PRINT_DESIGN)}>Reset</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Header style</span>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.headerStyle} onChange={(e) => updateDesign({ ...design, headerStyle: e.target.value as any })}>
                <option value="classic">Classic</option><option value="editorial">Editorial</option><option value="compact">Compact</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Body density</span>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.bodyLayout} onChange={(e) => updateDesign({ ...design, bodyLayout: e.target.value as any })}>
                <option value="balanced">Balanced</option><option value="spacious">Spacious</option><option value="dense">Dense</option>
              </select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Main logo (PNG)</span>
              <span className="h-8 rounded-md border bg-background px-2 text-xs flex items-center justify-between gap-2 cursor-pointer">
                <span className="truncate">{design.logoDataUrl ? "Custom uploaded" : "Default StoneWorld"}</span>
                <span className="text-primary">Replace</span>
                <input type="file" accept="image/png" className="hidden" onChange={(e) => uploadLogo(e.target.files?.[0])} />
              </span>
            </label>
          </div>

          <div className="rounded-md border border-border/60 p-2 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Watermark</div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <input className="h-8 rounded-md border bg-background px-2 text-xs" placeholder="Watermark text (e.g. DRAFT, PAID)" value={design.watermarkText ?? ""} onChange={(e) => updateDesign({ ...design, watermarkText: e.target.value })} />
              <label className="flex items-center gap-2 text-[11px]"><span>Opacity</span>
                <input type="range" min={0} max={100} value={design.watermarkOpacity} onChange={(e) => updateDesign({ ...design, watermarkOpacity: Number(e.target.value) })} className="w-24" />
                <span className="tabular-nums w-8 text-right">{design.watermarkOpacity}%</span>
              </label>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.watermarkLayer} onChange={(e) => updateDesign({ ...design, watermarkLayer: e.target.value as any })}>
                <option value="back">Behind content</option><option value="front">Over content</option>
              </select>
            </div>
          </div>

          <div className="rounded-md border border-border/60 p-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Footer brand logos ({design.footerLogos.length}/20)</div>
              {design.footerLogos.length > 0 && <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => updateDesign({ ...design, footerLogos: [] })}>Clear</Button>}
            </div>
            <div className="grid gap-2 sm:grid-cols-[auto_auto_auto_1fr]">
              <label className="h-8 rounded-md border bg-background px-3 text-[11px] flex items-center cursor-pointer">Add PNG logos<input type="file" accept="image/png" multiple className="hidden" onChange={(e) => uploadFooterLogos(e.target.files)} /></label>
              <label className="flex items-center gap-2 text-[11px]"><span>Rows</span>
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.footerRows} onChange={(e) => updateDesign({ ...design, footerRows: Number(e.target.value) as 1|2|3 })}>
                  <option value={1}>1 row</option><option value={2}>2 rows</option><option value={3}>3 rows</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[11px]"><span>Logo size</span>
                <input type="range" min={18} max={64} value={design.footerLogoSize} onChange={(e) => updateDesign({ ...design, footerLogoSize: Number(e.target.value) })} className="w-24" />
                <span className="tabular-nums w-10 text-right">{design.footerLogoSize}px</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] sm:justify-end"><span>Place at</span>
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.footerPosition} onChange={(e) => updateDesign({ ...design, footerPosition: e.target.value as any })}>
                  <option value="above-signature">Above signature</option><option value="page-bottom">At page bottom</option>
                </select>
              </label>
            </div>
            {design.footerLogos.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {design.footerLogos.map((src, i) => (
                  <span key={i} className="relative rounded border bg-background p-1">
                    <img src={src} alt="" className="h-6 object-contain" />
                    <button type="button" className="absolute -top-1.5 -right-1.5 h-4 w-4 grid place-items-center rounded-full bg-destructive text-destructive-foreground text-[9px]" onClick={() => updateDesign({ ...design, footerLogos: design.footerLogos.filter((_, j) => j !== i) })} aria-label="Remove">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={downloadPdf}><Printer className="h-4 w-4" /> Download Branded PDF</Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / Save PDF</Button>
        </div>
      </div>

      <article id="print-area" className="sw-print-doc bg-white text-[#121826] mx-auto max-w-[820px] rounded-md border border-slate-200 shadow-sm overflow-hidden print:border-0 print:shadow-none print:max-w-full print:rounded-none">
        <div className="h-2 bg-[#00abb5]" />
        <header className={`${design.headerStyle === "compact" ? "px-8 pt-5 pb-4" : "px-9 pt-7 pb-5"} border-b border-slate-200 ${design.headerStyle === "editorial" ? "bg-[#f4fcfd]" : ""}`}>
          <div className={`flex items-start justify-between gap-6 ${design.headerStyle === "editorial" ? "border-l-4 border-[#00abb5] pl-4" : ""}`}>
            <div className="flex items-start gap-4 min-w-0">
              <img src={design.logoDataUrl || swLogo} alt="StoneWorld Traders logo" className="h-16 w-16 object-contain shrink-0" />
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

        <section className={`${design.bodyLayout === "dense" ? "px-8 py-4" : design.bodyLayout === "spacious" ? "px-10 py-7" : "px-9 py-5"} relative`}>
          {design.watermarkText && (
            <div
              className="pointer-events-none absolute inset-0 grid place-items-center text-6xl font-black uppercase tracking-normal select-none"
              style={{ color: "#94a3b8", opacity: watermarkOpacity, transform: "rotate(-24deg)", zIndex: design.watermarkLayer === "front" ? 30 : 0 }}
            >
              {design.watermarkText}
            </div>
          )}
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
                    <td className={`${design.bodyLayout === "dense" ? "py-2" : "py-3"} px-2 text-center text-[#566070]`}>{i + 1}</td>
                    <td className={`${design.bodyLayout === "dense" ? "py-2" : "py-3"} px-2 font-semibold text-[#121826]`}>{it.product_name ?? "—"}</td>
                    <td className={`${design.bodyLayout === "dense" ? "py-2" : "py-3"} px-2 text-right tabular-nums`}>{fmt(it.qty)}</td>
                    <td className={`${design.bodyLayout === "dense" ? "py-2" : "py-3"} px-2 text-center text-[#566070]`}>{it.unit ?? "—"}</td>
                    <td className={`${design.bodyLayout === "dense" ? "py-2" : "py-3"} px-2 text-right tabular-nums font-semibold`}>{fmt(it.rate)}</td>
                    <td className={`${design.bodyLayout === "dense" ? "py-2" : "py-3"} px-2 text-right tabular-nums text-[#566070]`}>{fmt(it.gst_pct, Number(it.gst_pct ?? 0) % 1 === 0 ? 0 : 2)}%</td>
                    <td className={`${design.bodyLayout === "dense" ? "py-2" : "py-3"} px-2 text-right tabular-nums font-semibold text-[#007e87]`}>{fmt(base)}</td>
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

          {design.footerPosition === "above-signature" && footerLogoBlock}
          <div className="mt-14 grid grid-cols-2 text-[11px] text-[#566070] break-inside-avoid">
            <div>Thank you for your business.</div>
            <div className="text-right">For {company?.company_name ?? "StoneWorld Traders"}<br /><br /><br /><span className="border-t border-slate-300 pt-2 inline-block min-w-[180px]">Authorised Signatory</span></div>
          </div>
          {design.footerPosition === "page-bottom" && footerLogoBlock}
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