import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { ExternalLink, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

type Row = { id: string; at: string; action: string; entity: string; ref_no: string | null; summary: string; diff: any };

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const load = async () => {
    const { data } = await supabase.from("audit_log" as never).select("*").order("at", { ascending: false }).limit(500) as any;
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("audit-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = rows.filter(r =>
    (entity === "all" || r.entity === entity) &&
    (action === "all" || r.action === action) &&
    (q === "" || r.summary?.toLowerCase().includes(q.toLowerCase()) || (r.ref_no ?? "").toLowerCase().includes(q.toLowerCase()))
  );

  const onExport = () => exportToExcel({
    filename: `audit-${new Date().toISOString().slice(0,10)}`, sheetName: "Audit",
    columns: [
      { header: "Time", key: "at" },
      { header: "Action", key: "action" },
      { header: "Entity", key: "entity" },
      { header: "Ref", key: "ref_no" },
      { header: "Summary", key: "summary" },
    ],
    rows: filtered,
  });

  const actBadge = (a: string) =>
    a === "insert" ? "default" : a === "update" ? "secondary" : "destructive";

  const entityLabel: Record<string, string> = {
    sales: "Sale", purchases: "Purchase", third_party: "Third-party", quotations: "Quote",
    payments: "Payment", expenses: "Expense", products: "Product", contacts: "Contact",
    deliveries: "Delivery", sale_items: "Sale line", purchase_items: "Purchase line",
    tp_items: "TP line", quotation_items: "Quote line", delivery_items: "Delivery line",
    payment_allocations: "Allocation",
  };

  return (
    <div>
      <PageHeader title="Backlog / Audit Log" description="Every create, update and delete with timestamp"
        actions={<ExcelBar onExport={onExport} />} />
      <div className="flex flex-wrap gap-2 mb-3">
        <Input className="max-w-xs" placeholder="Search ref or summary…" value={q} onChange={e => setQ(e.target.value)} />
        <Select value={entity} onValueChange={setEntity}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {["sales","purchases","third_party","quotations","payments","expenses","products","contacts","deliveries"].map(e =>
              <SelectItem key={e} value={e}>{e}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="insert">Insert</SelectItem>
            <SelectItem value="update">Update</SelectItem>
            <SelectItem value="delete">Delete</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground self-center">{filtered.length} events</div>
      </div>
      {filtered.length === 0 ? <Empty>No activity yet.</Empty> : (
        <div className="rounded-md border bg-card divide-y">
          {filtered.map(r => (
            <div key={r.id} className="p-3 flex items-start gap-2 text-sm">
              <Badge variant={actBadge(r.action) as any} className="capitalize w-16 justify-center">{r.action}</Badge>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {entityLabel[r.entity] ?? r.entity} {r.action === "insert" ? "created" : r.action === "delete" ? "deleted" : "updated"}
                  {r.ref_no && <span className="font-mono ml-1">{r.ref_no}</span>}
                </div>
                <div className="text-xs text-muted-foreground capitalize">{r.entity.replace("_", " ")}</div>
                {r.diff && Object.keys(r.diff).length > 0 && (() => {
                  const entries = Object.entries(r.diff);
                  const isOpen = !!expanded[r.id];
                  const shown = isOpen ? entries : entries.slice(0, 6);
                  return (
                    <div className="text-[11px] mt-1 space-y-0.5">
                      {shown.map(([k, v]: any) => (
                        <div key={k} className="font-mono break-all">
                          <span className="text-muted-foreground">{k}:</span>{" "}
                          <span className="line-through text-destructive/70">{String(v?.old ?? "—")}</span>
                          <span className="text-muted-foreground"> → </span>
                          <span className="text-primary">{String(v?.new ?? "—")}</span>
                        </div>
                      ))}
                      {entries.length > 6 && (
                        <Button
                          size="sm" variant="ghost" className="h-6 px-2 text-[11px] mt-1"
                          onClick={() => setExpanded(s => ({ ...s, [r.id]: !isOpen }))}
                        >
                          {isOpen ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show all {entries.length} changes</>}
                        </Button>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                  {new Date(r.at).toLocaleString()}
                </div>
                {r.ref_no && r.action !== "delete" && (
                  <Button asChild size="sm" variant="ghost" className="h-6 px-2">
                    <Link to="/app/lookup" search={{ q: r.ref_no } as any}>
                      <ExternalLink className="h-3 w-3" /> Open
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}