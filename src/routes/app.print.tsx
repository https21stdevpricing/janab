import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import { fmtDate } from "@/lib/format";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/app/print")({ component: PrintLayout });

function PrintLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (path !== "/app/print") return <Outlet />;
  return <PrintIndex />;
}

function PrintIndex() {
  const [inv, setInv] = useState<any[]>([]);
  const [quo, setQuo] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    supabase.from("sales").select("id,invoice_no,date,buyer_name").order("date", { ascending: false }).then(({ data }) => setInv(data ?? []));
    supabase.from("quotations").select("id,quote_no,date,buyer_name").order("date", { ascending: false }).then(({ data }) => setQuo(data ?? []));
  }, []);
  const needle = q.trim().toLowerCase();
  const match = (r: any, noField: string) =>
    needle === "" ||
    [r[noField], r.buyer_name, r.date].some((v: any) => String(v ?? "").toLowerCase().includes(needle));
  const invF = useMemo(() => inv.filter(r => match(r, "invoice_no")), [inv, needle]);
  const quoF = useMemo(() => quo.filter(r => match(r, "quote_no")), [quo, needle]);
  return (
    <div>
      <PageHeader title="Print" description="Open any invoice or quote in a print-ready layout" />
      <div className="mb-3">
        <Input
          placeholder="Search by number, buyer, or date…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-10"
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {invF.length} invoice{invF.length === 1 ? "" : "s"} · {quoF.length} quote{quoF.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Invoices</h3>
          {invF.length === 0 ? <Empty>{inv.length === 0 ? "No invoices yet." : "No matches."}</Empty> : (
            <ul className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
              {invF.map(r => (
                <li key={r.id}><Link to={"/app/print/invoice/$id" as any} params={{ id: r.id } as any} className="block rounded border bg-card p-2 hover:bg-accent">
                  <span className="font-mono text-sm">{r.invoice_no}</span> <span className="text-xs text-muted-foreground">· {fmtDate(r.date)} · {r.buyer_name}</span>
                </Link></li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Quotations</h3>
          {quoF.length === 0 ? <Empty>{quo.length === 0 ? "No quotes yet." : "No matches."}</Empty> : (
            <ul className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
              {quoF.map(r => (
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