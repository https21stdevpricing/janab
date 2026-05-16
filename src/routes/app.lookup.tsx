import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { fmt, fmtDate, inr } from "@/lib/format";
import { Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/lookup")({ component: LookupPage });

type Found = { kind: string; header: any; items: any[] };

function LookupPage() {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found | null>(null);

  const run = async () => {
    const id = q.trim().toUpperCase();
    if (!id) return;
    setFound(null);
    const map: Array<{ prefix: string; kind: string; table: any; itemsTable: any; col: string; fk: string }> = [
      { prefix: "INV", kind: "Sale Invoice", table: "sales", itemsTable: "sale_items", col: "invoice_no", fk: "sale_id" },
      { prefix: "PO",  kind: "Purchase Order", table: "purchases", itemsTable: "purchase_items", col: "po_no", fk: "purchase_id" },
      { prefix: "TP",  kind: "Third Party", table: "third_party", itemsTable: "tp_items", col: "tp_no", fk: "tp_id" },
      { prefix: "QUO", kind: "Quotation", table: "quotations", itemsTable: "quotation_items", col: "quote_no", fk: "quotation_id" },
      { prefix: "RI",  kind: "Receipt", table: "payments", itemsTable: "", col: "payment_no", fk: "" },
      { prefix: "PY",  kind: "Payment", table: "payments", itemsTable: "", col: "payment_no", fk: "" },
    ];
    const match = map.find(m => id.startsWith(m.prefix + "-"));
    if (!match) { toast.error("Unknown ID. Use INV-, PO-, TP-, QUO-, RI-, PY-"); return; }
    const { data: h } = await supabase.from(match.table as never).select("*").eq(match.col as never, id).maybeSingle() as { data: any };
    if (!h) { toast.error("Not found"); return; }
    let items: any[] = [];
    if (match.itemsTable) {
      const { data: its } = await supabase.from(match.itemsTable as never).select("*").eq(match.fk as never, h.id).order("position");
      items = its ?? [];
    }
    setFound({ kind: match.kind, header: h, items });
  };

  return (
    <div>
      <PageHeader title="Lookup" description="Enter any document ID — INV-, PO-, TP-, QUO-, RI-, PY-" />
      <div className="flex gap-2 mb-4 max-w-md">
        <Input className="font-mono" placeholder="e.g. INV-0001" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <Button onClick={run}><Search className="h-4 w-4" /> Find</Button>
      </div>
      {!found ? <Empty>Enter an ID and press Find.</Empty> : (
        <div className="rounded-md border bg-card">
          <div className="p-4 border-b">
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{found.kind}</div>
            <div className="text-lg font-semibold font-mono">{found.header.invoice_no ?? found.header.po_no ?? found.header.tp_no ?? found.header.quote_no ?? found.header.payment_no}</div>
            <div className="text-sm text-muted-foreground mt-1">{fmtDate(found.header.date)} · {found.header.buyer_name ?? found.header.supplier_name ?? found.header.contact_name ?? "—"}</div>
            {found.header.amount && <div className="text-base font-semibold mt-2">{inr(found.header.amount)}</div>}
            {found.header.notes && <div className="text-sm mt-2">{found.header.notes}</div>}
          </div>
          {found.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide">
                  <tr><th className="text-left p-2">Product</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Rate</th><th className="text-right p-2">GST%</th><th className="text-right p-2">Total</th></tr>
                </thead>
                <tbody>
                  {found.items.map((it, i) => {
                    const rate = it.sale_rate ?? it.rate;
                    const total = it.qty * rate * (1 + (it.gst_pct ?? 0) / 100);
                    return (
                      <tr key={i} className="border-t">
                        <td className="p-2">{it.product_name}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(it.qty)} {it.unit}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(rate)}</td>
                        <td className="p-2 text-right tabular-nums">{fmt(it.gst_pct)}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{fmt(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}