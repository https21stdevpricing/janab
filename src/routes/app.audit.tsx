import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { ExternalLink, RotateCcw, Search, Plus, Pencil, Trash2, Clock, ListMusic } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

type Row = { id: string; at: string; action: string; entity: string; ref_no: string | null; summary: string; diff: any };

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});

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

  const restore = async (id: string) => {
    if (!confirm("Restore this deleted record? It will be re-inserted exactly as it was.")) return;
    setRestoring(r => ({ ...r, [id]: true }));
    const { data, error } = await supabase.rpc("restore_audit_entry" as never, { _audit_id: id } as never) as any;
    setRestoring(r => ({ ...r, [id]: false }));
    if (error) { toast.error(error.message); return; }
    toast.success((data as string) ?? "Restored");
    load();
  };

  const entityLabel: Record<string, string> = {
    sales: "Sale", purchases: "Purchase", third_party: "Third-party", quotations: "Quote",
    payments: "Payment", expenses: "Expense", products: "Product", contacts: "Contact",
    deliveries: "Delivery", sale_items: "Sale line", purchase_items: "Purchase line",
    tp_items: "TP line", quotation_items: "Quote line", delivery_items: "Delivery line",
    payment_allocations: "Allocation",
  };

  const counts = useMemo(() => {
    const c = { all: rows.length, insert: 0, update: 0, delete: 0 } as Record<string, number>;
    rows.forEach(r => { c[r.action] = (c[r.action] ?? 0) + 1; });
    return c;
  }, [rows]);

  const groups = useMemo(() => {
    const out: Record<string, Row[]> = {};
    const today = new Date(); today.setHours(0,0,0,0);
    const yest = new Date(today); yest.setDate(yest.getDate() - 1);
    const week = new Date(today); week.setDate(week.getDate() - 7);
    filtered.forEach(r => {
      const d = new Date(r.at);
      const key = d >= today ? "Today" : d >= yest ? "Yesterday" : d >= week ? "Earlier this week" : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      (out[key] ??= []).push(r);
    });
    return out;
  }, [filtered]);

  const selected = useMemo(() => filtered.find(r => r.id === selectedId) ?? filtered[0] ?? null, [filtered, selectedId]);

  const ActionIcon = ({ a }: { a: string }) =>
    a === "insert" ? <Plus className="h-3.5 w-3.5" /> :
    a === "update" ? <Pencil className="h-3.5 w-3.5" /> :
    <Trash2 className="h-3.5 w-3.5" />;

  const actionTone = (a: string) =>
    a === "insert" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
    a === "update" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
    "bg-rose-500/15 text-rose-600 dark:text-rose-400";

  const FilterChip = ({ value, label, count }: { value: string; label: string; count?: number }) => (
    <button
      onClick={() => setAction(value)}
      className={`px-3 h-8 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
        action === value ? "bg-foreground text-background" : "bg-muted/50 hover:bg-muted text-foreground/80"
      }`}
    >
      {label}{count !== undefined && <span className="opacity-60 ml-1.5">{count}</span>}
    </button>
  );

  const entities = Array.from(new Set(rows.map(r => r.entity))).sort();

  return (
    <div>
      <PageHeader title="Activity" description="Every create, update and delete — fully searchable history"
        actions={<ExcelBar onExport={onExport} />} />

      {/* Spotify-style search + chips */}
      <div className="relative mb-3">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 h-10 rounded-full bg-muted/40 border-transparent focus-visible:bg-background"
          placeholder="Search activity, ref no, contact…"
          value={q} onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterChip value="all" label="All" count={counts.all} />
        <FilterChip value="insert" label="Created" count={counts.insert} />
        <FilterChip value="update" label="Updated" count={counts.update} />
        <FilterChip value="delete" label="Deleted" count={counts.delete} />
        <div className="w-px bg-border mx-1 my-1.5" />
        <button
          onClick={() => setEntity("all")}
          className={`px-3 h-8 rounded-full text-xs font-medium whitespace-nowrap ${entity === "all" ? "bg-foreground text-background" : "bg-muted/50 hover:bg-muted"}`}
        >All entities</button>
        {entities.map(e => (
          <button key={e} onClick={() => setEntity(e)}
            className={`px-3 h-8 rounded-full text-xs font-medium whitespace-nowrap capitalize ${entity === e ? "bg-foreground text-background" : "bg-muted/50 hover:bg-muted"}`}
          >{entityLabel[e] ?? e.replace("_"," ")}</button>
        ))}
      </div>

      {filtered.length === 0 ? <Empty>No activity matches your filters.</Empty> : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          {/* Feed */}
          <div className="space-y-5">
            {Object.entries(groups).map(([label, items]) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h3>
                  <span className="text-[10px] text-muted-foreground">· {items.length}</span>
                </div>
                <div className="rounded-xl bg-card border overflow-hidden">
                  {items.map((r, i) => {
                    const isSel = selected?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                          isSel ? "bg-muted" : "hover:bg-muted/50"
                        } ${i > 0 ? "border-t" : ""}`}
                      >
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${actionTone(r.action)}`}>
                          <ActionIcon a={r.action} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {entityLabel[r.entity] ?? r.entity}
                            {r.ref_no && <span className="font-mono text-xs ml-1.5 text-muted-foreground">{r.ref_no}</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {r.summary || (r.action === "insert" ? "Created" : r.action === "delete" ? "Removed" : "Updated")}
                          </div>
                        </div>
                        <div className="text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
                          {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Detail panel */}
          {selected && (
            <aside className="lg:sticky lg:top-4 lg:self-start rounded-xl bg-card border p-4 space-y-3 h-fit">
              <div className="flex items-center gap-3">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${actionTone(selected.action)}`}>
                  <ActionIcon a={selected.action} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {selected.action === "insert" ? "Created" : selected.action === "delete" ? "Deleted" : "Updated"}
                  </div>
                  <div className="font-semibold truncate">{entityLabel[selected.entity] ?? selected.entity}</div>
                  {selected.ref_no && <div className="text-xs font-mono text-muted-foreground">{selected.ref_no}</div>}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {new Date(selected.at).toLocaleString()}
              </div>

              {selected.summary && (
                <div className="text-sm border-l-2 border-primary/40 pl-3 py-1 bg-muted/30 rounded-r">
                  {selected.summary}
                </div>
              )}

              {selected.diff && Object.keys(selected.diff).length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                    <ListMusic className="h-3 w-3" /> Changes ({Object.keys(selected.diff).length})
                  </div>
                  <div className="rounded-lg border bg-background/50 divide-y max-h-80 overflow-auto">
                    {Object.entries(selected.diff).map(([k, v]: any) => (
                      <div key={k} className="px-3 py-2 text-xs">
                        <div className="font-mono text-[10px] text-muted-foreground mb-1">{k}</div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 line-through break-all">{String(v?.old ?? "—")}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 break-all">{String(v?.new ?? "—")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                {selected.ref_no && selected.action !== "delete" && (
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/app/lookup" search={{ q: selected.ref_no } as any}>
                      <ExternalLink className="h-3.5 w-3.5" /> Open record
                    </Link>
                  </Button>
                )}
                {selected.action === "delete" && (
                  <Button size="sm" className="flex-1" onClick={() => restore(selected.id)} disabled={!!restoring[selected.id]}>
                    <RotateCcw className="h-3.5 w-3.5" /> {restoring[selected.id] ? "Restoring…" : "Restore"}
                  </Button>
                )}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}