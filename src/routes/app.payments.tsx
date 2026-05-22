import { createFileRoute, Navigate } from "@tanstack/react-router";

// Payments are unified into /app/bills. This route exists only to preserve
// any deep links (?ref=, ?dir=, ?party=, ?new=) coming from elsewhere.
export const Route = createFileRoute("/app/payments")({
  component: RedirectToBills,
  validateSearch: (s: Record<string, unknown>) => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
    dir: s.dir === "out" ? ("out" as const) : s.dir === "in" ? ("in" as const) : undefined,
    party: typeof s.party === "string" ? s.party : undefined,
    new: s.new === "in" ? ("in" as const) : s.new === "out" ? ("out" as const) : undefined,
  }),
});

function RedirectToBills() {
  const search = Route.useSearch();
  return <Navigate to="/app/bills" search={search as any} replace />;
}
