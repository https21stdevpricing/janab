import { supabase } from "@/integrations/supabase/client";
import { exportWorkbook } from "@/lib/excel";

const LAST_KEY = "stoneworld:lastBackupAt";

export function getLastBackupAt(): string | null {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}

const n = (v: any) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

async function fetchAll(table: string, select = "*"): Promise<any[]> {
  const { data, error } = await supabase.from(table as any).select(select);
  if (error) throw new Error(`${table}: ${error.message}`);
  return (data ?? []) as any[];
}

export async function downloadFullBackup() {
  // ---- Pull everything in parallel ----
  const [
    settings, products, contacts,
    sales, saleItems,
    purchases, purchaseItems,
    tp, tpItems,
    quotations, quotationItems,
    deliveries, deliveryItems,
    payments, allocations,
    expenses,
    journalEntries, journalLines,
    outstanding, partyAging, partySummary,
    stockView,
  ] = await Promise.all([
    fetchAll("settings"),
    fetchAll("products"),
    fetchAll("contacts"),
    fetchAll("sales"),
    fetchAll("sale_items"),
    fetchAll("purchases"),
    fetchAll("purchase_items"),
    fetchAll("third_party"),
    fetchAll("tp_items"),
    fetchAll("quotations"),
    fetchAll("quotation_items"),
    fetchAll("deliveries"),
    fetchAll("delivery_items"),
    fetchAll("payments"),
    fetchAll("payment_allocations"),
    fetchAll("expenses"),
    fetchAll("journal_entries"),
    fetchAll("journal_lines"),
    fetchAll("outstanding_view").catch(() => []),
    fetchAll("party_aging_view").catch(() => []),
    fetchAll("party_summary_view").catch(() => []),
    fetchAll("stock_view").catch(() => []),
  ]);

  // ---- Lookups ----
  const prodById = new Map(products.map((p: any) => [p.id, p]));
  const contactById = new Map(contacts.map((c: any) => [c.id, c]));
  const saleById = new Map(sales.map((s: any) => [s.id, s]));
  const purchaseById = new Map(purchases.map((p: any) => [p.id, p]));
  const tpById = new Map(tp.map((t: any) => [t.id, t]));
  const quoteById = new Map(quotations.map((q: any) => [q.id, q]));
  const deliveryById = new Map(deliveries.map((d: any) => [d.id, d]));

  // ---- Totals per document ----
  const totFromItems = (items: any[], rateKey: string) => {
    let taxable = 0, gst = 0;
    for (const it of items) {
      const v = n(it.qty) * n(it[rateKey]);
      taxable += v;
      gst += v * n(it.gst_pct) / 100;
    }
    return { taxable: r2(taxable), gst: r2(gst), total: r2(taxable + gst) };
  };

  const saleTotals = new Map<string, ReturnType<typeof totFromItems>>();
  for (const s of sales) saleTotals.set(s.id, totFromItems(saleItems.filter((i: any) => i.sale_id === s.id), "rate"));
  const purchaseTotals = new Map<string, ReturnType<typeof totFromItems>>();
  for (const p of purchases) purchaseTotals.set(p.id, totFromItems(purchaseItems.filter((i: any) => i.purchase_id === p.id), "rate"));
  const tpSaleTotals = new Map<string, ReturnType<typeof totFromItems>>();
  const tpPurchTotals = new Map<string, ReturnType<typeof totFromItems>>();
  for (const t of tp) {
    const its = tpItems.filter((i: any) => i.tp_id === t.id);
    tpSaleTotals.set(t.id, totFromItems(its, "sale_rate"));
    tpPurchTotals.set(t.id, totFromItems(its, "purchase_rate"));
  }
  const quoteTotals = new Map<string, ReturnType<typeof totFromItems>>();
  for (const q of quotations) quoteTotals.set(q.id, totFromItems(quotationItems.filter((i: any) => i.quotation_id === q.id), "rate"));

  // ---- Stock on hand (fallback if stock_view empty) ----
  const onHand = new Map<string, number>();
  if (stockView.length) {
    for (const r of stockView as any[]) onHand.set(r.product_id, n(r.on_hand));
  } else {
    for (const p of products) onHand.set(p.id, n(p.opening_stock));
    for (const i of purchaseItems) onHand.set(i.product_id, n(onHand.get(i.product_id)) + n(i.qty));
    for (const i of saleItems) onHand.set(i.product_id, n(onHand.get(i.product_id)) - n(i.qty));
  }

  // ---- Sheets ----
  const sheets: { name: string; rows: any[]; columns?: string[] }[] = [];

  // 1. Dashboard summary
  const sumSales = sales.reduce((a, s) => a + n(saleTotals.get(s.id)?.total), 0);
  const sumPurch = purchases.reduce((a, p) => a + n(purchaseTotals.get(p.id)?.total), 0);
  const sumTPSale = tp.reduce((a, t) => a + n(tpSaleTotals.get(t.id)?.total), 0);
  const sumTPPurch = tp.reduce((a, t) => a + n(tpPurchTotals.get(t.id)?.total), 0);
  const sumRecv = payments.filter((p: any) => p.direction === "in").reduce((a, p) => a + n(p.amount), 0);
  const sumPaid = payments.filter((p: any) => p.direction === "out").reduce((a, p) => a + n(p.amount), 0);
  const sumExp = expenses.reduce((a, e) => a + n(e.amount), 0);
  let invCost = 0, invSale = 0, onHandTotal = 0;
  for (const p of products) {
    if (p.kind === "order_basis") continue;
    const oh = n(onHand.get(p.id));
    onHandTotal += oh;
    invCost += oh * n(p.purchase_rate);
    invSale += oh * n(p.sale_rate);
  }
  const ar = outstanding.filter((o: any) => o.doc_kind === "sale" || o.doc_kind === "tp").reduce((a, o) => a + n(o.balance), 0);
  const ap = outstanding.filter((o: any) => o.doc_kind === "purchase" || o.doc_kind === "tp_purchase").reduce((a, o) => a + n(o.balance), 0);

  sheets.push({
    name: "Dashboard",
    columns: ["Metric", "Value (INR)", "Count"],
    rows: [
      { Metric: "Backup taken at", "Value (INR)": new Date().toLocaleString(), Count: "" },
      { Metric: "Company", "Value (INR)": settings[0]?.company_name ?? "", Count: "" },
      { Metric: "—", "Value (INR)": "", Count: "" },
      { Metric: "Total Sales (incl. GST)", "Value (INR)": r2(sumSales), Count: sales.length },
      { Metric: "Total Purchases (incl. GST)", "Value (INR)": r2(sumPurch), Count: purchases.length },
      { Metric: "Third-Party Sale Side", "Value (INR)": r2(sumTPSale), Count: tp.length },
      { Metric: "Third-Party Purchase Side", "Value (INR)": r2(sumTPPurch), Count: tp.length },
      { Metric: "Receipts (money in)", "Value (INR)": r2(sumRecv), Count: payments.filter((p: any) => p.direction === "in").length },
      { Metric: "Payments (money out)", "Value (INR)": r2(sumPaid), Count: payments.filter((p: any) => p.direction === "out").length },
      { Metric: "Expenses", "Value (INR)": r2(sumExp), Count: expenses.length },
      { Metric: "—", "Value (INR)": "", Count: "" },
      { Metric: "Accounts Receivable (open)", "Value (INR)": r2(ar), Count: outstanding.filter((o: any) => (o.doc_kind === "sale" || o.doc_kind === "tp") && n(o.balance) > 0).length },
      { Metric: "Accounts Payable (open)", "Value (INR)": r2(ap), Count: outstanding.filter((o: any) => (o.doc_kind === "purchase" || o.doc_kind === "tp_purchase") && n(o.balance) > 0).length },
      { Metric: "—", "Value (INR)": "", Count: "" },
      { Metric: "Inventory On-Hand (qty total)", "Value (INR)": r2(onHandTotal), Count: products.filter((p: any) => p.kind !== "order_basis").length },
      { Metric: "Inventory Value @ cost", "Value (INR)": r2(invCost), Count: "" },
      { Metric: "Inventory Value @ sale", "Value (INR)": r2(invSale), Count: "" },
      { Metric: "Estimated unrealised margin", "Value (INR)": r2(invSale - invCost), Count: "" },
      { Metric: "—", "Value (INR)": "", Count: "" },
      { Metric: "Products – stocked", "Value (INR)": "", Count: products.filter((p: any) => p.kind !== "order_basis").length },
      { Metric: "Products – on-order", "Value (INR)": "", Count: products.filter((p: any) => p.kind === "order_basis").length },
      { Metric: "Contacts – buyers", "Value (INR)": "", Count: contacts.filter((c: any) => c.type === "buyer" || c.type === "both").length },
      { Metric: "Contacts – suppliers", "Value (INR)": "", Count: contacts.filter((c: any) => c.type === "supplier" || c.type === "both").length },
      { Metric: "Deliveries", "Value (INR)": "", Count: deliveries.length },
      { Metric: "Quotations", "Value (INR)": "", Count: quotations.length },
      { Metric: "Journal entries", "Value (INR)": "", Count: journalEntries.length },
    ],
  });

  // 2. Company
  sheets.push({
    name: "Company",
    columns: ["Field", "Value"],
    rows: settings.length === 0 ? [] : Object.entries(settings[0]).map(([k, v]) => ({ Field: k, Value: v as any })),
  });

  // 3. Products (full)
  sheets.push({
    name: "Products",
    columns: ["Code", "Name", "Kind", "Unit", "HSN", "Purchase Rate", "Sale Rate", "Opening Stock", "On Hand", "Reorder Level", "Cost Value", "Sale Value", "Notes", "Created"],
    rows: products.map((p: any) => {
      const oh = n(onHand.get(p.id));
      return {
        Code: p.code, Name: p.name, Kind: p.kind ?? "stocked", Unit: p.unit ?? "",
        HSN: p.hsn ?? "", "Purchase Rate": n(p.purchase_rate), "Sale Rate": n(p.sale_rate),
        "Opening Stock": n(p.opening_stock), "On Hand": p.kind === "order_basis" ? "" : oh,
        "Reorder Level": n(p.reorder_level),
        "Cost Value": p.kind === "order_basis" ? "" : r2(oh * n(p.purchase_rate)),
        "Sale Value": p.kind === "order_basis" ? "" : r2(oh * n(p.sale_rate)),
        Notes: p.notes ?? "", Created: p.created_at,
      };
    }),
  });

  // 4. Inventory Valuation (stocked only)
  sheets.push({
    name: "Inventory Valuation",
    columns: ["Code", "Name", "Unit", "On Hand", "Purchase Rate", "Cost Value", "Sale Rate", "Sale Value", "Margin"],
    rows: products.filter((p: any) => p.kind !== "order_basis").map((p: any) => {
      const oh = n(onHand.get(p.id));
      const cv = oh * n(p.purchase_rate);
      const sv = oh * n(p.sale_rate);
      return {
        Code: p.code, Name: p.name, Unit: p.unit, "On Hand": oh,
        "Purchase Rate": n(p.purchase_rate), "Cost Value": r2(cv),
        "Sale Rate": n(p.sale_rate), "Sale Value": r2(sv), Margin: r2(sv - cv),
      };
    }),
  });

  // 5. Contacts
  sheets.push({
    name: "Contacts",
    columns: ["Code", "Name", "Type", "GSTIN", "State", "Phone", "Email", "Address", "Credit Limit", "Opening Balance", "Notes"],
    rows: contacts.map((c: any) => ({
      Code: c.code, Name: c.name, Type: c.type, GSTIN: c.gstin ?? "", State: c.state ?? "",
      Phone: c.phone ?? "", Email: c.email ?? "", Address: c.address ?? "",
      "Credit Limit": n(c.credit_limit), "Opening Balance": n(c.opening_balance), Notes: c.notes ?? "",
    })),
  });

  // 6. Sales (headers with totals)
  sheets.push({
    name: "Sales",
    columns: ["Invoice #", "Date", "Buyer Code", "Buyer", "GSTIN", "State", "Items", "Taxable", "GST", "Total", "Status", "Notes"],
    rows: sales.map((s: any) => {
      const t = saleTotals.get(s.id)!;
      const b = contactById.get(s.buyer_id);
      return {
        "Invoice #": s.invoice_no, Date: s.date, "Buyer Code": b?.code ?? "",
        Buyer: s.buyer_name ?? b?.name ?? "", GSTIN: b?.gstin ?? "", State: b?.state ?? "",
        Items: saleItems.filter((i: any) => i.sale_id === s.id).length,
        Taxable: t.taxable, GST: t.gst, Total: t.total, Status: s.status, Notes: s.notes ?? "",
      };
    }),
  });

  // 7. Sale Items (with doc context)
  sheets.push({
    name: "Sale Items",
    columns: ["Invoice #", "Date", "Buyer", "Product Code", "Product", "Unit", "L", "W", "Qty", "Rate", "GST %", "Taxable", "GST Amt", "Line Total"],
    rows: saleItems.map((i: any) => {
      const s = saleById.get(i.sale_id) ?? {};
      const p = prodById.get(i.product_id);
      const taxable = n(i.qty) * n(i.rate);
      const gst = taxable * n(i.gst_pct) / 100;
      return {
        "Invoice #": s.invoice_no ?? "", Date: s.date ?? "", Buyer: s.buyer_name ?? "",
        "Product Code": p?.code ?? "", Product: i.product_name ?? p?.name ?? "",
        Unit: i.unit ?? "", L: i.length ?? "", W: i.width ?? "",
        Qty: n(i.qty), Rate: n(i.rate), "GST %": n(i.gst_pct),
        Taxable: r2(taxable), "GST Amt": r2(gst), "Line Total": r2(taxable + gst),
      };
    }),
  });

  // 8. Purchases
  sheets.push({
    name: "Purchases",
    columns: ["PO #", "Date", "Supplier Code", "Supplier", "GSTIN", "State", "Items", "Taxable", "GST", "Total", "Status", "Notes"],
    rows: purchases.map((p: any) => {
      const t = purchaseTotals.get(p.id)!;
      const c = contactById.get(p.supplier_id);
      return {
        "PO #": p.po_no, Date: p.date, "Supplier Code": c?.code ?? "",
        Supplier: p.supplier_name ?? c?.name ?? "", GSTIN: c?.gstin ?? "", State: c?.state ?? "",
        Items: purchaseItems.filter((i: any) => i.purchase_id === p.id).length,
        Taxable: t.taxable, GST: t.gst, Total: t.total, Status: p.status, Notes: p.notes ?? "",
      };
    }),
  });

  // 9. Purchase Items
  sheets.push({
    name: "Purchase Items",
    columns: ["PO #", "Date", "Supplier", "Product Code", "Product", "Unit", "L", "W", "Qty", "Rate", "GST %", "Taxable", "GST Amt", "Line Total"],
    rows: purchaseItems.map((i: any) => {
      const p = purchaseById.get(i.purchase_id) ?? {};
      const pr = prodById.get(i.product_id);
      const taxable = n(i.qty) * n(i.rate);
      const gst = taxable * n(i.gst_pct) / 100;
      return {
        "PO #": p.po_no ?? "", Date: p.date ?? "", Supplier: p.supplier_name ?? "",
        "Product Code": pr?.code ?? "", Product: i.product_name ?? pr?.name ?? "",
        Unit: i.unit ?? "", L: i.length ?? "", W: i.width ?? "",
        Qty: n(i.qty), Rate: n(i.rate), "GST %": n(i.gst_pct),
        Taxable: r2(taxable), "GST Amt": r2(gst), "Line Total": r2(taxable + gst),
      };
    }),
  });

  // 10. Third Party
  sheets.push({
    name: "Third-Party",
    columns: ["TP #", "Date", "Supplier", "Buyer", "Items", "Purchase Taxable", "Purchase GST", "Purchase Total", "Sale Taxable", "Sale GST", "Sale Total", "Gross Margin", "Notes"],
    rows: tp.map((t: any) => {
      const ps = tpPurchTotals.get(t.id)!;
      const ss = tpSaleTotals.get(t.id)!;
      return {
        "TP #": t.tp_no, Date: t.date, Supplier: t.supplier_name ?? "", Buyer: t.buyer_name ?? "",
        Items: tpItems.filter((i: any) => i.tp_id === t.id).length,
        "Purchase Taxable": ps.taxable, "Purchase GST": ps.gst, "Purchase Total": ps.total,
        "Sale Taxable": ss.taxable, "Sale GST": ss.gst, "Sale Total": ss.total,
        "Gross Margin": r2(ss.taxable - ps.taxable), Notes: t.notes ?? "",
      };
    }),
  });

  // 11. TP Items
  sheets.push({
    name: "TP Items",
    columns: ["TP #", "Date", "Supplier", "Buyer", "Product Code", "Product", "Unit", "L", "W", "Qty", "Purchase Rate", "Sale Rate", "GST %", "Purchase Total", "Sale Total", "Margin"],
    rows: tpItems.map((i: any) => {
      const t = tpById.get(i.tp_id) ?? {};
      const p = prodById.get(i.product_id);
      const pt = n(i.qty) * n(i.purchase_rate);
      const st = n(i.qty) * n(i.sale_rate);
      const gp = n(i.gst_pct) / 100;
      return {
        "TP #": t.tp_no ?? "", Date: t.date ?? "", Supplier: t.supplier_name ?? "", Buyer: t.buyer_name ?? "",
        "Product Code": p?.code ?? "", Product: i.product_name ?? p?.name ?? "",
        Unit: i.unit ?? "", L: i.length ?? "", W: i.width ?? "",
        Qty: n(i.qty), "Purchase Rate": n(i.purchase_rate), "Sale Rate": n(i.sale_rate),
        "GST %": n(i.gst_pct),
        "Purchase Total": r2(pt * (1 + gp)), "Sale Total": r2(st * (1 + gp)),
        Margin: r2(st - pt),
      };
    }),
  });

  // 12. Quotations
  sheets.push({
    name: "Quotations",
    columns: ["Quote #", "Date", "Buyer", "Valid Until", "Items", "Taxable", "GST", "Total", "Notes"],
    rows: quotations.map((q: any) => {
      const t = quoteTotals.get(q.id)!;
      return {
        "Quote #": q.quote_no, Date: q.date, Buyer: q.buyer_name ?? "",
        "Valid Until": q.valid_until ?? "",
        Items: quotationItems.filter((i: any) => i.quotation_id === q.id).length,
        Taxable: t.taxable, GST: t.gst, Total: t.total, Notes: q.notes ?? "",
      };
    }),
  });

  // 13. Quotation Items
  sheets.push({
    name: "Quotation Items",
    columns: ["Quote #", "Date", "Buyer", "Product Code", "Product", "Unit", "L", "W", "Qty", "Rate", "GST %", "Line Total"],
    rows: quotationItems.map((i: any) => {
      const q = quoteById.get(i.quotation_id) ?? {};
      const p = prodById.get(i.product_id);
      const t = n(i.qty) * n(i.rate) * (1 + n(i.gst_pct) / 100);
      return {
        "Quote #": q.quote_no ?? "", Date: q.date ?? "", Buyer: q.buyer_name ?? "",
        "Product Code": p?.code ?? "", Product: i.product_name ?? p?.name ?? "",
        Unit: i.unit ?? "", L: i.length ?? "", W: i.width ?? "",
        Qty: n(i.qty), Rate: n(i.rate), "GST %": n(i.gst_pct), "Line Total": r2(t),
      };
    }),
  });

  // 14. Deliveries
  sheets.push({
    name: "Deliveries",
    columns: ["DN #", "Date", "Invoice #", "Buyer", "Ship Address", "Status", "Transporter", "Vehicle", "LR #", "Driver", "Phone", "Dispatched", "Delivered", "Notes"],
    rows: deliveries.map((d: any) => ({
      "DN #": d.delivery_no, Date: d.date, "Invoice #": d.invoice_no ?? "",
      Buyer: d.buyer_name ?? "", "Ship Address": d.ship_address ?? "",
      Status: d.status, Transporter: d.transporter ?? "", Vehicle: d.vehicle_no ?? "",
      "LR #": d.lr_no ?? "", Driver: d.driver_name ?? "", Phone: d.driver_phone ?? "",
      Dispatched: d.dispatched_at ?? "", Delivered: d.delivered_at ?? "", Notes: d.notes ?? "",
    })),
  });

  // 15. Delivery Items
  sheets.push({
    name: "Delivery Items",
    columns: ["DN #", "Date", "Buyer", "Product", "Unit", "Qty Ordered", "Qty Delivered", "Pending"],
    rows: deliveryItems.map((i: any) => {
      const d = deliveryById.get(i.delivery_id) ?? {};
      return {
        "DN #": d.delivery_no ?? "", Date: d.date ?? "", Buyer: d.buyer_name ?? "",
        Product: i.product_name ?? "", Unit: i.unit ?? "",
        "Qty Ordered": n(i.qty_ordered), "Qty Delivered": n(i.qty_delivered),
        Pending: r2(n(i.qty_ordered) - n(i.qty_delivered)),
      };
    }),
  });

  // 16. Payments
  sheets.push({
    name: "Payments",
    columns: ["Payment #", "Date", "Direction", "Party", "Mode", "Amount", "Ref Doc", "Notes"],
    rows: payments.map((p: any) => ({
      "Payment #": p.payment_no, Date: p.date,
      Direction: p.direction === "in" ? "Receipt (IN)" : "Payment (OUT)",
      Party: p.contact_name ?? "", Mode: p.mode ?? "", Amount: n(p.amount),
      "Ref Doc": p.ref_doc ?? "", Notes: p.notes ?? "",
    })),
  });

  // 17. Payment Allocations
  sheets.push({
    name: "Payment Allocations",
    columns: ["Payment #", "Doc Kind", "Doc #", "Amount Applied", "When"],
    rows: allocations.map((a: any) => {
      const p = payments.find((x: any) => x.id === a.payment_id);
      return {
        "Payment #": p?.payment_no ?? "",
        "Doc Kind": a.doc_kind, "Doc #": a.doc_no ?? "",
        "Amount Applied": n(a.amount), When: a.created_at,
      };
    }),
  });

  // 18. Expenses
  sheets.push({
    name: "Expenses",
    columns: ["Date", "Category", "Mode", "Amount", "Notes"],
    rows: expenses.map((e: any) => ({
      Date: e.date, Category: e.category, Mode: e.mode ?? "", Amount: n(e.amount), Notes: e.notes ?? "",
    })),
  });

  // 19. Journal Entries
  sheets.push({
    name: "Journal Entries",
    columns: ["Date", "Source", "Source #", "Narration"],
    rows: journalEntries.map((j: any) => ({
      Date: j.date, Source: j.source_kind, "Source #": j.source_no ?? "", Narration: j.narration ?? "",
    })),
  });

  // 20. Journal Lines
  sheets.push({
    name: "Journal Lines",
    columns: ["Date", "Account", "Party", "Debit", "Credit", "Ref #", "Narration"],
    rows: journalLines.map((l: any) => ({
      Date: l.date, Account: l.account, Party: l.party ?? "",
      Debit: n(l.debit), Credit: n(l.credit), "Ref #": l.ref_no ?? "", Narration: l.narration ?? "",
    })),
  });

  // 21. Trial Balance
  const trial = new Map<string, { debit: number; credit: number }>();
  for (const l of journalLines as any[]) {
    const t = trial.get(l.account) ?? { debit: 0, credit: 0 };
    t.debit += n(l.debit); t.credit += n(l.credit);
    trial.set(l.account, t);
  }
  const trialRows: any[] = [];
  let td = 0, tc = 0;
  for (const [acct, v] of [...trial.entries()].sort()) {
    const bal = v.debit - v.credit;
    trialRows.push({
      Account: acct, Debit: r2(v.debit), Credit: r2(v.credit),
      "Net (Dr-Cr)": r2(bal),
      Side: bal >= 0 ? "Dr" : "Cr",
    });
    td += v.debit; tc += v.credit;
  }
  trialRows.push({ Account: "TOTAL", Debit: r2(td), Credit: r2(tc), "Net (Dr-Cr)": r2(td - tc), Side: "" });
  sheets.push({ name: "Trial Balance", columns: ["Account", "Debit", "Credit", "Net (Dr-Cr)", "Side"], rows: trialRows });

  // 22. Outstanding (AR/AP)
  sheets.push({
    name: "Outstanding",
    columns: ["Doc Kind", "Doc #", "Date", "Party", "Total", "Paid", "Balance", "Status"],
    rows: (outstanding as any[]).map((o) => ({
      "Doc Kind": o.doc_kind, "Doc #": o.doc_no, Date: o.date, Party: o.party_name,
      Total: n(o.total), Paid: n(o.paid), Balance: n(o.balance), Status: o.status,
    })),
  });

  // 23. Party Aging
  sheets.push({
    name: "Party Aging",
    columns: ["Party", "Side", "0-30", "31-60", "61-90", "90+", "Total Balance", "Open Docs", "Last Doc Date"],
    rows: (partyAging as any[]).map((p) => ({
      Party: p.party_name, Side: p.side,
      "0-30": n(p.b_0_30), "31-60": n(p.b_31_60), "61-90": n(p.b_61_90), "90+": n(p.b_90p),
      "Total Balance": n(p.total_balance), "Open Docs": n(p.open_docs), "Last Doc Date": p.last_doc_date ?? "",
    })),
  });

  // 24. Party Summary
  sheets.push({
    name: "Party Summary",
    columns: ["Code", "Name", "Type", "Total Sales", "Total Purchases", "Receivable", "Payable", "Last Txn"],
    rows: (partySummary as any[]).map((p) => ({
      Code: p.code, Name: p.name, Type: p.type,
      "Total Sales": n(p.total_sales), "Total Purchases": n(p.total_purchases),
      Receivable: n(p.receivable), Payable: n(p.payable), "Last Txn": p.last_txn ?? "",
    })),
  });

  // 25. Stock Movements (chronological)
  const movements: any[] = [];
  for (const i of purchaseItems as any[]) {
    const p = purchaseById.get(i.purchase_id) ?? {};
    const pr = prodById.get(i.product_id);
    movements.push({
      Date: p.date ?? "", Kind: "Purchase IN", "Doc #": p.po_no ?? "",
      Party: p.supplier_name ?? "", "Product Code": pr?.code ?? "",
      Product: i.product_name ?? pr?.name ?? "", Unit: i.unit ?? "",
      "Qty In": n(i.qty), "Qty Out": 0, Rate: n(i.rate), Value: r2(n(i.qty) * n(i.rate)),
    });
  }
  for (const i of saleItems as any[]) {
    const s = saleById.get(i.sale_id) ?? {};
    const pr = prodById.get(i.product_id);
    movements.push({
      Date: s.date ?? "", Kind: "Sale OUT", "Doc #": s.invoice_no ?? "",
      Party: s.buyer_name ?? "", "Product Code": pr?.code ?? "",
      Product: i.product_name ?? pr?.name ?? "", Unit: i.unit ?? "",
      "Qty In": 0, "Qty Out": n(i.qty), Rate: n(i.rate), Value: r2(n(i.qty) * n(i.rate)),
    });
  }
  movements.sort((a, b) => (a.Date < b.Date ? -1 : a.Date > b.Date ? 1 : 0));
  sheets.push({
    name: "Stock Movements",
    columns: ["Date", "Kind", "Doc #", "Party", "Product Code", "Product", "Unit", "Qty In", "Qty Out", "Rate", "Value"],
    rows: movements,
  });

  const today = new Date().toISOString().slice(0, 10);
  exportWorkbook({ filename: `stoneworld-backup-${today}`, sheets });
  try { localStorage.setItem(LAST_KEY, new Date().toISOString()); } catch {}
}