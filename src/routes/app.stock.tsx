import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Empty } from "@/components/empty";
import { Badge } from "@/components/ui/badge";
import { fmt } from "@/lib/format";

export const Route = createFileRoute("/app/stock")({ component: StockPage });

function StockPage() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.from("stock_view").select("*").order("code").then(({ data }) => setRows(data ?? [])); }, []);
  return (
    <div>
      <PageHeader title="Stock Ledger" description="Live on-hand by product (excl. third-party)" />
      {rows.length === 0 ? <Empty>No products yet.</Empty> : (
        <div className="rounded-md border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/50 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-2">Code</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Unit</th>
                <th className="text-right p-2">Opening</th>
                <th className="text-right p-2">Purchased</th>
                <th className="text-right p-2">Sold</th>
                <th className="text-right p-2">On hand</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const low = Number(r.on_hand) <= Number(r.reorder_level ?? 0);
                return (
                  <tr key={r.product_id} className="border-t">
                    <td className="p-2 font-mono text-xs">{r.code}</td>
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2">{r.unit}</td>
                    <td className="p-2 text-right tabular-nums">{fmt(r.opening_stock)}</td>
                    <td className="p-2 text-right tabular-nums text-primary">{fmt(r.purchased)}</td>
                    <td className="p-2 text-right tabular-nums text-destructive">{fmt(r.sold)}</td>
                    <td className="p-2 text-right tabular-nums font-semibold">{fmt(r.on_hand)}</td>
                    <td className="p-2">{low && <Badge variant="destructive">Low</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}