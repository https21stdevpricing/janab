import QRCode from "qrcode";
import JsBarcode from "jsbarcode";

/**
 * Helpers that turn an invoice/quote into the small machine-readable codes
 * we print in the corner of every document:
 *   - A QR that either deep-links to the digital copy on our own site
 *     (so a customer can scan and view/verify the invoice) or that opens a
 *     UPI "scan & pay" intent pre-filled with amount, party and reference.
 *   - A Code-128 barcode of the document number, useful for warehouse /
 *     filing workflows where a scanner gun expects 1D codes.
 *
 * Everything is generated client-side as a data URL so it embeds cleanly
 * into both the on-screen preview and the branded PDF export.
 */

export function digitalCopyUrl(documentNo: string) {
  if (typeof window === "undefined") return `https://stoneworld.app/app/lookup?q=${encodeURIComponent(documentNo)}`;
  return `${window.location.origin}/app/lookup?q=${encodeURIComponent(documentNo)}`;
}

export function upiPayString(opts: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}) {
  // Standard UPI deep-link spec (BHIM / GPay / PhonePe all accept this).
  const params = new URLSearchParams({
    pa: opts.upiId,
    pn: opts.payeeName,
    am: opts.amount.toFixed(2),
    cu: "INR",
  });
  if (opts.note) params.set("tn", opts.note);
  return `upi://pay?${params.toString()}`;
}

export async function generateQrDataUrl(payload: string) {
  try {
    return await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
      color: { dark: "#111621", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

export function generateBarcodeDataUrl(value: string) {
  if (typeof document === "undefined" || !value) return null;
  try {
    const canvas = document.createElement("canvas");
    JsBarcode(canvas, value, {
      format: "CODE128",
      displayValue: true,
      fontSize: 11,
      font: "Helvetica Neue, Helvetica, Arial, sans-serif",
      height: 36,
      margin: 0,
      background: "#ffffff",
      lineColor: "#111621",
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}