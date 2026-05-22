export type PrintHeaderStyle = "classic" | "editorial" | "compact";
export type PrintBodyLayout = "balanced" | "spacious" | "dense";

export type PrintDesign = {
  headerStyle: PrintHeaderStyle;
  bodyLayout: PrintBodyLayout;
  logoDataUrl?: string | null;
  watermarkText?: string;
  footerLogos: string[];
};

export const DEFAULT_PRINT_DESIGN: PrintDesign = {
  headerStyle: "classic",
  bodyLayout: "balanced",
  logoDataUrl: null,
  watermarkText: "",
  footerLogos: [],
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