import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmt, fmtDate, todayISO } from "@/lib/format";
import swLogo from "@/assets/sw-logo.png";
import type { DocLookupResult } from "@/lib/doc-lookup";
import { imageFormat, type PrintDesign } from "@/lib/print-customizer";
import { amountInWords } from "@/lib/amount-words";

export type PdfRgb = [number, number, number];

export const swPdf = {
  teal: [0, 171, 181] as PdfRgb,
  tealDark: [0, 126, 135] as PdfRgb,
  ink: [17, 22, 33] as PdfRgb,
  inkSoft: [55, 64, 80] as PdfRgb,
  muted: [110, 120, 134] as PdfRgb,
  faint: [232, 236, 242] as PdfRgb,
  soft: [248, 250, 252] as PdfRgb,
  rule: [220, 226, 234] as PdfRgb,
};

function hexToRgb(hex?: string | null): PdfRgb {
  if (!hex || typeof hex !== "string") return swPdf.teal;
  const m = hex.replace("#", "").trim();
  if (m.length !== 6) return swPdf.teal;
  const n = parseInt(m, 16);
  if (!isFinite(n)) return swPdf.teal;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type PdfCompany = {
  company_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  state?: string | null;
  pan?: string | null;
  owner_name?: string | null;
  bank_name?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
  upi_id?: string | null;
};

export type PdfDocMeta = {
  title: string;
  subtitle?: string | null;
  reference?: string | null;
  date?: string | null;
  validUntil?: string | null;
};

export const pdfMoney = (value: number | null | undefined) => `Rs. ${fmt(value, 2)}`;
export const pdfPct = (value: number | null | undefined) => {
  const n = Number(value ?? 0);
  return `${fmt(n, n % 1 === 0 ? 0 : 2)}%`;
};

export function newStoneWorldPdf() {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setFont("helvetica", "normal");
  doc.setProperties({
    creator: "StoneWorld Traders",
    subject: "StoneWorld branded business document",
  });
  return doc;
}

export function drawStoneWorldHeader(
  doc: jsPDF,
  company: PdfCompany | null | undefined,
  meta: PdfDocMeta,
  top = 30,
  design?: Partial<PrintDesign>,
) {
  const W = doc.internal.pageSize.getWidth();
  const marginScale =
    design?.pageMargin === "compact" ? 26 : design?.pageMargin === "wide" ? 52 : 36;
  const M = marginScale;
  const co = company ?? {};
  const name = co.company_name || "StoneWorld Traders";
  const accent = hexToRgb(design?.accent);
  const fs = Math.max(0.85, Math.min(1.2, Number(design?.fontScale ?? 1)));
  const lh =
    design?.lineHeight === "tight" ? 0.92 : design?.lineHeight === "relaxed" ? 1.12 : 1;
  const logoPos = design?.logoPosition ?? "left";

  // Minimal, editorial-style header. Thin teal accent rule only.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 130, "F");

  // Title — placement flips based on logo position so they never collide
  const titleAlign: "left" | "right" | "center" =
    logoPos === "right" ? "left" : logoPos === "center" ? "center" : "right";
  const titleX = titleAlign === "left" ? M : titleAlign === "center" ? W / 2 : W - M;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(22 * fs)
    .setTextColor(...swPdf.ink);
  doc.text(meta.title.toUpperCase(), titleX, top + 14, { align: titleAlign });
  if (meta.subtitle) {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(8 * fs)
      .setTextColor(...swPdf.muted);
    doc.text(String(meta.subtitle).toUpperCase(), titleX, top + 28, { align: titleAlign });
  }

  // Logo + company block — anchor swaps with logoPosition
  const logoSize = 46;
  const logoX =
    logoPos === "center" ? (W - logoSize) / 2 : logoPos === "right" ? W - M - logoSize : M;
  try {
    doc.addImage(
      design?.logoDataUrl || swLogo,
      imageFormat(design?.logoDataUrl) as any,
      logoX,
      top,
      logoSize,
      logoSize,
    );
  } catch {}
  const companyAlign: "left" | "right" | "center" =
    logoPos === "right" ? "right" : logoPos === "center" ? "center" : "left";
  const companyAnchorX =
    logoPos === "right"
      ? logoX - 8
      : logoPos === "center"
        ? W / 2
        : M + logoSize + 12;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(14 * fs)
    .setTextColor(...swPdf.ink);
  doc.text(name, companyAnchorX, top + 14, { maxWidth: 280, align: companyAlign });
  doc
    .setFont("helvetica", "normal")
    .setFontSize(8 * fs)
    .setTextColor(...swPdf.inkSoft);
  const address = [co.address, co.state].filter(Boolean).join(", ");
  const addressLines = address ? doc.splitTextToSize(address, 290).slice(0, 2) : [];
  if (addressLines.length) doc.text(addressLines, companyAnchorX, top + 27, { align: companyAlign });
  const contactLine = [
    co.phone && `Tel: ${co.phone}`,
    co.email,
    co.gstin && `GSTIN ${co.gstin}`,
    co.pan && `PAN ${co.pan}`,
  ]
    .filter(Boolean)
    .join("   ·   ");
  if (contactLine)
    doc.text(
      doc.splitTextToSize(contactLine, 290).slice(0, 2),
      companyAnchorX,
      top + (addressLines.length > 1 ? 49 : 41),
      { align: companyAlign },
    );

  // Meta lines under title
  doc
    .setFont("helvetica", "normal")
    .setFontSize(8.5 * fs)
    .setTextColor(...swPdf.inkSoft);
  const metaLines: Array<[string, string]> = [];
  if (meta.reference) metaLines.push(["No.", String(meta.reference)]);
  if (meta.date) metaLines.push(["Date", fmtDate(meta.date)]);
  if (meta.validUntil) metaLines.push(["Valid", fmtDate(meta.validUntil)]);
  // When the title is right-aligned, keep meta on the right; otherwise place
  // meta opposite the title to balance the masthead.
  const metaRight = titleAlign !== "left";
  const metaStep = 12 * lh;
  metaLines.slice(0, 3).forEach(([k, v], i) => {
    const y = top + 44 + i * metaStep;
    doc.setFont("helvetica", "normal").setTextColor(...swPdf.muted);
    if (metaRight) {
      doc.text(k, W - M - 110, y);
      doc.setFont("helvetica", "bold").setTextColor(...swPdf.ink);
      doc.text(v, W - M, y, { align: "right" });
    } else {
      doc.text(k, M, y);
      doc.setFont("helvetica", "bold").setTextColor(...swPdf.ink);
      doc.text(v, M + 110, y, { align: "right" });
    }
  });

  const qr = design?.qrPlacement === "header" ? design?.qrCodeDataUrl : null;
  const barcode = design?.barcodePlacement === "header" ? design?.barcodeDataUrl : null;
  // Apple-style: pack header codes tightly under the meta column so the rule
  // never floats far below the title (the previous 138pt rule left a huge
  // empty band between the header and the Bill-To block).
  const hasCodes = !!(qr || barcode);
  const metaCount = [meta.reference, meta.date, meta.validUntil].filter(Boolean).length;
  const metaBottom = top + 44 + Math.max(0, metaCount - 1) * metaStep + 4;
  let ruleY = Math.max(top + 64, metaBottom);
  if (hasCodes) {
    const codeTop = metaBottom + 6;
    const codeAnchorRight = metaRight ? W - M : M; // place codes near the meta column
    if (barcode) {
      try {
        const bx = metaRight ? codeAnchorRight - 96 : codeAnchorRight;
        doc.addImage(barcode, imageFormat(barcode) as any, bx, codeTop, 96, 18);
      } catch {}
    }
    if (qr) {
      try {
        const qx = metaRight
          ? codeAnchorRight - (barcode ? 124 : 28)
          : codeAnchorRight + (barcode ? 100 : 0);
        doc.addImage(qr, imageFormat(qr) as any, qx, codeTop - 2, 26, 26);
      } catch {}
    }
    ruleY = codeTop + 24;
  }

  // Header divider — honours headerDividerStyle (solid / dashed / double /
  // accent / none) so users can tune the masthead separator independently.
  const div = design?.headerDividerStyle ?? "solid";
  if (div !== "none") {
    if (div === "accent") {
      doc.setDrawColor(...accent).setLineWidth(0.9);
      doc.line(M, ruleY, W - M, ruleY);
    } else if (div === "double") {
      doc.setDrawColor(...swPdf.rule).setLineWidth(0.4);
      doc.line(M, ruleY, W - M, ruleY);
      doc.line(M, ruleY + 2.4, W - M, ruleY + 2.4);
      ruleY += 2.4;
    } else if (div === "dashed") {
      doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
      const dx = 3;
      for (let x = M; x < W - M; x += dx * 2) {
        doc.line(x, ruleY, Math.min(x + dx, W - M), ruleY);
      }
    } else {
      doc.setDrawColor(...swPdf.rule).setLineWidth(0.4);
      doc.line(M, ruleY, W - M, ruleY);
    }
  }
  // Reference the accent so the unused-variable lint stays quiet; intentionally
  // referenced above only when the "accent" divider is selected.
  void accent;
  return { margin: M, y: ruleY + Math.round(22 * lh) };
}

export function drawStoneWorldFooter(
  doc: jsPDF,
  company: PdfCompany | null | undefined,
  margin = 34,
  opts: { showPageNumber?: boolean; hideCompanyName?: boolean } = {},
) {
  const pageCount = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const name = company?.company_name || "StoneWorld Traders";
  // Page number only makes sense when there's more than one page.
  const showPageNumber = opts.showPageNumber !== false && pageCount > 1;
  const hideCompanyName = !!opts.hideCompanyName;
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    if (!hideCompanyName || showPageNumber) {
      doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
      doc.line(margin, H - 36, W - margin, H - 36);
    }
    doc
      .setFont("helvetica", "normal")
      .setFontSize(8)
      .setTextColor(...swPdf.muted);
    if (!hideCompanyName) doc.text(name, margin, H - 21);
    if (showPageNumber) {
      doc.text(`Page ${page} of ${pageCount}`, W - margin, H - 21, { align: "right" });
    }
  }
}

