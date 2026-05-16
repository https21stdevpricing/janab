import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/app/sales")({ component: () => <Stub title="Sales" /> });
function Stub({ title }: { title: string }) {
  return <div><h1 className="text-2xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground mt-2">Coming in the next build — say "build {title.toLowerCase()}" to continue.</p></div>;
}