import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sparkles, ChevronLeft, ChevronRight, Check, ArrowRight,
  ShoppingCart, Truck, Wallet, FileSpreadsheet, BookOpen, Boxes, Search,
  Settings, Play, Keyboard,
} from "lucide-react";
import { Kbd } from "@/components/kbd";

export const Route = createFileRoute("/app/guide")({ component: GuidePage });

/* ────────────── tiny in-card animated demos ────────────── */

function SaleDemo() {
  const [s, setS] = useState(0);
  useEffect(() => { const t = setInterval(() => setS(v => (v + 1) % 4), 1400); return () => clearInterval(t); }, []);
  return (
    <div className="rounded-xl border bg-card p-4 h-44 relative overflow-hidden">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Live demo</div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary grid place-items-center"><ShoppingCart className="h-4 w-4" /></div>
        <div className="text-sm font-medium">New sale</div>
      </div>
      <div className="space-y-1.5">
        <Row label="Marble — 120 sqft" active={s >= 0} />
        <Row label={s >= 1 ? "Stock check: 922 sqft  ✓" : "Stock check…"} active={s >= 1} good={s >= 1} />
        <Row label={s >= 2 ? "Invoice INV-0124 created" : ""} active={s >= 2} good={s >= 2} />
        <Row label={s >= 3 ? "Ledger + delivery posted" : ""} active={s >= 3} good={s >= 3} />
      </div>
    </div>
  );
}

