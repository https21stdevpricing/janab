import * as XLSX from "xlsx";

export type Column<T> = {
  header: string;
  key: keyof T | string;
  // formatter for export; default uses raw value
  get?: (row: T) => string | number | null | undefined;
};

export function exportToExcel<T extends Record<string, any>>(opts: {
  filename: string;       // without extension
  sheetName?: string;
  columns: Column<T>[];
  rows: T[];
}) {
  const { filename, sheetName = "Sheet1", columns, rows } = opts;
  const data = rows.map((r) => {
    const o: Record<string, any> = {};
    for (const c of columns) {
      const raw = c.get ? c.get(r) : (r as any)[c.key as string];
      o[c.header] = raw == null ? "" : raw;
    }
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.header) });
  // auto-size columns
  const colWidths = columns.map((c) => {
    let max = c.header.length;
    for (const r of data) {
      const v = r[c.header];
      const s = v == null ? "" : String(v);
      if (s.length > max) max = s.length;
    }
    return { wch: Math.min(Math.max(max + 2, 8), 40) };
  });
  (ws as any)["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function importFromExcel(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, any>[];
}

// Pick a value from a row by trying several possible header names (case-insensitive).
export function pick(row: Record<string, any>, ...names: string[]): any {
  const keys = Object.keys(row);
  for (const n of names) {
    const k = keys.find((k) => k.toLowerCase().trim() === n.toLowerCase().trim());
    if (k != null && row[k] != null && row[k] !== "") return row[k];
  }
  return null;
}

export function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return isFinite(n) ? n : 0;
}

// Normalize header key (strip spaces, punct, lowercase) so "GST No." and "gst_no" match.
const norm = (s: string) => s.toLowerCase().replace(/[\s_\-./\\:#%₹$()]+/g, "");

// Smart pick: tries any alias, normalized.
export function smartPick(row: Record<string, any>, aliases: string[]): any {
  const keys = Object.keys(row);
  const lookup = new Map(keys.map((k) => [norm(k), k]));
  for (const a of aliases) {
    const hit = lookup.get(norm(a));
    if (hit != null && row[hit] != null && row[hit] !== "") return row[hit];
  }
  // Also try contains-match as fallback
  for (const a of aliases) {
    const na = norm(a);
    for (const [nk, k] of lookup) {
      if (nk.includes(na) && row[k] != null && row[k] !== "") return row[k];
    }
  }
  return null;
}

// Excel date serial → JS date
export function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel epoch = 1899-12-30
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (isFinite(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }
  const s = String(v).trim();
  // dd-mm-yyyy or dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const [_, d, mo, y] = m;
    const yr = y.length === 2 ? Number(y) + 2000 : Number(y);
    const iso = `${yr}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (!isNaN(new Date(iso).getTime())) return iso;
  }
  const d = new Date(s);
  return isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}