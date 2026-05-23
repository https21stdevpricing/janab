import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Plus, Printer, Trash2, FileDown } from "lucide-react";
import { fmt, inr, todayISO } from "@/lib/format";
import { amountInWords } from "@/lib/amount-words";
import { exportStoneWorldDocument } from "@/lib/pdf-theme";
import { loadPrintDesign } from "@/lib/print-customizer";
import type { DocLookupResult } from "@/lib/doc-lookup";

export const Route = createFileRoute("/app/document")({ component: DocumentMaker });

type Line = { name: string; hsn: string; qty: number; unit: string; rate: number; gst: number };

const blankLine = (): Line => ({ name: "", hsn: "", qty: 1, unit: "Nos", rate: 0, gst: 18 });

function DocumentMaker() {
  const [kind, setKind] = useState<"sale" | "quote">("sale");
  const [docNo, setDocNo] = useState("INV-0001");
  const [date, setDate] = useState(todayISO());
  const [validUntil, setValidUntil] = useState("");
  const [company, setCompany] = useState({
    company_name: "Your Business",
    address: "",
    phone: "",
    email: "",
    gstin: "",
    pan: "",
    state: "",
    bank_name: "",
    bank_account_no: "",
    bank_ifsc: "",
    upi_id: "",
    owner_name: "",
  });
  const [party, setParty] = useState({
    name: "",
    address: "",
    state: "",
    gstin: "",
    phone: "",
  });
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + Number(l.qty || 0) * Number(l.rate || 0), 0);
    const gst = lines.reduce(
      (a, l) => a + (Number(l.qty || 0) * Number(l.rate || 0) * Number(l.gst || 0)) / 100,
      0,
    );
    return { subtotal, gst, total: +(subtotal + gst).toFixed(2) };
  }, [lines]);

  const update = (i: number, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const remove = (i: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const buildResult = (): DocLookupResult => ({
    kind: kind === "sale" ? "sale" : "quote",
    prefix: kind === "sale" ? "INV" : "QUO",
    header: {
      id: "standalone",
      date,
      valid_until: validUntil || null,
      [kind === "sale" ? "invoice_no" : "quote_no"]: docNo,
      buyer_name: party.name,
      notes,
    },
    items: lines.map((l, i) => ({
      position: i + 1,
      product_name: l.name || "—",
      hsn: l.hsn || "—",
      qty: l.qty,
      unit: l.unit,
      rate: l.rate,
      sale_rate: l.rate,
      gst_pct: l.gst,
    })),
    totals,
    party: {
      name: party.name,
      address: party.address,
      state: party.state,
      gstin: party.gstin,
      phone: party.phone,
    },
    outstanding:
      kind === "sale"
        ? { total: totals.total, paid: 0, balance: totals.total, status: "unpaid" }
        : undefined,
  });

  const downloadPdf = () => {
    const design = loadPrintDesign();
    exportStoneWorldDocument(buildResult(), company as any, design);
  };

  return (
    <div>
      <PageHeader
        title="Document maker"
        description="Create a one-off invoice or quotation PDF. Nothing is saved to your accounts — pure print only."
      />

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          <section className="surface p-4 space-y-3">
            <div className="eyebrow">Document</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <label className="flex flex-col gap-1">
                <span className="text-muted-foreground">Type</span>
                <select
                  className="h-8 rounded-md border bg-background px-2"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as any)}
                >
                  <option value="sale">Tax Invoice</option>
                  <option value="quote">Quotation</option>
                </select>
              </label>
              <Field label="Document no.">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 font-mono"
                  value={docNo}
                  onChange={(e) => setDocNo(e.target.value)}
                />
              </Field>
              <Field label="Date">
                <input
                  type="date"
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              {kind === "quote" && (
                <Field label="Valid until">
                  <input
                    type="date"
                    className="h-8 w-full rounded-md border bg-background px-2"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </Field>
              )}
            </div>
          </section>

          <section className="surface p-4 space-y-3">
            <div className="eyebrow">Your business (printed in header)</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <Field label="Business name" full>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={company.company_name}
                  onChange={(e) => setCompany({ ...company, company_name: e.target.value })}
                />
              </Field>
              <Field label="Address" full>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={company.address}
                  onChange={(e) => setCompany({ ...company, address: e.target.value })}
                />
              </Field>
              <Field label="State">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={company.state}
                  onChange={(e) => setCompany({ ...company, state: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={company.phone}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={company.email}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                />
              </Field>
              <Field label="GSTIN">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 font-mono"
                  value={company.gstin}
                  onChange={(e) => setCompany({ ...company, gstin: e.target.value })}
                />
              </Field>
              <Field label="PAN">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 font-mono"
                  value={company.pan}
                  onChange={(e) => setCompany({ ...company, pan: e.target.value })}
                />
              </Field>
              <Field label="UPI ID">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={company.upi_id}
                  onChange={(e) => setCompany({ ...company, upi_id: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <section className="surface p-4 space-y-3">
            <div className="eyebrow">{kind === "sale" ? "Bill to" : "Quoted to"}</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <Field label="Name" full>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={party.name}
                  onChange={(e) => setParty({ ...party, name: e.target.value })}
                />
              </Field>
              <Field label="Address" full>
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={party.address}
                  onChange={(e) => setParty({ ...party, address: e.target.value })}
                />
              </Field>
              <Field label="State">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={party.state}
                  onChange={(e) => setParty({ ...party, state: e.target.value })}
                />
              </Field>
              <Field label="GSTIN">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2 font-mono"
                  value={party.gstin}
                  onChange={(e) => setParty({ ...party, gstin: e.target.value })}
                />
              </Field>
              <Field label="Phone">
                <input
                  className="h-8 w-full rounded-md border bg-background px-2"
                  value={party.phone}
                  onChange={(e) => setParty({ ...party, phone: e.target.value })}
                />
              </Field>
            </div>
          </section>

          <section className="surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="eyebrow">Line items</div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLines((p) => [...p, blankLine()])}
              >
                <Plus className="h-4 w-4" /> Add line
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[640px]">
                <thead className="text-muted-foreground text-[10px] uppercase tracking-wide">
                  <tr className="border-b">
                    <th className="text-left py-2 pr-2">Description</th>
                    <th className="text-left py-2 pr-2 w-[90px]">HSN/SAC</th>
                    <th className="text-right py-2 pr-2 w-[70px]">Qty</th>
                    <th className="text-left py-2 pr-2 w-[60px]">Unit</th>
                    <th className="text-right py-2 pr-2 w-[90px]">Rate</th>
                    <th className="text-right py-2 pr-2 w-[60px]">GST%</th>
                    <th className="text-right py-2 pr-2 w-[100px]">Amount</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 pr-2">
                        <input
                          className="h-8 w-full rounded-md border bg-background px-2"
                          value={l.name}
                          onChange={(e) => update(i, { name: e.target.value })}
                          placeholder="Item name"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          className="h-8 w-full rounded-md border bg-background px-2 font-mono"
                          value={l.hsn}
                          onChange={(e) => update(i, { hsn: e.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="any"
                          className="h-8 w-full rounded-md border bg-background px-2 text-right tabular-nums"
                          value={l.qty}
                          onChange={(e) => update(i, { qty: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          className="h-8 w-full rounded-md border bg-background px-2"
                          value={l.unit}
                          onChange={(e) => update(i, { unit: e.target.value })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="any"
                          className="h-8 w-full rounded-md border bg-background px-2 text-right tabular-nums"
                          value={l.rate}
                          onChange={(e) => update(i, { rate: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input
                          type="number"
                          step="any"
                          className="h-8 w-full rounded-md border bg-background px-2 text-right tabular-nums"
                          value={l.gst}
                          onChange={(e) => update(i, { gst: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums font-semibold">
                        {fmt(Number(l.qty || 0) * Number(l.rate || 0), 2)}
                      </td>
                      <td className="py-1.5">
                        <button
                          type="button"
                          onClick={() => remove(i)}
                          className="h-7 w-7 grid place-items-center rounded-md border text-muted-foreground hover:bg-accent"
                          aria-label="Remove line"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface p-4 space-y-2">
            <div className="eyebrow">Notes (printed on the document)</div>
            <textarea
              rows={2}
              className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any remark to print under the totals…"
            />
          </section>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-3 h-fit">
          <div className="surface p-4 space-y-2">
            <div className="eyebrow">Totals</div>
            <Row label="Subtotal" value={inr(totals.subtotal)} />
            <Row label="GST" value={inr(totals.gst)} />
            <div className="border-t pt-2 flex justify-between items-baseline">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Grand total
              </span>
              <span className="text-lg font-semibold tabular-nums">{inr(totals.total)}</span>
            </div>
            <p className="text-[10.5px] text-muted-foreground leading-4">
              {amountInWords(totals.total)}
            </p>
          </div>
          <div className="surface p-4 space-y-2">
            <div className="eyebrow">Output</div>
            <Button className="w-full" onClick={downloadPdf}>
              <FileDown className="h-4 w-4" /> Download branded PDF
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.print()}
              title="Browser print dialog"
            >
              <Printer className="h-4 w-4" /> Print preview
            </Button>
            <p className="text-[10.5px] text-muted-foreground leading-4">
              Nothing entered here is recorded in your books, stock, or GST. Pure document mode —
              safe to use as a sample, mock-up, or quick share.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "md:col-span-3 col-span-2" : ""}`}>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </div>
  );
}