function PaymentDemo() {
  const [p, setP] = useState(0);
  useEffect(() => { const t = setInterval(() => setP(v => (v + 1) % 100), 30); return () => clearInterval(t); }, []);
  const pct = Math.min(100, p);
  return (
    <div className="rounded-xl border bg-card p-4 h-44">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">FIFO allocation</div>
      <div className="text-sm font-medium mb-3">Receive ₹50,000 from Mehta Stones</div>
      <div className="space-y-2">
        {[
          { no: "INV-0098", due: 18000 },
          { no: "INV-0102", due: 22000 },
          { no: "INV-0110", due: 30000 },
        ].map((b, i) => {
          const prev = i === 0 ? 0 : i === 1 ? 18000 : 40000;
          const taken = Math.max(0, Math.min(b.due, (pct / 100) * 50000 - prev));
          const w = (taken / b.due) * 100;
          return (
            <div key={b.no}>
              <div className="flex justify-between text-[11px] mb-0.5">
                <span className="font-mono text-muted-foreground">{b.no}</span>
                <span className="tabular-nums">₹{Math.round(taken).toLocaleString("en-IN")} / ₹{b.due.toLocaleString("en-IN")}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${w}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockDemo() {
  const [t, setT] = useState(0);
  useEffect(() => { const id = setInterval(() => setT(v => v + 1), 60); return () => clearInterval(id); }, []);
  const bars = [40, 55, 35, 70, 45, 80, 60].map((h, i) => h + Math.sin((t + i * 8) / 10) * 6);
  return (
    <div className="rounded-xl border bg-card p-4 h-44">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Live on-hand</div>
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-md bg-primary/10 text-primary grid place-items-center"><Boxes className="h-4 w-4" /></div>
        <div className="text-sm font-medium">Kota stone · 922 sqft</div>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 rounded-sm bg-primary/70 transition-all" style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
      </div>
    </div>
  );
}

function LedgerDemo() {
  return (
    <div className="rounded-xl border bg-card p-4 h-44 overflow-hidden">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Auto-journal</div>
      <div className="space-y-1.5 text-xs">
        {[
          { a: "Accounts receivable", d: 12000, c: 0, delay: 0 },
          { a: "Sales — Marble", d: 0, c: 10169, delay: 200 },
          { a: "Output GST 18%", d: 0, c: 1831, delay: 400 },
        ].map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_70px] gap-2 py-1 border-b border-border/40 animate-fade-in" style={{ animationDelay: `${r.delay}ms`, animationFillMode: "both" }}>
            <span className="truncate">{r.a}</span>
            <span className="text-right tabular-nums text-emerald-600">{r.d ? r.d.toLocaleString("en-IN") : "—"}</span>
            <span className="text-right tabular-nums text-destructive">{r.c ? r.c.toLocaleString("en-IN") : "—"}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_70px_70px] gap-2 pt-1 text-[10px] uppercase text-muted-foreground">
          <span>Total</span><span className="text-right tabular-nums">12,000</span><span className="text-right tabular-nums">12,000</span>
        </div>
        <div className="text-[10px] text-primary mt-1">✓ Debits = Credits. Always.</div>
      </div>
    </div>
  );
}

function SearchDemo() {
  const queries = ["INV-0124", "Mehta", "PO-0042", "Kota stone"];
  const [i, setI] = useState(0);
  const [txt, setTxt] = useState("");
  useEffect(() => {
    const q = queries[i];
    let n = 0;
    setTxt("");
    const id = setInterval(() => {
      n++; setTxt(q.slice(0, n));
      if (n >= q.length) { clearInterval(id); setTimeout(() => setI(v => (v + 1) % queries.length), 900); }
    }, 80);
    return () => clearInterval(id);
  }, [i]);
  return (
    <div className="rounded-xl border bg-card p-4 h-44">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Press / anywhere</div>
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-mono">{txt}<span className="animate-pulse">|</span></span>
      </div>
      <div className="mt-2 space-y-1 text-xs">
        <div className="px-2 py-1.5 rounded-md bg-primary/10 text-primary">{txt || "—"} · top result</div>
        <div className="px-2 py-1.5 text-muted-foreground">Tap to open full preview</div>
      </div>
    </div>
  );
}

function Row({ label, active, good }: { label: string; active: boolean; good?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2 text-xs transition-all", active ? "opacity-100" : "opacity-30")}>
      <div className={cn("h-4 w-4 rounded-full grid place-items-center border", good ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40")}>
        {good && <Check className="h-2.5 w-2.5" />}
      </div>
      <span className="truncate">{label || "…"}</span>
    </div>
  );
}

/* ────────────── slides ────────────── */

type Slide = {
  id: string;
  kicker: string;
  title: string;
  body: string;
  demo?: () => ReactElement;
  tip?: string;
  cta?: { label: string; to: string };
};

const slides: Slide[] = [
  { id: "welcome", kicker: "Welcome", title: "Run your stone business like a superhero", body: "No accounting degree required. This 60-second tour shows what each section does — with live mini-demos you can click through.", tip: "Press ← → to navigate. Press ? anywhere for shortcuts." },
  { id: "sell", kicker: "Sell", title: "One save. Everything updates.", body: "Create a sale → we instantly check stock, post the journal (AR + Sales + GST), generate a delivery challan and refresh the buyer's ledger.", demo: SaleDemo, cta: { label: "Try a sale", to: "/app/sales" } },
  { id: "money", kicker: "Money", title: "Receipts that allocate themselves", body: "Receive money once. We split it across the oldest open bills using FIFO — no spreadsheet, no maths.", demo: PaymentDemo, cta: { label: "Open Money", to: "/app/payments" } },
  { id: "stock", kicker: "Stock", title: "Live inventory, real numbers", body: "Every sale and purchase moves the bar. Low-stock alerts, valuation at cost or sale, and full movement history per product.", demo: StockDemo, cta: { label: "Open Stock", to: "/app/stock" } },
  { id: "ledger", kicker: "Books", title: "Books that always balance", body: "Every transaction writes a balanced journal entry. Debits = Credits. Forever. You never touch a ledger — but it's always ready.", demo: LedgerDemo, cta: { label: "Open Ledger", to: "/app/ledger" } },
  { id: "search", kicker: "Tools", title: "Find anything in two keystrokes", body: "Hit / and type. Invoices, POs, parties, payments — all live in one box. Tap a result to preview without leaving the page.", demo: SearchDemo, cta: { label: "Open Lookup", to: "/app/lookup" } },
  { id: "shortcuts", kicker: "Power up", title: "Shortcuts for everyone", body: "A handful of keys turns this app into a flow state.", tip: "Pin these to your screen for the first week." },
];

const SHORTCUTS: Array<[string, string]> = [
  ["H", "Home"], ["S", "Sales"], ["P", "Payments"], ["B", "Bills"],
  ["I", "Stock"], ["G", "Ledger"], ["/", "Search"], ["?", "All shortcuts"],
];

/* ────────────── page ────────────── */

function GuidePage() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("guide.seen") ?? "[]")); } catch { return new Set(); }
  });

  useEffect(() => {
    const s = new Set(seen); s.add(slides[i].id); setSeen(s);
    try { localStorage.setItem("guide.seen", JSON.stringify([...s])); } catch { /* */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI(v => Math.min(slides.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI(v => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, []);

  const s = slides[i];
  const Demo = s.demo;
  const progress = useMemo(() => Math.round((seen.size / slides.length) * 100), [seen]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* header strip */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Quick guide</div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Learn StoneWorld in 60 seconds</h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-32 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          {progress}%
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_240px] gap-4">
        {/* main slide */}
        <div className="rounded-2xl border bg-card overflow-hidden animate-fade-in" key={s.id}>
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{s.kicker}</div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight mb-2">{s.title}</h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-prose">{s.body}</p>

            {Demo && <div className="mt-5 animate-scale-in"><Demo /></div>}

            {s.id === "shortcuts" && (
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{v}</span><Kbd>{k}</Kbd>
                  </div>
                ))}
              </div>
            )}

            {s.tip && (
              <div className="mt-4 text-xs rounded-lg border border-primary/20 bg-primary/5 text-primary/90 px-3 py-2 flex items-start gap-2">
                <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {s.tip}
              </div>
            )}

            {s.cta && (
              <div className="mt-5">
                <Button size="sm" onClick={() => navigate({ to: s.cta!.to as any })} className="rounded-full">
                  <Play className="h-3.5 w-3.5" /> {s.cta.label} <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* nav footer */}
          <div className="border-t bg-muted/30 px-4 py-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setI(v => Math.max(0, v - 1))} disabled={i === 0}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex gap-1">
              {slides.map((sl, idx) => (
                <button key={sl.id} onClick={() => setI(idx)} aria-label={`Slide ${idx + 1}`}
                  className={cn("h-1.5 rounded-full transition-all", idx === i ? "w-8 bg-primary" : seen.has(sl.id) ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted-foreground/30")} />
              ))}
            </div>
            {i < slides.length - 1 ? (
              <Button size="sm" onClick={() => setI(v => v + 1)} className="rounded-full">Next <ChevronRight className="h-4 w-4" /></Button>
            ) : (
              <Button size="sm" asChild className="rounded-full"><Link to="/app">Get started <ArrowRight className="h-4 w-4" /></Link></Button>
            )}
          </div>
        </div>

        {/* checklist sidebar */}
        <aside className="hidden lg:block">
          <div className="rounded-2xl border bg-card p-3 sticky top-20">
            <div className="px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              Your tour
            </div>
            <div className="space-y-0.5">
              {slides.map((sl, idx) => {
                const done = seen.has(sl.id) && idx !== i;
                const cur = idx === i;
                return (
                  <button key={sl.id} onClick={() => setI(idx)} className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors text-sm",
                    cur ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground/80",
                  )}>
                    <div className={cn(
                      "h-5 w-5 rounded-full grid place-items-center text-[10px] font-semibold shrink-0 border",
                      done ? "bg-primary border-primary text-primary-foreground" :
                      cur ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground",
                    )}>
                      {done ? <Check className="h-3 w-3" /> : idx + 1}
                    </div>
                    <span className="truncate">{sl.title.split(".")[0]}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 pt-3 border-t text-[11px] text-muted-foreground px-2 flex items-center gap-1.5">
              <Keyboard className="h-3 w-3" /> Use <Kbd>←</Kbd> <Kbd>→</Kbd> to navigate
            </div>
          </div>
        </aside>
      </div>

      {/* quick links at the bottom on small screens */}
      <div className="lg:hidden mt-4 grid grid-cols-2 gap-2">
        <QuickTile icon={ShoppingCart} label="Sales" to="/app/sales" />
        <QuickTile icon={Wallet} label="Payments" to="/app/payments" />
        <QuickTile icon={Boxes} label="Stock" to="/app/stock" />
        <QuickTile icon={FileSpreadsheet} label="Bills" to="/app/bills" />
        <QuickTile icon={BookOpen} label="Ledger" to="/app/ledger" />
        <QuickTile icon={Truck} label="Deliveries" to="/app/deliveries" />
        <QuickTile icon={Search} label="Lookup" to="/app/lookup" />
        <QuickTile icon={Settings} label="Settings" to="/app/settings" />
      </div>
    </div>
  );
}

function QuickTile({ icon: Icon, label, to }: { icon: typeof ShoppingCart; label: string; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 hover:bg-muted/50 transition-colors">
      <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary grid place-items-center"><Icon className="h-4 w-4" /></div>
      <span className="text-sm font-medium">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
    </Link>
  );
}