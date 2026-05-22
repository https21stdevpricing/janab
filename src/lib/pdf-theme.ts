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
  doc.setProperties({ creator: "StoneWorld Traders", subject: "StoneWorld branded business document" });
  return doc;
}

export function drawStoneWorldHeader(doc: jsPDF, company: PdfCompany | null | undefined, meta: PdfDocMeta, top = 30, design?: Partial<PrintDesign>) {
  const W = doc.internal.pageSize.getWidth();
  const M = 36;
  const co = company ?? {};
  const name = co.company_name || "StoneWorld Traders";

  // Minimal, editorial-style header. Thin teal accent rule only.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 130, "F");

  // Big title on the right, very tight letter spacing
  doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...swPdf.ink);
  doc.text(meta.title.toUpperCase(), W - M, top + 14, { align: "right" });
  if (meta.subtitle) {
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...swPdf.muted);
    doc.text(String(meta.subtitle).toUpperCase(), W - M, top + 28, { align: "right" });
  }

  // Logo + company block (left)
  try { doc.addImage(design?.logoDataUrl || swLogo, imageFormat(design?.logoDataUrl) as any, M, top, 46, 46); } catch {}
  doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...swPdf.ink);
  doc.text(name, M + 58, top + 14, { maxWidth: 280 });
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...swPdf.inkSoft);
  const address = [co.address, co.state].filter(Boolean).join(", ");
  const addressLines = address ? doc.splitTextToSize(address, 290).slice(0, 2) : [];
  if (addressLines.length) doc.text(addressLines, M + 58, top + 27);
  const contactLine = [co.phone && `Tel: ${co.phone}`, co.email, co.gstin && `GSTIN ${co.gstin}`, co.pan && `PAN ${co.pan}`].filter(Boolean).join("   ·   ");
  if (contactLine) doc.text(doc.splitTextToSize(contactLine, 290).slice(0, 2), M + 58, top + (addressLines.length > 1 ? 49 : 41));

  // Meta lines under title
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...swPdf.inkSoft);
  const metaLines: Array<[string, string]> = [];
  if (meta.reference) metaLines.push(["No.", String(meta.reference)]);
  if (meta.date) metaLines.push(["Date", fmtDate(meta.date)]);
  if (meta.validUntil) metaLines.push(["Valid", fmtDate(meta.validUntil)]);
  metaLines.slice(0, 3).forEach(([k, v], i) => {
    const y = top + 44 + i * 12;
    doc.setFont("helvetica", "normal").setTextColor(...swPdf.muted);
    doc.text(k, W - M - 110, y);
    doc.setFont("helvetica", "bold").setTextColor(...swPdf.ink);
    doc.text(v, W - M, y, { align: "right" });
  });

  // Thin double rule (hairline + teal accent)
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.4);
  doc.line(M, 110, W - M, 110);
  doc.setDrawColor(...swPdf.teal).setLineWidth(1.4);
  doc.line(M, 114, M + 64, 114);
  return { margin: M, y: 134 };
}

export function drawStoneWorldFooter(doc: jsPDF, company: PdfCompany | null | undefined, margin = 34) {
  const pageCount = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const name = company?.company_name || "StoneWorld Traders";
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
    doc.line(margin, H - 36, W - margin, H - 36);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...swPdf.muted);
    doc.text(name, margin, H - 21);
    doc.text(`Page ${page} of ${pageCount}`, W - margin, H - 21, { align: "right" });
  }
}

export function drawCustomWatermark(doc: jsPDF, text?: string | null, opacityPct: number = 35, layer: "back" | "front" = "back", logoDataUrl?: string | null, logoScalePct: number = 55) {
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
      const size = Math.max(120, Math.min(W - 80, (W * Math.max(20, Math.min(90, logoScalePct))) / 100));
      try { doc.addImage(logoDataUrl, imageFormat(logoDataUrl) as any, (W - size) / 2, (H - size) / 2, size, size); } catch {}
    }
    if (text) {
      const gray = supportsGState ? 90 : Math.round(255 - alpha * 200);
      doc.setFont("helvetica", "bold").setFontSize(72).setTextColor(gray, gray, gray);
      if (!supportsGState && layer === "front") doc.setTextColor(Math.max(0, gray - 60), Math.max(0, gray - 60), Math.max(0, gray - 60));
      doc.text(String(text).toUpperCase().slice(0, 24), W / 2, H / 2, { align: "center", angle: -26 });
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
  opts: { rows?: 1 | 2 | 3; logoHeightPx?: number; position?: "above-signature" | "page-bottom"; signatureY?: number } = {},
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
  const startY = position === "page-bottom"
    ? H - 56 - totalH
    : Math.max(margin + 80, (opts.signatureY ?? H - 100) - totalH - 8);
  logos.slice(0, count).forEach((logo, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // Center each logo in its cell at uniform height; width auto-derived to a square-ish box.
    const wPt = Math.min(cellW - 6, cellH * 2.4);
    const x = margin + c * cellW + cellW / 2 - wPt / 2;
    const y = startY + r * (cellH + 6);
    try { doc.addImage(logo, imageFormat(logo) as any, x, y, wPt, cellH); } catch {}
  });
}

