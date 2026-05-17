import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard, Package, Users, ShoppingCart, Truck, Repeat,
  Wallet, Receipt, FileText, Boxes, BookOpen, BarChart3, Search, Settings, LogOut, Printer, Menu, Percent, UserCheck, UserCog, LineChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { History, PackageCheck, FileSpreadsheet, Keyboard } from "lucide-react";
import { BookOpenCheck } from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { ShortcutsProvider, useShortcutsHelp } from "@/lib/shortcuts";
import { Kbd } from "@/components/kbd";

export const Route = createFileRoute("/app")({ component: AppLayout });

type NavItem =
  | { group: string }
  | { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };

const nav: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { group: "Masters" },
  { to: "/app/products", label: "Products", icon: Package },
  { to: "/app/contacts", label: "Contacts", icon: Users },
  { to: "/app/buyers", label: "Buyers", icon: UserCheck },
  { to: "/app/suppliers", label: "Suppliers", icon: UserCog },
  { group: "Transactions" },
  { to: "/app/sales", label: "Sales", icon: ShoppingCart },
  { to: "/app/purchases", label: "Purchases", icon: Truck },
  { to: "/app/third-party", label: "Third Party", icon: Repeat },
  { to: "/app/quotations", label: "Quotations", icon: FileText },
  { to: "/app/deliveries", label: "Deliveries", icon: PackageCheck },
  { to: "/app/payments", label: "Payments", icon: Wallet },
  { to: "/app/bills", label: "Bills (AR/AP)", icon: FileSpreadsheet },
  { to: "/app/expenses", label: "Expenses", icon: Receipt },
  { group: "Inventory & Books" },
  { to: "/app/stock", label: "Stock Movements", icon: Boxes },
  { to: "/app/ledger", label: "General Ledger", icon: BookOpen },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/analytics", label: "Analytics", icon: LineChart },
  { to: "/app/gst", label: "GST Summary", icon: Percent },
  { group: "Tools" },
  { to: "/app/lookup", label: "Lookup", icon: Search },
  { to: "/app/print", label: "Print", icon: Printer },
  { to: "/app/audit", label: "Backlog / Audit", icon: History },
  { to: "/app/guide", label: "Quick guide", icon: BookOpenCheck },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [path]);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Checking session…</div>;
  }

  if (!user) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Opening sign in…</div>;
  }

  const NavBody = () => (
    <>
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="text-sm font-semibold tracking-tight">StoneWorld</div>
        <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 text-sm">
        {nav.map((item, i) => {
            if ("group" in item) {
              return (
                <div key={i} className="px-2 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {item.group}
                </div>
              );
            }
            const active = item.exact ? path === item.to : path === item.to || path.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to as string}
                className={cn(
                  "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "hover:bg-sidebar-accent text-sidebar-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
        })}
      </nav>
      <div className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </>
  );

  return (
    <ShortcutsProvider>
    <div className="min-h-screen flex bg-muted/20">
      <aside className="hidden md:flex w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex-col">
        <NavBody />
      </aside>
      <main className="flex-1 min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 backdrop-blur px-3 py-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar flex flex-col">
              <NavBody />
            </SheetContent>
          </Sheet>
          <div className="text-sm font-semibold tracking-tight">StoneWorld</div>
          <div className="ml-auto"><NotificationsBell /></div>
        </header>
        <div className="hidden md:flex sticky top-0 z-20 items-center gap-2 px-4 py-2 border-b bg-background/70 backdrop-blur">
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1"><HelpButton /><NotificationsBell /></div>
        </div>
        <div className="max-w-[1400px] mx-auto p-3 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
    </ShortcutsProvider>
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
          placeholder="Search invoices, POs, buyers, suppliers, payments…   ( / )"
          className="pl-7 h-8 text-sm"
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