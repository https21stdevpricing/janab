export type PrintHeaderStyle = "classic" | "editorial" | "compact";
export type PrintBodyLayout = "balanced" | "spacious" | "dense";
export type PrintFooterPosition = "above-signature" | "page-bottom";
export type PrintWatermarkLayer = "back" | "front";
export type PrintQrMode = "digital-copy" | "upi-pay" | "manual" | "off";
export type PrintBarcodeMode = "auto" | "manual" | "off";

export type PrintDesign = {
  headerStyle: PrintHeaderStyle;
  bodyLayout: PrintBodyLayout;
  logoDataUrl?: string | null;
  watermarkText?: string;
  watermarkOpacity: number;          // 0-100
  watermarkLayer: PrintWatermarkLayer;
  watermarkLogoDataUrl?: string | null;
  watermarkLogoScale: number;        // 20-90 (% of page width)
  footerLogos: string[];
  footerRows: 1 | 2 | 3;             // arrangement of brand logos
  footerLogoSize: number;            // uniform height in px (HTML) / pt (PDF scaled)
  footerPosition: PrintFooterPosition;
  footerOnEveryPage: boolean;        // strict footer logos on every page
  qrMode: PrintQrMode;               // how to generate the corner QR
  qrCodeDataUrl?: string | null;     // manual fallback (qrMode === "manual")
  barcodeMode: PrintBarcodeMode;     // auto Code-128 from doc no, manual, or off
  barcodeDataUrl?: string | null;    // manual fallback (barcodeMode === "manual")
  showBankDetails: boolean;          // pre-filled bank block (invoice)
  showUpi: boolean;                  // pre-filled UPI line in bank block
  showGstSummary: boolean;           // CGST/SGST/IGST breakdown line
  showHsnSummary: boolean;           // HSN/SAC-wise tax summary table (Tally style)
  showTaxInWords: boolean;           // separate "Tax amount in words" line
  showShipTo: boolean;               // separate Ship-To panel
  showTransport: boolean;            // transport details panel (dispatch/vehicle/destination)
  transporter?: string;              // editable transporter name
  vehicleNo?: string;                // editable vehicle no
  destination?: string;              // editable destination
  dispatchDocNo?: string;            // editable dispatch doc no
  shipToOverride?: string;           // free-text ship-to address override
  declaration?: string;              // editable declaration / T&C override
  signatoryName?: string;            // override authorised signatory line
};

export const DEFAULT_PRINT_DESIGN: PrintDesign = {
  headerStyle: "classic",
  bodyLayout: "balanced",
  logoDataUrl: null,
  watermarkText: "",
  watermarkOpacity: 35,
  watermarkLayer: "back",
  watermarkLogoDataUrl: null,
  watermarkLogoScale: 55,
  footerLogos: [],
  footerRows: 1,
  footerLogoSize: 36,
  footerPosition: "above-signature",
  footerOnEveryPage: true,
  qrMode: "digital-copy",
  qrCodeDataUrl: null,
  barcodeMode: "auto",
  barcodeDataUrl: null,
  showBankDetails: true,
  showUpi: true,
  showGstSummary: true,
  showHsnSummary: true,
  showTaxInWords: true,
  showShipTo: true,
  showTransport: false,
  transporter: "",
  vehicleNo: "",
  destination: "",
  dispatchDocNo: "",
  shipToOverride: "",
  declaration: "",
  signatoryName: "",
};

const KEY = "stoneworld_print_design";

export function loadPrintDesign(): PrintDesign {
  if (typeof window === "undefined") return DEFAULT_PRINT_DESIGN;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRINT_DESIGN;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRINT_DESIGN, ...parsed, footerLogos: Array.isArray(parsed.footerLogos) ? parsed.footerLogos.slice(0, 20) : [] };
  } catch {
    return DEFAULT_PRINT_DESIGN;
  }
}

export function savePrintDesign(design: PrintDesign) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify({ ...design, footerLogos: design.footerLogos.slice(0, 20) }));
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function imageFormat(dataUrl?: string | null) {
  return dataUrl?.startsWith("data:image/jpeg") || dataUrl?.startsWith("data:image/jpg") ? "JPEG" : "PNG";
}