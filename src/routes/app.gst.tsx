import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { inr } from "@/lib/format";

export const Route = createFileRoute("/app/gst")({ component: GstPage });

type Row = {
  month: string;
  output_cgst: number; output_sgst: number; output_igst: number; output_total_legacy: number;
  input_cgst: number;  input_sgst: number;  input_igst: number;  input_total_legacy: number;
};

function GstPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("gst_summary_view").select("*").order("month", { ascending: false })
      .then(({ data }) => setRows((data as any) ?? []));
  }, []);

  const totals = useMemo(() => {
    const t = { oc: 0, os: 0, oi: 0, ic: 0, is: 0, ii: 0 };
    for (const r of rows) {
      t.oc += Number(r.output_cgst || 0) + Number(r.output_total_legacy || 0) / 2;
      t.os += Number(r.output_sgst || 0) + Number(r.output_total_legacy || 0) / 2;
      t.oi += Number(r.output_igst || 0);
      t.ic += Number(r.input_cgst || 0) + Number(r.input_total_legacy || 0) / 2;
      t.is += Number(r.input_sgst || 0) + Number(r.input_total_legacy || 0) / 2;
      t.ii += Number(r.input_igst || 0);
    }
    return t;
  }, [rows]);

  const outTotal = totals.oc + totals.os + totals.oi;
  const inTotal = totals.ic + totals.is + totals.ii;
  const net = outTotal - inTotal;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader title="GST Summary" description="CGST / SGST / IGST totals from sales and purchases" />

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Output GST (payable)" value={inr(outTotal)} tone="text-rose-600" />
        <Stat label="Input GST (credit)" value={inr(inTotal)} tone="text-emerald-600" />
        <Stat label={net >= 0 ? "Net GST payable" : "Net GST refund"} value={inr(Math.abs(net))} tone="font-semibold" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Tax breakdown</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 pr-3">Type</th>
                <th className="text-right py-2 px-3">CGST</th>
                <th className="text-right py-2 px-3">SGST</th>
                <th className="text-right py-2 px-3">IGST</th>
                <th className="text-right py-2 pl-3">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-3 font-medium">Output (Sales)</td>
                <td className="text-right px-3">{inr(totals.oc)}</td>
                <td className="text-right px-3">{inr(totals.os)}</td>
                <td className="text-right px-3">{inr(totals.oi)}</td>
                <td className="text-right pl-3 font-medium">{inr(outTotal)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-3 font-medium">Input (Purchases)</td>
                <td className="text-right px-3">{inr(totals.ic)}</td>
                <td className="text-right px-3">{inr(totals.is)}</td>
                <td className="text-right px-3">{inr(totals.ii)}</td>
                <td className="text-right pl-3 font-medium">{inr(inTotal)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-semibold">Net</td>
                <td className="text-right px-3">{inr(totals.oc - totals.ic)}</td>
                <td className="text-right px-3">{inr(totals.os - totals.is)}</td>
                <td className="text-right px-3">{inr(totals.oi - totals.ii)}</td>
                <td className="text-right pl-3 font-semibold">{inr(net)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Monthly breakdown</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="text-xs uppercase text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 pr-3">Month</th>
                <th className="text-right py-2 px-3">Out CGST</th>
                <th className="text-right py-2 px-3">Out SGST</th>
                <th className="text-right py-2 px-3">Out IGST</th>
                <th className="text-right py-2 px-3">In CGST</th>
                <th className="text-right py-2 px-3">In SGST</th>
                <th className="text-right py-2 px-3">In IGST</th>
                <th className="text-right py-2 pl-3">Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">No GST entries yet.</td></tr>
              )}
              {rows.map((r) => {
                const oc = Number(r.output_cgst || 0) + Number(r.output_total_legacy || 0) / 2;
                const os = Number(r.output_sgst || 0) + Number(r.output_total_legacy || 0) / 2;
                const oi = Number(r.output_igst || 0);
                const ic = Number(r.input_cgst || 0) + Number(r.input_total_legacy || 0) / 2;
                const is = Number(r.input_sgst || 0) + Number(r.input_total_legacy || 0) / 2;
                const ii = Number(r.input_igst || 0);
                const n = oc + os + oi - ic - is - ii;
                return (
                  <tr key={r.month} className="border-b last:border-0">
                    <td className="py-2 pr-3">{new Date(r.month).toLocaleString("en-IN", { month: "short", year: "numeric" })}</td>
                    <td className="text-right px-3">{inr(oc)}</td>
                    <td className="text-right px-3">{inr(os)}</td>
                    <td className="text-right px-3">{inr(oi)}</td>
                    <td className="text-right px-3">{inr(ic)}</td>
                    <td className="text-right px-3">{inr(is)}</td>
                    <td className="text-right px-3">{inr(ii)}</td>
                    <td className="text-right pl-3 font-medium">{inr(n)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl mt-1 ${tone ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}