export function ensurePdfSpace(doc: jsPDF, y: number, needed: number, margin = 34, footer = 58) {
  const H = doc.internal.pageSize.getHeight();
  if (y + needed <= H - footer) return y;
  doc.addPage();
  return margin;
}

export function drawKeyValuePanel(doc: jsPDF, x: number, y: number, w: number, title: string, rows: Array<[string, string | null | undefined]>, height = 92) {
  // Minimal: no fill, top thin rule, label-stack rows
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.4);
  doc.line(x, y, x + w, y);
  doc.setFont("helvetica", "bold").setFontSize(7.5).setTextColor(...swPdf.muted);
  doc.text(title.toUpperCase(), x, y + 14, { charSpace: 0.6 } as any);
  let cy = y + 30;
  for (const [label, value] of rows.filter(([, v]) => v)) {
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...swPdf.muted);
    doc.text(label, x, cy);
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...swPdf.ink);
    const lines = doc.splitTextToSize(String(value), w).slice(0, 2);
    doc.text(lines, x, cy + 11);
    cy += 12 + Math.max(11, lines.length * 11);
    if (cy > y + height - 4) break;
  }
  return y + height;
}

export function drawTotalsBlock(doc: jsPDF, x: number, y: number, w: number, rows: Array<[string, string]>, totalLabel: string, totalValue: string) {
  // Minimal totals: borderless rows + single thick rule + grand total
  rows.forEach(([label, value], i) => {
    const cy = y + 12 + i * 16;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...swPdf.muted);
    doc.text(label, x, cy);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...swPdf.ink);
    doc.text(value, x + w, cy, { align: "right" });
  });
  const gy = y + 12 + rows.length * 16 + 4;
  doc.setDrawColor(...swPdf.ink).setLineWidth(0.7);
  doc.line(x, gy, x + w, gy);
  doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...swPdf.ink);
  doc.text(totalLabel, x, gy + 16);
  doc.text(totalValue, x + w, gy + 16, { align: "right" });
  doc.setDrawColor(...swPdf.ink).setLineWidth(0.4);
  doc.line(x, gy + 22, x + w, gy + 22);
}

export function stoneWorldTable(doc: jsPDF, options: Parameters<typeof autoTable>[1]) {
  const margin = typeof options.margin === "object" ? options.margin : {};
  const { margin: _margin, styles, headStyles, alternateRowStyles, bodyStyles, ...rest } = options;
  return autoTable(doc, {
    theme: "grid",
    margin: { left: 34, right: 34, bottom: 58, ...margin },
    styles: {
      font: "helvetica",
      fontSize: 8.8,
      cellPadding: { top: 7, right: 6, bottom: 7, left: 6 },
      textColor: swPdf.ink,
      lineColor: swPdf.faint,
      lineWidth: 0.35,
      overflow: "linebreak",
      valign: "middle",
      minCellHeight: 22,
      ...(styles ?? {}),
    },
    headStyles: {
      fillColor: swPdf.soft,
      textColor: swPdf.tealDark,
      fontStyle: "bold",
      fontSize: 8,
      lineColor: swPdf.rule,
      lineWidth: 0.45,
      cellPadding: { top: 7, right: 6, bottom: 7, left: 6 },
      ...(headStyles ?? {}),
    },
    alternateRowStyles: { fillColor: [252, 254, 255], ...(alternateRowStyles ?? {}) },
    bodyStyles: { lineColor: swPdf.faint, lineWidth: 0.3, ...(bodyStyles ?? {}) },
    ...rest,
  });
}

export function defaultTerms(documentName = "document") {
  return `Rates are prepared for the named customer and valid only for the stated period. GST, loading, transport, installation, cutting, wastage and any statutory charges apply as mentioned in this ${documentName}. Supply is subject to stock availability, shade/lot variation and final confirmation. E&OE.`;
}

export function issuedOn() {
  return fmtDate(todayISO());
}