export function drawCustomWatermark(
  doc: jsPDF,
  text?: string | null,
  opacityPct: number = 35,
  layer: "back" | "front" = "back",
  logoDataUrl?: string | null,
  logoScalePct: number = 55,
) {
  if (!text && !logoDataUrl) return;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  const alpha = Math.max(0, Math.min(100, opacityPct)) / 100;
  const supportsGState = typeof (doc as any).GState === "function";
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    if (supportsGState) {
      const gs = new (doc as any).GState({ opacity: alpha });
      (doc as any).setGState(gs);
    }
    if (logoDataUrl) {
      const size = Math.max(
        120,
        Math.min(W - 80, (W * Math.max(20, Math.min(90, logoScalePct))) / 100),
      );
      try {
        doc.addImage(
          logoDataUrl,
          imageFormat(logoDataUrl) as any,
          (W - size) / 2,
          (H - size) / 2,
          size,
          size,
        );
      } catch {}
    }
    if (text) {
      const gray = supportsGState ? 90 : Math.round(255 - alpha * 200);
      doc.setFont("helvetica", "bold").setFontSize(72).setTextColor(gray, gray, gray);
      if (!supportsGState && layer === "front")
        doc.setTextColor(Math.max(0, gray - 60), Math.max(0, gray - 60), Math.max(0, gray - 60));
      doc.text(String(text).toUpperCase().slice(0, 24), W / 2, H / 2, {
        align: "center",
        angle: -26,
      });
    }
    if (supportsGState) {
      (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
    }
  }
}

