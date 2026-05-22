Five focused workstreams. Goal: a calmer, Apple-grade UI with zero accounting friction for first-time users.

## 1. Money page (`src/routes/app.bills.tsx`) — clean rebuild

Replace the current dense layout with a 3-zone structure:

```text
┌───────────────────────────────────────────┐
│ Header · Receipt | Payment (primary CTAs) │
├───────────────────────────────────────────┤
│ ┌─────────────┐  ┌─────────────┐          │
│ │ RECEIVABLE  │  │  PAYABLE    │  Net pos │
│ │ ₹ amount    │  │  ₹ amount   │  Overdue │
│ └─────────────┘  └─────────────┘          │
├───────────────────────────────────────────┤
│ Tabs: Receivables · Payables · History    │
│ Ageing chips · Filters · Search           │
│                                           │
│ Bill row → tap → pre-filled dialog        │
└───────────────────────────────────────────┘
```

- Strip duplicate KPI tiles; collapse to one neat 2×2 stat block with quiet borders, no color noise.
- Each row: party name (bold) · doc no · due-in chip · paid bar · balance (tabular). Tap = settle dialog auto-filled (party, balance, allocation).
- New transaction dialog: 3 clear sections — **Who & how much**, **Method** (Cash/Bank/UPI/Cheque with smart fields), **Allocate to bills** (auto-allocate oldest toggle).
- Empty states with one-line guidance + CTA.

## 2. Bank & cash page (`src/routes/app.bank.tsx`) — make it useful

- Add **Pending cheques** section at top (separate from cleared list) with one-tap **Mark cleared / Bounced** actions and inline edit of cheque no / date.
- Add **status edit** on every row (Pending → Cleared / Bounced) — currently missing.
- Tighten layout: balance tiles → segmented filter → table-like rows with consistent columns (No · Date · Type · Ref · Amount · Status · Actions).
- Add link explaining how cash/bank flows from sales/payments so users see *why* it's useful.

## 3. Lookup page (`src/routes/app.lookup.tsx`) — Apple-style redesign

- Big centered search hero, calm typography, generous whitespace.
- Result groups (Bills, Parties, Products, Payments) as distinct sections with subtle dividers, not cards-in-cards.
- Keyboard hints (↑↓ ↵) right-aligned.
- Recent searches chip row.

## 4. New-user onboarding wizard

New route `src/routes/app.onboarding.tsx` + a `needs_onboarding` flag on `settings`:

- 5 steps: **Business info → Opening cash & bank → Opening stock → Opening receivables (who owes you) → Opening payables (who you owe)**.
- All entries written as a single **"Opening balances" journal voucher** dated 1 day before today, tagged `is_opening=true`, so trial balance stays balanced (debits = credits via Owner's Equity / Opening Balance Equity account).
- Stock opening: writes to `stock_adjustments` as `kind='opening'` so stock_view stays consistent (no fake sales).
- Skippable per step; resumable. Existing users access via **Settings → Opening balances** button.
- Auto-redirect first-time users to `/app/onboarding` after signup until completed or skipped.

Migration: add `settings.onboarding_done boolean`, `journal_entries.is_opening boolean`, `stock_adjustments.kind` enum extension to include `opening`, and an `opening_balance_equity` virtual account in chart-of-accounts logic.

## 5. Interactive charts (dashboard graphical view)

Upgrade the bar chart in `src/routes/app.index.tsx`:

- Crosshair line + floating tooltip on touch/hover (like the Instagram-style screenshot) showing date + exact value.
- Pinch/drag brush strip below the chart for zooming time range.
- Smooth value-morph when switching metric (locked, no autoplay — already done).
- Use Recharts `<Tooltip>` with custom content + `<Brush>` component.

## Technical notes

- All new UI uses existing semantic tokens (`bg-card`, `border`, `text-muted-foreground`, `primary`). No new colors.
- Money dialog reuses existing payment insert path (no business-logic rewrite).
- Onboarding posts via a single `createServerFn` `postOpeningBalances` for atomicity.
- Cheque status edit hits existing `bank_transfers` row with new `status` column (`pending|cleared|bounced`) replacing the bare `cleared` boolean (migration keeps backward compat).
- Add FAQ entries for: "How do I mark a cheque cleared?", "I'm new — where do I enter opening balances?", "Why is my trial balance off after adding products?" — pointing to onboarding/bank actions.

## Out of scope

- No changes to invoice/sales/purchase flows beyond what onboarding requires.
- No new auth or roles work.