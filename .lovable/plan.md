# Plan: Full automation + Indian accounting + smart lookup

## 1. Database: auto IDs, allocations, journal engine

**New migration** adds:

- **Auto codes on insert** via triggers:
  - `products.code` → `P-0001` if blank
  - `contacts.code` (new col) → `B-0001` (buyer) / `S-0001` (supplier) / `BS-0001` (both)
  - Sales/Purchases/TP/Quote/Payment numbers auto-fill on insert if blank (calls `next_doc_no`)
- **payment_allocations** table: links a payment to one or more source docs (INV/PO/TP) with allocated amount → drives outstanding properly.
- **journal_entries / journal_lines** tables: every sale, purchase, TP, payment, expense writes balanced DR/CR lines per Indian GAAP chart of accounts:
  - Sales: DR Debtors, CR Sales, CR Output CGST/SGST/IGST
  - Purchase: DR Purchases, DR Input CGST/SGST/IGST, CR Creditors
  - TP: DR Debtors (sale value+GST), CR TP Revenue, CR Output GST; DR TP COGS, DR Input GST, CR Creditors — profit margin auto-flows to P&L
  - Payment-in: DR Bank/Cash, CR Debtors (allocated)
  - Payment-out: DR Creditors, CR Bank/Cash
  - Expense: DR Expense:Category, CR Cash/Bank
- **Triggers** auto-post journals on insert/update/delete (idempotent: delete old lines for that doc first).
- **Views**:
  - `outstanding_view` — per doc: total, paid (sum allocations), balance, status (paid/partial/unpaid/overdue)
  - `party_summary_view` — per contact: total business, receivable, payable, last txn date
  - `monthly_pnl_view`, `cash_flow_view` — month-wise aggregates
  - Rebuild `ledger_view` from `journal_lines` (single source of truth)

## 2. Frontend automation

- **Auto-fill on ID entry**: typing `INV-0001` in Payment, Invoice editor, or Lookup auto-fetches buyer/items/totals/outstanding via a shared `useDocLookup(id)` hook.
- **Lookup page**: searches across sales, purchases, TP, quotes, payments, **contacts (by name/phone/GSTIN)**, **products (by name/code/HSN)**. Tabbed result with full detail + linked payments + outstanding.
- **Payments page**: 
  - Outstanding panel lists open INV/PO/TP with balance.
  - Allocate amount across one or more docs; status auto-updates.
  - Auto-suggest contact from selected doc.
- **Sales/Purchase/TP forms**: contact picker auto-fills GSTIN/state → recomputes CGST/SGST vs IGST live.
- **Third-party flow**: clearer UI showing supplier cost, buyer price, margin (₹ + %) per line and totals.

## 3. Accounting reports (Indian GAAP-flavored)

- **P&L**: Revenue (Sales + TP Sales) → Less: COGS (Purchases + TP Purchases) = Gross Profit → Less: Indirect Expenses (by category) = Net Profit. Monthly columns toggle.
- **Balance Sheet**: Assets (Cash, Bank, Debtors, Stock-on-hand valued at purchase rate, Input GST) | Liabilities (Creditors, Output GST payable, Net GST liability) + Equity (Retained earnings).
- **Cash Flow** (new): Operating (collections − payments − expenses), monthly.
- **GST Summary** (new): Output GST, Input GST, Net payable, by month.
- **Party ledger drill-down**: click contact → full statement with running balance + total business.
- **Filters everywhere**: date range, party, product, doc type, status; column visibility toggles; CSV export.

## 4. UI polish

- Tighter sidebar, refined teal/grey tokens, better card density, sticky table headers, mobile sheet-based filters, improved print templates (A4, GST-compliant invoice format with HSN/SAC, place of supply, amount in words).

## Tech notes
- Single new migration creates allocations + journal tables + triggers + views; backfills journals for existing rows.
- New `src/lib/doc-lookup.ts` shared fetcher.
- New routes: `app.cash-flow.tsx`, `app.gst.tsx`; party-ledger drawer in `app.contacts.tsx`.
- No new dependencies.

After you approve I'll run the migration first, then ship the code in one pass.
