import { supabase } from "@/integrations/supabase/client";

// Maps an ID prefix to the actual tables it lives in.
export type DocKind = "sale" | "purchase" | "tp" | "quote" | "payment";
export type PrintableDocKind = Exclude<DocKind, "payment">;

const MAP: Record<string, { kind: DocKind; table: string; items?: string; fk?: string; noCol: string }> = {
  INV: { kind: "sale",     table: "sales",       items: "sale_items",       fk: "sale_id",      noCol: "invoice_no" },
  PO:  { kind: "purchase", table: "purchases",   items: "purchase_items",   fk: "purchase_id",  noCol: "po_no" },
  TP:  { kind: "tp",       table: "third_party", items: "tp_items",         fk: "tp_id",        noCol: "tp_no" },
  QUO: { kind: "quote",    table: "quotations",  items: "quotation_items",  fk: "quotation_id", noCol: "quote_no" },
  RI:  { kind: "payment",  table: "payments",                                                    noCol: "payment_no" },
  PY:  { kind: "payment",  table: "payments",                                                    noCol: "payment_no" },
};

export function prefixOf(id: string): string | null {
  const m = id.trim().toUpperCase().match(/^([A-Z]+)-/);
  return m ? m[1] : null;
}

export type DocLookupResult = {
  kind: DocKind;
  prefix: string;
  header: any;
  items: any[];
  totals: { subtotal: number; gst: number; total: number; cost?: number; margin?: number };
  outstanding?: { total: number; paid: number; balance: number; status: string };
  party?: any; // contacts row
  // TP only: supplier-side (payable) outstanding + supplier contact
  supplierOutstanding?: { total: number; paid: number; balance: number; status: string };
  supplier?: any;
};

export async function lookupDoc(rawId: string): Promise<DocLookupResult | null> {
  const id = rawId.trim().toUpperCase();
  const pfx = prefixOf(id);
  if (!pfx) return null;
  const cfg = MAP[pfx];
  if (!cfg) return null;

  const { data: header } = await supabase
    .from(cfg.table as never).select("*").eq(cfg.noCol as never, id).maybeSingle() as { data: any };
  if (!header) return null;

  let items: any[] = [];
  if (cfg.items && cfg.fk) {
    const { data } = await supabase
      .from(cfg.items as never).select("*").eq(cfg.fk as never, header.id).order("position");
    items = (data ?? []) as any[];
  }

  // Totals
  let subtotal = 0, gst = 0, cost = 0;
  for (const it of items) {
    const rate = Number(it.sale_rate ?? it.rate ?? 0);
    const base = Number(it.qty ?? 0) * rate;
    subtotal += base;
    gst += base * Number(it.gst_pct ?? 0) / 100;
    if (it.purchase_rate != null) cost += Number(it.qty) * Number(it.purchase_rate);
  }
  const total = subtotal + gst;
  const totals: DocLookupResult["totals"] = { subtotal, gst, total };
  if (cfg.kind === "tp") { totals.cost = cost; totals.margin = subtotal - cost; }

  // Outstanding (sale / purchase / tp only)
  let outstanding: DocLookupResult["outstanding"] | undefined;
  let supplierOutstanding: DocLookupResult["supplierOutstanding"] | undefined;
  if (cfg.kind === "sale" || cfg.kind === "purchase" || cfg.kind === "tp") {
    const { data: o } = await supabase
      .from("outstanding_view" as never).select("total,paid,balance,status")
      .eq("doc_kind" as never, cfg.kind).eq("doc_id" as never, header.id).maybeSingle() as { data: any };
    if (o) outstanding = { total: Number(o.total), paid: Number(o.paid), balance: Number(o.balance), status: o.status };
    else outstanding = { total, paid: 0, balance: total, status: total > 0 ? "unpaid" : "empty" };
    if (cfg.kind === "tp") {
      const { data: op } = await supabase
        .from("outstanding_view" as never).select("total,paid,balance,status")
        .eq("doc_kind" as never, "tp_purchase").eq("doc_id" as never, header.id).maybeSingle() as { data: any };
      if (op) supplierOutstanding = { total: Number(op.total), paid: Number(op.paid), balance: Number(op.balance), status: op.status };
    }
  } else if (cfg.kind === "payment") {
    outstanding = { total: Number(header.amount), paid: Number(header.amount), balance: 0, status: "paid" };
  }

  // Party
  let party: any = null;
  const partyId = header.buyer_id ?? header.supplier_id ?? header.contact_id ?? null;
  if (partyId) {
    const { data } = await supabase.from("contacts").select("*").eq("id", partyId).maybeSingle();
    party = data;
  }
  let supplier: any = null;
  if (cfg.kind === "tp" && header.supplier_id) {
    const { data } = await supabase.from("contacts").select("*").eq("id", header.supplier_id).maybeSingle();
    supplier = data;
  }

  return { kind: cfg.kind, prefix: pfx, header, items, totals, outstanding, party, supplierOutstanding, supplier };
}

// Open outstanding docs for a contact (used by Payments allocation panel).
export async function openDocsFor(contactId: string, direction: "in" | "out") {
  const kinds = direction === "in" ? ["sale", "tp"] : ["purchase", "tp_purchase"];
  const { data } = await supabase
    .from("outstanding_view" as never)
    .select("*")
    .eq("party_id" as never, contactId)
    .in("doc_kind" as never, kinds as never)
    .gt("balance" as never, 0)
    .order("date" as never, { ascending: true }) as { data: any[] };
  return data ?? [];
}

export async function lookupDocById(kind: PrintableDocKind, id: string): Promise<DocLookupResult | null> {
  const cfg = Object.values(MAP).find((entry) => entry.kind === kind && entry.items);
  if (!cfg) return null;
  const { data: header } = await supabase
    .from(cfg.table as never).select("*").eq("id" as never, id).maybeSingle() as { data: any };
  const no = header?.[cfg.noCol];
  return no ? lookupDoc(no) : null;
}