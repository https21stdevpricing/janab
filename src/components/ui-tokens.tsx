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