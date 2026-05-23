// Importers for third-party accounting backups.
// Supports:
//   • Tally ERP 9 / Prime XML exports (Day Book / Masters)
//   • Zoho Books CSV exports (Items, Contacts, Invoices)
// All importers map to StoneWorld tables and insert via the supabase client.
// Strategy: read-then-insert; nothing is mutated until the caller confirms.

import { XMLParser } from "fast-xml-parser";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { num, parseDate, smartPick } from "@/lib/excel";

export type ImportReport = {
  source: "tally-xml" | "zoho-csv";
  parsed: Record<string, number>;
  inserted: Record<string, number>;
  errors: string[];
};

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v];

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in.");
  return data.user.id;
}

// --------------------------------------------------------------------
// Tally XML
// --------------------------------------------------------------------

export async function parseTallyXml(text: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: true,
    trimValues: true,
  });
  const j = parser.parse(text);
  // Tally XML wraps everything in ENVELOPE → BODY → IMPORTDATA / DATA → TALLYMESSAGE[]
  const env = j?.ENVELOPE ?? j;
  const msgs = asArray<any>(
    env?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE ??
      env?.BODY?.DATA?.TALLYMESSAGE ??
      env?.TALLYMESSAGE,
  );
  const ledgers: any[] = [];
  const stockItems: any[] = [];
  const vouchers: any[] = [];
  for (const m of msgs) {
    if (m.LEDGER) for (const l of asArray<any>(m.LEDGER)) ledgers.push(l);
    if (m.STOCKITEM) for (const s of asArray<any>(m.STOCKITEM)) stockItems.push(s);
    if (m.VOUCHER) for (const v of asArray<any>(m.VOUCHER)) vouchers.push(v);
  }
  return { ledgers, stockItems, vouchers };
}

function tallyDate(s?: string | null): string | null {
  if (!s) return null;
  const str = String(s);
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  return parseDate(str);
}

export async function importTallyXml(text: string): Promise<ImportReport> {
  const user_id = await uid();
  const { ledgers, stockItems, vouchers } = await parseTallyXml(text);
  const report: ImportReport = {
    source: "tally-xml",
    parsed: { ledgers: ledgers.length, stockItems: stockItems.length, vouchers: vouchers.length },
    inserted: { contacts: 0, products: 0, sales: 0, purchases: 0, payments: 0 },
    errors: [],
  };

  // ---- Ledgers → contacts (skip system ledgers without GSTIN/address that look like accounts)
  const contactRows: any[] = [];
  for (const l of ledgers) {
    const name = String(l["@_NAME"] ?? l.NAME ?? "").trim();
    if (!name) continue;
    const parent = String(l.PARENT ?? "").toLowerCase();
    // Tally groups: Sundry Debtors → buyer, Sundry Creditors → supplier
    const type =
      parent.includes("debtor") ? "buyer" :
      parent.includes("creditor") ? "supplier" :
      null;
    if (!type) continue;
    contactRows.push({
      user_id, name, type,
      gstin: l.PARTYGSTIN ?? l.GSTREGISTRATIONTYPE ? String(l.PARTYGSTIN ?? "") : null,
      state: l.LEDSTATENAME ?? l.STATENAME ?? null,
      address: asArray<string>(l.LEDMAILINGDETAILS?.ADDRESS?.LIST?.ADDRESS ?? l.ADDRESS?.LIST?.ADDRESS)
        .filter(Boolean).join(", ") || null,
      phone: l.LEDGERPHONE ?? l.PHONE ?? null,
      email: l.EMAIL ?? null,
      opening_balance: num(l.OPENINGBALANCE),
    });
  }
  if (contactRows.length) {
    const { error } = await supabase.from("contacts").insert(contactRows as any);
    if (error) report.errors.push(`contacts: ${error.message}`);
    else report.inserted.contacts = contactRows.length;
  }

  // ---- Stock items → products
  const productRows: any[] = [];
  for (const s of stockItems) {
    const name = String(s["@_NAME"] ?? s.NAME ?? "").trim();
    if (!name) continue;
    productRows.push({
      user_id, name,
      code: (s.ALIASNAME ?? s["@_ALIAS"] ?? name).toString().slice(0, 40).replace(/\s+/g, "-").toUpperCase(),
      unit: s.BASEUNITS ?? s.BASEUNITNAME ?? "nos",
      hsn: s.HSNCODE ?? s.GSTCLASSIFICATIONNAME ?? null,
      opening_stock: num(s.OPENINGBALANCE),
      purchase_rate: num(s.OPENINGRATE),
      sale_rate: num(s.STANDARDPRICE ?? s.OPENINGRATE),
      kind: "stocked",
    });
  }
  if (productRows.length) {
    const { error } = await supabase.from("products").insert(productRows as any);
    if (error) report.errors.push(`products: ${error.message}`);
    else report.inserted.products = productRows.length;
  }

  // ---- Vouchers → sales / purchases / payments (header only; line-items skipped)
  let saleN = 1, poN = 1, payN = 1;
  for (const v of vouchers) {
    const date = tallyDate(v.DATE ?? v["@_DATE"]);
    const type = String(v.VOUCHERTYPENAME ?? "").toLowerCase();
    const partyName = String(v.PARTYLEDGERNAME ?? v.PARTYNAME ?? "").trim() || null;
    const ref = String(v.VOUCHERNUMBER ?? v["@_VCHKEY"] ?? "").trim();
    if (!date) continue;
    if (type.includes("sales")) {
      const { error } = await supabase.from("sales").insert({
        user_id, date, buyer_name: partyName,
        invoice_no: ref || `IMP-INV-${String(saleN++).padStart(5, "0")}`,
        notes: "Imported from Tally",
      });
      if (!error) report.inserted.sales++; else report.errors.push(`sale ${ref}: ${error.message}`);
    } else if (type.includes("purchase")) {
      const { error } = await supabase.from("purchases").insert({
        user_id, date, supplier_name: partyName,
        po_no: ref || `IMP-PO-${String(poN++).padStart(5, "0")}`,
        notes: "Imported from Tally",
      });
      if (!error) report.inserted.purchases++; else report.errors.push(`purchase ${ref}: ${error.message}`);
    } else if (type.includes("receipt") || type.includes("payment")) {
      const dir = type.includes("receipt") ? "in" : "out";
      const amount = Math.abs(num(asArray<any>(v["ALLLEDGERENTRIES.LIST"])[0]?.AMOUNT));
      const { error } = await supabase.from("payments").insert({
        user_id, date, direction: dir, amount,
        contact_name: partyName, ref_doc: ref || null, kind: "advance",
        payment_no: `IMP-${dir === "in" ? "REC" : "PAY"}-${String(payN++).padStart(5, "0")}`,
        notes: "Imported from Tally",
      });
      if (!error) report.inserted.payments++; else report.errors.push(`payment ${ref}: ${error.message}`);
    }
  }
  return report;
}

