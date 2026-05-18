import { supabase } from "@/integrations/supabase/client";
import { nextDocNo } from "@/lib/auto-number";

export async function seedDemoData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const uid = user.id;

  // Products
  const products = [
    { code: "GRN-001", name: "Black Galaxy Granite", unit: "sqft", hsn: "6802", purchase_rate: 95, sale_rate: 145, opening_stock: 1200, reorder_level: 200 },
    { code: "GRN-002", name: "Tan Brown Granite",   unit: "sqft", hsn: "6802", purchase_rate: 65, sale_rate: 110, opening_stock: 850,  reorder_level: 150 },
    { code: "MRB-001", name: "Makrana White Marble", unit: "sqft", hsn: "2515", purchase_rate: 180, sale_rate: 260, opening_stock: 600, reorder_level: 100 },
    { code: "MRB-002", name: "Italian Statuario",    unit: "sqft", hsn: "2515", purchase_rate: 420, sale_rate: 620, opening_stock: 220, reorder_level: 50 },
    { code: "SST-001", name: "Kota Stone Blue",      unit: "sqft", hsn: "2516", purchase_rate: 28,  sale_rate: 48,  opening_stock: 2400, reorder_level: 400 },
    { code: "QRZ-001", name: "Quartz Engineered Slab", unit: "sqft", hsn: "6810", purchase_rate: 230, sale_rate: 340, opening_stock: 180, reorder_level: 40 },
  ];
  await supabase.from("products").delete().eq("user_id", uid);
  const { data: prodIns } = await supabase.from("products").insert(products.map(p => ({ ...p, user_id: uid }))).select();
  const P = (code: string) => (prodIns ?? []).find((p: { code: string }) => p.code === code)!;

  // Contacts
  const contacts = [
    { type: "buyer" as const,    name: "Rajesh Constructions",  gstin: "08AABCR1234A1Z5", state: "Rajasthan",   phone: "9812345601", email: "rajesh@rcon.in",    address: "Plot 12, MIA Phase 2, Jodhpur" },
    { type: "buyer" as const,    name: "Sharma Builders",       gstin: "07AABCS5678B1Z2", state: "Delhi",       phone: "9812345602", email: "info@sharmab.com",  address: "Sector 18, Dwarka, Delhi" },
    { type: "buyer" as const,    name: "Aman Interiors",        gstin: "27AABCA9012C1Z9", state: "Maharashtra", phone: "9812345603", email: "amaninteriors@gmail.com", address: "Andheri East, Mumbai" },
    { type: "supplier" as const, name: "Marudhar Stone Suppliers", gstin: "08AAACM3456D1Z1", state: "Rajasthan", phone: "9812345610", email: "sales@marudharstone.in", address: "Makrana Road, Kishangarh" },
    { type: "supplier" as const, name: "South India Granites",  gstin: "33AAACS7890E1Z6", state: "Tamil Nadu",  phone: "9812345611", email: "sales@sigranites.com", address: "Hosur Industrial Area" },
    { type: "both" as const,     name: "Universal Marble Works", gstin: "08AAACU2345F1Z3", state: "Rajasthan",   phone: "9812345612", email: "office@univmarble.in", address: "RIICO, Kishangarh" },
  ];
  await supabase.from("contacts").delete().eq("user_id", uid);
  const { data: contIns } = await supabase.from("contacts").insert(contacts.map(c => ({ ...c, user_id: uid }))).select();
  const C = (name: string) => (contIns ?? []).find((c: { name: string }) => c.name === name)!;

  // Clean transactions
  await supabase.from("sales").delete().eq("user_id", uid);
  await supabase.from("purchases").delete().eq("user_id", uid);
  await supabase.from("third_party").delete().eq("user_id", uid);
  await supabase.from("quotations").delete().eq("user_id", uid);
  await supabase.from("payments").delete().eq("user_id", uid);
  await supabase.from("expenses").delete().eq("user_id", uid);
  await supabase.rpc("clear_my_deliveries" as never);
  await supabase.rpc("clear_my_notifications" as never);

  const d = (offset: number) => {
    const dt = new Date(); dt.setDate(dt.getDate() - offset);
    return dt.toISOString().slice(0, 10);
  };

  // Purchases (3)
  const purchases = [
    { supplier: "Marudhar Stone Suppliers", date: d(45), items: [
      { p: "GRN-001", qty: 400, rate: 95 },
      { p: "MRB-001", qty: 250, rate: 180 },
    ]},
    { supplier: "South India Granites", date: d(30), items: [
      { p: "GRN-002", qty: 500, rate: 65 },
    ]},
    { supplier: "Universal Marble Works", date: d(12), items: [
      { p: "MRB-002", qty: 80, rate: 420 },
      { p: "QRZ-001", qty: 60, rate: 230 },
    ]},
  ];
  for (const pu of purchases) {
    const po_no = await nextDocNo("purchases", "po_no", "PO");
    const sup = C(pu.supplier);
    const { data: ins } = await supabase.from("purchases").insert({
      user_id: uid, po_no, date: pu.date, supplier_id: sup.id, supplier_name: sup.name,
    }).select().single();
    if (ins) {
      await supabase.from("purchase_items").insert(pu.items.map((it, i) => {
        const prod = P(it.p);
        return { purchase_id: ins.id, product_id: prod.id, product_name: prod.name, unit: prod.unit, qty: it.qty, rate: it.rate, gst_pct: 18, position: i };
      }));
    }
  }

  // Sales (4)
  const sales = [
    { buyer: "Rajesh Constructions", date: d(40), items: [{ p: "GRN-001", qty: 220, rate: 145 }] },
    { buyer: "Sharma Builders",      date: d(25), items: [{ p: "GRN-002", qty: 300, rate: 110 }, { p: "SST-001", qty: 800, rate: 48 }] },
    { buyer: "Aman Interiors",       date: d(15), items: [{ p: "MRB-001", qty: 180, rate: 260 }, { p: "MRB-002", qty: 40, rate: 620 }] },
    { buyer: "Rajesh Constructions", date: d(5),  items: [{ p: "QRZ-001", qty: 35, rate: 340 }] },
  ];
  for (const sa of sales) {
    const invoice_no = await nextDocNo("sales", "invoice_no", "INV");
    const buyer = C(sa.buyer);
    const { data: ins } = await supabase.from("sales").insert({
      user_id: uid, invoice_no, date: sa.date, buyer_id: buyer.id, buyer_name: buyer.name,
    }).select().single();
    if (ins) {
      await supabase.from("sale_items").insert(sa.items.map((it, i) => {
        const prod = P(it.p);
        return { sale_id: ins.id, product_id: prod.id, product_name: prod.name, unit: prod.unit, qty: it.qty, rate: it.rate, gst_pct: 18, position: i };
      }));
    }
  }

  // Third party
  const tps = [
    { supplier: "South India Granites", buyer: "Aman Interiors", date: d(20), items: [{ p: "GRN-001", qty: 150, purchase_rate: 92, sale_rate: 140 }] },
    { supplier: "Marudhar Stone Suppliers", buyer: "Sharma Builders", date: d(8), items: [{ p: "MRB-001", qty: 100, purchase_rate: 175, sale_rate: 255 }] },
  ];
  for (const tp of tps) {
    const tp_no = await nextDocNo("third_party", "tp_no", "TP");
    const sup = C(tp.supplier); const buyer = C(tp.buyer);
    const { data: ins } = await supabase.from("third_party").insert({
      user_id: uid, tp_no, date: tp.date,
      supplier_id: sup.id, supplier_name: sup.name, buyer_id: buyer.id, buyer_name: buyer.name,
    }).select().single();
    if (ins) {
      await supabase.from("tp_items").insert(tp.items.map((it, i) => {
        const prod = P(it.p);
        return { tp_id: ins.id, product_id: prod.id, product_name: prod.name, unit: prod.unit, qty: it.qty, purchase_rate: it.purchase_rate, sale_rate: it.sale_rate, gst_pct: 18, position: i };
      }));
    }
  }

  // Quotations
  const quotes = [
    { buyer: "Rajesh Constructions", date: d(3), valid_until: d(-27), items: [{ p: "MRB-002", qty: 120, rate: 615 }, { p: "QRZ-001", qty: 80, rate: 335 }] },
    { buyer: "Aman Interiors", date: d(1), valid_until: d(-29), items: [{ p: "GRN-001", qty: 400, rate: 142 }] },
  ];
  for (const q of quotes) {
    const quote_no = await nextDocNo("quotations", "quote_no", "QUO");
    const buyer = C(q.buyer);
    const { data: ins } = await supabase.from("quotations").insert({
      user_id: uid, quote_no, date: q.date, valid_until: q.valid_until,
      buyer_id: buyer.id, buyer_name: buyer.name,
    }).select().single();
    if (ins) {
      await supabase.from("quotation_items").insert(q.items.map((it, i) => {
        const prod = P(it.p);
        return { quotation_id: ins.id, product_id: prod.id, product_name: prod.name, unit: prod.unit, qty: it.qty, rate: it.rate, gst_pct: 18, position: i };
      }));
    }
  }

  // Payments
  const pays = [
    { dir: "in" as const,  contact: "Rajesh Constructions", date: d(38), amount: 25000, mode: "Bank", ref: "INV-0001" },
    { dir: "in" as const,  contact: "Sharma Builders",      date: d(20), amount: 40000, mode: "Bank", ref: "INV-0002" },
    { dir: "out" as const, contact: "Marudhar Stone Suppliers", date: d(40), amount: 60000, mode: "Bank", ref: "PO-0001" },
    { dir: "out" as const, contact: "South India Granites", date: d(25), amount: 30000, mode: "Cash", ref: "PO-0002" },
  ];
  for (const py of pays) {
    const payment_no = await nextDocNo("payments", "payment_no", py.dir === "in" ? "RI" : "PY");
    const c = C(py.contact);
    await supabase.from("payments").insert({
      user_id: uid, payment_no, direction: py.dir, date: py.date, amount: py.amount,
      mode: py.mode, ref_doc: py.ref, contact_id: c.id, contact_name: c.name,
    });
  }

  // Expenses
  await supabase.from("expenses").insert([
    { user_id: uid, date: d(35), category: "Transport", amount: 8500, mode: "Cash", notes: "Truck hire to Mumbai" },
    { user_id: uid, date: d(28), category: "Labour",    amount: 12000, mode: "Cash", notes: "Loading/unloading crew" },
    { user_id: uid, date: d(18), category: "Rent",      amount: 35000, mode: "Bank", notes: "Yard rent — monthly" },
    { user_id: uid, date: d(10), category: "Utilities", amount: 4200, mode: "Bank", notes: "Electricity" },
    { user_id: uid, date: d(2),  category: "Office",    amount: 2300, mode: "Cash", notes: "Stationery + tea" },
  ]);

  // Settings
  await supabase.from("settings").update({
    company_name: "StoneWorld Traders",
    gstin: "08AAACS9999X1Z5",
    state: "Rajasthan",
    address: "Marble Market, Kishangarh, Rajasthan 305801",
    phone: "+91 98123 45600",
    email: "hello@stoneworld.in",
  }).eq("user_id", uid);
}

export async function clearAllData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const uid = user.id;
  // Delete in dependency-safe order. Item tables and allocations cascade from headers.
  await supabase.from("payments").delete().eq("user_id", uid);
  await supabase.from("expenses").delete().eq("user_id", uid);
  await supabase.rpc("clear_my_deliveries" as never);
  await supabase.rpc("clear_my_notifications" as never);
  await supabase.from("sales").delete().eq("user_id", uid);
  await supabase.from("purchases").delete().eq("user_id", uid);
  await supabase.from("third_party").delete().eq("user_id", uid);
  await supabase.from("quotations").delete().eq("user_id", uid);
  await supabase.from("products").delete().eq("user_id", uid);
  await supabase.from("contacts").delete().eq("user_id", uid);
}