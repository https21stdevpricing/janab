import { supabase } from "@/integrations/supabase/client";
import { exportWorkbook } from "@/lib/excel";

const TABLES = [
  "settings",
  "products",
  "contacts",
  "sales", "sale_items",
  "purchases", "purchase_items",
  "third_party", "tp_items",
  "quotations", "quotation_items",
  "deliveries",
  "payments", "payment_allocations",
  "expenses",
] as const;

const LABELS: Record<string, string> = {
  settings: "Company",
  products: "Products",
  contacts: "Contacts",
  sales: "Sales",
  sale_items: "Sale Items",
  purchases: "Purchases",
  purchase_items: "Purchase Items",
  third_party: "Third-Party",
  tp_items: "TP Items",
  quotations: "Quotations",
  quotation_items: "Quotation Items",
  deliveries: "Deliveries",
  payments: "Payments",
  payment_allocations: "Payment Allocations",
  expenses: "Expenses",
};

const LAST_KEY = "stoneworld:lastBackupAt";

export function getLastBackupAt(): string | null {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}

export async function downloadFullBackup() {
  const sheets: { name: string; rows: any[] }[] = [];
  for (const t of TABLES) {
    const { data, error } = await supabase.from(t as any).select("*");
    if (error) throw new Error(`${t}: ${error.message}`);
    sheets.push({ name: LABELS[t] ?? t, rows: (data ?? []) as any[] });
  }
  const today = new Date().toISOString().slice(0, 10);
  exportWorkbook({ filename: `stoneworld-backup-${today}`, sheets });
  try { localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch {}
}