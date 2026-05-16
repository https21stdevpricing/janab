import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import { fmt } from "@/lib/format";

export type Item = {
  product_id?: string | null;
  product_name?: string | null;
  unit?: string | null;
  qty: number;
  rate: number;
  gst_pct: number;
  // For TP only
  purchase_rate?: number;
  sale_rate?: number;
};

type Product = { id: string; code: string; name: string; unit: string | null; sale_rate: number | null; purchase_rate: number | null };

export function LineItemsEditor({
  items, onChange, mode = "single",
}: {
  items: Item[];
  onChange: (next: Item[]) => void;
  mode?: "single" | "tp"; // tp uses purchase_rate + sale_rate
}) {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { supabase.from("products").select("id,code,name,unit,sale_rate,purchase_rate").order("code").then(({ data }) => setProducts((data ?? []) as Product[])); }, []);

  const update = (i: number, patch: Partial<Item>) => {
    const next = items.slice();
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, mode === "tp"
    ? { qty: 1, rate: 0, gst_pct: 18, purchase_rate: 0, sale_rate: 0 }
    : { qty: 1, rate: 0, gst_pct: 18 }]);

  const pick = (i: number, productId: string) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    update(i, {
      product_id: p.id, product_name: p.name, unit: p.unit,
      rate: mode === "single" ? Number(p.sale_rate ?? 0) : items[i].rate,
      purchase_rate: mode === "tp" ? Number(p.purchase_rate ?? 0) : items[i].purchase_rate,
      sale_rate: mode === "tp" ? Number(p.sale_rate ?? 0) : items[i].sale_rate,
    });
  };

  const totals = items.reduce((acc, it) => {
    const rate = mode === "tp" ? (it.sale_rate ?? 0) : it.rate;
    const base = it.qty * rate;
    const gst = base * (it.gst_pct / 100);
    acc.base += base; acc.gst += gst; acc.total += base + gst;
    if (mode === "tp") acc.cost += it.qty * (it.purchase_rate ?? 0);
    return acc;
  }, { base: 0, gst: 0, total: 0, cost: 0 });

  return (
    <div className="space-y-2">
      {/* Desktop table */}
      <div className="hidden md:block rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left p-2 w-[28%]">Product</th>
              <th className="text-right p-2 w-20">Qty</th>
              <th className="text-left p-2 w-16">Unit</th>
              {mode === "tp" ? <>
                <th className="text-right p-2 w-24">Purch ₹</th>
                <th className="text-right p-2 w-24">Sale ₹</th>
              </> : (
                <th className="text-right p-2 w-24">Rate ₹</th>
              )}
              <th className="text-right p-2 w-16">GST%</th>
              <th className="text-right p-2 w-28">Amount</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const rate = mode === "tp" ? (it.sale_rate ?? 0) : it.rate;
              const amt = it.qty * rate * (1 + it.gst_pct / 100);
              return (
                <tr key={i} className="border-t">
                  <td className="p-1.5">
                    <Select value={it.product_id ?? ""} onValueChange={(v) => pick(i, v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="p-1.5"><Input className="h-8 text-right" type="number" value={it.qty} onChange={(e) => update(i, { qty: +e.target.value })} /></td>
                  <td className="p-1.5"><Input className="h-8" value={it.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value })} /></td>
                  {mode === "tp" ? <>
                    <td className="p-1.5"><Input className="h-8 text-right" type="number" value={it.purchase_rate ?? 0} onChange={(e) => update(i, { purchase_rate: +e.target.value })} /></td>
                    <td className="p-1.5"><Input className="h-8 text-right" type="number" value={it.sale_rate ?? 0} onChange={(e) => update(i, { sale_rate: +e.target.value })} /></td>
                  </> : (
                    <td className="p-1.5"><Input className="h-8 text-right" type="number" value={it.rate} onChange={(e) => update(i, { rate: +e.target.value })} /></td>
                  )}
                  <td className="p-1.5"><Input className="h-8 text-right" type="number" value={it.gst_pct} onChange={(e) => update(i, { gst_pct: +e.target.value })} /></td>
                  <td className="p-1.5 text-right tabular-nums">{fmt(amt)}</td>
                  <td className="p-1.5"><Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {items.map((it, i) => (
          <div key={i} className="rounded-md border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Select value={it.product_id ?? ""} onValueChange={(v) => pick(i, v)}>
                <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Labeled label="Qty"><Input className="h-9" type="number" value={it.qty} onChange={(e) => update(i, { qty: +e.target.value })} /></Labeled>
              <Labeled label="Unit"><Input className="h-9" value={it.unit ?? ""} onChange={(e) => update(i, { unit: e.target.value })} /></Labeled>
              <Labeled label="GST%"><Input className="h-9" type="number" value={it.gst_pct} onChange={(e) => update(i, { gst_pct: +e.target.value })} /></Labeled>
              {mode === "tp" ? <>
                <Labeled label="Purch ₹"><Input className="h-9" type="number" value={it.purchase_rate ?? 0} onChange={(e) => update(i, { purchase_rate: +e.target.value })} /></Labeled>
                <Labeled label="Sale ₹"><Input className="h-9" type="number" value={it.sale_rate ?? 0} onChange={(e) => update(i, { sale_rate: +e.target.value })} /></Labeled>
              </> : (
                <Labeled label="Rate ₹"><Input className="h-9" type="number" value={it.rate} onChange={(e) => update(i, { rate: +e.target.value })} /></Labeled>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add row</Button>
        <div className="text-xs md:text-sm text-right space-y-0.5">
          <div>Subtotal: <span className="font-medium tabular-nums">₹{fmt(totals.base)}</span></div>
          <div>GST: <span className="font-medium tabular-nums">₹{fmt(totals.gst)}</span></div>
          <div className="text-base font-semibold">Total: <span className="tabular-nums">₹{fmt(totals.total)}</span></div>
          {mode === "tp" && <div className="text-emerald-600 dark:text-emerald-400">Margin: <span className="tabular-nums">₹{fmt(totals.base - totals.cost)}</span></div>}
        </div>
      </div>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>{children}</div>;
}