import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Package, Users, ShoppingCart, Truck, Repeat,
  Wallet, Receipt, FileText, Boxes, BookOpen, BarChart3, Search, Settings, LogOut, Printer, Percent, UserCheck, UserCog, LineChart, Tags, Building2,
  Home, ChevronDown, MoreHorizontal, X, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { History, PackageCheck, FileSpreadsheet, Keyboard } from "lucide-react";
import { BookOpenCheck } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { ShortcutsProvider, useShortcutsHelp } from "@/lib/shortcuts";
import { Kbd } from "@/components/kbd";

export const Route = createFileRoute("/app")({ component: AppLayout });

/**
 * Navigation organized by REAL daily usage priority for a stone-trading business.
 *
 *  Pinned (always visible)         — used multiple times per day
 *  More > Records                  — viewed daily but not edited as often
 *  More > Catalog                  — set up rarely, used in transactions
 *  More > Books & Reports          — accountant / monthly use
 *  More > Tools & Settings         — occasional admin
 */
const pinned = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/sales", label: "Sales", icon: ShoppingCart },
  { to: "/app/purchases", label: "Purchases", icon: Truck },
  { to: "/app/bills", label: "Money", icon: Wallet },
  { to: "/app/stock", label: "Stock", icon: Boxes },
] as const;

const moreGroups: { label: string; items: { to: string; label: string; icon: any }[] }[] = [
  {
    label: "Records",
    items: [
      { to: "/app/deliveries", label: "Deliveries", icon: PackageCheck },
      { to: "/app/quotations", label: "Quotations", icon: FileText },
      { to: "/app/third-party", label: "Third party", icon: Repeat },
      { to: "/app/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    label: "Money",
    items: [
      { to: "/app/bank", label: "Bank & cash", icon: Wallet },
    ],
  },
  {
    label: "Catalog",
    items: [
      { to: "/app/products", label: "Products", icon: Package },
      { to: "/app/price-lists", label: "Price lists", icon: Tags },
      { to: "/app/contacts", label: "Contacts", icon: Users },
      { to: "/app/buyers", label: "Buyers", icon: UserCheck },
      { to: "/app/suppliers", label: "Suppliers", icon: UserCog },
    ],
  },
  {
    label: "Books & Reports",
    items: [
      { to: "/app/reports", label: "Reports", icon: BarChart3 },
      { to: "/app/analytics", label: "Analytics", icon: LineChart },
      { to: "/app/ledger", label: "General ledger", icon: BookOpen },
      { to: "/app/gst", label: "GST summary", icon: Percent },
      { to: "/app/fixed-assets", label: "Fixed assets", icon: Building2 },
    ],
  },
  {
    label: "Tools",
    items: [
      { to: "/app/lookup", label: "Lookup", icon: Search },
      { to: "/app/print", label: "Print", icon: Printer },
      { to: "/app/audit", label: "Audit log", icon: History },
      { to: "/app/guide", label: "Quick guide", icon: BookOpenCheck },
      { to: "/app/settings", label: "Settings", icon: Settings },
    ],
  },
];

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => { setMoreOpen(false); }, [path]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  // First-time setup gate — send brand-new users to the onboarding wizard.
  useEffect(() => {
    if (loading || !user) return;
    if (path.startsWith("/app/onboarding")) return;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.from("settings").select("onboarding_done").maybeSingle();
      if (data && (data as any).onboarding_done === false) {
        navigate({ to: "/app/onboarding", replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, path]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Checking session…</div>;
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Opening sign in…</div>;
  }

  return (
    <ShortcutsProvider>
    <div className="min-h-screen flex bg-background">
      <DesktopSidebar path={path} email={user.email ?? ""} onSignOut={async () => { await signOut(); navigate({ to: "/login" }); }} />
      <main className="flex-1 min-w-0">
        {/* Mobile top bar — minimal */}
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b border-border/60 bg-background/85 backdrop-blur-xl px-4 py-3">
          <div className="text-[15px] font-semibold tracking-tight">StoneWorld</div>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setSearchOpen(true)} className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted" aria-label="Search this page"><Search className="h-[18px] w-[18px]" /></button>
            <NotificationsBell />
          </div>
        </header>
        {/* Desktop top bar */}
        <div className="hidden md:flex sticky top-0 z-20 items-center gap-2 px-6 py-2.5 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <GlobalSearchTrigger onOpen={() => setSearchOpen(true)} pageLabel={pageLabel(path)} />
          <div className="ml-auto flex items-center gap-1"><HelpButton /><NotificationsBell /></div>
        </div>
        <div className="max-w-[1400px] mx-auto p-4 md:p-8 pb-safe-tabs md:pb-8">
          <Outlet />
        </div>
      </main>
      <MobileTabBar path={path} onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} email={user.email ?? ""} onSignOut={async () => { await signOut(); navigate({ to: "/login" }); }} />
      <GlobalSearchOverlay open={searchOpen} onOpenChange={setSearchOpen} pageLabel={pageLabel(path)} />
    </div>
    </ShortcutsProvider>
  );
}

function isActive(path: string, to: string, exact?: boolean) {
  return exact ? path === to : path === to || path.startsWith(to + "/");
}

function DesktopSidebar({ path, email, onSignOut }: { path: string; email: string; onSignOut: () => void }) {
  return (
    <aside className="hidden md:flex w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
      <div className="px-5 pt-5 pb-4">
        <div className="text-[15px] font-semibold tracking-tight">StoneWorld</div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{email}</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-0.5 text-[13px]">
        {pinned.map((it) => {
          const active = isActive(path, it.to, (it as any).exact);
          const Icon = it.icon;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent",
              )}
            >
              <Icon className="h-[16px] w-[16px]" />
              <span className="font-medium">{it.label}</span>
            </Link>
          );
        })}
        <div className="h-px bg-sidebar-border/60 my-3" />
        {moreGroups.map((g) => (
          <CollapseGroup key={g.label} label={g.label} defaultOpen={g.items.some((it) => isActive(path, it.to))}>
            {g.items.map((it) => {
              const active = isActive(path, it.to);
              const Icon = it.icon;
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "flex items-center gap-2.5 pl-7 pr-3 py-1.5 rounded-md transition-colors",
                    active ? "text-primary font-medium bg-primary/5" : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent",
                  )}
                >
                  <Icon className="h-[14px] w-[14px]" />
                  <span>{it.label}</span>
                </Link>
              );
            })}
          </CollapseGroup>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground" onClick={onSignOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}

function CollapseGroup({ label, defaultOpen, children }: { label: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="space-y-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        <span>{label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-150">{children}</div>}
    </div>
  );
}

