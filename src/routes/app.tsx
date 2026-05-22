import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Package, Users, ShoppingCart, Truck, Repeat,
  Wallet, Receipt, FileText, Boxes, BookOpen, BarChart3, Search, Settings, LogOut, Printer, Percent, UserCheck, UserCog, LineChart, Tags, Building2,
  Home, ChevronDown, MoreHorizontal,
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
  { to: "/app/payments", label: "Payments", icon: Wallet },
  { to: "/app/bills", label: "Bills", icon: FileSpreadsheet },
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

  useEffect(() => { setMoreOpen(false); }, [path]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

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
            <Link to="/app/lookup" className="h-9 w-9 grid place-items-center rounded-full hover:bg-muted"><Search className="h-[18px] w-[18px]" /></Link>
            <NotificationsBell />
          </div>
        </header>
        {/* Desktop top bar */}
        <div className="hidden md:flex sticky top-0 z-20 items-center gap-2 px-6 py-2.5 border-b border-border/60 bg-background/80 backdrop-blur-xl">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1"><HelpButton /><NotificationsBell /></div>
        </div>
        <div className="max-w-[1400px] mx-auto p-4 md:p-8 pb-safe-tabs md:pb-8">
          <Outlet />
        </div>
      </main>
      <MobileTabBar path={path} onMore={() => setMoreOpen(true)} />
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} email={user.email ?? ""} onSignOut={async () => { await signOut(); navigate({ to: "/login" }); }} />
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
  { to: "/app/payments", label: "Money", icon: Wallet },
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0 h-[88vh] rounded-t-2xl flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b">
          <div className="text-base font-semibold tracking-tight">StoneWorld</div>
          <div className="text-xs text-muted-foreground truncate">{email}</div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
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

function GlobalSearch() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const submit = () => {
    const v = q.trim();
    if (!v) return;
    navigate({ to: "/app/lookup", search: { q: v } as any });
  };
  return (
    <div className="flex items-center gap-1 w-full max-w-md">
      <div className="relative flex-1">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          data-global-search="1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Search anything — invoices, parties, products  ( / )"
          className="pl-7 h-9 text-sm rounded-full bg-muted/50 border-transparent focus-visible:bg-background"
        />
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