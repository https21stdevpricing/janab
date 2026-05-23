export type PrintHeaderStyle = "classic" | "editorial" | "compact";
export type PrintBodyLayout = "balanced" | "spacious" | "dense";
export type PrintPreset =
  | "minimal"
  | "clean"
  | "modern"
  | "bold"
  | "elegant"
  | "apple-minimal"
  | "clean-compact";
// Kept for backward compatibility with persisted localStorage values.
// The print template now always renders the "standard" structure;
// presets only tweak typography, spacing and accent colour.
export type PrintProductLayout = "standard" | "compact" | "description-first" | "tax-detail";
export type PrintCodePlacement = "totals" | "header" | "terms" | "hidden";
export type PrintFooterPosition = "above-signature" | "page-bottom";
export type PrintWatermarkLayer = "back" | "front";
export type PrintQrMode = "digital-copy" | "upi-pay" | "manual" | "off";
export type PrintBarcodeMode = "auto" | "manual" | "off";
export type PrintRoundOffMode = "off" | "nearest" | "up" | "down";
export type PrintFooterDivider = "solid" | "dashed" | "double" | "accent" | "none";
export type PrintHeaderContainer = "open" | "boxed" | "rule";
export type PrintLogoPosition = "left" | "center" | "right";
export type PrintLineHeight = "tight" | "normal" | "relaxed";
export type PrintPageMargin = "compact" | "standard" | "wide";

export type PrintDesign = {
  preset: PrintPreset;
  headerStyle: PrintHeaderStyle;
  bodyLayout: PrintBodyLayout;
  productLayout: PrintProductLayout;
  logoDataUrl?: string | null;
  watermarkText?: string;
  watermarkOpacity: number; // 0-100
  watermarkLayer: PrintWatermarkLayer;
  watermarkLogoDataUrl?: string | null;
  watermarkLogoScale: number; // 20-90 (% of page width)
  footerLogos: string[];
  footerRows: 1 | 2 | 3; // arrangement of brand logos
  footerLogoSize: number; // uniform height in px (HTML) / pt (PDF scaled)
  footerPosition: PrintFooterPosition;
  footerOnEveryPage: boolean; // strict footer logos on every page
  qrMode: PrintQrMode; // how to generate the corner QR
  qrPlacement: PrintCodePlacement;
  qrCodeDataUrl?: string | null; // manual fallback (qrMode === "manual")
  barcodeMode: PrintBarcodeMode; // auto Code-128 from doc no, manual, or off
  barcodePlacement: PrintCodePlacement;
  barcodeDataUrl?: string | null; // manual fallback (barcodeMode === "manual")
  showBankDetails: boolean; // pre-filled bank block (invoice)
  showUpi: boolean; // pre-filled UPI line in bank block
  showGstSummary: boolean; // CGST/SGST/IGST breakdown line
  showHsnSummary: boolean; // HSN/SAC-wise tax summary table (Tally style)
  showTaxInWords: boolean; // separate "Tax amount in words" line
  showShipTo: boolean; // separate Ship-To panel
  showTransport: boolean; // transport details panel (dispatch/vehicle/destination)
  roundOff: PrintRoundOffMode; // rounding behaviour on grand total
  showPageNumber: boolean; // print "Page x of y" footer text
  hideFooterCompanyName: boolean; // hide "StoneWorld Traders" line in the bottom footer band
  footerDividerStyle: PrintFooterDivider; // divider above footer logos / signature row
  headerContainer: PrintHeaderContainer; // visual containment for the header block
  headerDividerStyle: PrintFooterDivider; // hairline style under the header
  logoPosition: PrintLogoPosition; // logo placement in header
  fontScale: number; // 0.85 – 1.20, multiplies header / meta font sizes
  lineHeight: PrintLineHeight; // body / meta vertical rhythm
  pageMargin: PrintPageMargin; // outer page margins
  accent: string; // hex accent colour driving rules, totals divider and brand stripe
  transporter?: string; // editable transporter name
  vehicleNo?: string; // editable vehicle no
  destination?: string; // editable destination
  dispatchDocNo?: string; // editable dispatch doc no
  shipToOverride?: string; // free-text ship-to address override
  declaration?: string; // editable declaration / T&C override
  signatoryName?: string; // override authorised signatory line
};

