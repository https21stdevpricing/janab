import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmt, fmtDate, todayISO } from "@/lib/format";
import swLogo from "@/assets/sw-logo.png";
import type { DocLookupResult } from "@/lib/doc-lookup";
import { imageFormat, type PrintDesign } from "@/lib/print-customizer";

export type PdfRgb = [number, number, number];

export const swPdf = {
  teal: [0, 171, 181] as PdfRgb,
  tealDark: [0, 126, 135] as PdfRgb,
  ink: [18, 24, 38] as PdfRgb,
  muted: [86, 96, 112] as PdfRgb,
  faint: [235, 240, 244] as PdfRgb,
  soft: [244, 252, 253] as PdfRgb,
  rule: [214, 222, 230] as PdfRgb,
};

export type PdfCompany = {
  company_name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  state?: string | null;
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
  const M = 34;
  const co = company ?? {};
  const name = co.company_name || "StoneWorld Traders";

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 124, "F");
  doc.setFillColor(...swPdf.teal);
  doc.rect(0, 0, W, 7, "F");

  try { doc.addImage(design?.logoDataUrl || swLogo, imageFormat(design?.logoDataUrl) as any, M, top + 7, 54, 54); } catch {}

  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...swPdf.ink);
  doc.text(name, M + 68, top + 29, { maxWidth: 255 });
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...swPdf.muted);
  const address = [co.address, co.state].filter(Boolean).join(", ");
  const addressLines = address ? doc.splitTextToSize(address, 275).slice(0, 2) : [];
  if (addressLines.length) doc.text(addressLines, M + 68, top + 44);
  const contactLine = [co.phone && `Ph: ${co.phone}`, co.email, co.gstin && `GSTIN: ${co.gstin}`].filter(Boolean).join("  |  ");
  if (contactLine) doc.text(doc.splitTextToSize(contactLine, 360).slice(0, 1), M + 68, top + 66);

  doc.setFont("helvetica", "bold").setFontSize(24).setTextColor(...swPdf.ink);
  doc.text(meta.title.toUpperCase(), W - M, top + 28, { align: "right" });
  if (meta.subtitle) {
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...swPdf.tealDark);
    doc.text(String(meta.subtitle).toUpperCase(), W - M, top + 45, { align: "right", maxWidth: 190 });
  }
  doc.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...swPdf.muted);
  const metaLines = [
    meta.reference ? `Ref: ${meta.reference}` : null,
    meta.date ? `Date: ${fmtDate(meta.date)}` : null,
    meta.validUntil ? `Valid until: ${fmtDate(meta.validUntil)}` : null,
  ].filter(Boolean) as string[];
  metaLines.slice(0, 3).forEach((line, index) => doc.text(line, W - M, top + 61 + index * 12, { align: "right" }));

  doc.setDrawColor(...swPdf.rule).setLineWidth(0.6);
  doc.line(M, 116, W - M, 116);
  return { margin: M, y: 136 };
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

export function drawCustomWatermark(doc: jsPDF, text?: string | null, opacityPct: number = 35, layer: "back" | "front" = "back") {
  if (!text) return;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();
  const alpha = Math.max(0, Math.min(100, opacityPct)) / 100;
  // jsPDF text gray ≈ 255*(1-alpha) gives "back" feel for back layer.
  const gray = Math.round(255 - alpha * 200);
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "bold").setFontSize(64).setTextColor(gray, gray, gray);
    // Note: jsPDF lacks z-ordering; "front" is approximated by stronger contrast.
    if (layer === "front") doc.setTextColor(Math.max(0, gray - 60), Math.max(0, gray - 60), Math.max(0, gray - 60));
    doc.text(String(text).toUpperCase().slice(0, 24), W / 2, H / 2, { align: "center", angle: -28 });
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
  doc.setFillColor(...swPdf.soft);
  doc.setDrawColor(...swPdf.faint).setLineWidth(0.7);
  doc.roundedRect(x, y, w, height, 5, 5, "FD");
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...swPdf.tealDark);
  doc.text(title.toUpperCase(), x + 14, y + 18);
  let cy = y + 36;
  for (const [label, value] of rows.filter(([, v]) => v)) {
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...swPdf.muted);
    doc.text(`${label}:`, x + 14, cy);
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...swPdf.ink);
    const lines = doc.splitTextToSize(String(value), w - 92).slice(0, 2);
    doc.text(lines, x + 74, cy);
    cy += Math.max(13, lines.length * 10);
    if (cy > y + height - 12) break;
  }
  return y + height;
}

