import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/kbd";
import {
  ChevronLeft, ChevronRight, Keyboard, ShoppingCart, Truck, Repeat,
  Wallet, FileSpreadsheet, Search, BookOpen, Bell, Boxes, Settings,
  LayoutDashboard, Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/app/guide")({ component: GuidePage });

type Slide = {
  icon: any;
  title: string;
  body: React.ReactNode;
  tip?: React.ReactNode;
};

const slides: Slide[] = [
  {
    icon: Sparkles,
    title: "Welcome to StoneWorld",
    body: <>This quick guide walks you through every screen. Use <Kbd>←</Kbd> <Kbd>→</Kbd> or the buttons below to navigate. You can revisit it anytime from the sidebar.</>,
    tip: <>Press <Kbd>?</Kbd> at any time to see all keyboard shortcuts.</>,
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard — Your daily snapshot",
    body: <>Press <Kbd>H</Kbd> to jump home. Tiles show today's sales, receipts, dues, and low-stock items. Click any tile to drill in.</>,
  },
  {
    icon: ShoppingCart,
    title: "Sales · Purchases · Third-party",
    body: <>Press <Kbd>S</Kbd>, <Kbd>U</Kbd> or <Kbd>T</Kbd>. On any list, press <Kbd>N</Kbd> for a new entry. Sales block themselves if stock isn't enough — you'll see a clear error.</>,
    tip: <>Third-party deals capture both Buy and Sell rates so margin is calculated automatically.</>,
  },
  {
    icon: Truck,
    title: "Deliveries",
    body: <>Press <Kbd>D</Kbd>. Every sale auto-creates a delivery. Tap a row to preview the challan; tap <strong>Edit</strong> to update vehicle, driver, Challan No, and status.</>,
  },
  {
    icon: Wallet,
    title: "Payments — Receipts (R) & Payments (P)",
    body: <>Press <Kbd>R</Kbd> for a new receipt, <Kbd>P</Kbd> for a new payment. Paste an invoice id to auto-fill, or pick a party and we'll apply FIFO to the oldest dues.</>,
    tip: <>Two tabs separate Receipts and Payments for a clean view.</>,
  },
  {
    icon: FileSpreadsheet,
    title: "Bills — Receivable & Payable",
    body: <>Press <Kbd>B</Kbd>. See outstanding bills bucketed by age (0–30 / 31–60 / 61–90 / 90+). One click goes straight to Receive or Pay.</>,
  },
  {
    icon: Search,
    title: "Lookup — Find anything",
    body: <>Press <Kbd>L</Kbd> or just <Kbd>/</Kbd> from anywhere to focus global search. Type an invoice no, party, GSTIN, or HSN — you'll get a full preview.</>,
  },
  {
    icon: BookOpen,
    title: "Ledger — Books that balance",
    body: <>Press <Kbd>G</Kbd>. Latest entries appear on top. Tap <strong>Filters</strong> to narrow by account, party, date, or side. Excel exports always go oldest → newest.</>,
  },
  {
    icon: Boxes,
    title: "Stock & Reports",
    body: <>Press <Kbd>I</Kbd> for live stock. Reports & Analytics live under their own pages with GST summary one click away.</>,
  },
  {
    icon: Bell,
    title: "Notifications",
    body: <>The bell at the top shows alerts. The <strong>eye</strong> opens a quick preview; <strong>+</strong> opens the full page.</>,
  },
  {
    icon: Settings,
    title: "Settings & demo data",
    body: <>Update your company profile, GSTIN, and address. You can <strong>Load demo data</strong> to explore the app, or <strong>Clear all data</strong> to start fresh.</>,
  },
  {
    icon: Keyboard,
    title: "Shortcuts cheat-sheet",
    body: (
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <Row k="?" v="Show shortcuts" /><Row k="/" v="Global search" />
        <Row k="H" v="Dashboard" /><Row k="S" v="Sales" />
        <Row k="U" v="Purchases" /><Row k="T" v="Third-party" />
        <Row k="Q" v="Quotations" /><Row k="D" v="Deliveries" />
        <Row k="P" v="New payment" /><Row k="R" v="New receipt" />
        <Row k="B" v="Bills" /><Row k="L" v="Lookup" />
        <Row k="X" v="Expenses" /><Row k="I" v="Stock" />
        <Row k="G" v="Ledger" /><Row k="A" v="Audit" />
        <Row k="N" v="New (on any list)" />
      </div>
    ),
  },
];

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-0.5">
      <span className="text-muted-foreground">{v}</span><Kbd>{k}</Kbd>
    </div>
  );
}

function GuidePage() {
  const [i, setI] = useState(0);
  const s = slides[i];
  const Icon = s.icon;
  const prev = () => setI(v => Math.max(0, v - 1));
  const next = () => setI(v => Math.min(slides.length - 1, v + 1));
  return (
    <div>
      <PageHeader title="Quick guide" description="A short walkthrough of every screen and shortcut" />
      <div className="rounded-md border bg-card p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
          <span>Slide {i + 1} of {slides.length}</span>
          <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${((i + 1) / slides.length) * 100}%` }} />
          </div>
        </div>
        <div className="flex items-start gap-3 mb-3">
          <div className="h-10 w-10 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0"><Icon className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg sm:text-xl font-semibold leading-tight">{s.title}</h2>
          </div>
        </div>
        <div className="text-sm leading-relaxed space-y-2">{s.body}</div>
        {s.tip && <div className="mt-3 text-xs rounded-md border border-primary/30 bg-primary/5 text-primary px-3 py-2">💡 {s.tip}</div>}
        <div className="flex items-center justify-between mt-5 gap-2">
          <Button variant="outline" size="sm" onClick={prev} disabled={i === 0}><ChevronLeft className="h-4 w-4" /> Back</Button>
          <div className="flex gap-1">
            {slides.map((_, idx) => (
              <button key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} onClick={() => setI(idx)} aria-label={`Go to slide ${idx + 1}`} />
            ))}
          </div>
          {i < slides.length - 1 ? (
            <Button size="sm" onClick={next}>Next <ChevronRight className="h-4 w-4" /></Button>
          ) : (
            <Button size="sm" asChild><Link to="/app">Get started</Link></Button>
          )}
        </div>
      </div>
    </div>
  );
}