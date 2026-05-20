import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Home, ShoppingCart, Wallet, MoreHorizontal, Search, LogOut, Keyboard,
  Package, Tags, Users, UserCheck, UserCog, Truck, Repeat, FileText, PackageCheck,
  FileSpreadsheet, Receipt, Boxes, Building2, BookOpen, BarChart3, LineChart, Percent,
  Printer, History, BookOpenCheck, Settings, X, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/notifications-bell";
import { ShortcutsProvider, useShortcutsHelp } from "@/lib/shortcuts";
import { Kbd } from "@/components/kbd";

export const Route = createFileRoute("/app")({ component: AppLayout });

type Tab = { to: string; label: string; icon: typeof Home; exact?: boolean };

const coreTabs: Tab[] = [
  { to: "/app", label: "Home", icon: Home, exact: true },
  { to: "/app/sales", label: "Sell", icon: ShoppingCart },
  { to: "/app/payments", label: "Money", icon: Wallet },
];

type DrawerItem = { to: string; label: string; icon: typeof Home; hint?: string };
type DrawerGroup = { title: string; blurb: string; items: DrawerItem[] };

const drawer: DrawerGroup[] = [
  {
    title: "Inventory",
    blurb: "What you stock, price and move",
    items: [
      { to: "/app/products", label: "Products", icon: Package, hint: "Items, HSN, rates" },
      { to: "/app/stock", label: "Stock", icon: Boxes, hint: "Live on-hand & movements" },
      { to: "/app/price-lists", label: "Price lists", icon: Tags, hint: "Buyer-specific rates" },
    ],
  },
  {
    title: "People",
    blurb: "Buyers, suppliers and contacts",
    items: [
      { to: "/app/buyers", label: "Buyers", icon: UserCheck },
      { to: "/app/suppliers", label: "Suppliers", icon: UserCog },
      { to: "/app/contacts", label: "All contacts", icon: Users },
    ],
  },
  {
    title: "Buy & Trade",
    blurb: "Purchases, quotes and third-party deals",
    items: [
      { to: "/app/purchases", label: "Purchases", icon: Truck },
      { to: "/app/third-party", label: "Third party", icon: Repeat, hint: "Buy & sell without holding stock" },
      { to: "/app/quotations", label: "Quotations", icon: FileText },
      { to: "/app/deliveries", label: "Deliveries", icon: PackageCheck },
    ],
  },
  {
    title: "Books & Reports",
    blurb: "Numbers, taxes and insights",
    items: [
      { to: "/app/bills", label: "Bills (AR/AP)", icon: FileSpreadsheet },
      { to: "/app/expenses", label: "Expenses", icon: Receipt },
      { to: "/app/fixed-assets", label: "Fixed assets", icon: Building2 },
      { to: "/app/ledger", label: "General ledger", icon: BookOpen },
      { to: "/app/reports", label: "Reports", icon: BarChart3 },
      { to: "/app/analytics", label: "Analytics", icon: LineChart },
      { to: "/app/gst", label: "GST summary", icon: Percent },
    ],
  },
  {
    title: "Tools",
    blurb: "Search, print and settings",
    items: [
      { to: "/app/lookup", label: "Lookup", icon: Search, hint: "Find any document" },
      { to: "/app/print", label: "Print centre", icon: Printer },
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setDrawerOpen(false); }, [path]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Checking session…</div>;
  }
  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Opening sign in…</div>;
  }

  const isActive = (t: Tab) => t.exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
  const inCore = coreTabs.some(isActive);

  return (
    <ShortcutsProvider>
    <div className="min-h-screen flex flex-col bg-background">
      {/* ───────── top bar ───────── */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="max-w-[1400px] mx-auto flex items-center gap-2 px-3 sm:px-5 h-14">
          <Link to="/app" className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-md bg-primary grid place-items-center text-primary-foreground font-bold text-xs tracking-tight">SW</div>
            <span className="text-sm font-semibold tracking-tight hidden sm:inline">StoneWorld</span>
          </Link>

          {/* desktop core tabs */}
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {coreTabs.map(t => {
              const a = isActive(t); const I = t.icon;
              return (
                <Link key={t.to} to={t.to} className={cn(
                  "flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium transition-colors",
                  a ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}>
                  <I className="h-4 w-4" /> {t.label}
                </Link>
              );
            })}
            <button
              onClick={() => setDrawerOpen(true)}
              className={cn(
                "flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium transition-colors",
                !inCore ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <MoreHorizontal className="h-4 w-4" /> More
            </button>
          </nav>

          <div className="flex-1" />
          <GlobalSearch />
          <HelpButton />
          <NotificationsBell />
          <Button variant="ghost" size="icon" onClick={async () => { await signOut(); navigate({ to: "/login" }); }} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* ───────── content ───────── */}
      <main className="flex-1 min-w-0">
        <div className="max-w-[1400px] mx-auto p-3 sm:p-6 pb-24 md:pb-10">
          <Outlet />
        </div>
      </main>

      {/* ───────── mobile bottom tab bar ───────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-16">
          {coreTabs.map(t => {
            const a = isActive(t); const I = t.icon;
            return (
              <Link key={t.to} to={t.to} className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                a ? "text-primary" : "text-muted-foreground",
              )}>
                <I className={cn("h-5 w-5 transition-transform", a && "scale-110")} />
                {t.label}
              </Link>
            );
          })}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
              !inCore ? "text-primary" : "text-muted-foreground",
            )}
          >
            <MoreHorizontal className={cn("h-5 w-5", !inCore && "scale-110")} />
            More
          </button>
        </div>
      </nav>

      <MoreDrawer open={drawerOpen} onOpenChange={setDrawerOpen} path={path} userEmail={user.email ?? ""} />
    </div>
    </ShortcutsProvider>
  );
}

function MoreDrawer({ open, onOpenChange, path, userEmail }: { open: boolean; onOpenChange: (v: boolean) => void; path: string; userEmail: string }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (!v) return drawer;
    return drawer
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(v) || (i.hint ?? "").toLowerCase().includes(v)) }))
      .filter(g => g.items.length);
  }, [q]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold tracking-tight">All sections</div>
              <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
            </div>
            <button onClick={() => onOpenChange(false)} className="rounded-md p-1 hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Jump to anything…" className="pl-8 h-9 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {filtered.map(g => (
            <div key={g.title}>
              <div className="px-2 mb-1.5">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{g.title}</div>
                <div className="text-[11px] text-muted-foreground/80">{g.blurb}</div>
              </div>
              <div className="space-y-0.5">
                {g.items.map(i => {
                  const a = path === i.to || path.startsWith(i.to + "/");
                  const I = i.icon;
                  return (
                    <Link key={i.to} to={i.to} className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                      a ? "bg-primary/10 text-primary" : "hover:bg-muted",
                    )}>
                      <div className={cn(
                        "h-9 w-9 rounded-lg grid place-items-center shrink-0",
                        a ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70 group-hover:bg-background",
                      )}>
                        <I className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-tight">{i.label}</div>
                        {i.hint && <div className="text-[11px] text-muted-foreground truncate">{i.hint}</div>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-10">No matches for "{q}"</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const submit = () => {
    const v = q.trim();
    if (!v) return;
    navigate({ to: "/app/lookup", search: { q: v } as any });
  };
  return (
    <div className="hidden lg:flex items-center w-full max-w-xs">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          data-global-search="1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Search anything…  ( / )"
          className="pl-8 h-9 text-sm rounded-full bg-muted/60 border-transparent focus-visible:bg-background"
        />
      </div>
    </div>
  );
}

function HelpButton() {
  const { open } = useShortcutsHelp();
  return (
    <Button variant="ghost" size="icon" onClick={open} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
      <Keyboard className="h-4 w-4" />
      <Kbd className="ml-0 hidden">?</Kbd>
    </Button>
  );
}