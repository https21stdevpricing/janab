import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 sm:mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-lg sm:text-2xl font-semibold tracking-tight leading-tight break-words">{title}</h1>
        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-snug">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 sm:justify-end sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}