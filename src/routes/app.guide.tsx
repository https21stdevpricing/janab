import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, ShoppingCart, Truck, FileSpreadsheet,
  Search, BookOpen, Boxes, ArrowRight, Sparkles, Check, ArrowDown,
  LineChart, Layers, Lightbulb, Play, Pause, RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/app/guide")({
  component: GuidePage,
  validateSearch: (s: Record<string, unknown>) => ({
    intro: s.intro === "1" || s.intro === 1 ? "1" : undefined,
  }),
});

/* ---------------- Multi-step animated prototypes ---------------- *
 *
 * Every mockup is a tiny "movie" that plays itself: it walks through
 * 3–5 steps, with a caption strip describing what's happening in plain
 * English. The `tick` prop drives the timeline so the parent can replay.
 */

function useTimeline(steps: number, replayKey: number, intervalMs = 1100) {
  const [t, setT] = useState(0);
  useEffect(() => {
    setT(0);
    const id = setInterval(() => {
      // Loop continuously: hold on the final frame for one extra beat,
      // then jump back to 0 so the mockup re-plays end-to-end.
      setT((v) => (v + 1 > steps ? 0 : v + 1));
    }, intervalMs);
    return () => clearInterval(id);
  }, [steps, replayKey, intervalMs]);
  return Math.min(t, steps - 1);
}

function Stage({
  caption,
  children,
}: {
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative aspect-[16/10] rounded-2xl bg-gradient-to-br from-background to-muted/40 border border-border/70 overflow-hidden shadow-sm">
      <div className="absolute inset-0 p-4 pb-10">{children}</div>
      <div className="absolute bottom-0 inset-x-0 px-3 py-2 bg-background/85 backdrop-blur border-t border-border/60 text-[11px] text-foreground/80 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        <span className="truncate">{caption}</span>
      </div>
    </div>
  );
}