export const DEFAULT_PRINT_DESIGN: PrintDesign = {
  preset: "clean",
  headerStyle: "classic",
  bodyLayout: "balanced",
  productLayout: "standard",
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
  qrPlacement: "totals",
  qrCodeDataUrl: null,
  barcodeMode: "auto",
  barcodePlacement: "terms",
  barcodeDataUrl: null,
  showBankDetails: true,
  showUpi: true,
  showGstSummary: true,
  showHsnSummary: true,
  showTaxInWords: true,
  showShipTo: true,
  showTransport: false,
  roundOff: "nearest",
  showPageNumber: true,
  hideFooterCompanyName: false,
  footerDividerStyle: "solid",
  headerContainer: "rule",
  headerDividerStyle: "solid",
  logoPosition: "left",
  fontScale: 1,
  lineHeight: "normal",
  pageMargin: "standard",
  accent: "#00abb5",
  transporter: "",
  vehicleNo: "",
  destination: "",
  dispatchDocNo: "",
  shipToOverride: "",
  declaration: "",
  signatoryName: "",
};

export const PRINT_PRESETS: Record<PrintPreset, Partial<PrintDesign>> = {
  minimal: {
    preset: "minimal",
    headerStyle: "compact",
    bodyLayout: "balanced",
    productLayout: "standard",
    headerContainer: "open",
    footerDividerStyle: "solid",
    accent: "#111621",
  },
  clean: {
    preset: "clean",
    headerStyle: "classic",
    bodyLayout: "balanced",
    productLayout: "standard",
    headerContainer: "rule",
    footerDividerStyle: "solid",
    accent: "#00abb5",
  },
  modern: {
    preset: "modern",
    headerStyle: "compact",
    bodyLayout: "balanced",
    productLayout: "standard",
    headerContainer: "boxed",
    footerDividerStyle: "accent",
    accent: "#0ea5b7",
  },
  bold: {
    preset: "bold",
    headerStyle: "classic",
    bodyLayout: "dense",
    productLayout: "standard",
    headerContainer: "boxed",
    footerDividerStyle: "double",
    accent: "#111621",
  },
  elegant: {
    preset: "elegant",
    headerStyle: "editorial",
    bodyLayout: "spacious",
    productLayout: "standard",
    headerContainer: "rule",
    footerDividerStyle: "dashed",
    accent: "#9a7b3f",
  },
  "apple-minimal": {
    preset: "apple-minimal",
    headerStyle: "editorial",
    bodyLayout: "spacious",
    productLayout: "standard",
    headerContainer: "open",
    headerDividerStyle: "solid",
    footerDividerStyle: "none",
    logoPosition: "left",
    fontScale: 0.95,
    lineHeight: "relaxed",
    pageMargin: "wide",
    accent: "#111621",
    hideFooterCompanyName: true,
  },
  "clean-compact": {
    preset: "clean-compact",
    headerStyle: "compact",
    bodyLayout: "dense",
    productLayout: "standard",
    headerContainer: "rule",
    headerDividerStyle: "solid",
    footerDividerStyle: "solid",
    logoPosition: "left",
    fontScale: 0.9,
    lineHeight: "tight",
    pageMargin: "compact",
    accent: "#00abb5",
  },
};

const KEY = "stoneworld_print_design";

export function loadPrintDesign(): PrintDesign {
  if (typeof window === "undefined") return DEFAULT_PRINT_DESIGN;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRINT_DESIGN;
    const parsed = JSON.parse(raw);
    // Migrate legacy preset names from older builds.
    const legacyMap: Record<string, PrintPreset> = {
      gst: "modern", dispatch: "bold", letterhead: "elegant",
    };
    const preset: PrintPreset =
      (legacyMap[parsed.preset] as PrintPreset | undefined) ?? (parsed.preset ?? "clean");
    return {
      ...DEFAULT_PRINT_DESIGN,
      ...parsed,
      preset,
      productLayout: "standard",
      footerLogos: Array.isArray(parsed.footerLogos) ? parsed.footerLogos.slice(0, 20) : [],
    };
  } catch {
    return DEFAULT_PRINT_DESIGN;
  }
}

export function savePrintDesign(design: PrintDesign) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    KEY,
    JSON.stringify({ ...design, footerLogos: design.footerLogos.slice(0, 20) }),
  );
}

export function applyPrintPreset(design: PrintDesign, preset: PrintPreset): PrintDesign {
  return { ...design, ...PRINT_PRESETS[preset], preset };
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
  return dataUrl?.startsWith("data:image/jpeg") || dataUrl?.startsWith("data:image/jpg")
    ? "JPEG"
    : "PNG";
}
