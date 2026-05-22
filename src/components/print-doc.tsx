import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate, inr } from "@/lib/format";
import { Printer } from "lucide-react";
import swLogo from "@/assets/sw-logo.png";
import { exportStoneWorldDocument } from "@/lib/pdf-theme";
import { lookupDocById } from "@/lib/doc-lookup";
import { amountInWords } from "@/lib/amount-words";
import { applyPrintPreset, DEFAULT_PRINT_DESIGN, fileToDataUrl, loadPrintDesign, savePrintDesign, type PrintDesign, type PrintCodePlacement, type PrintProductLayout, type PrintPreset } from "@/lib/print-customizer";
import { digitalCopyUrl, generateBarcodeDataUrl, generateQrDataUrl, upiPayString } from "@/lib/doc-codes";
import { stateWithCode } from "@/lib/india-states";

const presetLabels: Record<PrintPreset, string> = {
  minimal: "Minimal",
  gst: "GST detail",
  dispatch: "Dispatch",
  letterhead: "Letterhead",
};

const productLayoutLabels: Record<PrintProductLayout, string> = {
  standard: "Standard columns",
  compact: "Compact list",
  "description-first": "Description first",
  "tax-detail": "GST detail",
};

const codePlacementLabels: Record<PrintCodePlacement, string> = {
  totals: "Totals side",
  header: "Header",
  terms: "Terms side",
  hidden: "Hidden",
};