export function exportStoneWorldDocument(result: DocLookupResult, company: PdfCompany | null | undefined, design?: Partial<PrintDesign>) {
  const doc = newStoneWorldPdf();
  const W = doc.internal.pageSize.getWidth();
  const { margin: M, y } = drawStoneWorldHeader(doc, company, {
    title: result.kind === "sale" ? "Tax Invoice" : result.kind === "quote" ? "Quotation" : result.kind === "purchase" ? "Purchase Bill" : "Third Party Bill",
    subtitle: result.kind.toUpperCase(),
    reference: result.header.invoice_no ?? result.header.quote_no ?? result.header.po_no ?? result.header.tp_no,
    date: result.header.date,
    validUntil: result.header.valid_until,
  }, 30, design);
  const no = result.header.invoice_no ?? result.header.quote_no ?? result.header.po_no ?? result.header.tp_no;
  const panelW = (W - M * 2 - 14) / 2;
  drawKeyValuePanel(doc, M, y, panelW, result.kind === "purchase" ? "Supplier" : "Customer", [
    ["Name", result.header.buyer_name ?? result.header.supplier_name ?? result.party?.name],
    ["Phone", result.party?.phone],
    ["GSTIN", result.party?.gstin],
    ["Address", result.party?.address],
  ], 102);
  drawKeyValuePanel(doc, M + panelW + 14, y, panelW, "Document Details", [
    ["No", no],
    ["Date", fmtDate(result.header.date)],
    ["State", result.party?.state],
    ["Status", result.outstanding?.status],
  ], 102);

  stoneWorldTable(doc, {
    startY: y + 122,
    margin: { left: M, right: M, top: 58, bottom: 66 },
    head: [["#", "Product / HSN", "Qty", "Unit", "Rate", "GST%", "Amount"]],
    body: result.items.map((it, i) => {
      const rate = Number(it.sale_rate ?? it.rate ?? 0);
      const qty = Number(it.qty ?? 0);
      const taxable = qty * rate;
      const total = taxable * (1 + Number(it.gst_pct ?? 0) / 100);
      const name = it.product_name ?? "-";
      const hsn = it.hsn ?? it.hsn_code ?? null;
      return [String(i + 1), hsn ? `${name}\nHSN: ${hsn}` : name, fmt(qty), it.unit ?? "-", pdfMoney(rate), pdfPct(it.gst_pct), pdfMoney(total)];
    }),
    columnStyles: {
      0: { halign: "center", cellWidth: 22, textColor: swPdf.muted },
      1: { cellWidth: "auto", fontStyle: "bold", minCellWidth: 160 },
      2: { halign: "right", cellWidth: 46 },
      3: { halign: "center", cellWidth: 40, textColor: swPdf.muted },
      4: { halign: "right", cellWidth: 64, fontStyle: "bold" },
      5: { halign: "right", cellWidth: 42, textColor: swPdf.muted },
      6: { halign: "right", cellWidth: 86, fontStyle: "bold", textColor: swPdf.tealDark },
    },
    didDrawPage: (data: any) => {
      if (data.pageNumber > 1) {
        doc.setFillColor(...swPdf.teal); doc.rect(0, 0, W, 5, "F");
        doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...swPdf.ink);
        doc.text(`${no} - continued`, M, 34);
      }
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? y + 260;
  let blockY = ensurePdfSpace(doc, finalY + 18, 132, M, 66);
  const totalsW = 232;
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...swPdf.tealDark);
  doc.text("AMOUNT IN WORDS", M, blockY + 14);
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...swPdf.ink);
  doc.text(doc.splitTextToSize(amountInWords(result.totals.total), W - M * 2 - totalsW - 18), M, blockY + 30);
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...swPdf.tealDark);
  doc.text("NOTES & TERMS", M, blockY + 58);
  doc.setFont("helvetica", "normal").setFontSize(8.4).setTextColor(...swPdf.muted);
  const notes = result.header.notes ? `${result.header.notes}\n${defaultTerms(result.kind === "quote" ? "quotation" : "document")}` : defaultTerms(result.kind === "quote" ? "quotation" : "document");
  doc.text(doc.splitTextToSize(notes, W - M * 2 - totalsW - 18).slice(0, 6), M, blockY + 74);
  const sameState = !!(company?.state && result.party?.state && String(company.state).toLowerCase() === String(result.party.state).toLowerCase());
  const gstRows: Array<[string, string]> = sameState
    ? [["CGST", pdfMoney(result.totals.gst / 2)], ["SGST", pdfMoney(result.totals.gst / 2)]]
    : [["IGST", pdfMoney(result.totals.gst)]];
  drawTotalsBlock(doc, W - M - totalsW, blockY, totalsW, [
    ["Subtotal", pdfMoney(result.totals.subtotal)],
    ...gstRows,
    ...(result.outstanding ? [["Paid", pdfMoney(result.outstanding.paid)] as [string, string]] : []),
  ], result.outstanding?.balance && result.outstanding.balance > 0 ? "Balance Due" : "Grand Total", result.outstanding?.balance && result.outstanding.balance > 0 ? pdfMoney(result.outstanding.balance) : pdfMoney(result.totals.total));

  blockY = ensurePdfSpace(doc, blockY + 148, 46, M, 66);
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
  doc.line(M, blockY + 18, M + 172, blockY + 18);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...swPdf.muted);
  doc.text(`For ${company?.company_name || "StoneWorld Traders"} - Authorised Signatory`, M, blockY + 33);
  drawCustomWatermark(doc, design?.watermarkText, design?.watermarkOpacity ?? 35, design?.watermarkLayer ?? "back");
  drawFooterBrandLogos(doc, design?.footerLogos, M, {
    rows: (design?.footerRows ?? 1) as 1 | 2 | 3,
    logoHeightPx: design?.footerLogoSize ?? 36,
    position: design?.footerPosition ?? "above-signature",
    signatureY: blockY,
  });
  drawStoneWorldFooter(doc, company, M);
  doc.save(`${String(no || result.kind).replace(/\s+/g, "_")}.pdf`);
}

