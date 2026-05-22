import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared visual primitives. Use these instead of hand-rolling card chrome
 * on every page so spacing, borders and typography stay consistent.
 */

export function Surface({
  className,
  children,
  padded = true,
  elevated = false,
}: {
  className?: string;
  children: ReactNode;
  padded?: boolean;
  elevated?: boolean;
}) {
  return (
    <div className={cn("surface", elevated && "elev-1", padded && "p-4 sm:p-5", className)}>
      {children}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("eyebrow", className)}>{children}</div>;
}

export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 mb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] sm:text-base font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="text-xs sm:text-[13px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good"
      ? "text-primary"
      : tone === "warn"
      ? "text-amber-600 dark:text-amber-400"
      : tone === "bad"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className={cn("stat-num mt-1.5 text-xl sm:text-2xl", toneCls)}>{value}</div>
      {hint && <div className="text-[11px] sm:text-xs text-muted-foreground mt-1 leading-snug">{hint}</div>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  className?: string;
}) {
  const toneCls =
    tone === "good"
      ? "bg-primary/10 text-primary border-primary/20"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
      : tone === "bad"
      ? "bg-destructive/10 text-destructive border-destructive/20"
      : tone === "info"
      ? "bg-accent text-accent-foreground border-accent/40"
      : "bg-muted text-muted-foreground border-border/60";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium",
        toneCls,
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------
 * Shared components used site-wide for visual consistency.
 * - KpiGrid / KpiTile : 2×N stat tiles (Stock, Reports, Money, Deposits)
 * - ActionStack       : vertical action list with primary at the bottom
 *                       (Money Quick actions, Deposits New entry)
 * - SegmentedTabs     : pill-style filter tabs (Receivable / Payable / History)
 * ------------------------------------------------------------------ */

export function KpiTile({
  label,
  value,
  hint,
  tone,
  onClick,
  active,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "good" | "warn" | "bad";
  onClick?: () => void;
  active?: boolean;
}) {
  const valueCls =
    tone === "good" ? "text-primary"
    : tone === "warn" ? "text-amber-600 dark:text-amber-400"
    : tone === "bad" ? "text-destructive"
    : "text-foreground";
  const interactive = !!onClick;
  const Comp: any = interactive ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "surface text-left w-full p-3.5 sm:p-4 transition-colors",
        interactive && "hover:bg-muted/35",
        active && "ring-1 ring-primary/40",
      )}
    >
      <div className="eyebrow">{label}</div>
      <div className={cn("stat-num mt-1.5 text-lg sm:text-xl", valueCls)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{hint}</div>}
    </Comp>
  );
}

export function KpiGrid({ children, cols = 2, className }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const grid = cols === 4 ? "grid-cols-2 md:grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return <div className={cn("grid gap-2.5", grid, className)}>{children}</div>;
}

export type ActionItem = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
};

export function ActionStack({
  title,
  items,
  className,
}: {
  title?: ReactNode;
  items: ActionItem[];
  className?: string;
}) {
  return (
    <div className={cn("surface p-3", className)}>
      {title && <div className="eyebrow mb-2.5">{title}</div>}
      <div className="grid grid-cols-1 gap-2">
        {items.map((it, i) => (
          <button
            key={i}
            type="button"
            onClick={it.onClick}
            disabled={it.disabled}
            className={cn(
              "h-10 rounded-lg border px-3 text-sm font-medium inline-flex items-center gap-2 transition-colors",
              it.primary
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                : "bg-background border-border/70 hover:bg-muted/50",
              it.disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <span className={cn("inline-flex h-4 w-4 items-center justify-center", it.primary ? "text-primary-foreground" : "text-muted-foreground")}>{it.icon}</span>
            <span className="truncate">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export type SegmentItem = { value: string; label: ReactNode; icon?: ReactNode };

export function SegmentedTabs({
  value,
  onValueChange,
  items,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: SegmentItem[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex w-full sm:w-auto rounded-full bg-muted p-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(it.value)}
            className={cn(
              // Equal-width segments + fixed type metrics so the active pill
              // never resizes the row. Same font-size & weight in both states;
              // active state only changes the surface + colour.
              "flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3 h-8 rounded-full text-[12.5px] font-medium leading-none tracking-tight transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {it.icon && <span className="h-3.5 w-3.5 inline-flex items-center justify-center shrink-0">{it.icon}</span>}
            <span className="truncate">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}