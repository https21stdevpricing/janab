export const fmt = (n: number | null | undefined, dp = 2) => {
  const v = Number(n ?? 0);
  if (!isFinite(v)) return "0.00";
  return v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
export const inr = (n: number | null | undefined) => "₹" + fmt(n, 2);
export const fmtDate = (d?: string | null) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
};
export const todayISO = () => new Date().toISOString().slice(0, 10);