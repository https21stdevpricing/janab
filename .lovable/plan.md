# StoneWorld Operations Workbook v10 — Final Rebuild

Goal: deliver one clean `.xlsx` that opens with **zero repair warnings, zero formula errors, zero circular references**, with full automation (live lookups, auto-status, auto-totals) and a minimal, consistent visual style.

## What you'll get

A single file: **StoneWorld_Operations_v10.xlsx** (plus a parallel `.xlsm` instructions block so you can save it macro-enabled in one click).

### Sheet structure (18 sheets, grouped)

**Setup**
1. `Start Here` — 1-page guide: where to enter data, where to read results.
2. `Settings` — company info, GST %, FY start/end, low-stock threshold, credit-limit default.

**Masters**
3. `Products` — code, name, unit, HSN, purchase rate, sale rate, opening stock, reorder level.
4. `Contacts` — buyers + suppliers in one list with a Type column, GSTIN, address, credit limit.

**Transactions**
5. `Sales` — header + line items in one flat table (Invoice No, Date, Buyer, Product, Qty, Rate, GST%, Line Total auto).
6. `Purchases` — same shape as Sales.
7. `Payments In` — receipts against invoices.
8. `Payments Out` — payments against purchases.
9. `Expenses` — date, category, amount, notes.
10. `Deliveries` — invoice no, dispatch date, vehicle, status.

**Auto-derived (read-only formulas)**
11. `Stock Ledger` — per-product on-hand = opening + purchased − sold; flags low stock.
12. `Buyer Ledger` — per-contact billed − received = outstanding; flags over-credit-limit.
13. `Supplier Ledger` — per-contact billed − paid.
14. `Accounting` — live P&L + GST payable + cash position for the FY in Settings.
15. `Owner Alerts` — single list of every problem (low stock, overdue, mismatch).

**Print / Lookup**
16. `Invoice Print` — type Invoice No in B6 → full GST invoice auto-fills.
17. `Quotation` — same idea, draft quotes that don't touch stock.
18. `VBA Guide` — exact code blocks + which module to paste each into, with one-line description per macro.

## How automation works

- **Line items auto-fetch**: in `Sales`/`Purchases`, picking a Product code auto-fills name, unit, HSN, default rate, GST% via `INDEX/MATCH` (no `VLOOKUP`, no dynamic arrays).
- **Live totals**: line total, GST split (CGST/SGST/IGST based on buyer state vs company state), invoice total — all formula-driven.
- **Live status**: Invoice "Paid / Partial / Unpaid" via `SUMIFS` against Payments In; Delivery status via `Deliveries`.
- **Live stock**: every Sales/Purchase row updates `Stock Ledger` instantly.
- **Owner Alerts**: one consolidated `IFERROR/AGGREGATE` list — overdue invoices, low stock, over-limit buyers, header-vs-line mismatches.
- **Print sheets**: type one ID → invoice/quotation renders with up to 20 line items.

## Error-prevention rules applied

- No `UNIQUE`, `FILTER`, `SORT`, `LET`, `LAMBDA`, `XLOOKUP` (mobile/older Excel safe).
- No circular references (validated by recalculating every formula and scanning all cells).
- All blank-safe: `IFERROR(...,"")` and `IF(key="","",...)` everywhere.
- Data validation drop-downs for Product, Buyer, Supplier, GST%, Status — no typos.
- Frozen panes + table styles + consistent number formats (₹#,##0.00; dates dd-mmm-yyyy).

## Visual style (minimal)

- White background, single accent (slate-blue), thin gray borders only on data tables.
- One font (Calibri 11), bold headers, no fills except header row + KPI tiles.
- Same column widths and header style across every sheet.

## VBA Guide (optional, only if you save as .xlsm)

Each macro block is labeled with: **what it does**, **which sheet/module to paste into**, **how to trigger**.
1. `Workbook_Open` → ThisWorkbook → forces full recalc on open.
2. `Worksheet_Change` (Sales/Purchases) → live recalc on edit.
3. `PrintInvoice` / `PrintQuotation` → standard module → prompts for ID, prints.
4. `BackupNow` → standard module → saves a timestamped copy next to the file.

## Build & QA process

1. Generate workbook via `openpyxl` with all formulas.
2. Recalculate via LibreOffice; assert **0 errors across all cells**.
3. Open in LibreOffice headless → confirm no "repaired records" entry.
4. Spot-check: add a sample Sale + Payment → confirm Stock Ledger, Buyer Ledger, Accounting, Owner Alerts all update.
5. Deliver `StoneWorld_Operations_v10.xlsx` to `/mnt/documents/` as a `<presentation-artifact>`.

## Confirm before I build

- Keep **18 sheets** as listed above? Anything to add/remove?
- Currency **₹ INR** and **GST (CGST/SGST/IGST)** — correct for your business?
- Any specific column you used in v6/v7 that you want preserved by name? (If yes, list them — otherwise I use the standard columns above.)
