import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/kbd";

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  register: (key: string, handler: () => void) => () => void;
};

const ShortcutCtx = createContext<Ctx | null>(null);

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

export function ShortcutsProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Use a ref so registering page-level shortcuts does not re-render the tree.
  const localRef = useRef<Record<string, () => void>>({});

  const register = useCallback((key: string, handler: () => void) => {
    const k = key.toLowerCase();
    localRef.current[k] = handler;
    return () => { if (localRef.current[k] === handler) delete localRef.current[k]; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // ? — open help (Shift+/)
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault(); setOpen(o => !o); return;
      }
      // Escape closes help
      if (e.key === "Escape" && open) { setOpen(false); return; }
      if (isTypingTarget(e.target)) return;
      // "/" focuses global search
      if (e.key === "/") {
        const el = document.querySelector<HTMLInputElement>('input[data-global-search="1"]');
        if (el) { e.preventDefault(); el.focus(); el.select?.(); return; }
      }
      const k = e.key.toLowerCase();
      // Page-registered shortcut wins
      const local = localRef.current[k];
      if (local) { e.preventDefault(); local(); return; }
      // Global navigation
      const map: Record<string, string> = {
        h: "/app", s: "/app/sales", u: "/app/purchases", t: "/app/third-party",
        q: "/app/quotations", d: "/app/deliveries", p: "/app/payments",
        b: "/app/bills", l: "/app/lookup", x: "/app/expenses",
        i: "/app/stock", g: "/app/ledger", a: "/app/audit",
      };
      // r — open Receipt dialog on Payments
      if (k === "r") { e.preventDefault(); navigate({ to: "/app/payments", search: { new: "in" } as any }); return; }
      if (map[k]) { e.preventDefault(); navigate({ to: map[k] as any }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, open]);

  const value = useMemo(() => ({ open, setOpen, register }), [open, register]);

  return (
    <ShortcutCtx.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Keyboard shortcuts</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Row k="?" label="Show this help" />
            <Row k="/" label="Focus global search" />
            <Row k="H" label="Dashboard" />
            <Row k="S" label="Sales" />
            <Row k="U" label="Purchases" />
            <Row k="T" label="Third-party" />
            <Row k="Q" label="Quotations" />
            <Row k="D" label="Deliveries" />
            <Row k="P" label="Payments" />
            <Row k="R" label="New receipt" />
            <Row k="B" label="Bills (AR/AP)" />
            <Row k="L" label="Lookup" />
            <Row k="X" label="Expenses" />
            <Row k="I" label="Stock" />
            <Row k="G" label="Ledger" />
            <Row k="A" label="Audit log" />
          </div>
          <div className="text-[11px] text-muted-foreground pt-1">
            Shortcuts pause while typing in text fields. Press <Kbd>?</Kbd> any time.
          </div>
        </DialogContent>
      </Dialog>
    </ShortcutCtx.Provider>
  );
}

function Row({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/40 py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <Kbd>{k}</Kbd>
    </div>
  );
}

export function useShortcut(key: string, handler: () => void, enabled = true) {
  const ctx = useContext(ShortcutCtx);
  useEffect(() => {
    if (!ctx || !enabled) return;
    return ctx.register(key, handler);
  }, [ctx, key, handler, enabled]);
}

export function useShortcutsHelp() {
  const ctx = useContext(ShortcutCtx);
  return { open: () => ctx?.setOpen(true) };
}