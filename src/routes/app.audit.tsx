import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

type Row = { id: string; at: string; action: string; entity: string; ref_no: string | null; summary: string; diff: any };

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");

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
                <div className="font-medium truncate">{r.summary}</div>
                <div className="text-xs text-muted-foreground">{r.entity}{r.ref_no ? ` · ${r.ref_no}` : ""}</div>
                {r.diff && Object.keys(r.diff).length > 0 && (
                  <div className="text-[11px] text-muted-foreground mt-1 font-mono break-all">
                    {Object.entries(r.diff).slice(0, 4).map(([k, v]: any) => (
                      <span key={k} className="mr-2">{k}: {String(v.old ?? "—")} → {String(v.new ?? "—")}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                {new Date(r.at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}