export function drawFooterBrandLogos(
  doc: jsPDF,
  logos: string[] | undefined,
  margin = 34,
  opts: {
    rows?: 1 | 2 | 3;
    logoHeightPx?: number;
    position?: "above-signature" | "page-bottom";
    signatureY?: number;
    everyPage?: boolean;
    dividerStyle?: "solid" | "dashed" | "double" | "accent" | "none";
    accent?: PdfRgb;
  } = {},
) {
  if (!logos?.length) return;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const count = Math.min(20, logos.length);
  const rows = Math.max(1, Math.min(3, opts.rows ?? 1));
  const cols = Math.max(1, Math.ceil(count / rows));
  const cellW = (W - margin * 2) / cols;
  // Uniform logo size: convert px (HTML) to pt approximation (1px ≈ 0.75pt).
  const cellH = Math.max(10, Math.round((opts.logoHeightPx ?? 36) * 0.6));
  const totalH = rows * (cellH + 6);
  const position = opts.position ?? "above-signature";
  const everyPage = opts.everyPage ?? false;
  const divider = opts.dividerStyle ?? "solid";
  const startYOnPage = (pageIndex: number, pageCount: number) => {
    const isLast = pageIndex === pageCount;
    if (everyPage || position === "page-bottom") return H - 56 - totalH;
    return isLast ? Math.max(margin + 80, (opts.signatureY ?? H - 100) - totalH - 8) : -9999;
  };
  const pageCount = doc.getNumberOfPages();
  const pagesToRun = everyPage ? Array.from({ length: pageCount }, (_, i) => i + 1) : [pageCount];
  for (const page of pagesToRun) {
    doc.setPage(page);
    const startY = startYOnPage(page, pageCount);
    if (startY < 0) continue;
    // Thin divider above the brand logo strip.
    if (divider !== "none") {
      const yLine = startY - 8;
      if (divider === "accent" && opts.accent) {
        doc.setDrawColor(...opts.accent).setLineWidth(1.1);
        doc.line(margin, yLine, W - margin, yLine);
      } else if (divider === "dashed") {
        doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
        (doc as any).setLineDashPattern?.([2, 2], 0);
        doc.line(margin, yLine, W - margin, yLine);
        (doc as any).setLineDashPattern?.([], 0);
      } else if (divider === "double") {
        doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
        doc.line(margin, yLine - 1.5, W - margin, yLine - 1.5);
        doc.line(margin, yLine + 1.5, W - margin, yLine + 1.5);
      } else {
        doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
        doc.line(margin, yLine, W - margin, yLine);
      }
    }
    logos.slice(0, count).forEach((logo, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const wPt = Math.min(cellW - 6, cellH * 2.4);
      const x = margin + c * cellW + cellW / 2 - wPt / 2;
      const y = startY + r * (cellH + 6);
      try {
        doc.addImage(logo, imageFormat(logo) as any, x, y, wPt, cellH);
      } catch {}
    });
  }
}

