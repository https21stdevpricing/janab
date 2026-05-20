import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Filter, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Collapsible advanced-filter block (mirrors the General Ledger pattern).
 * Use for any page where the filter bar otherwise clutters the screen.
 */
export function CollapseFilters({
  children,
  summary,
  active = 0,
  onClear,
  defaultOpen = false,
  className,
}: {
  children: ReactNode;
  summary?: ReactNode;
  active?: number;
  onClear?: () => void;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={cn("mb-3", className)}>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={open ? "default" : "outline"}
          size="sm"
          onClick={() => setOpen((s) => !s)}
          className="h-8"
        >
          <Filter className="h-3.5 w-3.5" /> Filters
          {active > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary/15 text-primary text-[10px] font-semibold tabular-nums">
              {active}
            </span>
          )}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        {active > 0 && onClear && (
          <Button variant="ghost" size="sm" className="h-8" onClick={onClear}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
        {summary && <div className="ml-auto text-xs text-muted-foreground truncate">{summary}</div>}
      </div>
      {open && (
        <div className="mt-2 rounded-lg border bg-card p-3 animate-in fade-in slide-in-from-top-1 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}