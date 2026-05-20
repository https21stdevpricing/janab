import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, ShoppingCart, Truck, Wallet, FileSpreadsheet,
  Search, BookOpen, Boxes, ArrowRight, Sparkles, Check, ArrowDown,
} from "lucide-react";

export const Route = createFileRoute("/app/guide")({ component: GuidePage });

/* ---------------- Mini animated prototypes ---------------- */

function MockSale() {
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New sale</div>
      <div className="mt-2 space-y-1.5">
        {["Kota stone — 50 sqft", "Granite slab — 12 sqft"].map((t, i) => (
          <div
            key={t}
            className="flex items-center justify-between text-xs bg-background rounded-md px-2.5 py-1.5 border border-border/60 animate-in fade-in slide-in-from-left-2"
            style={{ animationDelay: `${i * 200}ms`, animationDuration: "500ms", animationFillMode: "both" }}
          >
            <span>{t}</span>
            <span className="font-mono tabular-nums text-primary">₹{(i === 0 ? 18750 : 9000).toLocaleString()}</span>
          </div>
        ))}
        <div
          className="flex items-center justify-between text-xs font-semibold bg-primary/10 text-primary rounded-md px-2.5 py-1.5 animate-in fade-in"
          style={{ animationDelay: "600ms", animationDuration: "400ms", animationFillMode: "both" }}
        >
          <span>Total</span><span className="font-mono tabular-nums">₹27,750</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[10px] text-emerald-600 animate-in fade-in" style={{ animationDelay: "900ms", animationDuration: "400ms", animationFillMode: "both" }}>
        <Check className="h-3 w-3" /> Saved — stock reduced, ledger posted, delivery created
      </div>
    </div>
  );
}

function MockFlow() {
  const dots = [
    { label: "Sale", icon: ShoppingCart },
    { label: "Stock −50", icon: Boxes },
    { label: "Ledger", icon: BookOpen },
    { label: "Bill", icon: FileSpreadsheet },
  ];
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">One save → four updates</div>
      <div className="flex items-center justify-between gap-2">
        {dots.map((d, i) => {
          const Icon = d.icon;
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className="h-10 w-10 rounded-full bg-background border border-border grid place-items-center animate-in fade-in zoom-in-50"
                style={{ animationDelay: `${i * 250}ms`, animationDuration: "400ms", animationFillMode: "both" }}
              >
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <span
                className="text-[10px] text-muted-foreground animate-in fade-in"
                style={{ animationDelay: `${i * 250 + 200}ms`, animationDuration: "300ms", animationFillMode: "both" }}
              >{d.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 h-1 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary animate-[grow_1.2s_ease-out_forwards] origin-left" style={{ transform: "scaleX(0)" }} />
      </div>
      <style>{`@keyframes grow { to { transform: scaleX(1); } }`}</style>
    </div>
  );
}

function MockDelivery() {
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Challan #DL-204</div>
      <div className="mt-2 text-xs text-muted-foreground">Vehicle MH-12-AB-1234 · Driver Ramesh</div>
      <div className="mt-4 flex items-center gap-2">
        {["Pending", "Dispatched", "Delivered"].map((s, i) => (
          <div key={s} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-all",
                i === 0 && "bg-muted-foreground/40",
                i === 1 && "bg-amber-500 animate-pulse",
                i === 2 && "bg-emerald-500",
              )}
              style={{ animationDelay: `${i * 300}ms` }}
            />
            <span className="text-[10px]">{s}</span>
          </div>
        ))}
      </div>
      <div className="absolute left-4 right-4 top-[calc(50%+24px)] h-px bg-border -z-0" />
      <div className="mt-4 inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full">
        <Truck className="h-3 w-3" /> Truck on the way
      </div>
    </div>
  );
}