export function ensurePdfSpace(doc: jsPDF, y: number, needed: number, margin = 34, footer = 58) {
  const H = doc.internal.pageSize.getHeight();
  if (y + needed <= H - footer) return y;
  doc.addPage();
  return margin;
}

export function drawKeyValuePanel(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  title: string,
  rows: Array<[string, string | null | undefined]>,
  height = 92,
) {
  // Minimal: no fill, top thin rule, label-stack rows
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.4);
  doc.line(x, y, x + w, y);
  doc
    .setFont("helvetica", "bold")
    .setFontSize(7.5)
    .setTextColor(...swPdf.muted);
  doc.text(title.toUpperCase(), x, y + 14, { charSpace: 0.6 } as any);
  let cy = y + 30;
  for (const [label, value] of rows.filter(([, v]) => v)) {
    doc
      .setFont("helvetica", "normal")
      .setFontSize(7.5)
      .setTextColor(...swPdf.muted);
    doc.text(label, x, cy);
    doc
      .setFont("helvetica", "bold")
      .setFontSize(9)
      .setTextColor(...swPdf.ink);
    const lines = doc.splitTextToSize(String(value), w).slice(0, 2);
    doc.text(lines, x, cy + 11);
    cy += 12 + Math.max(11, lines.length * 11);
    if (cy > y + height - 4) break;
  }
  return y + height;
}

export function drawTotalsBlock(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  rows: Array<[string, string]>,
  totalLabel: string,
  totalValue: string,
) {
  // Minimal totals: borderless rows + single thick rule + grand total
  rows.forEach(([label, value], i) => {
    const cy = y + 12 + i * 16;
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9)
      .setTextColor(...swPdf.muted);
    doc.text(label, x, cy);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(9)
      .setTextColor(...swPdf.ink);
    doc.text(value, x + w, cy, { align: "right" });
  });
  const gy = y + 12 + rows.length * 16 + 4;
  doc.setDrawColor(...swPdf.ink).setLineWidth(0.7);
  doc.line(x, gy, x + w, gy);
  doc
    .setFont("helvetica", "bold")
    .setFontSize(11)
    .setTextColor(...swPdf.ink);
  doc.text(totalLabel, x, gy + 16);
  doc.text(totalValue, x + w, gy + 16, { align: "right" });
  doc.setDrawColor(...swPdf.ink).setLineWidth(0.4);
  doc.line(x, gy + 22, x + w, gy + 22);
}

