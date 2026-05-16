import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Package, Users, ShoppingCart, Truck, Repeat,
  Wallet, Receipt, FileText, Boxes, BookOpen, BarChart3, Search, Settings, LogOut, Printer,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app")({ component: AppLayout });

const nav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { group: "Masters" },
  { to: "/app/products", label: "Products", icon: Package },
  { to: "/app/contacts", label: "Contacts", icon: Users },
  { group: "Transactions" },
  { to: "/app/sales", label: "Sales", icon: ShoppingCart },
  { to: "/app/purchases", label: "Purchases", icon: Truck },
  { to: "/app/third-party", label: "Third Party", icon: Repeat },
  { to: "/app/quotations", label: "Quotations", icon: FileText },
  { to: "/app/payments", label: "Payments", icon: Wallet },
  { to: "/app/expenses", label: "Expenses", icon: Receipt },
  { group: "Inventory & Books" },
  { to: "/app/stock", label: "Stock Ledger", icon: Boxes },
  { to: "/app/ledger", label: "General Ledger", icon: BookOpen },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { group: "Tools" },
  { to: "/app/lookup", label: "Lookup", icon: Search },
  { to: "/app/print", label: "Print", icon: Printer },
  { to: "/app/settings", label: "Settings", icon: Settings },
] as const;

function AppLayout() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen flex bg-muted/20">
      <aside className="w-60 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col">
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
                to={item.to}
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
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-[1400px] mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}