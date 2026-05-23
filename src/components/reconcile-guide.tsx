import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight, CheckCircle2, Wrench, BookOpen, Scale, Boxes, Wallet, Receipt, History } from "lucide-react";
import { Surface, SectionTitle, Pill } from "@/components/ui-tokens";

/**
 * Self-help panel that explains common report mismatches and points the
 * user directly to the page that can fix them. Each "symptom" lists the
 * likely cause in plain English and a one-tap deep link to the fix page.
 */

type Severity = "ok" | "warn" | "bad";

export interface ReconcileSignal {
  /** Stable id so we can de-dupe / re-order. */
  id: string;
  severity: Severity;
  /** Short headline visible at the top of the row. */
  title: string;
  /** Plain-English what happened. */
  symptom: string;
  /** Plain-English why it usually happens. */
  likelyCause: string;
  /** Step-by-step fix the user can follow. */
  steps: string[];
  /** Exact rows / documents that most likely caused the issue. */
  evidence?: Array<{ label: string; detail: string; amount?: string }>;
  /** Deep link that takes the user to the fix surface. */
  fix: { label: string; to: string };
  icon?: any;
}

export function ReconcileGuide({ signals }: { signals: ReconcileSignal[] }) {
  const open = signals.filter((s) => s.severity !== "ok");
  return (
    <Surface className="space-y-4">
      <SectionTitle
        title="Reconciliation helper"
        description="If a number looks wrong, start here. Each item explains what likely caused the mismatch and links to the exact page to fix it."
        action={
          open.length === 0 ? (
            <Pill tone="good"><CheckCircle2 className="h-3 w-3" /> All checks pass</Pill>
          ) : (
            <Pill tone={open.some((s) => s.severity === "bad") ? "bad" : "warn"}>
              <AlertTriangle className="h-3 w-3" /> {open.length} to review
            </Pill>
          )
        }
      />

      {open.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Your books are tying out across the trial balance, balance sheet, stock ledger and GST.
          If a specific figure still feels off, open the relevant section below for a guided walkthrough.
        </div>
      ) : (
        <div className="space-y-3">
          {open.map((s) => (
            <ReconcileRow key={s.id} signal={s} />
          ))}
        </div>
      )}

      <details className="group rounded-lg surface-muted p-3">
        <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium">
          <BookOpen className="h-4 w-4" />
          Common mismatch walkthroughs
          <ChevronRight className="h-4 w-4 ml-auto transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <WalkthroughCard
            icon={Scale}
            title="Trial balance is off by a few rupees"
            body="Almost always a rounding artefact on GST or a single journal line with a typo. Open the General Ledger, group by account, and look for the smallest debit/credit pair near the variance amount."
            to="/app/ledger"
            cta="Open General Ledger"
          />
          <WalkthroughCard
            icon={Boxes}
            title="Closing stock doesn't match what you counted"
            body="Usually means a sale or purchase was posted without selecting the SKU, or opening stock was never entered. Open Stock to see per-SKU movement; open Products to set opening stock."
            to="/app/stock"
            cta="Open Stock"
          />
          <WalkthroughCard
            icon={Wallet}
            title="A buyer's balance looks wrong"
            body="A payment was likely received but not allocated to the right invoice. Open Money, edit the entry, and allocate to the correct bill."
            to="/app/bills"
            cta="Open Money"
          />
          <WalkthroughCard
            icon={Receipt}
            title="GST output and bill total disagree"
            body="Check the invoice's HSN and tax rate per line. Inter-state sales must use IGST, intra-state must use CGST+SGST."
            to="/app/gst"
            cta="Open GST summary"
          />
          <WalkthroughCard
            icon={History}
            title="A number changed without explanation"
            body="Every create, edit and delete is logged. Open the Audit log, filter by entity and date, and you'll see who/when/what."
            to="/app/audit"
            cta="Open Audit log"
          />
          <WalkthroughCard
            icon={Wrench}
            title="Still stuck?"
            body="Re-post nothing. Instead, add a journal-style correction by entering an offsetting transaction (return / refund / write-off) so your audit trail stays intact."
            to="/app/guide"
            cta="See guided tours"
          />
        </div>
      </details>
    </Surface>
  );
}