// --------------------------------------------------------------------
// Zoho Books CSV — auto-detects sheet by columns
// --------------------------------------------------------------------

function rowsFromCsvOrXlsx(file: ArrayBuffer): Record<string, any>[] {
  const wb = XLSX.read(file, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: null });
}

function detectZohoKind(rows: Record<string, any>[]): "items" | "contacts" | "invoices" | "bills" | "payments" | null {
  if (!rows.length) return null;
  const k = Object.keys(rows[0]).map((s) => s.toLowerCase());
  const has = (...ns: string[]) => ns.some((n) => k.includes(n));
  if (has("item name", "sku") && has("rate", "selling price")) return "items";
  if (has("contact name", "display name") && has("company name", "email")) return "contacts";
  if (has("invoice number", "invoice date")) return "invoices";
  if (has("bill number", "bill date")) return "bills";
  if (has("payment number", "payment mode", "amount received")) return "payments";
  return null;
}

export async function importZohoCsv(file: File): Promise<ImportReport> {
  const user_id = await uid();
  const rows = rowsFromCsvOrXlsx(await file.arrayBuffer());
  const kind = detectZohoKind(rows);
  const report: ImportReport = {
    source: "zoho-csv",
    parsed: { rows: rows.length },
    inserted: {},
    errors: [],
  };
  if (!kind) {
    report.errors.push("Could not detect this Zoho export. Use Items / Contacts / Invoices / Bills / Payments CSV.");
    return report;
  }

  if (kind === "items") {
    const data = rows.map((r) => ({
      user_id,
      name: smartPick(r, ["Item Name", "Name"]) ?? "Unnamed",
      code: (smartPick(r, ["SKU", "Item ID"]) ?? smartPick(r, ["Item Name"]) ?? "ITEM")
        .toString().slice(0, 40).replace(/\s+/g, "-").toUpperCase(),
      unit: smartPick(r, ["Usage unit", "Unit"]) ?? "nos",
      hsn: smartPick(r, ["HSN/SAC", "HSN"]) ?? null,
      sale_rate: num(smartPick(r, ["Rate", "Selling Price"])),
      purchase_rate: num(smartPick(r, ["Purchase Rate", "Cost Price"])),
      opening_stock: num(smartPick(r, ["Opening Stock", "Stock On Hand"])),
      kind: "stocked",
    }));
    const { error } = await supabase.from("products").insert(data as any);
    if (error) report.errors.push(`products: ${error.message}`);
    else report.inserted.products = data.length;
  }

  if (kind === "contacts") {
    const data = rows.map((r) => {
      const t = String(smartPick(r, ["Contact Type"]) ?? "").toLowerCase();
      return {
        user_id,
        name: smartPick(r, ["Display Name", "Contact Name", "Company Name"]) ?? "Unnamed",
        type: t.includes("vendor") ? "supplier" : "buyer",
        gstin: smartPick(r, ["GST Identification Number (GSTIN)", "GSTIN"]) ?? null,
        state: smartPick(r, ["Billing State", "Shipping State"]) ?? null,
        address: [smartPick(r, ["Billing Address"]), smartPick(r, ["Billing City"]), smartPick(r, ["Billing State"])].filter(Boolean).join(", ") || null,
        phone: smartPick(r, ["Phone", "MobilePhone"]) ?? null,
        email: smartPick(r, ["EmailID", "Email"]) ?? null,
        opening_balance: num(smartPick(r, ["Opening Balance"])),
      };
    });
    const { error } = await supabase.from("contacts").insert(data as any);
    if (error) report.errors.push(`contacts: ${error.message}`);
    else report.inserted.contacts = data.length;
  }

  if (kind === "invoices") {
    // Group by invoice no; each Zoho row is a line item.
    const groups = new Map<string, Record<string, any>[]>();
    for (const r of rows) {
      const k = String(smartPick(r, ["Invoice Number"]) ?? "");
      if (!k) continue;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }
    for (const [inv, lines] of groups) {
      const first = lines[0];
      const { data: sale, error } = await supabase.from("sales").insert({
        user_id,
        invoice_no: inv,
        date: parseDate(smartPick(first, ["Invoice Date"])) ?? new Date().toISOString().slice(0, 10),
        buyer_name: smartPick(first, ["Customer Name"]) ?? null,
        notes: "Imported from Zoho",
      }).select("id").single();
      if (error || !sale) { report.errors.push(`invoice ${inv}: ${error?.message}`); continue; }
      const items = lines.map((l, i) => ({
        sale_id: sale.id, position: i,
        product_name: smartPick(l, ["Item Name"]) ?? "Item",
        qty: num(smartPick(l, ["Quantity"])),
        rate: num(smartPick(l, ["Item Price", "Rate"])),
        gst_pct: num(smartPick(l, ["CGST Rate %"])) + num(smartPick(l, ["SGST Rate %"])) || num(smartPick(l, ["IGST Rate %"])) || 18,
        unit: smartPick(l, ["Usage unit", "Unit"]) ?? null,
      }));
      const { error: itErr } = await supabase.from("sale_items").insert(items as any);
      if (itErr) report.errors.push(`invoice ${inv} items: ${itErr.message}`);
      report.inserted.sales = (report.inserted.sales ?? 0) + 1;
    }
  }

  if (kind === "bills") {
    const groups = new Map<string, Record<string, any>[]>();
    for (const r of rows) {
      const k = String(smartPick(r, ["Bill Number"]) ?? "");
      if (!k) continue;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }
    for (const [bn, lines] of groups) {
      const first = lines[0];
      const { data: po, error } = await supabase.from("purchases").insert({
        user_id, po_no: bn,
        date: parseDate(smartPick(first, ["Bill Date"])) ?? new Date().toISOString().slice(0, 10),
        supplier_name: smartPick(first, ["Vendor Name"]) ?? null,
        notes: "Imported from Zoho",
      }).select("id").single();
      if (error || !po) { report.errors.push(`bill ${bn}: ${error?.message}`); continue; }
      const items = lines.map((l, i) => ({
        purchase_id: po.id, position: i,
        product_name: smartPick(l, ["Item Name"]) ?? "Item",
        qty: num(smartPick(l, ["Quantity"])),
        rate: num(smartPick(l, ["Item Price", "Rate"])),
        gst_pct: num(smartPick(l, ["CGST Rate %"])) + num(smartPick(l, ["SGST Rate %"])) || num(smartPick(l, ["IGST Rate %"])) || 18,
        unit: smartPick(l, ["Usage unit", "Unit"]) ?? null,
      }));
      const { error: itErr } = await supabase.from("purchase_items").insert(items as any);
      if (itErr) report.errors.push(`bill ${bn} items: ${itErr.message}`);
      report.inserted.purchases = (report.inserted.purchases ?? 0) + 1;
    }
  }

  if (kind === "payments") {
    const data = rows.map((r, i) => ({
      user_id,
      payment_no: smartPick(r, ["Payment Number"]) ?? `ZP-${i + 1}`,
      date: parseDate(smartPick(r, ["Date", "Payment Date"])) ?? new Date().toISOString().slice(0, 10),
      direction: String(smartPick(r, ["Payment Type"]) ?? "").toLowerCase().includes("vendor") ? "out" : "in",
      contact_name: smartPick(r, ["Customer Name", "Vendor Name"]) ?? null,
      amount: num(smartPick(r, ["Amount", "Amount Received"])),
      mode: smartPick(r, ["Payment Mode"]) ?? "Bank",
      ref_doc: smartPick(r, ["Reference Number"]) ?? null,
      kind: "advance",
      notes: "Imported from Zoho",
    }));
    const { error } = await supabase.from("payments").insert(data as any);
    if (error) report.errors.push(`payments: ${error.message}`);
    else report.inserted.payments = data.length;
  }

  return report;
}