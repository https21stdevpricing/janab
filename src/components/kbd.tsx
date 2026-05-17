import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 ml-1.5 rounded border border-border bg-muted/60 text-[10px] font-mono font-medium text-muted-foreground leading-none align-middle select-none",
        className,
      )}
    >
      {children}
    </kbd>
  );
}