/* ---------------- Mobile bottom tabs ---------------- */

const mobileTabs = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/sales", label: "Sell", icon: ShoppingCart },
  { to: "/app/purchases", label: "Buy", icon: Truck },
  { to: "/app/bills", label: "Money", icon: Wallet },
] as const;

function MobileTabBar({ path, onMore }: { path: string; onMore: () => void }) {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border/60"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-5 h-16">
        {mobileTabs.map((t) => {
          const active = isActive(path, t.to, (t as any).exact);
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform">
              <Icon className={cn("h-[22px] w-[22px] transition-colors", active ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-[10px] font-medium", active ? "text-primary" : "text-muted-foreground")}>{t.label}</span>
            </Link>
          );
        })}
        <button onClick={onMore} className="flex flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform">
          <MoreHorizontal className="h-[22px] w-[22px] text-muted-foreground" />
          <span className="text-[10px] font-medium text-muted-foreground">More</span>
        </button>
      </div>
    </nav>
  );
}

function MoreSheet({ open, onOpenChange, email, onSignOut }: { open: boolean; onOpenChange: (v: boolean) => void; email: string; onSignOut: () => void }) {
  // Whole-screen, physics-based pull-down close. Listens at document capture
  // while the sheet is open so drags starting on icons, empty space, footer, or
  // the dim overlay all feel identical without React re-renders during motion.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blockClickUntilRef = useRef(0);
  const stateRef = useRef({
    tracking: false, dragging: false, startY: 0, lastY: 0, lastT: 0, lastV: 0,
    startedInScroller: false, height: 0,
  });

  const setTransform = (y: number) => {
    const el = sheetRef.current;
    if (!el) return;
    if (y <= 0) {
      el.style.transform = "";
      el.style.transition = "transform 280ms cubic-bezier(.22,1,.36,1)";
      return;
    }
    // Rubber-band: ease past ~half-screen
    const max = stateRef.current.height || 600;
    const eased = y < max ? y : max + (y - max) * 0.3;
    el.style.transition = "none";
    el.style.transform = `translate3d(0, ${eased}px, 0)`;
  };

  const animateClose = () => {
    const el = sheetRef.current;
    if (!el) return;
    const h = stateRef.current.height || el.getBoundingClientRect().height || 600;
    el.style.transition = "transform 220ms cubic-bezier(.4,0,.2,1)";
    el.style.transform = `translate3d(0, ${h}px, 0)`;
    window.setTimeout(() => onOpenChange(false), 180);
  };

  useEffect(() => {
    if (!open) return;
    const el = sheetRef.current;
    if (!el) return;
    const scroller = scrollRef.current;
    // Reset transform when opening
    el.style.transform = "";
    el.style.transition = "";

    const begin = (y: number, target: EventTarget | null) => {
      const fromBody = !!(scroller && target instanceof Node && scroller.contains(target));
      if (fromBody && scroller && scroller.scrollTop > 0) return;
      stateRef.current = {
        active: true, startY: y, lastY: y, lastT: performance.now(),
        lastV: 0, fromBody, height: el.getBoundingClientRect().height,
      };
    };
    const move = (y: number, ev: Event) => {
      const s = stateRef.current;
      if (!s.active) return;
      const dy = y - s.startY;
      if (dy < -6) { s.active = false; setTransform(0); return; }
      if (s.fromBody && scroller && scroller.scrollTop > 0) {
        s.active = false; setTransform(0); return;
      }
      if (dy > 0) {
        if (ev.cancelable) ev.preventDefault();
        const now = performance.now();
        const dt = now - s.lastT;
        if (dt > 0) {
          // EMA velocity for stability
          const inst = (y - s.lastY) / dt;
          s.lastV = s.lastV * 0.6 + inst * 0.4;
        }
        s.lastY = y; s.lastT = now;
        setTransform(dy);
      }
    };
    const end = () => {
      const s = stateRef.current;
      if (!s.active) return;
      s.active = false;
      const dy = s.lastY - s.startY;
      const v = s.lastV;
      const shouldClose = dy > 90 || (dy > 30 && v > 0.3) || v > 0.7;
      if (shouldClose) animateClose();
      else setTransform(0);
    };

    const onTouchStart = (e: TouchEvent) => begin(e.touches[0].clientY, e.target);
    const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientY, e);
    const onTouchEnd = () => end();
    const onMouseDown = (e: MouseEvent) => begin(e.clientY, e.target);
    const onMouseMove = (e: MouseEvent) => { if (stateRef.current.active) move(e.clientY, e); };
    const onMouseUp = () => end();

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [open, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={sheetRef as any}
        side="bottom"
        className="p-0 h-[88vh] rounded-t-2xl flex flex-col [&>button]:hidden"
        style={{
          willChange: "transform",
          touchAction: "pan-y",
        }}
      >
        {/* Drag handle + aligned header */}
        <div
          className="px-5 pt-2 pb-3 border-b select-none"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-muted-foreground/30" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold tracking-tight">StoneWorld</div>
              <div className="text-xs text-muted-foreground truncate">{email}</div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted active:scale-95 transition-all shrink-0"
              aria-label="Close menu"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4 space-y-5 overscroll-contain"
        >
          {[{ label: "Daily", items: [...pinned].slice(1).map((p) => ({ ...p })) }, ...moreGroups].map((g) => (
            <div key={g.label}>
              <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground/80 mb-2 px-1">{g.label}</div>
              <div className="grid grid-cols-4 gap-2">
                {g.items.map((it: any) => {
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      onClick={() => onOpenChange(false)}
                      className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-muted/40 active:scale-95 active:bg-muted transition-all"
                    >
                      <div className="h-9 w-9 grid place-items-center rounded-lg bg-background border border-border/60">
                        <Icon className="h-[18px] w-[18px] text-foreground" />
                      </div>
                      <span className="text-[11px] text-center leading-tight">{it.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-3">
          <Button variant="ghost" size="sm" className="w-full justify-center gap-2" onClick={onSignOut}>
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function pageLabel(path: string) {
  const current = [...pinned, ...moreGroups.flatMap((g) => g.items)].find((it: any) => isActive(path, it.to, (it as any).exact));
  return current?.label ?? "this page";
}

function GlobalSearchTrigger({ onOpen, pageLabel }: { onOpen: () => void; pageLabel: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-9 w-full max-w-md items-center gap-2 rounded-full border border-border/60 bg-muted/45 px-3 text-left text-sm text-muted-foreground transition-all hover:bg-background hover:shadow-sm"
      aria-label={`Search from ${pageLabel}`}
    >
      <Search className="h-3.5 w-3.5" />
      <span className="truncate">Search from {pageLabel}…</span>
      <span className="ml-auto hidden rounded-md border bg-background px-1.5 py-0.5 text-[10px] sm:inline">/</span>
    </button>
  );
}

type QuickHit = { kind: string; title: string; sub: string; no?: string };

function GlobalSearchOverlay({ open, onOpenChange, pageLabel }: { open: boolean; onOpenChange: (v: boolean) => void; pageLabel: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<QuickHit[]>([]);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !open && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        onOpenChange(true);
      }
      if (e.key === "Escape" && open) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setBusy(true);
      const like = `%${term}%`;
      const [{ data: cs }, { data: ps }, { data: ss }, { data: pos }, { data: tps }, { data: qs }, { data: pys }, { data: bts }] = await Promise.all([
        supabase.from("contacts").select("name,code,type,phone").or(`name.ilike.${like},phone.ilike.${like},gstin.ilike.${like},code.ilike.${like}`).limit(4),
        supabase.from("products").select("name,code,unit,hsn").or(`name.ilike.${like},code.ilike.${like},hsn.ilike.${like}`).limit(4),
        supabase.from("sales").select("invoice_no,date,buyer_name").or(`invoice_no.ilike.${like},buyer_name.ilike.${like}`).limit(4),
        supabase.from("purchases").select("po_no,date,supplier_name").or(`po_no.ilike.${like},supplier_name.ilike.${like}`).limit(4),
        supabase.from("third_party").select("tp_no,date,buyer_name,supplier_name").or(`tp_no.ilike.${like},buyer_name.ilike.${like},supplier_name.ilike.${like}`).limit(3),
        supabase.from("quotations").select("quote_no,date,buyer_name").or(`quote_no.ilike.${like},buyer_name.ilike.${like}`).limit(3),
        supabase.from("payments").select("payment_no,date,contact_name,direction").or(`payment_no.ilike.${like},contact_name.ilike.${like}`).limit(3),
        supabase.from("bank_transfers" as never).select("transfer_no,date,kind,bank_name,amount").or(`transfer_no.ilike.${like},bank_name.ilike.${like},cheque_no.ilike.${like},txn_id.ilike.${like},notes.ilike.${like}`).limit(3) as any,
      ]);
      const out: QuickHit[] = [];
      for (const r of ss ?? []) out.push({ kind: "Invoice", title: r.invoice_no, sub: `${r.buyer_name ?? "—"} · ${r.date}`, no: r.invoice_no });
      for (const r of pos ?? []) out.push({ kind: "Purchase", title: r.po_no, sub: `${r.supplier_name ?? "—"} · ${r.date}`, no: r.po_no });
      for (const r of tps ?? []) out.push({ kind: "Third party", title: r.tp_no, sub: `${r.supplier_name ?? "—"} → ${r.buyer_name ?? "—"}`, no: r.tp_no });
      for (const r of qs ?? []) out.push({ kind: "Quote", title: r.quote_no, sub: `${r.buyer_name ?? "—"} · ${r.date}`, no: r.quote_no });
      for (const r of pys ?? []) out.push({ kind: r.direction === "in" ? "Receipt" : "Payment", title: r.payment_no, sub: `${r.contact_name ?? "—"} · ${r.date}`, no: r.payment_no });
      for (const r of bts ?? []) out.push({ kind: r.kind === "cash_withdrawal" ? "Withdrawal" : "Deposit", title: r.transfer_no, sub: `${r.bank_name ?? "Bank"} · ${r.date}`, no: r.transfer_no });
      for (const r of cs ?? []) out.push({ kind: r.type === "supplier" ? "Supplier" : "Buyer", title: r.name, sub: [r.code, r.phone].filter(Boolean).join(" · ") || "Contact" });
      for (const r of ps ?? []) out.push({ kind: "Product", title: r.name, sub: [r.code, r.unit, r.hsn && `HSN ${r.hsn}`].filter(Boolean).join(" · ") || "Product" });
      if (!cancelled) { setHits(out.slice(0, 12)); setBusy(false); }
    }, 180);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [q, open]);

  const openLookup = (term = q) => {
    const v = term.trim();
    if (!v) return;
    onOpenChange(false);
    navigate({ to: "/app/lookup", search: { q: v } as any });
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-background/78 backdrop-blur-xl animate-in fade-in duration-150">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-4 pt-16 sm:pt-24">
        <div className="rounded-2xl border border-border/70 bg-card shadow-lg overflow-hidden animate-in zoom-in-95 slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3 border-b px-3 py-3 sm:px-4">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && openLookup()} placeholder={`Search from ${pageLabel}…`} className="h-10 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0" />
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close search"><X className="h-5 w-5" /></Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {q.trim().length < 2 ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">Type an invoice, party, product, payment or bank ID.</div>
            ) : hits.length === 0 && !busy ? (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No quick matches. Press Enter to open detailed Lookup.</div>
            ) : (
              hits.map((h, i) => (
                <button key={`${h.kind}-${h.title}-${i}`} type="button" onClick={() => openLookup(h.no ?? h.title)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/60">
                  <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{h.kind}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{h.title}</span><span className="block truncate text-xs text-muted-foreground">{h.sub}</span></span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span>{busy ? "Searching…" : "Enter opens detailed Lookup report"}</span>
            <Button size="sm" variant="outline" onClick={() => openLookup()} disabled={!q.trim()}>Open report</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HelpButton() {
  const { open } = useShortcutsHelp();
  return (
    <Button variant="ghost" size="icon" onClick={open} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
      <Keyboard className="h-5 w-5" />
      <Kbd className="ml-0 hidden">?</Kbd>
    </Button>
  );
}