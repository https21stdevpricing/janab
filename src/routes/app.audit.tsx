import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { ExternalLink, RotateCcw, Search, Plus, Pencil, Trash2, Clock, ListMusic, FileText, Hash, User as UserIcon } from "lucide-react";
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
  const [authReady, setAuthReady] = useState(false);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setRows([]); return; }
    const { data, error } = await supabase
      .from("audit_log" as never)
      .select("*")
      .order("at", { ascending: false })
      .limit(500) as any;
    if (error) { console.error("audit load", error); toast.error(error.message); return; }
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setAuthReady(true);
      if (session?.user) load();
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) load();
    });
    const ch = supabase.channel("audit-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, () => load()).subscribe();
    return () => { cancelled = true; subscription.unsubscribe(); supabase.removeChannel(ch); };
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
    a === "insert" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" :
    a === "update" ? "bg-muted text-foreground/70" :
    "bg-rose-500/10 text-rose-700 dark:text-rose-300";

  const FilterChip = ({ value, label, count }: { value: string; label: string; count?: number }) => (
    <button
      onClick={() => setAction(value)}
      className={`px-3.5 h-8 rounded-full text-[12.5px] font-medium transition-colors whitespace-nowrap ${
        action === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
    >
      {label}{count !== undefined && <span className="opacity-60 ml-1.5">{count}</span>}
    </button>
  );

  const entities = Array.from(new Set(rows.map(r => r.entity))).sort();

  return (
    <div>
      <PageHeader title="Activity" description="A quiet, complete record of everything that changed."
        actions={<ExcelBar onExport={onExport} />} />

      <div className="relative mb-4">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 h-11 rounded-2xl bg-muted/40 border-transparent focus-visible:bg-background focus-visible:ring-1"
          placeholder="Search activity, ref no, contact…"
          value={q} onChange={e => setQ(e.target.value)}
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterChip value="all" label="All" count={counts.all} />
        <FilterChip value="insert" label="Created" count={counts.insert} />
        <FilterChip value="update" label="Updated" count={counts.update} />
        <FilterChip value="delete" label="Deleted" count={counts.delete} />
        <div className="w-px bg-border/60 mx-1.5 my-2" />
        <button
          onClick={() => setEntity("all")}
          className={`px-3.5 h-8 rounded-full text-[12.5px] font-medium whitespace-nowrap ${entity === "all" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
        >All entities</button>
        {entities.map(e => (
          <button key={e} onClick={() => setEntity(e)}
            className={`px-3.5 h-8 rounded-full text-[12.5px] font-medium whitespace-nowrap capitalize ${entity === e ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground hover:bg-muted/40"}`}
          >{entityLabel[e] ?? e.replace("_"," ")}</button>
        ))}
      </div>

      {filtered.length === 0 ? <Empty>No activity matches your filters.</Empty> : (
        <div className="grid lg:grid-cols-[1fr_400px] gap-6">
          {/* Feed */}
          <div className="space-y-7">
            {Object.entries(groups).map(([label, items]) => (
              <div key={label}>
                <div className="flex items-baseline gap-2 mb-2.5 px-1">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</h3>
                  <span className="text-[10px] text-muted-foreground/70 tabular-nums">{items.length}</span>
                </div>
                <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
                  {items.map((r, i) => {
                    const isSel = selected?.id === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full flex items-center gap-3.5 px-4 py-3 text-left transition-colors ${
                          isSel ? "bg-muted/60" : "hover:bg-muted/30"
                        } ${i > 0 ? "border-t border-border/40" : ""}`}
                      >
                        <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${actionTone(r.action)}`}>
                          <ActionIcon a={r.action} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-medium truncate tracking-tight">
                            {entityLabel[r.entity] ?? r.entity}
                            {r.ref_no && <span className="font-mono text-[11.5px] ml-2 text-muted-foreground">{r.ref_no}</span>}
                          </div>
                          <div className="text-[11.5px] text-muted-foreground truncate mt-0.5">
                            {r.summary || (r.action === "insert" ? "Created" : r.action === "delete" ? "Removed" : "Updated")}
                          </div>
                        </div>
                        <div className="text-[10.5px] tabular-nums text-muted-foreground/80 whitespace-nowrap">
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
            <AuditDetailPanel
              selected={selected}
              entityLabel={entityLabel}
              actionTone={actionTone}
              ActionIcon={ActionIcon}
              restoring={restoring}
              onRestore={restore}
            />
          )}
        </div>
      )}
    </div>
  );
}

function AuditDetailPanel({
  selected,
  entityLabel,
  actionTone,
  ActionIcon,
  restoring,
  onRestore,
}: {
  selected: Row;
  entityLabel: Record<string, string>;
  actionTone: (a: string) => string;
  ActionIcon: (props: { a: string }) => ReactElement;
  restoring: Record<string, boolean>;
  onRestore: (id: string) => void;
}) {
  const diff = selected.diff ?? {};
  const diffEntries = Object.entries(diff) as Array<[string, any]>;
  const at = new Date(selected.at);
  const rel = relTime(at);
  const actLabel = selected.action === "insert" ? "Created" : selected.action === "delete" ? "Deleted" : "Updated";
  const isMoney = (k: string) => /amount|total|paid|balance|rate|qty|cost|opening|salary|price/i.test(k);

  return (
    <aside className="lg:sticky lg:top-4 lg:self-start rounded-2xl bg-card border border-border/60 overflow-hidden h-fit">
      {/* Header */}
      <div className="px-6 pt-6 pb-5 border-b border-border/40">
        <div className="flex items-start gap-3.5">
          <div className={`h-11 w-11 rounded-full flex items-center justify-center ${actionTone(selected.action)}`}>
            <ActionIcon a={selected.action} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">{actLabel}</div>
            <h3 className="text-[16px] font-semibold tracking-tight leading-tight truncate mt-0.5">
              {entityLabel[selected.entity] ?? selected.entity}
            </h3>
            <div className="text-[11.5px] text-muted-foreground mt-1">{rel} · {at.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <dl className="px-6 py-4 grid grid-cols-2 gap-x-5 gap-y-3.5 text-[12px] border-b border-border/40">
        {selected.ref_no && (
          <MetaRow icon={<Hash className="h-3 w-3" />} label="Reference" value={<span className="font-mono">{selected.ref_no}</span>} />
        )}
        <MetaRow icon={<FileText className="h-3 w-3" />} label="Entity" value={<span className="capitalize">{selected.entity.replace("_"," ")}</span>} />
        <MetaRow icon={<Clock className="h-3 w-3" />} label="When" value={at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
        <MetaRow icon={<UserIcon className="h-3 w-3" />} label="Action" value={actLabel} />
      </dl>

      {selected.summary && (
        <div className="px-6 py-4 border-b border-border/40">
          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-2">Summary</div>
          <p className="text-[13.5px] leading-relaxed text-foreground/90">{selected.summary}</p>
        </div>
      )}

      {diffEntries.length > 0 && (
        <div className="px-6 py-4 border-b border-border/40">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
              Field changes
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{diffEntries.length}</span>
          </div>
          <div className="rounded-xl border border-border/50 bg-background/40 divide-y divide-border/40 max-h-[380px] overflow-auto">
            {diffEntries.map(([k, v]) => {
              const oldV = v?.old ?? "—";
              const newV = v?.new ?? "—";
              return (
                <div key={k} className="px-3.5 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1.5">{k.replace(/_/g, " ")}</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 text-[11.5px]">
                    <span className={`font-mono px-2 py-1 rounded-md bg-muted/60 text-muted-foreground truncate ${selected.action !== "insert" ? "line-through opacity-70" : ""}`}>{String(oldV)}</span>
                    <span className="text-muted-foreground/60 text-[10px]">→</span>
                    <span className={`font-mono px-2 py-1 rounded-md bg-foreground text-background truncate ${isMoney(k) ? "tabular-nums" : ""}`}>{String(newV)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-6 py-4 flex gap-2">
        {selected.ref_no && selected.action !== "delete" && (
          <Button asChild size="sm" variant="outline" className="flex-1 rounded-full">
            <Link to="/app/lookup" search={{ q: selected.ref_no } as any}>
              <ExternalLink className="h-3.5 w-3.5" /> Open record
            </Link>
          </Button>
        )}
        {selected.action === "delete" && (
          <Button size="sm" className="flex-1 rounded-full" onClick={() => onRestore(selected.id)} disabled={!!restoring[selected.id]}>
            <RotateCcw className="h-3.5 w-3.5" /> {restoring[selected.id] ? "Restoring…" : "Restore record"}
          </Button>
        )}
      </div>
    </aside>
  );
}

function MetaRow({ icon, label, value }: { icon: ReactElement; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold flex items-center gap-1">{icon}{label}</dt>
      <dd className="mt-0.5 text-[12.5px] font-medium truncate">{value}</dd>
    </div>
  );
}

function relTime(d: Date) {
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24); if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}