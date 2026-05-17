import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmt, fmtDate, todayISO } from "@/lib/format";
import swLogo from "@/assets/sw-logo.png";

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

export function drawStoneWorldHeader(doc: jsPDF, company: PdfCompany | null | undefined, meta: PdfDocMeta, top = 30) {
  const W = doc.internal.pageSize.getWidth();
  const M = 34;
  const co = company ?? {};
  const name = co.company_name || "StoneWorld Traders";

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 124, "F");
  doc.setFillColor(...swPdf.teal);
  doc.rect(0, 0, W, 7, "F");

  try { doc.addImage(swLogo, "PNG", M, top + 7, 54, 54); } catch {}

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