function ReconcileRow({ signal }: { signal: ReconcileSignal }) {
  const Icon = signal.icon ?? AlertTriangle;
  const tone =
    signal.severity === "bad" ? "bad" : signal.severity === "warn" ? "warn" : "good";
  return (
    <details className="group rounded-xl border border-border/70 bg-card overflow-hidden">
      <summary className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/40">
        <div
          className={
            "h-8 w-8 rounded-full grid place-items-center shrink-0 " +
            (tone === "bad"
              ? "bg-destructive/10 text-destructive"
              : tone === "warn"
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
              : "bg-primary/10 text-primary")
          }
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm leading-tight">{signal.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{signal.symptom}</div>
        </div>
        <Pill tone={tone}>{tone === "bad" ? "Action needed" : tone === "warn" ? "Review" : "OK"}</Pill>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="px-3 sm:px-4 pb-4 space-y-3 border-t bg-muted/20">
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <Block title="What this means">{signal.symptom}</Block>
          <Block title="Why it usually happens">{signal.likelyCause}</Block>
        </div>
        {signal.evidence?.length ? (
          <div>
            <div className="eyebrow mb-1.5">Exact entries to check first</div>
            <div className="grid gap-2">
              {signal.evidence.slice(0, 5).map((item, i) => (
                <div key={`${item.label}-${i}`} className="rounded-lg border border-border/60 bg-card px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{item.label}</div>
                      <div className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.detail}</div>
                    </div>
                    {item.amount ? <div className="text-sm font-semibold tabular-nums whitespace-nowrap">{item.amount}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div>
          <div className="eyebrow mb-1.5">How to fix it</div>
          <ol className="text-sm text-foreground/90 space-y-1 list-decimal pl-5 leading-relaxed">
            {signal.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
        <Link
          to={signal.fix.to}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          {signal.fix.label} <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </details>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="eyebrow mb-1">{title}</div>
      <div className="text-sm text-foreground/90 leading-relaxed">{children}</div>
    </div>
  );
}

function WalkthroughCard({
  icon: Icon,
  title,
  body,
  to,
  cta,
}: {
  icon: any;
  title: string;
  body: string;
  to: string;
  cta: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div className="text-sm font-medium">{title}</div>
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{body}</p>
      <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-2 hover:underline">
        {cta} <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

/**
 * Build the live signal list for the reports page. Pure function so it can
 * be unit-tested. All thresholds picked from accounting practice; kept
 * conservative so the panel only screams when something is genuinely off.
 */
export function buildReconcileSignals(args: {
  tbDebit: number;
  tbCredit: number;
  assetsTotal: number;
  liabilitiesPlusEquity: number;
  bookStockValue: number;
  negativeStockSkus: number;
  negativeStockDetails?: Array<{ name: string; opening: number; purchased: number; sold: number; onHand: number }>;
  unallocatedPaymentsAmt: number;
  unallocatedPaymentsCount: number;
  unallocatedPaymentDetails?: Array<{ direction: string; amount: number; used: number; remaining: number; id?: string | null; party?: string | null }>;
  netGstPayable: number;
  missingHsnCount: number;
  missingHsnProducts?: Array<{ name: string }>;
  productsWithoutOpening: number;
  productsWithoutOpeningDetails?: Array<{ name: string; sold: number; purchased: number }>;
  largestLedgerImbalances?: Array<{ account: string; debit: number; credit: number; net: number }>;
}): ReconcileSignal[] {
  const out: ReconcileSignal[] = [];
  const tbDiff = Math.abs(args.tbDebit - args.tbCredit);
  out.push({
    id: "tb",
    severity: tbDiff < 1 ? "ok" : tbDiff < 100 ? "warn" : "bad",
    title: "Trial balance",
    symptom:
      tbDiff < 1
        ? "Total debits equal total credits."
        : `Debits and credits differ by ${formatINR(tbDiff)}.`,
    likelyCause:
      tbDiff < 1
        ? "No action required. Every debit currently has a matching credit."
        : "Usually one source document posted only one side, an amount was edited after posting, or a ledger line was deleted.",
    evidence: args.largestLedgerImbalances?.slice(0, 4).map((r) => ({
      label: r.account,
      detail: `Debit ${formatINR(r.debit)} · Credit ${formatINR(r.credit)} · ${r.net >= 0 ? "Debit" : "Credit"} net`,
      amount: formatINR(Math.abs(r.net)),
    })),
    steps: [
      "Open General Ledger and filter the accounts shown above first.",
      "Inside those accounts, compare the document number, date and debit/credit side against the source invoice / payment.",
      "If one side is missing or the amount differs, edit the source document — do not patch the ledger directly.",
      "Re-open Reports — the trial balance recomputes automatically.",
    ],
    fix: { label: "Open General Ledger", to: "/app/ledger" },
    icon: Scale,
  });

  const bsDiff = Math.abs(args.assetsTotal - args.liabilitiesPlusEquity);
  out.push({
    id: "bs",
    severity: bsDiff < 1 ? "ok" : bsDiff < 100 ? "warn" : "bad",
    title: "Balance sheet",
    symptom:
      bsDiff < 1
        ? "Assets equal Liabilities + Equity."
        : `Assets exceed Liabilities + Equity by ${formatINR(bsDiff)}.`,
    likelyCause:
      bsDiff < 1
        ? "No action required. Assets, liabilities and equity currently tie out."
        : "Most often caused by inventory value drift, missing opening stock, or documents that changed stock without the matching accounting effect.",
    evidence: [
      { label: "Assets", detail: "Total of cash, bank, receivables, GST input, inventory and fixed assets.", amount: formatINR(args.assetsTotal) },
      { label: "Liabilities + Equity", detail: "Payables, GST output, profit and opening capital.", amount: formatINR(args.liabilitiesPlusEquity) },
      { label: "Book stock value", detail: "Inventory valuation feeding the balance sheet.", amount: formatINR(args.bookStockValue) },
    ],
    steps: [
      "Check the stock items listed in the other reconciliation warnings first — they usually explain this difference.",
      "Open Products and set opening stock/value for items already in your godown when you started.",
      "Open Stock and review negative on-hand SKUs; add the missing purchase or correct the wrong sale SKU.",
    ],
    fix: { label: "Open Products", to: "/app/products" },
    icon: Boxes,
  });

  if (args.negativeStockSkus > 0) {
    out.push({
      id: "neg-stock",
      severity: "bad",
      title: `${args.negativeStockSkus} item${args.negativeStockSkus === 1 ? "" : "s"} sold without stock`,
      symptom:
        "These SKUs have more sold than purchased + opening — your inventory value is understated.",
      likelyCause:
        "A purchase invoice is missing, opening stock was never entered, or a sale picked the wrong SKU.",
      evidence: args.negativeStockDetails?.slice(0, 5).map((r) => ({
        label: r.name,
        detail: `Opening ${fmtQty(r.opening)} + Purchased ${fmtQty(r.purchased)} - Sold ${fmtQty(r.sold)} = ${fmtQty(r.onHand)} on hand`,
        amount: `${fmtQty(Math.abs(r.onHand))} short`,
      })),
      steps: [
        "Open Stock and click the exact SKU shown above.",
        "Read its movement list from oldest to newest; the first row where running stock goes below zero is the problem point.",
        "If goods really came in, add the missing purchase before that sale date. If not, edit the sale and choose the correct SKU / quantity.",
      ],
      fix: { label: "Open Stock", to: "/app/stock" },
      icon: Boxes,
    });
  }

  if (args.productsWithoutOpening > 0) {
    out.push({
      id: "no-opening",
      severity: "warn",
      title: `${args.productsWithoutOpening} product${args.productsWithoutOpening === 1 ? "" : "s"} without opening stock`,
      symptom:
        "Stocked items with zero opening can cause closing stock to look low if they existed before you started.",
      likelyCause: "Opening balances were skipped when products were created.",
      evidence: args.productsWithoutOpeningDetails?.slice(0, 5).map((r) => ({
        label: r.name,
        detail: `Opening is zero while purchased is ${fmtQty(r.purchased)} and sold is ${fmtQty(r.sold)}.`,
      })),
      steps: [
        "Open Products and start with the products listed above.",
        "For each affected SKU, enter the quantity and purchase rate that was physically present on day one.",
        "Save — the inventory tab in Reports will refresh.",
      ],
      fix: { label: "Open Products", to: "/app/products" },
      icon: Boxes,
    });
  }

  if (args.unallocatedPaymentsCount > 0) {
    out.push({
      id: "unalloc-pay",
      severity: "warn",
      title: `${args.unallocatedPaymentsCount} unallocated payment${args.unallocatedPaymentsCount === 1 ? "" : "s"} (${formatINR(args.unallocatedPaymentsAmt)})`,
      symptom:
        "Money was received or paid but not linked to a specific invoice — buyer/supplier balances will look incorrect.",
      likelyCause:
        "Payment entered in a hurry without selecting which bill it settles.",
      evidence: args.unallocatedPaymentDetails?.slice(0, 5).map((p) => ({
        label: `${p.direction === "in" ? "Receipt" : "Payment"}${p.party ? ` · ${p.party}` : ""}`,
        detail: `Total ${formatINR(p.amount)} · allocated ${formatINR(p.used)} · still not linked to a bill`,
        amount: formatINR(p.remaining),
      })),
      steps: [
        "Open Money and search the amount / party shown above.",
        "Open that entry and allocate the remaining amount to the exact invoice or purchase bill it settles.",
        "Buyer / supplier outstanding refreshes immediately.",
      ],
      fix: { label: "Open Money", to: "/app/bills" },
      icon: Wallet,
    });
  }

  if (args.missingHsnCount > 0) {
    out.push({
      id: "missing-hsn",
      severity: "warn",
      title: `${args.missingHsnCount} product${args.missingHsnCount === 1 ? "" : "s"} missing HSN`,
      symptom: "GST returns require HSN — your GSTR-1 will reject these lines.",
      likelyCause: "Product created without an HSN code.",
      evidence: args.missingHsnProducts?.slice(0, 5).map((p) => ({
        label: p.name,
        detail: "Product master has no HSN/SAC code, so invoice and GST reports cannot classify it.",
      })),
      steps: [
        "Open Products and search the product names listed above.",
        "Enter the HSN for each affected item, usually available on supplier invoices or product packaging.",
        "Re-open GST summary to confirm.",
      ],
      fix: { label: "Open Products", to: "/app/products" },
      icon: Receipt,
    });
  }

  return out;
}

function formatINR(n: number) {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Math.round(n));
  } catch {
    return `₹${Math.round(n)}`;
  }
}