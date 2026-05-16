import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/app/print")({ component: PrintLayout });

function PrintLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path !== "/app/print") return <Outlet />;
  return <PrintIndex />;
}

function PrintIndex() {
  const [inv, setInv] = useState<any[]>([]);
  const [quo, setQuo] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("sales").select("id,invoice_no,date,buyer_name").order("date", { ascending: false }).limit(50).then(({ data }) => setInv(data ?? []));
    supabase.from("quotations").select("id,quote_no,date,buyer_name").order("date", { ascending: false }).limit(50).then(({ data }) => setQuo(data ?? []));
  }, []);
  return (
    <div>
      <PageHeader title="Print" description="Open any invoice or quote in a print-ready layout" />
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Invoices</h3>
          {inv.length === 0 ? <Empty>No invoices yet.</Empty> : (
            <ul className="space-y-1">
              {inv.map(r => (
                <li key={r.id}><Link to={"/app/print/invoice/$id" as any} params={{ id: r.id } as any} className="block rounded border bg-card p-2 hover:bg-accent">
                  <span className="font-mono text-sm">{r.invoice_no}</span> <span className="text-xs text-muted-foreground">· {fmtDate(r.date)} · {r.buyer_name}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Quotations</h3>
          {quo.length === 0 ? <Empty>No quotes yet.</Empty> : (
            <ul className="space-y-1">
              {quo.map(r => (
                <li key={r.id}><Link to={"/app/print/quote/$id" as any} params={{ id: r.id } as any} className="block rounded border bg-card p-2 hover:bg-accent">
                  <span className="font-mono text-sm">{r.quote_no}</span> <span className="text-xs text-muted-foreground">· {fmtDate(r.date)} · {r.buyer_name}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}