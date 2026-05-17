# Build plan — Buyers, Suppliers, Analytics, GST fix, Smart Lookup

This is a multi-turn build. I'll ship in 3 focused turns so each lands cleanly without breaking the app.

## Turn 1 — Data layer + GST fix (foundation)

**Fix GST Summary (root cause found)**
- `gst_summary_view` filters `account LIKE 'GST %'`, but the actual journal accounts are `Output CGST/SGST/IGST` and `Input CGST/SGST/IGST` (no `GST ` prefix). That's why no rows show.
- Rewrite the view to match real account names.

**New views to power buyers/suppliers/analytics**
- `party_aging_view` — buckets per party (0-30, 31-60, 61-90, 90+ days) for receivables and payables
- `monthly_party_view` — sales/purchases/payments per party per month (for "best buyer/supplier of month")
- `monthly_product_view` — qty + revenue per product per month (for "best products")
- `dashboard_top_view` — convenience view used by the dashboard tiles

**Indexes** on hot columns (sales.buyer_id, purchases.supplier_id, payments.contact_id, journal_lines.date, journal_lines.account) for speed.

## Turn 2 — Buyers / Suppliers / Analytics pages

**`/app/buyers`** — dedicated buyers page
- Sortable, searchable Excel-style table of all buyers (+ "both" contacts)
- Columns: Code, Name, State, GSTIN, Phone, Total Sales, Receivable, Last Txn, Aging badge
- Row click → drawer with invoices, payments, deliveries, ledger, aging breakdown
- Quick actions: **Receive Payment** (deep-links to /app/payments with party+dir=in), **New Sale**, **Open Deliveries**, **Statement (Excel)**

**`/app/suppliers`** — mirror of buyers for supplier-side
- Columns: Code, Name, State, GSTIN, Phone, Total Purchases, Payable, Last Txn, Aging
- Row drawer: POs, TPs (as supplier), payments out, ledger
- Quick actions: **Pay Supplier**, **New Purchase**, **Statement**

**`/app/analytics`** — bird's-eye monthly/yearly view
- Period toggle: This month / Last month / FY / Custom
- Top tiles: Revenue, Purchases, Cash earned, Cash spent, Best month, Margin %
- Best products / Best buyers / Best suppliers leaderboards (top 5 each, with sparkline-ish bars)
- Realtime: subscribe to `sales/purchases/payments` Postgres changes → refresh

**Nav updates** in `src/routes/app.tsx`: add Buyers, Suppliers, Analytics under "Masters" / "Books".

## Turn 3 — Smart Lookup + Excel auto-import + speed

**Smart Lookup hits**
- Each contact hit now shows: receivable / payable / open-doc count + state + GSTIN inline
- Each product hit shows: on-hand stock, low-stock badge if below reorder
- Each doc hit shows: balance + paid badge

**Auto Excel import**
- Generic header normalizer in `src/lib/excel.ts`: lowercases, strips spaces/underscores/punct, supports aliases per field (e.g. "Mobile" → phone, "GST No" → gstin, "Party" → name, "₹/Amount/Total" → amount).
- Per-entity column auto-mapping with smart defaults; unknown columns saved into `notes` JSON.
- Date parsing: ISO / dd-mm-yyyy / Excel serial all accepted.
- Row-level validation report (errors per row) instead of fail-fast.

**Performance pass**
- React Query for `/app/buyers`, `/app/suppliers`, `/app/analytics`, dashboard tiles — cached, instant on revisit.
- Realtime subscriptions auto-invalidate the relevant queries (no full reloads).
- Skeleton loaders so screens never look blank.
- Memoize heavy tables, virtualize only if a list exceeds 200 rows (otherwise plain table is faster on mobile).

---

### Technical notes

- All migrations use `CREATE OR REPLACE VIEW` with `security_invoker=on`. RLS on base tables already scopes to `auth.uid()`.
- Deep-link contract reused from earlier turn: `/app/payments?ref=<doc>&dir=in|out` plus a new `?party=<id>&dir=...` for "Pay party" from buyers/suppliers pages.
- No business-logic changes to existing sales/purchases/payments code — only views + new pages + smarter lookup/import.
- Mobile-first: tables get sticky first column + horizontal scroll; cards collapse to two-line summary on `<sm`.

Reply **continue** and I'll start with Turn 1 (GST fix + new views) so the rest builds on solid data.
