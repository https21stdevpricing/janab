import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate, inr } from "@/lib/format";
import { Printer } from "lucide-react";
import swLogo from "@/assets/sw-logo.png";
import { exportStoneWorldDocument } from "@/lib/pdf-theme";
import { lookupDocById } from "@/lib/doc-lookup";
import { amountInWords } from "@/lib/amount-words";
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
  const uploadWatermarkLogo = async (file?: File) => { if (file) updateDesign({ ...design, watermarkLogoDataUrl: await fileToDataUrl(file) }); };
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
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <label className="h-8 rounded-md border bg-background px-2 text-xs flex items-center justify-between gap-2 cursor-pointer">
                <span className="truncate">{design.watermarkLogoDataUrl ? "Logo watermark uploaded" : "Logo watermark (PNG)"}</span>
                <span className="text-primary">{design.watermarkLogoDataUrl ? "Replace" : "Upload"}</span>
                <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => uploadWatermarkLogo(e.target.files?.[0])} />
              </label>
              <label className="flex items-center gap-2 text-[11px]"><span>Size</span>
                <input type="range" min={20} max={90} value={design.watermarkLogoScale} onChange={(e) => updateDesign({ ...design, watermarkLogoScale: Number(e.target.value) })} className="w-24" />
                <span className="tabular-nums w-10 text-right">{design.watermarkLogoScale}%</span>
              </label>
              {design.watermarkLogoDataUrl && <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => updateDesign({ ...design, watermarkLogoDataUrl: null })}>Remove logo</Button>}
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

      <article id="print-area" className="sw-print-doc bg-white text-[#111621] mx-auto max-w-[820px] rounded-md border border-slate-200 shadow-sm overflow-hidden print:border-0 print:shadow-none print:max-w-full print:rounded-none relative" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        {(design.watermarkText || design.watermarkLogoDataUrl) && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center select-none" style={{ opacity: watermarkOpacity, zIndex: design.watermarkLayer === "front" ? 30 : 0 }}>
            {design.watermarkLogoDataUrl && (
              <img src={design.watermarkLogoDataUrl} alt="" style={{ width: `${design.watermarkLogoScale}%`, transform: "rotate(-8deg)" }} className="object-contain" />
            )}
            {design.watermarkText && (
              <div className="absolute text-6xl font-black uppercase tracking-tight" style={{ color: "#0f172a", transform: "rotate(-24deg)" }}>{design.watermarkText}</div>
            )}
          </div>
        )}

        <header className="px-9 pt-8 pb-5 relative">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-start gap-4 min-w-0">
              <img src={design.logoDataUrl || swLogo} alt="logo" className="h-14 w-14 object-contain shrink-0" />
              <div className="min-w-0">
                <h1 className="text-[20px] font-bold leading-tight text-[#111621] tracking-tight">{company?.company_name ?? "StoneWorld Traders"}</h1>
                {address && <p className="mt-1 text-[11px] leading-4 text-[#374050] max-w-[380px]">{address}</p>}
                <p className="mt-1 text-[11px] leading-4 text-[#6e7886]">
                  {[company?.phone && `Tel: ${company.phone}`, company?.email, company?.gstin && `GSTIN ${company.gstin}`, company?.pan && `PAN ${company.pan}`].filter(Boolean).join("  ·  ")}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[22px] font-bold uppercase tracking-tight text-[#111621] leading-none">{title}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#6e7886]">{kind === "invoice" ? "Original for Recipient" : "Proposal · Not a tax invoice"}</div>
              <dl className="mt-4 grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[11px] justify-end">
                <dt className="text-[#6e7886]">No.</dt><dd className="font-bold tabular-nums text-[#111621]">{documentNo}</dd>
                <dt className="text-[#6e7886]">Date</dt><dd className="font-bold tabular-nums text-[#111621]">{fmtDate(doc.date)}</dd>
                {doc.valid_until && <><dt className="text-[#6e7886]">Valid</dt><dd className="font-bold tabular-nums text-[#111621]">{fmtDate(doc.valid_until)}</dd></>}
              </dl>
            </div>
          </div>
          <div className="mt-5 h-px bg-slate-200" />
          <div className="mt-1 h-[2px] w-16 bg-[#00abb5]" />
        </header>

        <section className="px-9 py-6 grid grid-cols-2 gap-10">
          <InfoPanel title={kind === "invoice" ? "Bill To" : "Quoted To"} rows={[
            ["Name", doc.buyer_name ?? buyer?.name ?? "—"],
            ["Address", partyAddress],
            ["State", buyer?.state],
            ["GSTIN", buyer?.gstin],
            ["Phone", buyer?.phone],
          ]} />
          <InfoPanel title={kind === "invoice" ? "Invoice Info" : "Quotation Info"} rows={[
            [kind === "invoice" ? "Invoice No" : "Quote No", documentNo],
            ["Date", fmtDate(doc.date)],
            ...(doc.valid_until ? [["Valid Until", fmtDate(doc.valid_until)] as [string, string]] : []),
            ["Place of Supply", buyer?.state ?? "—"],
            ["GST Treatment", sameState ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"],
            ["Reverse Charge", "No"],
          ]} />
        </section>

        <section className={`${design.bodyLayout === "dense" ? "px-8 pb-4" : design.bodyLayout === "spacious" ? "px-10 pb-7" : "px-9 pb-6"} relative`}>
          <table className="w-full border-collapse text-[11.5px] leading-4">
            <thead>
              <tr className="text-[#6e7886] uppercase text-[9.5px] tracking-[0.08em]">
                <th className="text-center py-2 px-2 w-7 border-b-2 border-[#111621] border-t border-slate-200 font-bold">#</th>
                <th className="text-left py-2 px-2 border-b-2 border-[#111621] border-t border-slate-200 font-bold">Description</th>
                <th className="text-center py-2 px-2 w-16 border-b-2 border-[#111621] border-t border-slate-200 font-bold">HSN</th>
                <th className="text-right py-2 px-2 w-12 border-b-2 border-[#111621] border-t border-slate-200 font-bold">Qty</th>
                <th className="text-center py-2 px-2 w-12 border-b-2 border-[#111621] border-t border-slate-200 font-bold">Unit</th>
                <th className="text-right py-2 px-2 w-20 border-b-2 border-[#111621] border-t border-slate-200 font-bold">Rate</th>
                <th className="text-right py-2 px-2 w-12 border-b-2 border-[#111621] border-t border-slate-200 font-bold">GST</th>
                <th className="text-right py-2 px-2 w-24 border-b-2 border-[#111621] border-t border-slate-200 font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const base = Number(it.qty || 0) * Number(it.rate || 0);
                const padY = design.bodyLayout === "dense" ? "py-2" : "py-3";
                return (
                  <tr key={i} className="border-b border-slate-100 break-inside-avoid align-top">
                    <td className={`${padY} px-2 text-center text-[#6e7886] tabular-nums`}>{i + 1}</td>
                    <td className={`${padY} px-2 font-semibold text-[#111621]`}>{it.product_name ?? "—"}</td>
                    <td className={`${padY} px-2 text-center text-[#6e7886] font-mono text-[10.5px]`}>{(it as any).hsn ?? (it as any).hsn_code ?? "—"}</td>
                    <td className={`${padY} px-2 text-right tabular-nums`}>{fmt(it.qty)}</td>
                    <td className={`${padY} px-2 text-center text-[#6e7886]`}>{it.unit ?? "—"}</td>
                    <td className={`${padY} px-2 text-right tabular-nums`}>{fmt(it.rate)}</td>
                    <td className={`${padY} px-2 text-right tabular-nums text-[#6e7886]`}>{fmt(it.gst_pct, Number(it.gst_pct ?? 0) % 1 === 0 ? 0 : 2)}%</td>
                    <td className={`${padY} px-2 text-right tabular-nums font-bold text-[#111621]`}>{fmt(base)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-8 grid grid-cols-[1fr_260px] gap-10 items-start break-inside-avoid">
            <div className="text-[11px] leading-5 text-[#374050]">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">Amount in words</p>
              <p className="mt-1 font-semibold text-[#111621]">{amountInWords(totals.total)}</p>
              {kind === "invoice" && (company?.bank_name || company?.bank_account_no || company?.bank_ifsc) && (
                <div className="mt-4">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">Bank Details</p>
                  <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                    {company?.bank_name && <><span className="text-[#6e7886]">Bank</span><span className="font-semibold">{company.bank_name}</span></>}
                    {company?.bank_account_no && <><span className="text-[#6e7886]">A/c No.</span><span className="font-mono font-semibold">{company.bank_account_no}</span></>}
                    {company?.bank_ifsc && <><span className="text-[#6e7886]">IFSC</span><span className="font-mono font-semibold">{company.bank_ifsc}</span></>}
                  </div>
                </div>
              )}
              {doc.notes && <p className="mt-4"><span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">Notes</span><br />{doc.notes}</p>}
              <p className="mt-4 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">{kind === "invoice" ? "Terms & Conditions" : "Terms of Proposal"}</p>
              <p className="mt-1 text-[10.5px] leading-4 text-[#6e7886]">{kind === "invoice"
                ? "Goods once sold will not be taken back. Interest @18% p.a. on overdue balances. Subject to local jurisdiction. E&OE."
                : "Prices valid until the date shown above. Quotation does not constitute a tax invoice. Stock and lot variation may apply. E&OE."}</p>
            </div>
            <div className="text-[11.5px]">
              <SummaryLine label="Subtotal" value={totals.subtotal} />
              {sameState ? <><SummaryLine label="CGST" value={totals.gst / 2} /><SummaryLine label="SGST" value={totals.gst / 2} /></> : <SummaryLine label="IGST" value={totals.gst} />}
              <div className="border-t-2 border-[#111621] mt-1 pt-2 flex justify-between items-baseline">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Grand Total</span>
                <span className="tabular-nums font-bold text-[15px]">{inr(totals.total)}</span>
              </div>
            </div>
          </div>

          {design.footerPosition === "above-signature" && footerLogoBlock}
          <div className="mt-14 grid grid-cols-2 text-[11px] text-[#6e7886] break-inside-avoid">
            <div>Thank you for your business.</div>
            <div className="text-right">For {company?.company_name ?? "StoneWorld Traders"}<br /><br /><br /><span className="border-t border-slate-400 pt-2 inline-block min-w-[180px] font-semibold text-[#111621]">Authorised Signatory</span></div>
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
    <div className="border-t border-slate-300 pt-3">
      <div className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#6e7886] mb-3">{title}</div>
      <div className="space-y-2">
        {rows.filter(([, value]) => value).map(([label, value]) => (
          <div key={label} className="text-[11px] leading-4">
            <div className="text-[9.5px] uppercase tracking-wide text-[#6e7886]">{label}</div>
            <div className="font-semibold text-[#111621] break-words">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between py-1.5"><span className="text-[#6e7886]">{label}</span><span className="tabular-nums font-semibold text-[#111621]">{inr(value)}</span></div>;
}