function MockPayment() {
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Receive ₹50,000</div>
      <div className="mt-2 space-y-1.5">
        {[
          { no: "INV-018", amt: 22000, before: 22000, after: 0 },
          { no: "INV-021", amt: 28000, before: 35000, after: 7000 },
        ].map((b, i) => (
          <div
            key={b.no}
            className="flex items-center justify-between text-xs bg-background rounded-md px-2.5 py-1.5 border border-border/60 animate-in fade-in slide-in-from-bottom-1"
            style={{ animationDelay: `${i * 250}ms`, animationDuration: "500ms", animationFillMode: "both" }}
          >
            <span className="font-mono">{b.no}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="line-through">₹{b.before.toLocaleString()}</span>
              <ArrowRight className="h-3 w-3" />
              <span className={cn("font-semibold tabular-nums", b.after === 0 ? "text-emerald-600" : "text-foreground")}>₹{b.after.toLocaleString()}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">FIFO auto-allocated across oldest dues</div>
    </div>
  );
}

function MockBills() {
  const buckets = [
    { label: "0–30", val: 45, color: "bg-emerald-500" },
    { label: "31–60", val: 30, color: "bg-amber-500" },
    { label: "61–90", val: 18, color: "bg-orange-500" },
    { label: "90+", val: 8, color: "bg-rose-500" },
  ];
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Aging of receivables</div>
      <div className="mt-3 flex items-end gap-2 h-24">
        {buckets.map((b, i) => (
          <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
            <div className="flex-1 w-full flex items-end">
              <div
                className={cn("w-full rounded-t-md", b.color)}
                style={{
                  height: `${b.val}%`,
                  animation: `riseBar 700ms ${i * 100}ms ease-out backwards`,
                }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{b.label}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes riseBar { from { height: 0%; } }`}</style>
    </div>
  );
}

function MockSearch() {
  const items = ["INV-014 · Sharma Constructions", "PO-022 · Marble Mart", "Buyer: Patel Granites"];
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="flex items-center gap-2 bg-background border border-border rounded-full px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">sharma<span className="inline-block w-px h-3 bg-foreground ml-0.5 animate-pulse" /></span>
      </div>
      <div className="mt-2 space-y-1">
        {items.map((t, i) => (
          <div
            key={t}
            className="text-xs bg-background border border-border/60 rounded-md px-2.5 py-1.5 animate-in fade-in slide-in-from-top-1"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: "400ms", animationFillMode: "both" }}
          >{t}</div>
        ))}
      </div>
    </div>
  );
}

function MockLedger() {
  const rows = [
    { acc: "Cash", dr: 50000, cr: 0 },
    { acc: "Sales", dr: 0, cr: 42373 },
    { acc: "Output GST", dr: 0, cr: 7627 },
  ];
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Auto journal — INV-019</div>
      <table className="w-full mt-2 text-xs">
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.acc}
              className="border-b border-border/40 animate-in fade-in slide-in-from-left-2"
              style={{ animationDelay: `${i * 200}ms`, animationDuration: "400ms", animationFillMode: "both" }}
            >
              <td className="py-1.5">{r.acc}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-emerald-600">{r.dr ? `₹${r.dr.toLocaleString()}` : ""}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-rose-600">{r.cr ? `₹${r.cr.toLocaleString()}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 text-[10px] text-emerald-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Debits = Credits</div>
    </div>
  );
}

function MockStock() {
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-muted/40 to-muted/10 border border-border/60 overflow-hidden p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Kota stone · sqft</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums">
        922<span className="text-base text-muted-foreground">/sqft</span>
      </div>
      <div className="mt-3 space-y-1">
        {[
          { d: "Today", t: "Sale INV-019", q: -50, c: "text-rose-600" },
          { d: "Yesterday", t: "Purchase PO-008", q: +500, c: "text-emerald-600" },
        ].map((m, i) => (
          <div
            key={m.t}
            className="flex items-center justify-between text-xs bg-background border border-border/60 rounded-md px-2.5 py-1.5 animate-in fade-in slide-in-from-right-2"
            style={{ animationDelay: `${i * 200}ms`, animationDuration: "400ms", animationFillMode: "both" }}
          >
            <span className="text-muted-foreground">{m.d} · {m.t}</span>
            <span className={cn("font-mono tabular-nums font-semibold", m.c)}>{m.q > 0 ? "+" : ""}{m.q}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockHome() {
  return (
    <div className="relative aspect-[16/10] rounded-xl bg-gradient-to-br from-primary/10 via-muted/30 to-muted/10 border border-border/60 overflow-hidden p-5 grid place-items-center">
      <div className="text-center">
        <Sparkles className="h-7 w-7 text-primary mx-auto animate-pulse" />
        <div className="mt-2 text-base font-semibold tracking-tight">Run your business like a superhero</div>
        <div className="text-xs text-muted-foreground mt-1">A 60-second tour of what makes StoneWorld different.</div>
        <div className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          Swipe <ChevronRight className="h-3 w-3" /> or press <kbd className="px-1 border rounded bg-background">→</kbd>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Slide deck ---------------- */

type Slide = {
  title: string;
  body: string;
  visual: React.ReactNode;
  cta?: { label: string; to: string };
};

const slides: Slide[] = [
  { title: "Welcome", body: "Most billing apps make accounting feel scary. StoneWorld doesn't. Every screen is built so a non-accountant can run the books with confidence.", visual: <MockHome /> },
  { title: "Save a sale", body: "Pick a buyer, add line items, hit Save. Stock decreases, a delivery challan is created, the ledger posts, GST is computed, and the bill appears under receivables — all from one tap.", visual: <MockSale />, cta: { label: "Open Sales", to: "/app/sales" } },
  { title: "Everything stays in sync", body: "You never touch the books directly. Behind every save we post a balanced journal so your reports are always trustworthy.", visual: <MockFlow /> },
  { title: "Track every delivery", body: "Each sale auto-creates a challan with vehicle, driver and status. Move it from Pending → Dispatched → Delivered with one tap.", visual: <MockDelivery />, cta: { label: "Open Deliveries", to: "/app/deliveries" } },
  { title: "Get paid faster", body: "Receive money against one or many bills. We FIFO-allocate to the oldest dues, update aging buckets, and post the receipt to the ledger.", visual: <MockPayment />, cta: { label: "Open Payments", to: "/app/payments" } },
  { title: "See who owes you", body: "Bills are bucketed by age. Chase the 60+ day reds first. Tap a row to preview, settle, or print.", visual: <MockBills />, cta: { label: "Open Bills", to: "/app/bills" } },
  { title: "Find anything fast", body: "Press / from anywhere. Live results across invoices, POs, parties and products. No more digging.", visual: <MockSearch />, cta: { label: "Try Lookup", to: "/app/lookup" } },
  { title: "Books that balance", body: "Every transaction writes a debit-equals-credit journal automatically. Open the ledger and the numbers will always tie.", visual: <MockLedger />, cta: { label: "Open Ledger", to: "/app/ledger" } },
  { title: "Live stock", body: "On-hand updates the instant you save. See every movement, in and out, per product.", visual: <MockStock />, cta: { label: "Open Stock", to: "/app/stock" } },
];

function GuidePage() {
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const s = slides[i];
  const prev = () => setI((v) => Math.max(0, v - 1));
  const next = () => setI((v) => Math.min(slides.length - 1, v + 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-[11px] text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
        <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((i + 1) / slides.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8 items-center">
        {/* Visual */}
        <div key={`v-${i}`} className="animate-in fade-in zoom-in-95 duration-300 order-1 md:order-2">
          {s.visual}
        </div>
        {/* Copy */}
        <div key={`t-${i}`} className="animate-in fade-in slide-in-from-bottom-2 duration-300 order-2 md:order-1">
          <div className="text-[10px] uppercase tracking-[0.12em] text-primary mb-3">Step {i + 1}</div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.05]">{s.title}</h1>
          <p className="text-[15px] text-muted-foreground mt-4 leading-relaxed">{s.body}</p>
          {s.cta && (
            <Button size="sm" variant="secondary" className="mt-5 rounded-full" onClick={() => navigate({ to: s.cta!.to as any })}>
              {s.cta.label} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-10 flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={prev} disabled={i === 0} className="rounded-full">
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex gap-1.5">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === i ? "w-6 bg-primary" : "w-1.5 bg-muted hover:bg-muted-foreground/30",
              )}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
        {i < slides.length - 1 ? (
          <Button size="sm" onClick={next} className="rounded-full">
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button size="sm" asChild className="rounded-full">
            <Link to="/app">Get started <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        )}
      </div>

      {/* Subtle hint */}
      <div className="mt-10 text-center text-[11px] text-muted-foreground inline-flex items-center gap-1.5 justify-center w-full">
        <ArrowDown className="h-3 w-3" /> You can revisit this guide anytime from More → Tools → Quick guide
      </div>
    </div>
  );
}