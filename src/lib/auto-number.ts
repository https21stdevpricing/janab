import { supabase } from "@/integrations/supabase/client";

/**
 * Generates the next document number for a given prefix.
 * Scans existing rows and finds max(numeric suffix) + 1.
 * Falls back to PREFIX-0001 if no rows exist.
 */
export async function nextDocNo(table: string, column: string, prefix: string): Promise<string> {
  const { data, error } = await supabase
    .from(table as never)
    .select(column)
    .like(column, `${prefix}-%`)
    .order(column, { ascending: false })
    .limit(50);
  if (error) {
    console.error("nextDocNo error", error);
    return `${prefix}-0001`;
  }
  let max = 0;
  for (const row of (data ?? []) as Array<Record<string, string>>) {
    const raw = row[column];
    const m = raw?.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}