export function stoneWorldTable(doc: jsPDF, options: Parameters<typeof autoTable>[1]) {
  const margin = typeof options.margin === "object" ? options.margin : {};
  const { margin: _margin, styles, headStyles, alternateRowStyles, bodyStyles, ...rest } = options;
  return autoTable(doc, {
    theme: "plain",
    margin: { left: 36, right: 36, bottom: 58, ...margin },
    styles: {
      font: "helvetica",
      fontSize: 8.6,
      cellPadding: { top: 8, right: 6, bottom: 8, left: 6 },
      textColor: swPdf.ink,
      lineColor: swPdf.faint,
      lineWidth: 0,
      overflow: "linebreak",
      valign: "top",
      minCellHeight: 22,
      ...(styles ?? {}),
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: swPdf.muted,
      fontStyle: "bold",
      fontSize: 7.4,
      lineColor: swPdf.ink,
      lineWidth: 0,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 },
      ...(headStyles ?? {}),
    },
    alternateRowStyles: { fillColor: [255, 255, 255], ...(alternateRowStyles ?? {}) },
    bodyStyles: { lineColor: swPdf.faint, lineWidth: 0, ...(bodyStyles ?? {}) },
    didDrawCell: (data: any) => {
      // Draw bottom hairline under each body row, and top/bottom rules around header
      const d: any = data;
      const x = d.cell.x;
      const y = d.cell.y;
      const w = d.cell.width;
      const h = d.cell.height;
      if (d.section === "head") {
        doc.setDrawColor(...swPdf.ink).setLineWidth(0.6);
        doc.line(x, y, x + w, y);
        doc.setDrawColor(...swPdf.rule).setLineWidth(0.4);
        doc.line(x, y + h, x + w, y + h);
      } else if (d.section === "body") {
        doc.setDrawColor(...swPdf.faint).setLineWidth(0.3);
        doc.line(x, y + h, x + w, y + h);
      }
      if (typeof options.didDrawCell === "function") options.didDrawCell(data);
    },
    ...rest,
  });
}

export function defaultTerms(documentName = "document") {
  return `Rates are prepared for the named customer and valid only for the stated period. GST, loading, transport, installation, cutting, wastage and any statutory charges apply as mentioned in this ${documentName}. Supply is subject to stock availability, shade/lot variation and final confirmation. E&OE.`;
}

export function issuedOn() {
  return fmtDate(todayISO());
}

