import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { CollapseFilters } from "@/components/collapse-filters";
import { inr, fmtDate } from "@/lib/format";
import { Kbd } from "@/components/kbd";
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DocDetail } from "@/routes/app.lookup";
import { lookupDoc, type DocLookupResult } from "@/lib/doc-lookup";
import { Eye } from "lucide-react";

export const Route = createFileRoute("/app/bills")({ component: BillsPage });

type Row = {
  user_id: string;
  doc_kind: "sale" | "purchase" | "tp" | "tp_purchase";
  doc_id: string;
  doc_no: string;
  date: string;
  party_id: string | null;
  party_name: string | null;
  total: number;
  paid: number;
  balance: number;
  status: string;
};

const sideOf = (k: Row["doc_kind"]) => (k === "sale" || k === "tp" ? "receivable" : "payable");
const docKindLabel = (k: Row["doc_kind"]) => k === "sale" ? "Invoice" : k === "purchase" ? "Purchase" : k === "tp" ? "TP sale" : "TP purchase";

function ageDays(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
function bucket(d: number) {
  if (d <= 30) return "0–30";
  if (d <= 60) return "31–60";
  if (d <= 90) return "61–90";
  return "90+";
}
function bucketTone(b: string) {
  return b === "0–30" ? "secondary" : b === "31–60" ? "default" : "destructive";
}

function BillsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<"receivable" | "payable">("receivable");
  const [q, setQ] = useState("");
  const [bucketFilter, setBucketFilter] = useState<"all" | "0–30" | "31–60" | "61–90" | "90+">("all");
  const [preview, setPreview] = useState<DocLookupResult | null>(null);

  const openPreview = async (docNo: string) => {
    const r = await lookupDoc(docNo);
    if (r) setPreview(r);
  };

  const load = async () => {
    const { data } = await supabase
      .from("outstanding_view" as never)
      .select("*")
      .gt("balance", 0)
      .order("date", { ascending: true }) as any;
    setRows((data ?? []) as Row[]);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel("bills-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_allocations" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "third_party" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const sideRows = useMemo(() => rows.filter(r => sideOf(r.doc_kind) === tab), [rows, tab]);
  const filtered = useMemo(() => sideRows.filter(r => {
    if (q && !`${r.doc_no} ${r.party_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (bucketFilter !== "all" && bucket(ageDays(r.date)) !== bucketFilter) return false;
    return true;
  }), [sideRows, q, bucketFilter]);

  const totals = useMemo(() => {
    const t = { total: 0, b1: 0, b2: 0, b3: 0, b4: 0 };
    for (const r of sideRows) {
      t.total += Number(r.balance || 0);
      const b = bucket(ageDays(r.date));
      if (b === "0–30") t.b1 += r.balance;
      else if (b === "31–60") t.b2 += r.balance;
      else if (b === "61–90") t.b3 += r.balance;
      else t.b4 += r.balance;
    }
    return t;
  }, [sideRows]);

  const onExport = () => {
    exportToExcel({
      filename: `bills-${tab}-${new Date().toISOString().slice(0, 10)}`,
      sheetName: tab === "receivable" ? "Receivable" : "Payable",
      columns: [
        { header: "Doc No", key: "doc_no" },
        { header: "Type", key: "doc_kind" },
        { header: "Date", key: "date" },
        { header: "Party", key: "party_name" },
        { header: "Total", key: "total" },
        { header: "Paid", key: "paid" },
        { header: "Balance", key: "balance" },
        { header: "Age (days)", key: "age", get: (r: Row) => ageDays(r.date) },
        { header: "Status", key: "status" },
      ],
      rows: filtered.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    });
  };

  return (
    <div>
      <PageHeader
        title={<span className="inline-flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Bills <Kbd>B</Kbd></span>}
        description="Outstanding receivables and payables grouped by aging."
        actions={<ExcelBar onExport={onExport} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Tile label={tab === "receivable" ? "Total receivable" : "Total payable"} value={inr(totals.total)} tone={tab === "receivable" ? "good" : "bad"} />
        <Tile label="0–30 d" value={inr(totals.b1)} />
        <Tile label="31–60 d" value={inr(totals.b2)} />
        <Tile label="61–90 d" value={inr(totals.b3)} />
        <Tile label="90+ d" value={inr(totals.b4)} tone="bad" />
      </div>

      <Tabs value={tab} onValueChange={v => setTab(v as any)} className="mb-3">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="receivable" className="flex-1 sm:flex-none"><ArrowDownLeft className="h-3.5 w-3.5 mr-1" /> Receivable</TabsTrigger>
          <TabsTrigger value="payable" className="flex-1 sm:flex-none"><ArrowUpRight className="h-3.5 w-3.5 mr-1" /> Payable</TabsTrigger>
        </TabsList>
      </Tabs>

      <CollapseFilters
        summary={`${filtered.length} of ${sideRows.length} ${tab}`}
        active={(q ? 1 : 0) + (bucketFilter !== "all" ? 1 : 0)}
        onClear={() => { setQ(""); setBucketFilter("all"); }}
      >
        <div className="space-y-3">
          <Input placeholder="Search document or party…" value={q} onChange={e => setQ(e.target.value)} />
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Aging bucket</div>
            <div className="flex flex-wrap gap-1">
              {(["all", "0–30", "31–60", "61–90", "90+"] as const).map(b => (
                <Button key={b} size="sm" variant={bucketFilter === b ? "default" : "outline"} onClick={() => setBucketFilter(b)}>{b}</Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{tab === "receivable" ? "Money buyers owe you from invoices and TP sales." : "Money you owe suppliers from purchases and TP purchase side."}</p>
        </div>
      </CollapseFilters>

      {filtered.length === 0 ? <Empty>No outstanding {tab === "receivable" ? "receivables" : "payables"}.</Empty> : (
        <>
        <div className="hidden md:block rounded-md border bg-card overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="text-left p-2">Doc</th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Party</th>
                <th className="text-right p-2">Total</th>
                <th className="text-right p-2">Paid</th>
                <th className="text-right p-2">Balance</th>
                <th className="text-left p-2">Age</th>
                <th className="text-right p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const d = ageDays(r.date); const b = bucket(d);
                return (
                  <tr key={`${r.doc_kind}-${r.doc_id}`} className="border-t">
                    <td className="p-2"><button onClick={() => openPreview(r.doc_no)} className="font-mono text-primary hover:underline">{r.doc_no}</button><div><Badge variant="outline" className="mt-1 text-[10px]">{docKindLabel(r.doc_kind)}</Badge></div></td>
                    <td className="p-2">{fmtDate(r.date)}</td>
                    <td className="p-2 truncate max-w-[200px]">{r.party_name ?? "—"}</td>
                    <td className="p-2 text-right tabular-nums">{inr(r.total)}</td>
                    <td className="p-2 text-right tabular-nums">{inr(r.paid)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">{inr(r.balance)}</td>
                    <td className="p-2"><Badge variant={bucketTone(b) as any}>{b} · {d}d</Badge></td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="ghost" onClick={() => openPreview(r.doc_no)} title="Preview bill"><Eye className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/app/payments" search={{ ref: r.doc_no, dir: tab === "receivable" ? "in" : "out" } as any}>
                          {tab === "receivable" ? "Receive" : "Pay"}
                        </Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-2">
          {filtered.map(r => {
            const d = ageDays(r.date); const b = bucket(d);
            return (
              <div key={`${r.doc_kind}-${r.doc_id}`} className="rounded-md border bg-card p-3 space-y-3">
                <button type="button" onClick={() => openPreview(r.doc_no)} className="w-full text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-medium text-primary">{r.doc_no}</div>
                      <div className="text-sm truncate">{r.party_name ?? "—"}</div>
                    </div>
                    <Badge variant={bucketTone(b) as any} className="shrink-0">{b}</Badge>
                  </div>
                </button>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <BillStat label="Type" value={docKindLabel(r.doc_kind)} />
                  <BillStat label="Paid" value={inr(r.paid)} />
                  <BillStat label="Balance" value={inr(r.balance)} strong />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{fmtDate(r.date)} · {d} days old</span>
                  <span>Total {inr(r.total)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => openPreview(r.doc_no)}><Eye className="h-3.5 w-3.5" /> Preview</Button>
                  <Button size="sm" asChild>
                    <Link to="/app/payments" search={{ ref: r.doc_no, dir: tab === "receivable" ? "in" : "out" } as any}>{tab === "receivable" ? "Receive" : "Pay"}</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}
      <Dialog open={!!preview} onOpenChange={o => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0 gap-0">
          <div className="px-4 py-3 border-b">
            <DialogTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Bill preview</DialogTitle>
          </div>
          <div className="p-4">{preview && <DocDetail doc={preview} />}</div>
          <div className="px-4 py-3 border-t flex justify-end">
            <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-base sm:text-lg font-semibold tabular-nums ${tone === "good" ? "text-primary" : tone === "bad" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function BillStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 p-2 min-w-0">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`${strong ? "font-semibold text-primary" : "font-medium"} truncate tabular-nums`}>{value}</div>
    </div>
  );
}