export function PrintDoc({ kind, id }: { kind: "invoice" | "quote"; id: string }) {
  const [doc, setDoc] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [buyer, setBuyer] = useState<any>(null);
  const [design, setDesign] = useState<PrintDesign>(DEFAULT_PRINT_DESIGN);
  const [autoQr, setAutoQr] = useState<string | null>(null);
  const [autoBarcode, setAutoBarcode] = useState<string | null>(null);

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
    const raw = subtotal + gst;
    // Prefer the round_off persisted on the saved header so the printed total
    // and the journal always tie. Fall back to the design-side toggle for
    // previews where the header is empty.
    let roundOff = Number((doc as any)?.round_off ?? 0);
    if (!roundOff && design?.roundOff && design.roundOff !== "off") {
      const target =
        design.roundOff === "up"   ? Math.ceil(raw)  :
        design.roundOff === "down" ? Math.floor(raw) :
                                     Math.round(raw);
      roundOff = +(target - raw).toFixed(2);
    }
    return { subtotal, gst, roundOff, total: +(raw + roundOff).toFixed(2) };
  }, [items, doc, design]);

  const sameState = !!(company?.state && buyer?.state && company.state.toLowerCase() === buyer.state.toLowerCase());
  const documentNo = doc?.invoice_no ?? doc?.quote_no ?? "";
  const title = kind === "invoice" ? "Tax Invoice" : "Quotation";
  const address = [company?.address, company?.state].filter(Boolean).join(", ");
  const partyAddress = [buyer?.address, buyer?.state].filter(Boolean).join(", ");
  const shipToText = (design.shipToOverride?.trim() || partyAddress || "Same as Bill-To");

  // HSN/SAC-wise tax summary (Tally style). Groups item taxable value and
  // splits CGST/SGST (intra-state) or IGST (inter-state) per HSN row.
  const hsnSummary = useMemo(() => {
    const map = new Map<string, { hsn: string; taxable: number; rate: number; tax: number }>();
    for (const it of items) {
      const hsn = String((it as any).hsn ?? (it as any).hsn_code ?? "—");
      const taxable = Number(it.qty || 0) * Number(it.rate || 0);
      const rate = Number(it.gst_pct ?? 0);
      const tax = taxable * rate / 100;
      const key = `${hsn}|${rate}`;
      const prev = map.get(key);
      if (prev) { prev.taxable += taxable; prev.tax += tax; }
      else map.set(key, { hsn, taxable, rate, tax });
    }
    return Array.from(map.values());
  }, [items]);

  // -----------------------------------------------------------------
  // Auto-generated codes (QR for digital copy / UPI pay, Code-128 barcode).
  // We recompute whenever inputs that affect the payload change.
  // -----------------------------------------------------------------
  const upiPayload = company?.upi_id && totals.total > 0
    ? upiPayString({
        upiId: company.upi_id,
        payeeName: company?.company_name ?? "StoneWorld Traders",
        amount: totals.total,
        note: documentNo,
      })
    : null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (design.qrMode === "off" || design.qrMode === "manual" || !documentNo) {
        if (!cancelled) setAutoQr(null);
        return;
      }
      const payload =
        design.qrMode === "upi-pay" && upiPayload
          ? upiPayload
          : digitalCopyUrl(documentNo);
      const url = await generateQrDataUrl(payload);
      if (!cancelled) setAutoQr(url);
    })();
    return () => { cancelled = true; };
  }, [design.qrMode, documentNo, upiPayload]);

  useEffect(() => {
    if (design.barcodeMode !== "auto" || !documentNo) { setAutoBarcode(null); return; }
    setAutoBarcode(generateBarcodeDataUrl(documentNo));
  }, [design.barcodeMode, documentNo]);

  const renderedQr =
    design.qrMode === "off"
      ? null
      : design.qrMode === "manual"
        ? design.qrCodeDataUrl ?? null
        : autoQr;
  const qrCaption =
    design.qrMode === "upi-pay" && upiPayload
      ? "Scan to pay via UPI"
      : design.qrMode === "digital-copy"
        ? "Scan for digital copy"
        : design.qrMode === "manual"
          ? "Scan to pay / verify"
          : null;
  const renderedBarcode =
    design.barcodeMode === "off"
      ? null
      : design.barcodeMode === "manual"
        ? design.barcodeDataUrl ?? null
        : autoBarcode;
  const qrPlacement = renderedQr ? design.qrPlacement : "hidden";
  const barcodePlacement = renderedBarcode ? design.barcodePlacement : "hidden";

  if (!doc) return <div className="text-sm text-muted-foreground p-4">Loading…</div>;

  const downloadPdf = async () => {
    const result = await lookupDocById(kind === "invoice" ? "sale" : "quote", id);
    if (result) {
      // Hand the rendered codes to the branded PDF exporter so the printed
      // PDF matches the on-screen preview byte-for-byte.
      exportStoneWorldDocument(result, company, {
        ...design,
        qrCodeDataUrl: renderedQr ?? design.qrCodeDataUrl ?? null,
        barcodeDataUrl: renderedBarcode ?? design.barcodeDataUrl ?? null,
      });
    }
  };

  const updateDesign = (next: PrintDesign) => { setDesign(next); savePrintDesign(next); };
  const updatePreset = (preset: PrintPreset) => updateDesign(applyPrintPreset(design, preset));
  const uploadLogo = async (file?: File) => { if (file) updateDesign({ ...design, logoDataUrl: await fileToDataUrl(file) }); };
  const uploadWatermarkLogo = async (file?: File) => { if (file) updateDesign({ ...design, watermarkLogoDataUrl: await fileToDataUrl(file) }); };
  const uploadQr = async (file?: File) => { if (file) updateDesign({ ...design, qrCodeDataUrl: await fileToDataUrl(file) }); };
  const uploadBarcode = async (file?: File) => { if (file) updateDesign({ ...design, barcodeDataUrl: await fileToDataUrl(file) }); };
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
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Preset</span>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.preset} onChange={(e) => updatePreset(e.target.value as PrintPreset)}>
                {(Object.keys(presetLabels) as PrintPreset[]).map((key) => <option key={key} value={key}>{presetLabels[key]}</option>)}
              </select>
            </label>
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
            <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Products layout</span>
              <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.productLayout} onChange={(e) => updateDesign({ ...design, productLayout: e.target.value as PrintProductLayout })}>
                {(Object.keys(productLayoutLabels) as PrintProductLayout[]).map((key) => <option key={key} value={key}>{productLayoutLabels[key]}</option>)}
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
            <label className="flex items-center gap-2 text-[11px]">
              <input type="checkbox" checked={design.footerOnEveryPage} onChange={(e) => updateDesign({ ...design, footerOnEveryPage: e.target.checked })} />
              <span>Print footer logos on every page (strict)</span>
            </label>
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

          <div className="rounded-md border border-border/60 p-2 space-y-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Document extras (pre-filled blocks)</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={design.showBankDetails} onChange={(e) => updateDesign({ ...design, showBankDetails: e.target.checked })} />
                <span>Show bank details (invoice)</span>
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={design.showUpi} onChange={(e) => updateDesign({ ...design, showUpi: e.target.checked })} />
                <span>Show UPI ID in bank block</span>
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={design.showGstSummary} onChange={(e) => updateDesign({ ...design, showGstSummary: e.target.checked })} />
                <span>Show GST breakdown (CGST/SGST/IGST)</span>
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={design.showHsnSummary} onChange={(e) => updateDesign({ ...design, showHsnSummary: e.target.checked })} />
                <span>Show HSN/SAC tax summary table</span>
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={design.showTaxInWords} onChange={(e) => updateDesign({ ...design, showTaxInWords: e.target.checked })} />
                <span>Show tax amount in words</span>
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={design.showShipTo} onChange={(e) => updateDesign({ ...design, showShipTo: e.target.checked })} />
                <span>Show Ship-To (Consignee) panel</span>
              </label>
              <label className="flex items-center gap-2 text-[11px]">
                <input type="checkbox" checked={design.showTransport} onChange={(e) => updateDesign({ ...design, showTransport: e.target.checked })} />
                <span>Show transport / dispatch panel</span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Round off grand total</span>
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.roundOff} onChange={(e) => updateDesign({ ...design, roundOff: e.target.value as any })}>
                  <option value="off">Off · show paise</option>
                  <option value="nearest">Nearest rupee (recommended)</option>
                  <option value="up">Always round up</option>
                  <option value="down">Always round down</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">QR code</span>
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.qrMode} onChange={(e) => updateDesign({ ...design, qrMode: e.target.value as any })}>
                  <option value="digital-copy">Auto · Digital copy link</option>
                  <option value="upi-pay" disabled={!company?.upi_id}>Auto · UPI scan &amp; pay{company?.upi_id ? "" : " (set UPI ID in Settings)"}</option>
                  <option value="manual">Manual upload</option>
                  <option value="off">Hide</option>
                </select>
                {design.qrMode === "manual" && (
                  <label className="h-8 rounded-md border bg-background px-2 text-xs flex items-center justify-between gap-2 cursor-pointer">
                    <span className="truncate">{design.qrCodeDataUrl ? "QR uploaded" : "Upload QR image"}</span>
                    <span className="text-primary">{design.qrCodeDataUrl ? "Replace" : "Upload"}</span>
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => uploadQr(e.target.files?.[0])} />
                  </label>
                )}
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.qrPlacement} onChange={(e) => updateDesign({ ...design, qrPlacement: e.target.value as PrintCodePlacement })} disabled={design.qrMode === "off"}>
                  {(Object.keys(codePlacementLabels) as PrintCodePlacement[]).map((key) => <option key={key} value={key}>{codePlacementLabels[key]}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Barcode</span>
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.barcodeMode} onChange={(e) => updateDesign({ ...design, barcodeMode: e.target.value as any })}>
                  <option value="auto">Auto · Code-128 of document no.</option>
                  <option value="manual">Manual upload</option>
                  <option value="off">Hide</option>
                </select>
                {design.barcodeMode === "manual" && (
                  <label className="h-8 rounded-md border bg-background px-2 text-xs flex items-center justify-between gap-2 cursor-pointer">
                    <span className="truncate">{design.barcodeDataUrl ? "Barcode uploaded" : "Upload barcode image"}</span>
                    <span className="text-primary">{design.barcodeDataUrl ? "Replace" : "Upload"}</span>
                    <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => uploadBarcode(e.target.files?.[0])} />
                  </label>
                )}
                <select className="h-8 rounded-md border bg-background px-2 text-xs" value={design.barcodePlacement} onChange={(e) => updateDesign({ ...design, barcodePlacement: e.target.value as PrintCodePlacement })} disabled={design.barcodeMode === "off"}>
                  {(Object.keys(codePlacementLabels) as PrintCodePlacement[]).map((key) => <option key={key} value={key}>{codePlacementLabels[key]}</option>)}
                </select>
              </label>
              <label className="sm:col-span-2 flex items-center gap-2 text-[11px]">
                <span className="w-28 text-muted-foreground">Signatory name</span>
                <input className="h-8 flex-1 rounded-md border bg-background px-2 text-xs" placeholder="Authorised Signatory" value={design.signatoryName ?? ""} onChange={(e) => updateDesign({ ...design, signatoryName: e.target.value })} />
              </label>
            </div>

            {(design.showShipTo || design.showTransport) && (
              <div className="grid gap-2 sm:grid-cols-2 pt-1 border-t border-border/40 mt-1">
                {design.showShipTo && (
                  <label className="sm:col-span-2 flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Ship-To address (leave blank to mirror Bill-To)</span>
                    <textarea rows={2} className="rounded-md border bg-background px-2 py-1.5 text-xs" placeholder="Consignee name, address, GSTIN…" value={design.shipToOverride ?? ""} onChange={(e) => updateDesign({ ...design, shipToOverride: e.target.value })} />
                  </label>
                )}
                {design.showTransport && (
                  <>
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Dispatch doc no.</span>
                      <input className="h-8 rounded-md border bg-background px-2 text-xs" value={design.dispatchDocNo ?? ""} onChange={(e) => updateDesign({ ...design, dispatchDocNo: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Dispatched through</span>
                      <input className="h-8 rounded-md border bg-background px-2 text-xs" placeholder="Transporter / courier" value={design.transporter ?? ""} onChange={(e) => updateDesign({ ...design, transporter: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Vehicle no.</span>
                      <input className="h-8 rounded-md border bg-background px-2 text-xs" value={design.vehicleNo ?? ""} onChange={(e) => updateDesign({ ...design, vehicleNo: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Destination</span>
                      <input className="h-8 rounded-md border bg-background px-2 text-xs" value={design.destination ?? ""} onChange={(e) => updateDesign({ ...design, destination: e.target.value })} />
                    </label>
                  </>
                )}
                <label className="sm:col-span-2 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Declaration / Terms (override)</span>
                  <textarea rows={2} className="rounded-md border bg-background px-2 py-1.5 text-xs" placeholder="Leave blank to use default T&C…" value={design.declaration ?? ""} onChange={(e) => updateDesign({ ...design, declaration: e.target.value })} />
                </label>
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
              {(qrPlacement === "header" || barcodePlacement === "header") && (
                <div className="mt-3 flex items-end justify-end gap-3">
                  {qrPlacement === "header" && renderedQr && <img src={renderedQr} alt="qr" className="h-16 w-16 object-contain" />}
                  {barcodePlacement === "header" && renderedBarcode && <img src={renderedBarcode} alt={`barcode ${documentNo}`} className="h-9 max-w-[150px] object-contain" />}
                </div>
              )}
            </div>
          </div>
          <div className="mt-5 h-px bg-slate-200" />
          <div className="mt-1 h-[2px] w-16 bg-[#00abb5]" />
        </header>

        <section className={`px-9 py-6 grid gap-10 ${design.showShipTo ? "md:grid-cols-3" : "grid-cols-2"}`}>
          <InfoPanel title={kind === "invoice" ? "Bill To (Buyer)" : "Quoted To"} rows={[
            ["Name", doc.buyer_name ?? buyer?.name ?? "—"],
            ["Address", partyAddress],
            ["State", stateWithCode(buyer?.state)],
            ["GSTIN", buyer?.gstin],
            ["Phone", buyer?.phone],
          ]} />
          {design.showShipTo && (
            <InfoPanel title="Ship To (Consignee)" rows={[
              ["Address", shipToText],
              ["State", stateWithCode(buyer?.state)],
              ["GSTIN", buyer?.gstin],
            ]} />
          )}
          <InfoPanel title={kind === "invoice" ? "Invoice Info" : "Quotation Info"} rows={[
            [kind === "invoice" ? "Invoice No" : "Quote No", documentNo],
            ["Date", fmtDate(doc.date)],
            ...(doc.valid_until ? [["Valid Until", fmtDate(doc.valid_until)] as [string, string]] : []),
            ["Place of Supply", stateWithCode(buyer?.state) || "—"],
            ["GST Treatment", sameState ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"],
            ["Reverse Charge", "No"],
          ]} />
        </section>

        {kind === "invoice" && design.showTransport && (design.dispatchDocNo || design.transporter || design.vehicleNo || design.destination) && (
          <section className="px-9 pb-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border border-slate-200 rounded p-3 text-[11px]">
              {design.dispatchDocNo && <div><div className="text-[9.5px] uppercase tracking-wide text-[#6e7886]">Dispatch Doc No.</div><div className="font-semibold text-[#111621] mt-0.5">{design.dispatchDocNo}</div></div>}
              {design.transporter && <div><div className="text-[9.5px] uppercase tracking-wide text-[#6e7886]">Dispatched through</div><div className="font-semibold text-[#111621] mt-0.5">{design.transporter}</div></div>}
              {design.vehicleNo && <div><div className="text-[9.5px] uppercase tracking-wide text-[#6e7886]">Vehicle No.</div><div className="font-semibold text-[#111621] mt-0.5 font-mono">{design.vehicleNo}</div></div>}
              {design.destination && <div><div className="text-[9.5px] uppercase tracking-wide text-[#6e7886]">Destination</div><div className="font-semibold text-[#111621] mt-0.5">{design.destination}</div></div>}
            </div>
          </section>
        )}

        <section className={`${design.bodyLayout === "dense" ? "px-8 pb-4" : design.bodyLayout === "spacious" ? "px-10 pb-7" : "px-9 pb-6"} relative`}>
          <ProductPrintTable items={items} layout={design.productLayout} density={design.bodyLayout} />

          <div className="mt-8 grid grid-cols-[1fr_260px] gap-10 items-start break-inside-avoid">
            <div className="text-[11px] leading-5 text-[#374050]">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">Amount in words</p>
              <p className="mt-1 font-semibold text-[#111621]">{amountInWords(totals.total)}</p>
              {kind === "invoice" && design.showBankDetails && (company?.bank_name || company?.bank_account_no || company?.bank_ifsc) && (
                <div className="mt-4">
                  <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">Bank Details</p>
                  <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                    {company?.bank_name && <><span className="text-[#6e7886]">Bank</span><span className="font-semibold">{company.bank_name}</span></>}
                    {company?.bank_account_no && <><span className="text-[#6e7886]">A/c No.</span><span className="font-mono font-semibold">{company.bank_account_no}</span></>}
                    {company?.bank_ifsc && <><span className="text-[#6e7886]">IFSC</span><span className="font-mono font-semibold">{company.bank_ifsc}</span></>}
                    {design.showUpi && company?.upi_id && <><span className="text-[#6e7886]">UPI</span><span className="font-mono font-semibold">{company.upi_id}</span></>}
                  </div>
                </div>
              )}
              {barcodePlacement === "terms" && renderedBarcode && (
                <div className="mt-4">
                  <img src={renderedBarcode} alt={`barcode ${documentNo}`} className="h-10 object-contain" />
                  <p className="mt-1 text-[9px] text-[#6e7886] tracking-wide">{documentNo}</p>
                </div>
              )}
              {qrPlacement === "terms" && renderedQr && (
                <div className="mt-4 inline-flex flex-col items-start">
                  <img src={renderedQr} alt="qr" className="h-20 w-20 object-contain" />
                  {qrCaption && <span className="text-[9px] text-[#6e7886] mt-1">{qrCaption}</span>}
                </div>
              )}
              {doc.notes && <p className="mt-4"><span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">Notes</span><br />{doc.notes}</p>}
              <p className="mt-4 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">{kind === "invoice" ? "Terms & Conditions" : "Terms of Proposal"}</p>
              <p className="mt-1 text-[10.5px] leading-4 text-[#6e7886]">{kind === "invoice"
                ? "Goods once sold will not be taken back. Interest @18% p.a. on overdue balances. Subject to local jurisdiction. E&OE."
                : "Prices valid until the date shown above. Quotation does not constitute a tax invoice. Stock and lot variation may apply. E&OE."}</p>
              {design.declaration && design.declaration.trim() && (
                <p className="mt-1 text-[10.5px] leading-4 text-[#374050] whitespace-pre-line">{design.declaration}</p>
              )}
            </div>
            <div className="text-[11.5px] relative">
              {qrPlacement === "totals" && renderedQr && (
                <div className="mb-3 flex flex-col items-end">
                  <img src={renderedQr} alt="qr" className="h-24 w-24 object-contain" />
                  {qrCaption && <span className="text-[9px] text-[#6e7886] mt-1">{qrCaption}</span>}
                </div>
              )}
              {barcodePlacement === "totals" && renderedBarcode && (
                <div className="mb-3 flex flex-col items-end">
                  <img src={renderedBarcode} alt={`barcode ${documentNo}`} className="h-10 max-w-[180px] object-contain" />
                  <span className="text-[9px] text-[#6e7886] mt-1">{documentNo}</span>
                </div>
              )}
              <SummaryLine label="Subtotal" value={totals.subtotal} />
              {design.showGstSummary && (sameState ? <><SummaryLine label="CGST" value={totals.gst / 2} /><SummaryLine label="SGST" value={totals.gst / 2} /></> : <SummaryLine label="IGST" value={totals.gst} />)}
              {Math.abs(totals.roundOff) > 0.0001 && (
                <SummaryLine label={totals.roundOff > 0 ? "Round Off (+)" : "Round Off (−)"} value={Math.abs(totals.roundOff)} />
              )}
              <div className="border-t-2 border-[#111621] mt-1 pt-2 flex justify-between items-baseline">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Grand Total</span>
                <span className="tabular-nums font-bold text-[15px]">{inr(totals.total)}</span>
              </div>
            </div>
          </div>

          {kind === "invoice" && design.showHsnSummary && hsnSummary.length > 0 && (
            <div className="mt-6 break-inside-avoid">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886] mb-2">HSN/SAC tax summary</p>
              <table className="w-full border-collapse text-[10.5px] leading-4 border border-slate-200">
                <thead className="bg-slate-50 text-[#6e7886] uppercase text-[9px] tracking-[0.08em]">
                  <tr>
                    <th className="text-left py-1.5 px-2 border-b border-slate-200 font-bold">HSN/SAC</th>
                    <th className="text-right py-1.5 px-2 border-b border-slate-200 font-bold">Taxable Value</th>
                    {sameState ? (
                      <>
                        <th className="text-center py-1.5 px-2 border-b border-slate-200 font-bold" colSpan={2}>CGST</th>
                        <th className="text-center py-1.5 px-2 border-b border-slate-200 font-bold" colSpan={2}>SGST</th>
                      </>
                    ) : (
                      <th className="text-center py-1.5 px-2 border-b border-slate-200 font-bold" colSpan={2}>IGST</th>
                    )}
                    <th className="text-right py-1.5 px-2 border-b border-slate-200 font-bold">Total Tax</th>
                  </tr>
                  <tr className="text-[9px]">
                    <th></th><th></th>
                    {sameState ? (<><th className="text-center py-1 px-2 border-b border-slate-200">Rate</th><th className="text-right py-1 px-2 border-b border-slate-200">Amount</th><th className="text-center py-1 px-2 border-b border-slate-200">Rate</th><th className="text-right py-1 px-2 border-b border-slate-200">Amount</th></>) : (<><th className="text-center py-1 px-2 border-b border-slate-200">Rate</th><th className="text-right py-1 px-2 border-b border-slate-200">Amount</th></>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {hsnSummary.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 font-mono">{r.hsn}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.taxable, 2)}</td>
                      {sameState ? (
                        <>
                          <td className="py-1.5 px-2 text-center tabular-nums">{fmt(r.rate / 2, r.rate % 2 === 0 ? 0 : 2)}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.tax / 2, 2)}</td>
                          <td className="py-1.5 px-2 text-center tabular-nums">{fmt(r.rate / 2, r.rate % 2 === 0 ? 0 : 2)}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.tax / 2, 2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="py-1.5 px-2 text-center tabular-nums">{fmt(r.rate, r.rate % 1 === 0 ? 0 : 2)}%</td>
                          <td className="py-1.5 px-2 text-right tabular-nums">{fmt(r.tax, 2)}</td>
                        </>
                      )}
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmt(r.tax, 2)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold">
                    <td className="py-1.5 px-2">Total</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(totals.subtotal, 2)}</td>
                    {sameState ? (
                      <><td></td><td className="py-1.5 px-2 text-right tabular-nums">{fmt(totals.gst / 2, 2)}</td><td></td><td className="py-1.5 px-2 text-right tabular-nums">{fmt(totals.gst / 2, 2)}</td></>
                    ) : (
                      <><td></td><td className="py-1.5 px-2 text-right tabular-nums">{fmt(totals.gst, 2)}</td></>
                    )}
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(totals.gst, 2)}</td>
                  </tr>
                </tbody>
              </table>
              {design.showTaxInWords && totals.gst > 0 && (
                <p className="mt-2 text-[10.5px] text-[#374050]"><span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#6e7886]">Tax amount in words: </span><span className="font-semibold text-[#111621]">{amountInWords(totals.gst)}</span></p>
              )}
            </div>
          )}

          {design.footerPosition === "above-signature" && !design.footerOnEveryPage && footerLogoBlock}
          <div className="mt-14 grid grid-cols-2 text-[11px] text-[#6e7886] break-inside-avoid">
            <div>Thank you for your business.</div>
            <div className="text-right">For {company?.company_name ?? "StoneWorld Traders"}<br /><br /><br /><span className="border-t border-slate-400 pt-2 inline-block min-w-[180px] font-semibold text-[#111621]">{design.signatoryName?.trim() || "Authorised Signatory"}</span></div>
          </div>
          {(design.footerPosition === "page-bottom" || design.footerOnEveryPage) && footerLogoBlock}
        </section>
      </article>

      <style>{`@media print { @page { size: A4; margin: 14mm 12mm 22mm 12mm; } body { background: white !important; } .print\\:hidden { display: none !important; } #print-area { width: 186mm; } .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; } tr, .sw-row { page-break-inside: avoid; } thead { display: table-header-group; } tfoot { display: table-footer-group; } }`}</style>
    </div>
  );
}

function ProductPrintTable({ items, layout, density }: { items: any[]; layout: PrintProductLayout; density: PrintDesign["bodyLayout"] }) {
  const padY = density === "dense" ? "py-2" : density === "spacious" ? "py-3.5" : "py-3";
  const th = "py-2 px-2 border-b-2 border-[#111621] border-t border-slate-200 font-bold";
  const td = `${padY} px-2`;

  if (layout === "compact") {
    return (
      <table className="w-full border-collapse text-[11.5px] leading-4">
        <thead><tr className="text-[#6e7886] uppercase text-[9.5px] tracking-[0.08em]"><th className={`text-center w-7 ${th}`}>#</th><th className={`text-left ${th}`}>Description</th><th className={`text-right w-16 ${th}`}>Qty</th><th className={`text-right w-20 ${th}`}>Rate</th><th className={`text-right w-24 ${th}`}>Amount</th></tr></thead>
        <tbody>{items.map((it, i) => { const base = Number(it.qty || 0) * Number(it.rate || 0); return <tr key={i} className="border-b border-slate-100 break-inside-avoid align-top"><td className={`${td} text-center text-[#6e7886] tabular-nums`}>{i + 1}</td><td className={`${td} font-semibold text-[#111621]`}>{it.product_name ?? "—"}<div className="mt-0.5 text-[10px] font-normal text-[#6e7886]">{[(it as any).hsn && `HSN ${(it as any).hsn}`, it.unit].filter(Boolean).join(" · ")}</div></td><td className={`${td} text-right tabular-nums`}>{fmt(it.qty)} {it.unit ?? ""}</td><td className={`${td} text-right tabular-nums`}>{fmt(it.rate)}</td><td className={`${td} text-right tabular-nums font-bold text-[#111621]`}>{fmt(base)}</td></tr>; })}</tbody>
      </table>
    );
  }

  if (layout === "tax-detail") {
    return (
      <table className="w-full border-collapse text-[11px] leading-4">
        <thead><tr className="text-[#6e7886] uppercase text-[9px] tracking-[0.08em]"><th className={`text-center w-7 ${th}`}>#</th><th className={`text-left ${th}`}>Description</th><th className={`text-center w-14 ${th}`}>HSN</th><th className={`text-right w-14 ${th}`}>Qty</th><th className={`text-right w-18 ${th}`}>Taxable</th><th className={`text-right w-12 ${th}`}>GST</th><th className={`text-right w-18 ${th}`}>Tax</th><th className={`text-right w-22 ${th}`}>Total</th></tr></thead>
        <tbody>{items.map((it, i) => { const base = Number(it.qty || 0) * Number(it.rate || 0); const tax = base * Number(it.gst_pct ?? 0) / 100; return <tr key={i} className="border-b border-slate-100 break-inside-avoid align-top"><td className={`${td} text-center text-[#6e7886] tabular-nums`}>{i + 1}</td><td className={`${td} font-semibold text-[#111621]`}>{it.product_name ?? "—"}<div className="mt-0.5 text-[10px] font-normal text-[#6e7886]">{fmt(it.qty)} {it.unit ?? ""} × {fmt(it.rate)}</div></td><td className={`${td} text-center text-[#6e7886] font-mono text-[10px]`}>{(it as any).hsn ?? (it as any).hsn_code ?? "—"}</td><td className={`${td} text-right tabular-nums`}>{fmt(it.qty)}</td><td className={`${td} text-right tabular-nums`}>{fmt(base)}</td><td className={`${td} text-right tabular-nums text-[#6e7886]`}>{fmt(it.gst_pct, Number(it.gst_pct ?? 0) % 1 === 0 ? 0 : 2)}%</td><td className={`${td} text-right tabular-nums`}>{fmt(tax)}</td><td className={`${td} text-right tabular-nums font-bold text-[#111621]`}>{fmt(base + tax)}</td></tr>; })}</tbody>
      </table>
    );
  }

  return (
    <table className="w-full border-collapse text-[11.5px] leading-4">
      <thead><tr className="text-[#6e7886] uppercase text-[9.5px] tracking-[0.08em]"><th className={`text-center w-7 ${th}`}>#</th><th className={`text-left ${th}`}>Description</th><th className={`text-center w-16 ${th}`}>HSN</th><th className={`text-right w-12 ${th}`}>Qty</th><th className={`text-center w-12 ${th}`}>Unit</th><th className={`text-right w-20 ${th}`}>Rate</th><th className={`text-right w-12 ${th}`}>GST</th><th className={`text-right w-24 ${th}`}>Amount</th></tr></thead>
      <tbody>{items.map((it, i) => { const base = Number(it.qty || 0) * Number(it.rate || 0); return <tr key={i} className="border-b border-slate-100 break-inside-avoid align-top"><td className={`${td} text-center text-[#6e7886] tabular-nums`}>{i + 1}</td><td className={`${td} font-semibold text-[#111621]`}>{it.product_name ?? "—"}</td><td className={`${td} text-center text-[#6e7886] font-mono text-[10.5px]`}>{(it as any).hsn ?? (it as any).hsn_code ?? "—"}</td><td className={`${td} text-right tabular-nums`}>{fmt(it.qty)}</td><td className={`${td} text-center text-[#6e7886]`}>{it.unit ?? "—"}</td><td className={`${td} text-right tabular-nums`}>{fmt(it.rate)}</td><td className={`${td} text-right tabular-nums text-[#6e7886]`}>{fmt(it.gst_pct, Number(it.gst_pct ?? 0) % 1 === 0 ? 0 : 2)}%</td><td className={`${td} text-right tabular-nums font-bold text-[#111621]`}>{fmt(layout === "description-first" ? base * (1 + Number(it.gst_pct ?? 0) / 100) : base)}</td></tr>; })}</tbody>
    </table>
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