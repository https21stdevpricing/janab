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