export function exportStoneWorldDocument(
  result: DocLookupResult,
  company: PdfCompany | null | undefined,
  design?: Partial<PrintDesign>,
) {
  const doc = newStoneWorldPdf();
  const W = doc.internal.pageSize.getWidth();
  const isQuote = result.kind === "quote";
  const docLabel =
    result.kind === "sale"
      ? "Tax Invoice"
      : isQuote
        ? "Quotation"
        : result.kind === "purchase"
          ? "Purchase Bill"
          : "Third Party Bill";
  const footerLogos = design?.footerLogos ?? [];
  const footerRows = (design?.footerRows ?? 1) as 1 | 2 | 3;
  const footerEvery = (design?.footerOnEveryPage ?? true) && footerLogos.length > 0;
  const footerLogoSize = design?.footerLogoSize ?? 36;
  const reservedFooter = footerEvery ? 66 + Math.round(footerLogoSize * 0.6) * footerRows + 18 : 66;
  const { margin: M, y } = drawStoneWorldHeader(
    doc,
    company,
    {
      title: docLabel,
      subtitle:
        result.kind === "sale"
          ? "Original for Recipient"
          : isQuote
            ? "Proposal · Not a tax invoice"
            : result.kind.toUpperCase(),
      reference:
        result.header.invoice_no ??
        result.header.quote_no ??
        result.header.po_no ??
        result.header.tp_no,
      date: result.header.date,
      validUntil: result.header.valid_until,
    },
    30,
    design,
  );
  const no =
    result.header.invoice_no ??
    result.header.quote_no ??
    result.header.po_no ??
    result.header.tp_no;
  const sameState = !!(
    company?.state &&
    result.party?.state &&
    String(company.state).toLowerCase() === String(result.party.state).toLowerCase()
  );
  const accent = hexToRgb(design?.accent);
  const qrPlacement = design?.qrCodeDataUrl ? (design.qrPlacement ?? "totals") : "hidden";
  const barcodePlacement = design?.barcodeDataUrl ? (design.barcodePlacement ?? "terms") : "hidden";
  const panelW = (W - M * 2 - 18) / 2;
  const partyTitle = result.kind === "purchase" ? "Supplier" : isQuote ? "Quoted To" : "Bill To";
  drawKeyValuePanel(
    doc,
    M,
    y,
    panelW,
    partyTitle,
    [
      ["Name", result.header.buyer_name ?? result.header.supplier_name ?? result.party?.name],
      ["Address", result.party?.address],
      ["State", result.party?.state],
      ["GSTIN", result.party?.gstin],
      ["Phone", result.party?.phone],
    ],
    124,
  );
  drawKeyValuePanel(
    doc,
    M + panelW + 18,
    y,
    panelW,
    isQuote ? "Quotation Info" : "Invoice Info",
    [
      [isQuote ? "Quote No" : "Invoice No", no],
      ["Date", fmtDate(result.header.date)],
      ...(isQuote && result.header.valid_until
        ? [["Valid Until", fmtDate(result.header.valid_until)] as [string, string]]
        : []),
      ["Place of Supply", result.party?.state ?? "—"],
      ["GST Treatment", sameState ? "Intra-state (CGST + SGST)" : "Inter-state (IGST)"],
      ["Reverse Charge", "No"],
      ...(!isQuote && result.outstanding?.status
        ? [["Status", result.outstanding.status] as [string, string]]
        : []),
    ],
    124,
  );

  const productHead = [["#", "Description", "HSN/SAC", "Qty", "Unit", "Rate", "GST", "Amount"]];
  const productBody = result.items.map((it, i) => {
    const rate = Number(it.sale_rate ?? it.rate ?? 0);
    const qty = Number(it.qty ?? 0);
    const taxable = qty * rate;
    const name = it.product_name ?? "-";
    const hsn = it.hsn ?? it.hsn_code ?? "—";
    return [
      String(i + 1),
      name,
      String(hsn),
      fmt(qty),
      it.unit ?? "—",
      pdfMoney(rate),
      pdfPct(it.gst_pct),
      pdfMoney(taxable),
    ];
  });
  stoneWorldTable(doc, {
    startY: y + 140,
    margin: { left: M, right: M, top: 58, bottom: reservedFooter },
    head: productHead,
    body: productBody,
    columnStyles: {
      0: { halign: "center", cellWidth: 22, textColor: swPdf.muted },
      1: { cellWidth: "auto", fontStyle: "bold", minCellWidth: 130 },
      2: { halign: "center", cellWidth: 56, textColor: swPdf.muted, font: "courier", fontSize: 8 },
      3: { halign: "right", cellWidth: 40 },
      4: { halign: "center", cellWidth: 36, textColor: swPdf.muted },
      5: { halign: "right", cellWidth: 62 },
      6: { halign: "right", cellWidth: 36, textColor: swPdf.muted },
      7: { halign: "right", cellWidth: 74, fontStyle: "bold" },
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) {
        doc
          .setFont("helvetica", "bold")
          .setFontSize(9)
          .setTextColor(...swPdf.ink);
        doc.text(`${docLabel} ${no} — continued`, M, 36);
        doc.setDrawColor(...accent).setLineWidth(1.2);
        doc.line(M, 42, M + 50, 42);
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 260;
  let blockY = ensurePdfSpace(doc, finalY + 24, 170, M, reservedFooter);
  const totalsW = 220;
  const leftW = W - M * 2 - totalsW - 22;

  // Amount in words
  doc
    .setFont("helvetica", "bold")
    .setFontSize(7.5)
    .setTextColor(...swPdf.muted);
  doc.text("AMOUNT IN WORDS", M, blockY + 10, { charSpace: 0.6 } as any);
  doc
    .setFont("helvetica", "bold")
    .setFontSize(9.5)
    .setTextColor(...swPdf.ink);
  const wordsLines = doc.splitTextToSize(amountInWords(result.totals.total), leftW).slice(0, 3);
  doc.text(wordsLines, M, blockY + 24);

  // Bank details (invoice only, when present)
  let leftY = blockY + 24 + wordsLines.length * 11 + 8;
  if (
    !isQuote &&
    (design?.showBankDetails ?? true) &&
    (company?.bank_name || company?.bank_account_no || company?.bank_ifsc)
  ) {
    doc
      .setFont("helvetica", "bold")
      .setFontSize(7.5)
      .setTextColor(...swPdf.muted);
    doc.text("BANK DETAILS", M, leftY, { charSpace: 0.6 } as any);
    doc
      .setFont("helvetica", "normal")
      .setFontSize(8.4)
      .setTextColor(...swPdf.ink);
    const bank = [
      company?.bank_name && `Bank: ${company.bank_name}`,
      company?.bank_account_no && `A/c No: ${company.bank_account_no}`,
      company?.bank_ifsc && `IFSC: ${company.bank_ifsc}`,
      company?.upi_id && (design?.showUpi ?? true) && `UPI: ${company.upi_id}`,
      company?.owner_name && `Beneficiary: ${company.owner_name}`,
    ].filter(Boolean) as string[];
    bank.forEach((b, i) => doc.text(b, M, leftY + 12 + i * 11));
    leftY += 12 + bank.length * 11 + 6;
  }

  // Terms
  doc
    .setFont("helvetica", "bold")
    .setFontSize(7.5)
    .setTextColor(...swPdf.muted);
  doc.text(isQuote ? "TERMS OF PROPOSAL" : "TERMS & CONDITIONS", M, leftY, {
    charSpace: 0.6,
  } as any);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(7.8)
    .setTextColor(...swPdf.inkSoft);
  const baseTerms = isQuote
    ? `Prices valid until the date shown above. Quotation does not constitute a tax invoice or a sale. Stock and lot variation may apply. GST and statutory charges as listed. E&OE.`
    : `Goods once sold will not be taken back. Interest @18% p.a. on overdue balances. Subject to local jurisdiction. E&OE.`;
  const notes = result.header.notes ? `${result.header.notes}\n${baseTerms}` : baseTerms;
  doc.text(doc.splitTextToSize(notes, leftW).slice(0, 5), M, leftY + 12);

  // Optional QR + barcode column on the right of totals
  if (qrPlacement === "terms" && design?.qrCodeDataUrl) {
    try {
      doc.addImage(
        design.qrCodeDataUrl,
        imageFormat(design.qrCodeDataUrl) as any,
        M,
        leftY + 58,
        58,
        58,
      );
    } catch {}
    doc
      .setFont("helvetica", "normal")
      .setFontSize(7)
      .setTextColor(...swPdf.muted);
    doc.text("Scan to pay / verify", M + 29, leftY + 124, { align: "center" });
  }
  if (qrPlacement === "totals" && design?.qrCodeDataUrl) {
    try {
      doc.addImage(
        design.qrCodeDataUrl,
        imageFormat(design.qrCodeDataUrl) as any,
        W - M - 70,
        blockY + 4,
        70,
        70,
      );
    } catch {}
    doc
      .setFont("helvetica", "normal")
      .setFontSize(7)
      .setTextColor(...swPdf.muted);
    doc.text("Scan to pay / verify", W - M - 35, blockY + 82, { align: "center" });
  }
  if (barcodePlacement === "totals" && design?.barcodeDataUrl) {
    try {
      doc.addImage(
        design.barcodeDataUrl,
        imageFormat(design.barcodeDataUrl) as any,
        W - M - 178,
        blockY + 82,
        178,
        30,
      );
    } catch {}
  }
  if (barcodePlacement === "terms" && design?.barcodeDataUrl) {
    try {
      doc.addImage(
        design.barcodeDataUrl,
        imageFormat(design.barcodeDataUrl) as any,
        M,
        leftY + 70,
        160,
        28,
      );
    } catch {}
  }

  // Totals block (right)
  const gstRows: Array<[string, string]> = sameState
    ? [
        ["CGST", pdfMoney(result.totals.gst / 2)],
        ["SGST", pdfMoney(result.totals.gst / 2)],
      ]
    : [["IGST", pdfMoney(result.totals.gst)]];
  const totalsRows: Array<[string, string]> = [
    ["Subtotal", pdfMoney(result.totals.subtotal)],
    ...gstRows,
    ...(!isQuote && result.outstanding
      ? [["Paid", pdfMoney(result.outstanding.paid)] as [string, string]]
      : []),
  ];
  const showBalance = !isQuote && result.outstanding?.balance && result.outstanding.balance > 0;
  drawTotalsBlock(
    doc,
    W - M - totalsW,
    blockY + 4,
    totalsW,
    totalsRows,
    showBalance ? "Balance Due" : "Grand Total",
    showBalance ? pdfMoney(result.outstanding!.balance) : pdfMoney(result.totals.total),
  );

  // Signature
  blockY = ensurePdfSpace(doc, Math.max(leftY + 60, blockY + 170), 56, M, reservedFooter);
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.4);
  doc.line(W - M - 180, blockY + 32, W - M, blockY + 32);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(8)
    .setTextColor(...swPdf.muted);
  doc.text(`For ${company?.company_name || "StoneWorld Traders"}`, W - M, blockY + 10, {
    align: "right",
  });
  doc
    .setFont("helvetica", "bold")
    .setFontSize(8.5)
    .setTextColor(...swPdf.ink);
  doc.text(design?.signatoryName?.trim() || "Authorised Signatory", W - M, blockY + 44, {
    align: "right",
  });

  drawCustomWatermark(
    doc,
    design?.watermarkText,
    design?.watermarkOpacity ?? 35,
    design?.watermarkLayer ?? "back",
    design?.watermarkLogoDataUrl,
    design?.watermarkLogoScale ?? 55,
  );
  drawFooterBrandLogos(doc, footerLogos, M, {
    rows: footerRows,
    logoHeightPx: footerLogoSize,
    position: design?.footerPosition ?? "above-signature",
    signatureY: blockY,
    everyPage: footerEvery,
    dividerStyle: design?.footerDividerStyle ?? "solid",
    accent,
  });
  drawStoneWorldFooter(doc, company, M, {
    showPageNumber: design?.showPageNumber !== false,
    hideCompanyName: !!design?.hideFooterCompanyName,
  });
  doc.save(`${String(no || result.kind).replace(/\s+/g, "_")}.pdf`);
}

export function exportStoneWorldPayment(
  row: {
    payment_no: string;
    date: string;
    direction: "in" | "out";
    contact_name?: string | null;
    amount: number;
    mode?: string | null;
    ref_doc?: string | null;
    notes?: string | null;
  },
  allocations: Array<{ doc_kind: string; doc_no: string; amount: number }>,
  company: PdfCompany | null | undefined,
) {
  const doc = newStoneWorldPdf();
  const W = doc.internal.pageSize.getWidth();
  const { margin: M, y } = drawStoneWorldHeader(doc, company, {
    title: row.direction === "in" ? "Receipt" : "Payment",
    subtitle: row.mode || "Payment Entry",
    reference: row.payment_no,
    date: row.date,
  });
  const panelW = (W - M * 2 - 14) / 2;
  drawKeyValuePanel(
    doc,
    M,
    y,
    panelW,
    row.direction === "in" ? "Received From" : "Paid To",
    [
      ["Party", row.contact_name || "-"],
      ["Mode", row.mode || "-"],
      ["Reference", row.ref_doc || "Advance / ledger entry"],
    ],
    102,
  );
  drawKeyValuePanel(
    doc,
    M + panelW + 14,
    y,
    panelW,
    "Payment Details",
    [
      ["No", row.payment_no],
      ["Date", fmtDate(row.date)],
      ["Type", row.direction === "in" ? "Money received" : "Money paid"],
      ["Amount", pdfMoney(row.amount)],
    ],
    102,
  );

  const startY = y + 124;
  stoneWorldTable(doc, {
    startY,
    margin: { left: M, right: M, bottom: 66 },
    head: [["#", "Document Type", "Document No", "Allocated Amount"]],
    body: allocations.length
      ? allocations.map((a, i) => [
          String(i + 1),
          a.doc_kind.toUpperCase(),
          a.doc_no,
          pdfMoney(a.amount),
        ])
      : [["1", "ADVANCE", "Ledger balance", pdfMoney(row.amount)]],
    columnStyles: {
      0: { halign: "center", cellWidth: 28, textColor: swPdf.muted },
      1: { cellWidth: 130, fontStyle: "bold", textColor: swPdf.tealDark },
      2: { cellWidth: "auto", font: "courier" },
      3: { halign: "right", cellWidth: 140, fontStyle: "bold", textColor: swPdf.ink },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 80;
  let blockY = ensurePdfSpace(doc, finalY + 18, 124, M, 66);
  doc
    .setFont("helvetica", "bold")
    .setFontSize(8.5)
    .setTextColor(...swPdf.tealDark);
  doc.text("NOTES", M, blockY + 14);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(8.8)
    .setTextColor(...swPdf.muted);
  doc.text(
    doc
      .splitTextToSize(
        row.notes || "This document records the payment entry and allocation shown above.",
        W - M * 2 - 252,
      )
      .slice(0, 7),
    M,
    blockY + 32,
  );
  drawTotalsBlock(
    doc,
    W - M - 232,
    blockY,
    232,
    [["Allocated", pdfMoney(allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0))]],
    "Payment Amount",
    pdfMoney(row.amount),
  );

  blockY = ensurePdfSpace(doc, blockY + 106, 46, M, 66);
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
  doc.line(M, blockY + 18, M + 172, blockY + 18);
  doc
    .setFont("helvetica", "normal")
    .setFontSize(8)
    .setTextColor(...swPdf.muted);
  doc.text(
    `For ${company?.company_name || "StoneWorld Traders"} - Authorised Signatory`,
    M,
    blockY + 33,
  );
  drawStoneWorldFooter(doc, company, M);
  doc.save(`${row.payment_no.replace(/\s+/g, "_")}.pdf`);
}