export function exportStoneWorldPayment(row: { payment_no: string; date: string; direction: "in" | "out"; contact_name?: string | null; amount: number; mode?: string | null; ref_doc?: string | null; notes?: string | null }, allocations: Array<{ doc_kind: string; doc_no: string; amount: number }>, company: PdfCompany | null | undefined) {
  const doc = newStoneWorldPdf();
  const W = doc.internal.pageSize.getWidth();
  const { margin: M, y } = drawStoneWorldHeader(doc, company, {
    title: row.direction === "in" ? "Receipt" : "Payment",
    subtitle: row.mode || "Payment Entry",
    reference: row.payment_no,
    date: row.date,
  });
  const panelW = (W - M * 2 - 14) / 2;
  drawKeyValuePanel(doc, M, y, panelW, row.direction === "in" ? "Received From" : "Paid To", [
    ["Party", row.contact_name || "-"],
    ["Mode", row.mode || "-"],
    ["Reference", row.ref_doc || "Advance / ledger entry"],
  ], 102);
  drawKeyValuePanel(doc, M + panelW + 14, y, panelW, "Payment Details", [
    ["No", row.payment_no],
    ["Date", fmtDate(row.date)],
    ["Type", row.direction === "in" ? "Money received" : "Money paid"],
    ["Amount", pdfMoney(row.amount)],
  ], 102);

  const startY = y + 124;
  stoneWorldTable(doc, {
    startY,
    margin: { left: M, right: M, bottom: 66 },
    head: [["#", "Document Type", "Document No", "Allocated Amount"]],
    body: allocations.length ? allocations.map((a, i) => [String(i + 1), a.doc_kind.toUpperCase(), a.doc_no, pdfMoney(a.amount)]) : [["1", "ADVANCE", "Ledger balance", pdfMoney(row.amount)]],
    columnStyles: {
      0: { halign: "center", cellWidth: 28, textColor: swPdf.muted },
      1: { cellWidth: 130, fontStyle: "bold", textColor: swPdf.tealDark },
      2: { cellWidth: "auto", font: "courier" },
      3: { halign: "right", cellWidth: 140, fontStyle: "bold", textColor: swPdf.ink },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? startY + 80;
  let blockY = ensurePdfSpace(doc, finalY + 18, 124, M, 66);
  doc.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...swPdf.tealDark);
  doc.text("NOTES", M, blockY + 14);
  doc.setFont("helvetica", "normal").setFontSize(8.8).setTextColor(...swPdf.muted);
  doc.text(doc.splitTextToSize(row.notes || "This document records the payment entry and allocation shown above.", W - M * 2 - 252).slice(0, 7), M, blockY + 32);
  drawTotalsBlock(doc, W - M - 232, blockY, 232, [
    ["Allocated", pdfMoney(allocations.reduce((sum, a) => sum + Number(a.amount || 0), 0))],
  ], "Payment Amount", pdfMoney(row.amount));

  blockY = ensurePdfSpace(doc, blockY + 106, 46, M, 66);
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.5);
  doc.line(M, blockY + 18, M + 172, blockY + 18);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...swPdf.muted);
  doc.text(`For ${company?.company_name || "StoneWorld Traders"} - Authorised Signatory`, M, blockY + 33);
  drawStoneWorldFooter(doc, company, M);
  doc.save(`${row.payment_no.replace(/\s+/g, "_")}.pdf`);
}