export function drawTotalsBlock(doc: jsPDF, x: number, y: number, w: number, rows: Array<[string, string]>, totalLabel: string, totalValue: string) {
  doc.setDrawColor(...swPdf.rule).setLineWidth(0.7);
  doc.roundedRect(x, y, w, 34 + rows.length * 18, 5, 5, "S");
  rows.forEach(([label, value], i) => {
    const cy = y + 18 + i * 18;
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...swPdf.muted);
    doc.text(label, x + 14, cy);
    doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...swPdf.ink);
    doc.text(value, x + w - 14, cy, { align: "right" });
  });
  const gy = y + 22 + rows.length * 18;
  doc.setFillColor(...swPdf.teal);
  doc.roundedRect(x + 8, gy - 12, w - 16, 26, 4, 4, "F");
  doc.setFont("helvetica", "bold").setFontSize(10).setTextColor(255, 255, 255);
  doc.text(totalLabel, x + 18, gy + 5);
  doc.text(totalValue, x + w - 18, gy + 5, { align: "right" });
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
    head: [["#", "Product", "Unit", "Qty", "Rate", "GST", "Taxable", "Total"]],
    body: result.items.map((it, i) => {
      const rate = Number(it.sale_rate ?? it.rate ?? 0);
      const qty = Number(it.qty ?? 0);
      const taxable = qty * rate;
      return [String(i + 1), it.product_name ?? "-", it.unit ?? "-", fmt(qty), pdfMoney(rate), pdfPct(it.gst_pct), pdfMoney(taxable), pdfMoney(taxable * (1 + Number(it.gst_pct ?? 0) / 100))];
    }),
    columnStyles: {
      0: { halign: "center", cellWidth: 22, textColor: swPdf.muted },
      1: { cellWidth: "auto", fontStyle: "bold", minCellWidth: 180 },
      2: { halign: "center", cellWidth: 44, textColor: swPdf.muted },
      3: { halign: "right", cellWidth: 50 },
      4: { halign: "right", cellWidth: 68, fontStyle: "bold" },
      5: { halign: "right", cellWidth: 42, textColor: swPdf.muted },
      6: { halign: "right", cellWidth: 74 },
      7: { halign: "right", cellWidth: 78, fontStyle: "bold", textColor: swPdf.tealDark },
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
  doc.text("NOTES & TERMS", M, blockY + 14);
  doc.setFont("helvetica", "normal").setFontSize(8.8).setTextColor(...swPdf.muted);
  const notes = result.header.notes ? `${result.header.notes}\n${defaultTerms(result.kind === "quote" ? "quotation" : "document")}` : defaultTerms(result.kind === "quote" ? "quotation" : "document");
  doc.text(doc.splitTextToSize(notes, W - M * 2 - totalsW - 18).slice(0, 8), M, blockY + 32);
  drawTotalsBlock(doc, W - M - totalsW, blockY, totalsW, [
    ["Subtotal", pdfMoney(result.totals.subtotal)],
    ["GST", pdfMoney(result.totals.gst)],
    ...(result.outstanding ? [["Paid", pdfMoney(result.outstanding.paid)] as [string, string]] : []),
  ], result.outstanding?.balance && result.outstanding.balance > 0 ? "Balance" : "Total", result.outstanding?.balance && result.outstanding.balance > 0 ? pdfMoney(result.outstanding.balance) : pdfMoney(result.totals.total));

  blockY = ensurePdfSpace(doc, blockY + 122, 46, M, 66);
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