function MockSale({ tick }: { tick: number }) {
  const captions = [
    "Pick a buyer — past rates auto-fill",
    "Add line items — sqft calculated from slab size",
    "GST splits into CGST + SGST automatically",
    "Save — bill, stock, ledger and delivery all done",
  ];
  return (
    <Stage caption={captions[tick] ?? captions[0]}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">New sale</div>
        <div className="text-[10px] text-muted-foreground">INV-019</div>
      </div>
      <div
        className={cn(
          "mt-2 flex items-center gap-2 text-xs bg-background border border-border/60 rounded-md px-2.5 py-1.5 transition-all",
          tick >= 0 ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1",
        )}
      >
        <span className="h-5 w-5 rounded-full bg-primary/15 text-primary grid place-items-center text-[10px] font-semibold">S</span>
        <span className="font-medium">Sharma Constructions</span>
        <span className="ml-auto text-muted-foreground">GSTIN 27AAAFB1234N1Z5</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {[
          { t: "Kota stone — 50 sqft", v: 18750 },
          { t: "Granite slab — 12 sqft", v: 9000 },
        ].map((row, i) => (
          <div
            key={row.t}
            className={cn(
              "flex items-center justify-between text-xs bg-background rounded-md px-2.5 py-1.5 border transition-all duration-500",
              tick >= 1 ? "opacity-100 translate-x-0 border-border/60" : "opacity-0 -translate-x-2 border-transparent",
            )}
            style={{ transitionDelay: `${i * 180}ms` }}
          >
            <span>{row.t}</span>
            <span className="font-mono tabular-nums text-foreground">₹{row.v.toLocaleString()}</span>
          </div>
        ))}
        <div
          className={cn(
            "grid grid-cols-3 gap-1.5 transition-all duration-500",
            tick >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
          )}
        >
          {[
            { l: "Sub-total", v: "₹27,750" },
            { l: "CGST 9%", v: "₹2,498" },
            { l: "SGST 9%", v: "₹2,498" },
          ].map((c) => (
            <div key={c.l} className="rounded-md border border-border/60 bg-background px-2 py-1 text-[10px]">
              <div className="text-muted-foreground">{c.l}</div>
              <div className="font-mono tabular-nums">{c.v}</div>
            </div>
          ))}
        </div>
        <div
          className={cn(
            "flex items-center justify-between text-xs font-semibold rounded-md px-2.5 py-1.5 transition-all duration-500",
            tick >= 3 ? "bg-emerald-500/10 text-emerald-700 opacity-100" : "bg-primary/10 text-primary opacity-80",
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            {tick >= 3 ? <Check className="h-3.5 w-3.5" /> : null}
            {tick >= 3 ? "Saved" : "Grand total"}
          </span>
          <span className="font-mono tabular-nums">₹32,746</span>
        </div>
      </div>
    </Stage>
  );
}

function MockFlow({ tick }: { tick: number }) {
  const dots = [
    { label: "Sale", icon: ShoppingCart, hint: "You save it" },
    { label: "Stock −50", icon: Boxes, hint: "Inventory reduces" },
    { label: "Ledger", icon: BookOpen, hint: "Journal posted" },
    { label: "Bill", icon: FileSpreadsheet, hint: "Receivable created" },
  ];
  const cap = `Step ${Math.min(tick + 1, dots.length)} of 4 — ${dots[Math.min(tick, dots.length - 1)].hint}`;
  return (
    <Stage caption={cap}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-4">One save → four updates</div>
      <div className="relative flex items-center justify-between gap-2">
        <div className="absolute left-5 right-5 top-5 h-px bg-border" />
        <div
          className="absolute left-5 top-5 h-px bg-primary transition-all duration-700"
          style={{ width: `calc(${(tick / (dots.length - 1)) * 100}% - 2.5rem * ${tick / (dots.length - 1)})` }}
        />
        {dots.map((d, i) => {
          const Icon = d.icon;
          const reached = tick >= i;
          return (
            <div key={d.label} className="relative flex-1 flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "h-10 w-10 rounded-full border grid place-items-center transition-all duration-500",
                  reached ? "bg-primary text-primary-foreground border-primary shadow-sm scale-100" : "bg-background border-border scale-95 opacity-60",
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className={cn("text-[10px] transition-colors", reached ? "text-foreground font-medium" : "text-muted-foreground")}>{d.label}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 text-[10px] text-muted-foreground text-center">All four happen in under a second — you only ever click Save.</div>
    </Stage>
  );
}

function MockDelivery({ tick }: { tick: number }) {
  const stages = ["Pending", "Dispatched", "Delivered"];
  const captions = [
    "Challan auto-created from the sale",
    "Driver leaves the yard — one tap = Dispatched",
    "Buyer signs — status & timestamp captured",
  ];
  return (
    <Stage caption={captions[Math.min(tick, captions.length - 1)]}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Challan #DL-204</div>
        <div className="text-[10px] text-muted-foreground">For INV-019</div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">Vehicle MH-12-AB-1234 · Driver Ramesh</div>
      <div className="relative mt-6">
        <div className="absolute left-0 right-0 top-1.5 h-0.5 bg-border" />
        <div className="absolute left-0 top-1.5 h-0.5 bg-emerald-500 transition-all duration-700" style={{ width: `${(tick / (stages.length - 1)) * 100}%` }} />
        <div className="relative flex items-start justify-between">
          {stages.map((s, i) => {
            const done = tick >= i;
            const active = tick === i;
            return (
              <div key={s} className="flex flex-col items-center gap-1.5">
                <div className={cn("h-3 w-3 rounded-full transition-all", done ? "bg-emerald-500" : "bg-muted", active && i < stages.length - 1 && "ring-4 ring-emerald-500/20 animate-pulse")} />
                <span className={cn("text-[10px] transition-colors", done ? "text-foreground font-medium" : "text-muted-foreground")}>{s}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-5 inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 text-[10px] px-2 py-1 rounded-full">
        <Truck className="h-3 w-3" /> {tick >= 2 ? "Delivered at 4:12 PM" : tick >= 1 ? "Truck on the way" : "Awaiting dispatch"}
      </div>
    </Stage>
  );
}

function MockPayment({ tick }: { tick: number }) {
  const captions = [
    "Buyer pays ₹50,000 — pick the buyer",
    "We allocate FIFO: oldest bill first",
    "Next bill gets the remainder",
    "Receipt posted to ledger, aging updated",
  ];
  const bills = [
    { no: "INV-018", before: 22000, after: tick >= 1 ? 0 : 22000 },
    { no: "INV-021", before: 35000, after: tick >= 2 ? 7000 : 35000 },
  ];
  return (
    <Stage caption={captions[Math.min(tick, captions.length - 1)]}>
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Receive payment</span>
        <span className="text-emerald-700 font-semibold tabular-nums normal-case text-xs">+ ₹50,000</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {bills.map((b, i) => {
          const changed = (i === 0 && tick >= 1) || (i === 1 && tick >= 2);
          return (
            <div
              key={b.no}
              className={cn(
                "flex items-center justify-between text-xs bg-background rounded-md px-2.5 py-1.5 border transition-all duration-500",
                changed ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60",
              )}
            >
              <span className="font-mono">{b.no}</span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("transition-colors", changed && "line-through")}>₹{b.before.toLocaleString()}</span>
                <ArrowRight className="h-3 w-3" />
                <span className={cn("font-semibold tabular-nums", b.after === 0 ? "text-emerald-700" : "text-foreground")}>₹{b.after.toLocaleString()}</span>
              </span>
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          "mt-2 text-[10px] rounded-md px-2 py-1.5 transition-all",
          tick >= 3 ? "bg-emerald-500/10 text-emerald-700" : "bg-muted/60 text-muted-foreground",
        )}
      >
        {tick >= 3 ? "Ledger updated · Aging refreshed" : "FIFO allocates to oldest dues first"}
      </div>
    </Stage>
  );
}

function MockBills({ tick }: { tick: number }) {
  const buckets = [
    { label: "0–30", val: 45, color: "bg-emerald-500" },
    { label: "31–60", val: 30, color: "bg-amber-500" },
    { label: "61–90", val: 18, color: "bg-orange-500" },
    { label: "90+", val: 8, color: "bg-rose-500" },
  ];
  const captions = [
    "Bills automatically bucket by age",
    "Reds need chasing — they're 60+ days overdue",
    "Tap a bucket to filter the list below",
    "Send a reminder PDF in one click",
  ];
  return (
    <Stage caption={captions[Math.min(tick, captions.length - 1)]}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Aging of receivables</div>
      <div className="mt-3 flex items-end gap-2 h-20">
        {buckets.map((b, i) => {
          const highlight = tick >= 1 && i >= 2;
          const selected = tick >= 2 && i === 3;
          return (
            <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex-1 w-full flex items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md transition-all duration-700",
                    b.color,
                    highlight && "ring-2 ring-rose-500/30",
                    selected && "ring-4 ring-rose-500/50",
                  )}
                  style={{ height: tick >= 0 ? `${b.val}%` : "0%" }}
                />
              </div>
              <span className={cn("text-[10px]", selected ? "text-rose-600 font-semibold" : "text-muted-foreground")}>{b.label}</span>
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          "mt-3 rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs flex items-center justify-between transition-all",
          tick >= 3 ? "opacity-100" : "opacity-0",
        )}
      >
        <span className="font-mono">INV-006 · Patel Granites</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-primary">Reminder sent <Check className="h-3 w-3" /></span>
      </div>
    </Stage>
  );
}

function MockSearch({ tick }: { tick: number }) {
  const items = [
    "INV-014 · Sharma Constructions",
    "PO-022 · Marble Mart",
    "Buyer: Patel Granites",
    "Product: Sharma's preferred Kota stone",
  ];
  const query = "sharma".slice(0, Math.min(tick + 2, 6));
  const visible = items.slice(0, Math.min(tick + 1, items.length));
  const cap = tick >= 3 ? "Press ↵ to open the highlighted result" : `Typing… "${query}"`;
  return (
    <Stage caption={cap}>
      <div className="flex items-center gap-2 bg-background border border-border rounded-full px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs">
          {query}
          <span className="inline-block w-px h-3 bg-foreground ml-0.5 align-middle animate-pulse" />
        </span>
        <kbd className="ml-auto text-[9px] border rounded px-1 py-px text-muted-foreground">/</kbd>
      </div>
      <div className="mt-2 space-y-1">
        {visible.map((t, i) => {
          const active = tick >= 3 && i === 0;
          return (
            <div
              key={t}
              className={cn(
                "text-xs rounded-md px-2.5 py-1.5 border transition-all",
                active ? "bg-primary/10 border-primary/30 text-foreground" : "bg-background border-border/60",
              )}
            >
              {t}
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function MockLedger({ tick }: { tick: number }) {
  const rows = [
    { acc: "Cash", dr: 50000, cr: 0 },
    { acc: "Sales", dr: 0, cr: 42373 },
    { acc: "Output GST", dr: 0, cr: 7627 },
  ];
  const captions = [
    "We post the cash you received…",
    "…credit revenue at the net amount…",
    "…and park GST as an output liability",
    "Debits = Credits — the ledger always balances",
  ];
  return (
    <Stage caption={captions[Math.min(tick, captions.length - 1)]}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Auto journal — INV-019</div>
      <table className="w-full mt-2 text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="text-left font-normal py-1">Account</th>
            <th className="text-right font-normal py-1">Debit</th>
            <th className="text-right font-normal py-1">Credit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const shown = tick >= i;
            return (
              <tr
                key={r.acc}
                className={cn("border-b border-border/40 transition-all duration-500", shown ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2")}
              >
                <td className="py-1.5">{r.acc}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{r.dr ? `₹${r.dr.toLocaleString()}` : ""}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">{r.cr ? `₹${r.cr.toLocaleString()}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div
        className={cn(
          "mt-2 text-[10px] inline-flex items-center gap-1 transition-all",
          tick >= 3 ? "text-emerald-700 opacity-100" : "opacity-0",
        )}
      >
        <Check className="h-3 w-3" /> Debits ₹50,000 = Credits ₹50,000
      </div>
    </Stage>
  );
}

function MockStock({ tick }: { tick: number }) {
  const captions = [
    "Kota stone — current on-hand",
    "Yesterday: 500 sqft came in (PO-008)",
    "Today: 50 sqft sold (INV-019)",
    "Live total stays accurate — no month-end reconciliation",
  ];
  const moves = [
    { d: "Today", t: "Sale INV-019", q: -50, c: "text-rose-600" },
    { d: "Yesterday", t: "Purchase PO-008", q: +500, c: "text-emerald-600" },
  ];
  const counter = tick >= 2 ? 922 : tick >= 1 ? 972 : 472;
  return (
    <Stage caption={captions[Math.min(tick, captions.length - 1)]}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Kota stone · sqft</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums transition-all duration-500">
        {counter}
        <span className="text-base text-muted-foreground">/sqft</span>
      </div>
      <div className="mt-3 space-y-1">
        {moves.map((m, i) => {
          const shown = (i === 1 && tick >= 1) || (i === 0 && tick >= 2);
          return (
            <div
              key={m.t}
              className={cn(
                "flex items-center justify-between text-xs bg-background border border-border/60 rounded-md px-2.5 py-1.5 transition-all duration-500",
                shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1",
              )}
            >
              <span className="text-muted-foreground">{m.d} · {m.t}</span>
              <span className={cn("font-mono tabular-nums font-semibold", m.c)}>{m.q > 0 ? "+" : ""}{m.q}</span>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function MockHome() {
  return (
    <div className="relative aspect-[16/10] rounded-2xl bg-gradient-to-br from-primary/15 via-muted/30 to-muted/10 border border-border/70 overflow-hidden p-5 grid place-items-center shadow-sm">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/15 grid place-items-center">
          <Sparkles className="h-6 w-6 text-primary animate-pulse" />
        </div>
        <div className="mt-3 text-lg font-semibold tracking-tight">Run your business like a pro</div>
        <div className="text-xs text-muted-foreground mt-1 max-w-[28ch] mx-auto">A 90-second tour. No accounting jargon. Just what each screen does for you.</div>
        <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <kbd className="px-1.5 py-px border rounded bg-background">→</kbd> next
          <span className="mx-1 opacity-30">·</span>
          <kbd className="px-1.5 py-px border rounded bg-background">Space</kbd> auto-play
        </div>
      </div>
    </div>
  );
}

function MockReports({ tick }: { tick: number }) {
  const bars = [38, 52, 47, 61, 58, 73, 80];
  const captions = [
    "Weekly revenue — trending up 18%",
    "Gross margin tells you what you really earn",
    "Cash runway shows how long you can keep going",
    "Current ratio: are you safe to pay short-term bills?",
  ];
  const highlight = tick; // 0..3
  return (
    <Stage caption={captions[Math.min(tick, captions.length - 1)]}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Revenue · last 7 weeks</div>
        <div className="text-[10px] inline-flex items-center gap-1 text-emerald-700"><LineChart className="h-3 w-3" /> +18%</div>
      </div>
      <div className="mt-3 flex items-end gap-1.5 h-16">
        {bars.map((h, i) => (
          <div
            key={i}
            className={cn("flex-1 rounded-t-sm transition-all duration-500", i === bars.length - 1 ? "bg-primary" : "bg-primary/60")}
            style={{ height: tick >= 0 ? `${h}%` : "0%", transitionDelay: `${i * 60}ms` }}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]">
        {[
          { l: "Gross margin", v: "26.4%", idx: 1 },
          { l: "Cash runway", v: "5.2 mo", idx: 2 },
          { l: "Current ratio", v: "1.84", idx: 3 },
        ].map((c) => {
          const on = highlight >= c.idx;
          return (
            <div
              key={c.l}
              className={cn(
                "rounded-md border p-1.5 transition-all",
                on ? "border-primary/40 bg-primary/5" : "border-border/60 bg-background",
              )}
            >
              <div className="text-muted-foreground">{c.l}</div>
              <div className="font-semibold tabular-nums">{c.v}</div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
}

function MockValuation({ tick }: { tick: number }) {
  const captions = [
    "Same stock — two valuation methods",
    "Weighted Average smooths out price swings",
    "FIFO uses today's market prices",
    "AS 2 rule: report the lower of cost or market",
  ];
  return (
    <Stage caption={captions[Math.min(tick, captions.length - 1)]}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Same stock, two valuation lenses</div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[
          { name: "Weighted Average", val: "₹4,82,000", tag: "Smooth", idx: 1 },
          { name: "FIFO", val: "₹5,14,200", tag: "Market-fresh", idx: 2 },
        ].map((m, i) => (
          <div
            key={m.name}
            className={cn(
              "rounded-md border bg-background p-2.5 transition-all duration-500",
              tick >= m.idx ? "border-primary/40 ring-2 ring-primary/10" : "border-border/60",
            )}
            style={{ transitionDelay: `${i * 120}ms` }}
          >
            <div className="text-[10px] text-muted-foreground">{m.tag}</div>
            <div className="text-sm font-semibold">{m.name}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-primary">{m.val}</div>
          </div>
        ))}
      </div>
      <div
        className={cn(
          "mt-3 text-[10px] rounded px-2 py-1.5 inline-flex items-center gap-1.5 transition-all",
          tick >= 3 ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground",
        )}
      >
        <Layers className="h-3 w-3" /> AS 2: always the <span className="font-semibold">lower of cost or market</span>
      </div>
    </Stage>
  );
}

/* ---------------- Slide deck ---------------- */

type Slide = {
  title: string;
  body: string;
  bullets?: string[];
  why?: string;
  tip?: string;
  visual: (tick: number) => React.ReactNode;
  steps: number;
  cta?: { label: string; to: string };
};

const slides: Slide[] = [
  {
    title: "Welcome",
    body: "Most billing apps make accounting feel scary. StoneWorld doesn't. Every screen is built so a non-accountant can run the books with confidence.",
    bullets: ["Designed for stone traders, not CAs", "Bookkeeping happens silently in the background", "Reports you can actually act on"],
    tip: "Use ← → arrow keys, or press the Play button to auto-advance.",
    visual: () => <MockHome />, steps: 1,
  },
  {
    title: "Save a sale",
    body: "Pick a buyer, add line items, hit Save. One tap creates the bill, drops stock, posts the journal, computes GST and prepares a delivery challan.",
    bullets: ["Smart suggestions for buyer, rate and HSN", "Slab → sqft calculator built in", "GST split into CGST/SGST/IGST automatically"],
    why: "You don't have to remember six screens — saving the sale takes care of all of them.",
    visual: (t) => <MockSale tick={t} />, steps: 4, cta: { label: "Open Sales", to: "/app/sales" },
  },
  {
    title: "Everything stays in sync",
    body: "You never touch the books directly. Behind every save we post a balanced journal so your reports are always trustworthy.",
    bullets: ["Stock, Ledger, Bills and Deliveries update from one event", "Edit or delete the source → downstream entries clean up", "Trial balance and Balance Sheet always tie out"],
    why: "No more 'fixing the books at month-end'. There's nothing to fix.",
    visual: (t) => <MockFlow tick={t} />, steps: 4,
  },
  {
    title: "Track every delivery",
    body: "Each sale auto-creates a challan with vehicle, driver and status. Move it from Pending → Dispatched → Delivered with one tap.",
    bullets: ["Status changes timestamp themselves for audit", "Third-party drop-ship deliveries flagged separately", "Print a PDF challan in one click"],
    visual: (t) => <MockDelivery tick={t} />, steps: 3, cta: { label: "Open Deliveries", to: "/app/deliveries" },
  },
  {
    title: "Get paid faster",
    body: "Receive money against one or many bills. We FIFO-allocate to the oldest dues, update aging buckets, and post the receipt to the ledger.",
    bullets: ["One receipt can settle many invoices", "Advance payments park as 'on account'", "Bank vs cash receipts tracked separately"],
    why: "Cash on hand stops being a guess. You see exactly who paid, when and against what.",
    visual: (t) => <MockPayment tick={t} />, steps: 4, cta: { label: "Open Payments", to: "/app/payments" },
  },
  {
    title: "See who owes you",
    body: "Bills are bucketed by age. Chase the 60+ day reds first. Tap a row to preview, settle, or print.",
    bullets: ["Color-coded aging: 0-30 / 31-60 / 61-90 / 90+", "Filter by buyer or branch", "Send reminder PDFs straight from the row"],
    tip: "Sort by 'Most overdue' once a week — your cash flow will thank you.",
    visual: (t) => <MockBills tick={t} />, steps: 4, cta: { label: "Open Bills", to: "/app/bills" },
  },
  {
    title: "Find anything fast",
    body: "Press / from anywhere. Live results across invoices, POs, parties and products. No more digging.",
    bullets: ["Searches doc numbers, party names and products together", "Keyboard-first: ↑ ↓ to move, ↵ to open", "Recent items pinned for one-tap return"],
    visual: (t) => <MockSearch tick={t} />, steps: 4, cta: { label: "Try Lookup", to: "/app/lookup" },
  },
  {
    title: "Books that balance",
    body: "Every transaction writes a debit-equals-credit journal automatically. Open the ledger and the numbers will always tie.",
    bullets: ["Auto-posted entries for sales, purchases, payments, GST", "Drill from any report figure down to the source bill", "Full audit trail with timestamps"],
    why: "When your CA asks 'where did this number come from?', the answer is one click away.",
    visual: (t) => <MockLedger tick={t} />, steps: 4, cta: { label: "Open Ledger", to: "/app/ledger" },
  },
  {
    title: "Live stock",
    body: "On-hand updates the instant you save. See every movement, in and out, per product.",
    bullets: ["Reorder alerts when stock dips below your minimum", "Per-SKU history of every in/out movement", "Separate yard stock vs on-order items"],
    visual: (t) => <MockStock tick={t} />, steps: 4, cta: { label: "Open Stock", to: "/app/stock" },
  },
  {
    title: "Value stock the right way",
    body: "Choose FIFO or Weighted Average from a plain-English picker. We always apply the AS 2 'lower of cost or market' rule so profit isn't overstated.",
    bullets: ["Side-by-side comparison: see what each method would say", "Per-SKU breakdown with NRV write-down flags", "Switch methods anytime — every report recomputes instantly"],
    why: "Stop guessing what your unsold stock is worth. The number you see is the number your CA will sign off on.",
    visual: (t) => <MockValuation tick={t} />, steps: 4, cta: { label: "Open Reports", to: "/app/reports" },
  },
  {
    title: "Reports that tell the story",
    body: "P&L, Balance Sheet, Working Capital and a plain-English Overview — all built live from your ledger. No exports, no spreadsheets.",
    bullets: ["Trust badges show whether books are balanced before you read a number", "Health meters explain each ratio in one sentence", "'What to do next' ranks suggestions by impact on cash and profit"],
    why: "You don't need an accounting degree to know whether the business is healthy this month.",
    visual: (t) => <MockReports tick={t} />, steps: 4, cta: { label: "Open Reports", to: "/app/reports" },
  },
];

function GuidePage() {
  const search = Route.useSearch();
  const isIntro = search.intro === "1";
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [replay, setReplay] = useState(0);
  const navigate = useNavigate();
  const s = slides[i];
  const prev = () => setI((v) => Math.max(0, v - 1));
  const next = () => setI((v) => Math.min(slides.length - 1, v + 1));
  const replayNow = () => setReplay((r) => r + 1);
  const tick = useTimeline(s.steps, replay + i * 1000, 1300);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      if (e.key.toLowerCase() === "r") replayNow();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!playing) return;
    if (i >= slides.length - 1) { setPlaying(false); return; }
    // give the scene enough time to play through all steps before advancing
    const dwell = Math.max(6000, s.steps * 1400 + 1200);
    const t = setTimeout(() => setI((v) => v + 1), dwell);
    return () => clearTimeout(t);
  }, [playing, i, s.steps]);

  return (
    <div className="max-w-3xl mx-auto">
      {isIntro && (
        <div className="mb-5 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-4 sm:p-5 flex items-start gap-3">
          <div className="h-9 w-9 rounded-xl bg-foreground text-background grid place-items-center shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold tracking-tight">Welcome to StoneWorld</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              A 90-second tour of every feature. You'll only see this once — revisit anytime from More → Quick guide.
            </div>
          </div>
          <Button asChild variant="ghost" size="sm" className="rounded-full shrink-0">
            <Link to="/app">Skip</Link>
          </Button>
        </div>
      )}
      {/* Progress + auto-play */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-[11px] text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
        <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-500" style={{ width: `${((i + 1) / slides.length) * 100}%` }} />
        </div>
        <Button variant="ghost" size="sm" className="rounded-full h-7 px-2" onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          <span className="text-[11px] ml-1">{playing ? "Pause" : "Auto-play"}</span>
        </Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8 items-start">
        {/* Visual */}
        <div className="order-1 md:order-2 md:sticky md:top-4">
          <div className="relative group">
            <div key={`v-${i}`} className="animate-in fade-in zoom-in-95 duration-300">
              {s.visual(tick)}
            </div>
            {/* step pips */}
            {s.steps > 1 && (
              <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background/85 backdrop-blur border border-border/70">
                {Array.from({ length: s.steps }).map((_, k) => (
                  <span key={k} className={cn("h-1.5 rounded-full transition-all", k === tick ? "w-4 bg-primary" : k < tick ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted")} />
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={replayNow}
              className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-background/85 backdrop-blur border border-border/70 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              aria-label="Replay animation"
              title="Replay animation (R)"
            >
              <RotateCcw className="h-3 w-3" /> Replay
            </button>
          </div>
        </div>
        {/* Copy */}
        <div key={`t-${i}`} className="animate-in fade-in slide-in-from-bottom-2 duration-300 order-2 md:order-1">
          <div className="text-[10px] uppercase tracking-[0.12em] text-primary mb-3">Step {i + 1}</div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight leading-[1.05]">{s.title}</h1>
          <p className="text-[15px] text-muted-foreground mt-4 leading-relaxed">{s.body}</p>
          {s.bullets && (
            <ul className="mt-4 space-y-1.5">
              {s.bullets.map((b, idx) => (
                <li key={idx} className="flex gap-2 text-sm text-foreground/90">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {s.why && (
            <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
              <div className="font-medium text-foreground mb-0.5">Why it matters</div>
              <div className="text-muted-foreground">{s.why}</div>
            </div>
          )}
          {s.tip && (
            <div className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
              <span>{s.tip}</span>
            </div>
          )}
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
        <div className="flex gap-1.5 flex-wrap justify-center max-w-[60%]">
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

      <div className="mt-10 text-center text-[11px] text-muted-foreground inline-flex items-center gap-1.5 justify-center w-full">
        <ArrowDown className="h-3 w-3" /> Revisit anytime from More → Tools → Quick guide
      </div>
    </div>
  );
}
