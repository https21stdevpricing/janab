import { useMemo, useState } from "react";
import { ChevronDown, Search, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";

type FAQ = {
  q: string;
  a: string;
  steps?: string[];
  links?: { label: string; to: string }[];
  tags?: string[];
};

type Group = { id: string; title: string; blurb: string; items: FAQ[] };

const GROUPS: Group[] = [
  {
    id: "start",
    title: "Getting started",
    blurb: "First-time setup, accounts and the basics.",
    items: [
      {
        q: "I'm not an accountant — can I really use this on my own?",
        a: "Yes. Every screen is built around plain-English actions like 'Save a sale' or 'Receive a payment'. The accounting journal is posted silently in the background, so you never have to know what a debit or credit is.",
        steps: [
          "Start with the 90-second Quick guide above to see every screen in action.",
          "Create your first sale from Sales → New. Don't worry about getting it perfect — you can edit it any time.",
          "Open Reports → Overview. Each ratio has a one-line explanation in plain English.",
        ],
        links: [
          { label: "Open Sales", to: "/app/sales" },
          { label: "Open Reports", to: "/app/reports" },
        ],
      },
      {
        q: "What should I set up before I start billing?",
        a: "Three things, in this order: your business profile (name, address, GSTIN), at least one product with HSN and rate, and an opening stock figure for that product. Everything else can be added on the fly.",
        steps: [
          "Open Settings and fill in business name, address and GSTIN.",
          "Open Products → New and add one product with HSN, unit and GST rate.",
          "Open Stock and set opening on-hand for that product.",
        ],
        links: [
          { label: "Settings", to: "/app/settings" },
          { label: "Products", to: "/app/products" },
          { label: "Stock", to: "/app/stock" },
        ],
      },
      {
        q: "Where is my data stored? Is it safe?",
        a: "Your data lives in our managed cloud database, encrypted at rest and in transit. Every record is scoped to your account through row-level security — nobody else, including other businesses on the platform, can read it.",
      },
      {
        q: "Can multiple people in my team use the same account?",
        a: "Yes. Invite teammates from Settings → Team. Each person signs in with their own email, and every action is logged in the audit trail with their name and timestamp.",
        links: [{ label: "Settings", to: "/app/settings" }],
      },
    ],
  },
  {
    id: "sales",
    title: "Sales, invoices & GST",
    blurb: "Billing, tax splits and document numbering.",
    items: [
      {
        q: "How is GST split between CGST, SGST and IGST?",
        a: "Based on the buyer's state of supply. If the buyer's state matches your business state, GST splits into CGST + SGST. If different, the full amount is charged as IGST. You don't pick — we read the buyer's GSTIN and decide.",
        steps: [
          "Make sure your business state is set in Settings.",
          "When you add a buyer, enter their GSTIN — the state is derived from the first two digits.",
          "Save the sale. The tax columns will already be correct.",
        ],
      },
      {
        q: "I made a mistake on an invoice — can I edit it?",
        a: "Yes, any unpaid or partially paid bill can be edited. We re-post the journal, restock the inventory and recompute GST so all downstream reports stay correct. For fully paid bills, raise a credit note instead so the trail stays clean.",
        links: [{ label: "Open Sales", to: "/app/sales" }],
      },
      {
        q: "How do invoice numbers work? Can I customise them?",
        a: "Invoice numbers are auto-generated per financial year (e.g. INV/2025-26/0001). You can change the prefix and starting number in Settings → Numbering. Once an invoice is saved, its number is locked to keep the GST series continuous.",
        links: [{ label: "Settings", to: "/app/settings" }],
      },
      {
        q: "Can I sell to a buyer who doesn't have a GSTIN?",
        a: "Yes. Leave the GSTIN blank and we'll treat it as a B2C sale. The bill is still tax-compliant; only the GSTR-1 export rolls these into the aggregate B2C summary instead of a line-item B2B entry.",
      },
      {
        q: "How do I calculate sqft from slab size?",
        a: "Enter length and width on the line item — we compute area, round per your settings, and use it as the billable quantity. If you sell per piece, leave the size blank and quantity stays a count.",
      },
      {
        q: "I sold something at a special rate for one buyer — will it remember?",
        a: "Yes. We track the last 5 rates you charged this buyer for each product. Next time you pick them, the most recent rate auto-fills, and a small history pill shows the trend.",
      },
    ],
  },
  {
    id: "stock",
    title: "Stock & inventory",
    blurb: "On-hand, movements, valuation methods.",
    items: [
      {
        q: "My on-hand looks wrong — how do I fix it?",
        a: "Open the product in Stock. The right panel shows every in/out movement with the source document. Find the one that's wrong, click through to the source bill, and edit it. The on-hand recomputes instantly.",
        steps: [
          "Open Stock and search the SKU.",
          "Scroll the movement history on the right — look for the suspect quantity.",
          "Click the source bill or PO link to open and correct it.",
          "Return to Stock — the new total is already live.",
        ],
        links: [
          { label: "Stock", to: "/app/stock" },
          { label: "Reports → Reconcile", to: "/app/reports" },
        ],
      },
      {
        q: "What's the difference between FIFO and Weighted Average?",
        a: "FIFO assumes the oldest stock leaves first, so its value reflects today's prices. Weighted Average mixes all batches into one price, smoothing out swings. Use FIFO when prices change often; use Weighted Average when they're stable.",
      },
      {
        q: "When does the 'lower of cost or market' rule apply?",
        a: "Whenever the market price of a SKU drops below what you paid. AS 2 requires you to report the lower number so profit isn't overstated. Reports → Valuation flags every SKU where this is true with a tiny red dot.",
      },
      {
        q: "Why is one SKU showing negative stock?",
        a: "You billed more than you had on hand, usually because the purchase entry is late. Add the missing purchase, or correct the sale quantity. The Reconcile tab in Reports lists every negative SKU with a one-click fix.",
        links: [{ label: "Reconcile", to: "/app/reports" }],
      },
    ],
  },
  {
    id: "payments",
    title: "Payments & receivables",
    blurb: "Collecting cash, allocations, aging.",
    items: [
      {
        q: "How does FIFO allocation work when a buyer pays?",
        a: "We apply the payment to the oldest open bill first, then the next, and so on, until the amount is exhausted. If there's leftover, it parks as an advance on that buyer's ledger.",
      },
      {
        q: "A buyer paid for one specific invoice — can I override the allocation?",
        a: "Yes. On the receipt screen, switch to Manual allocation and tick exactly which bills to settle. The auto-FIFO is just a default to save you time.",
        links: [{ label: "Payments", to: "/app/payments" }],
      },
      {
        q: "What is an aging bucket and which one should I chase?",
        a: "Aging buckets group unpaid bills by how overdue they are: 0-30, 31-60, 61-90, and 90+ days. Always chase 90+ first — every day they age, the recovery rate drops. Reds = urgent, ambers = nudge, greens = healthy.",
      },
      {
        q: "Can I record a payment that hasn't cleared the bank yet?",
        a: "Yes. Set the payment mode to 'Cheque' or 'NEFT pending' and mark the clearance date. Until cleared, it shows in the bank reconciliation list. Once cleared, mark it cleared and the cash account updates.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports & accounting",
    blurb: "P&L, Balance Sheet, ratios, exports.",
    items: [
      {
        q: "My Trial Balance doesn't balance — what now?",
        a: "Open Reports → Reconcile. It scans every journal for drift, lists the exact entries that don't tie, and gives one-click links to fix each one. In most cases the cause is an opening balance not posted to both sides.",
        steps: [
          "Open Reports → Reconcile tab.",
          "Read the 'Trial Balance drift' card — it names the account and the gap.",
          "Click 'Fix in Ledger' to open the suspect journal.",
          "Save the corrected entry — the drift card turns green.",
        ],
        links: [{ label: "Reconcile", to: "/app/reports" }],
      },
      {
        q: "What's the difference between gross margin and net margin?",
        a: "Gross margin = (Revenue − Cost of goods sold) ÷ Revenue. It tells you what's left after the cost of what you sold. Net margin subtracts everything else (rent, salary, interest, tax) and tells you what actually ends up in your pocket.",
      },
      {
        q: "What is 'cash runway'?",
        a: "How many months you can keep operating at your current burn rate without any new income. Below 3 months is a red flag; above 6 is comfortable. The number on the dashboard updates daily as cash moves.",
      },
      {
        q: "Can I export reports for my CA?",
        a: "Yes. Every report has Export → PDF and Export → Excel buttons. The Excel export preserves formulas where it can, so your CA can pivot and recheck without re-typing.",
      },
      {
        q: "Why is profit on P&L different from money in the bank?",
        a: "Profit is earned when you raise the bill; cash arrives when the buyer pays. The gap is your receivables. If the gap is widening, you're profitable on paper but starving for cash — chase the aging report.",
      },
    ],
  },
  {
    id: "errors",
    title: "Errors & troubleshooting",
    blurb: "When something looks off or breaks.",
    items: [
      {
        q: "A page says 'Something went wrong' — what do I do?",
        a: "Tap Retry on the error card. Most errors are transient (network blink, slow query). If it persists, open the same screen with a smaller date range — large windows occasionally time out on slow connections.",
      },
      {
        q: "I lost connection while saving — is my work gone?",
        a: "No. Forms autosave to your device as a draft every few seconds. When the connection returns, open the same screen — you'll see a 'Resume draft' banner with your unsaved entries.",
      },
      {
        q: "My device back button took me somewhere unexpected.",
        a: "Back closes overlays first (any open sheet, modal or filter panel), then steps one screen back in your history. If you were deep inside a record, Back returns to the list you came from with the same filters applied.",
      },
      {
        q: "A number on the dashboard doesn't match a report. Why?",
        a: "The dashboard always shows 'today' or 'this week' by default. Reports default to the financial year. Match the date range on both and the numbers will agree. If they still don't, open Reports → Reconcile.",
      },
      {
        q: "I deleted something by mistake — can I get it back?",
        a: "Every deletion is soft for 30 days. Open Settings → Audit log, find the entry, and click Restore. The original document number, journal and stock movement come back unchanged.",
        links: [{ label: "Audit", to: "/app/audit" }],
      },
    ],
  },
  {
    id: "account",
    title: "Account & billing",
    blurb: "Plans, invites, exports and closing.",
    items: [
      {
        q: "How do I change my plan or payment method?",
        a: "Settings → Billing. Plans take effect immediately; you'll only be charged the prorated difference at the next cycle.",
      },
      {
        q: "Can I export everything if I want to leave?",
        a: "Yes. Settings → Data export builds a zipped archive of every invoice, payment, journal and product with images, ready in a few minutes. It's yours forever — no lock-in.",
      },
      {
        q: "How do I close my account?",
        a: "Settings → Danger zone → Close account. Your data stays available for 60 days in case you change your mind, then is permanently deleted. We send an email confirmation at each step.",
      },
    ],
  },
];

export function GuideFAQ() {
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (it) =>
          it.q.toLowerCase().includes(q) ||
          it.a.toLowerCase().includes(q) ||
          it.steps?.some((s) => s.toLowerCase().includes(q)),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  const totalCount = GROUPS.reduce((n, g) => n + g.items.length, 0);

  return (
    <section className="mt-20 border-t border-border/60 pt-12">
      <div className="flex flex-col gap-1 mb-2">
        <div className="text-[10px] uppercase tracking-[0.16em] text-primary font-medium">
          Help centre
        </div>
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.05]">
          Every question, answered
        </h2>
        <p className="text-[15px] text-muted-foreground mt-2 max-w-[60ch] leading-relaxed">
          {totalCount} answers covering setup, billing, GST, stock, payments,
          reports and recovery. Search or browse by topic — each answer ends
          with a one-click path to the screen that fixes it.
        </p>
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the help centre… e.g. 'GST split', 'negative stock', 'cash runway'"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-10 space-y-12">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
            <HelpCircle className="h-5 w-5 text-muted-foreground mx-auto" />
            <div className="mt-2 text-sm font-medium">No matching answers</div>
            <div className="text-xs text-muted-foreground mt-1">
              Try a shorter or different keyword.
            </div>
          </div>
        )}

        {filtered.map((g) => (
          <div key={g.id}>
            <div className="grid md:grid-cols-[200px_1fr] gap-6 md:gap-10">
              <div className="md:sticky md:top-4 self-start">
                <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-medium">
                  {g.title}
                </div>
                <div className="text-[11px] text-muted-foreground/80 mt-1.5 leading-relaxed">
                  {g.blurb}
                </div>
              </div>
              <div className="divide-y divide-border/60 border-y border-border/60">
                {g.items.map((it, idx) => {
                  const key = `${g.id}-${idx}`;
                  const open = openKey === key;
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setOpenKey(open ? null : key)}
                        className="w-full flex items-start gap-3 py-4 text-left group"
                      >
                        <span className="flex-1 text-[15px] font-medium tracking-tight leading-snug text-foreground group-hover:text-primary transition-colors">
                          {it.q}
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground mt-1 shrink-0 transition-transform duration-300",
                            open && "rotate-180 text-foreground",
                          )}
                        />
                      </button>
                      <div
                        className={cn(
                          "grid transition-all duration-300 ease-out",
                          open
                            ? "grid-rows-[1fr] opacity-100 pb-5"
                            : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="overflow-hidden">
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {it.a}
                          </p>
                          {it.steps && (
                            <ol className="mt-3 space-y-1.5">
                              {it.steps.map((s, k) => (
                                <li
                                  key={k}
                                  className="flex gap-2.5 text-[13px] text-foreground/90 leading-relaxed"
                                >
                                  <span className="mt-0.5 h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-semibold grid place-items-center shrink-0 tabular-nums">
                                    {k + 1}
                                  </span>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                          {it.links && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {it.links.map((l) => (
                                <Link
                                  key={l.to}
                                  to={l.to as any}
                                  className="text-[11px] rounded-full border border-border bg-background px-2.5 py-1 hover:bg-muted transition-colors"
                                >
                                  {l.label} →
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-2xl border border-border/70 bg-muted/30 p-6 text-center">
        <div className="text-sm font-semibold tracking-tight">
          Still stuck? We're one tap away.
        </div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[44ch] mx-auto leading-relaxed">
          Use Reports → Reconcile for accounting mismatches. For anything else,
          email support — we reply within one working day.
        </div>
      </div>
    </section>
  );
}