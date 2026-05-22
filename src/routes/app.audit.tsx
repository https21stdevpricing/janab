import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  FileText,
  Hash,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/empty";
import { ExcelBar } from "@/components/excel-bar";
import { exportToExcel } from "@/lib/excel";
import { KpiGrid, KpiTile, SegmentedTabs, Surface } from "@/components/ui-tokens";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/audit")({ component: AuditPage });

type Row = {
  id: string;
  at: string;
  action: string;
  entity: string;
  entity_id: string | null;
  ref_no: string | null;
  summary: string | null;
  diff: Record<string, { old?: unknown; new?: unknown }> | null;
};

type ActionFilter = "all" | "insert" | "update" | "delete";

const entityLabel: Record<string, string> = {
  sales: "Sales",
  sale_items: "Sales lines",
  purchases: "Purchases",
  purchase_items: "Purchase lines",
  third_party: "Third-party",
  tp_items: "Third-party lines",
  quotations: "Quotations",
  quotation_items: "Quotation lines",
  payments: "Payments",
  payment_allocations: "Payment allocations",
  expenses: "Expenses",
  products: "Products",
  contacts: "Contacts",
  deliveries: "Deliveries",
  delivery_items: "Delivery lines",
  bank_transfers: "Deposits & withdrawals",
  stock_adjustments: "Stock adjustments",
  price_lists: "Price lists",
  settings: "Company settings",
  fixed_assets: "Fixed assets",
};

const actionLabel: Record<string, string> = {
  insert: "Created",
  update: "Updated",
  delete: "Deleted",
};

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("all");
  const [action, setAction] = useState<ActionFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});
  const [authReady, setAuthReady] = useState(false);

  const load = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    setAuthReady(true);
    if (!session?.user) {
      setRows([]);
      return;
    }

    const { data, error } = (await supabase
      .from("audit_log" as never)
      .select("*")
      .order("at", { ascending: false })
      .limit(700)) as any;

    if (error) {
      console.error("audit load", error);
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as Row[]);
  };

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      if (!cancelled) load();
    };

    reload();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => reload());
    const ch = supabase
      .channel("audit-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, reload)
      .subscribe();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      supabase.removeChannel(ch);
    };
  }, []);

  const counts = useMemo(() => {
    const c: Record<ActionFilter | string, number> = { all: rows.length, insert: 0, update: 0, delete: 0 };
    rows.forEach((r) => {
      c[r.action] = (c[r.action] ?? 0) + 1;
    });
    return c;
  }, [rows]);

  const entityCounts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    rows.forEach((r) => {
      c[r.entity] = (c[r.entity] ?? 0) + 1;
    });
    return c;
  }, [rows]);

  const entities = useMemo(
    () => Array.from(new Set(rows.map((r) => r.entity))).sort((a, b) => labelForEntity(a).localeCompare(labelForEntity(b))),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const haystack = [r.summary, r.ref_no, r.entity, actionLabel[r.action], ...Object.keys(r.diff ?? {})]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (entity === "all" || r.entity === entity) && (action === "all" || r.action === action) && (!needle || haystack.includes(needle));
    });
  }, [rows, q, entity, action]);

  const selected = useMemo(() => filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null, [filtered, selectedId]);
  const lastSync = rows[0]?.at ? new Date(rows[0].at) : null;
  const changedFields = filtered.reduce((sum, r) => sum + Object.keys(r.diff ?? {}).length, 0);

  const groups = useMemo(() => {
    const out: Record<string, Row[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const week = new Date(today);
    week.setDate(week.getDate() - 7);

    filtered.forEach((r) => {
      const d = new Date(r.at);
      const key = d >= today ? "Today" : d >= yest ? "Yesterday" : d >= week ? "Earlier this week" : d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      (out[key] ??= []).push(r);
    });
    return out;
  }, [filtered]);

  const onExport = () =>
    exportToExcel({
      filename: `audit-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Audit",
      columns: [
        { header: "Time", key: "at" },
        { header: "Action", key: "action" },
        { header: "Entity", key: "entity" },
        { header: "Reference", key: "ref_no" },
        { header: "Summary", key: "summary" },
      ],
      rows: filtered,
    });

  const restore = async (id: string) => {
    if (!confirm("Restore this deleted record? It will be re-inserted exactly as it was.")) return;
    setRestoring((r) => ({ ...r, [id]: true }));
    const { data, error } = (await supabase.rpc("restore_audit_entry" as never, { _audit_id: id } as never)) as any;
    setRestoring((r) => ({ ...r, [id]: false }));
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success((data as string) ?? "Restored");
    load();
  };

  const openDetail = (row: Row) => {
    setSelectedId(row.id);
    setMobileDetailOpen(true);
  };

  return (
    <div className="max-w-full overflow-hidden">
      <PageHeader
        title="Audit"
        description="Every saved change, live-synced with field-level detail."
        actions={<ExcelBar onExport={onExport} />}
      />

      <KpiGrid cols={4} className="mb-4">
        <KpiTile label="Events" value={String(filtered.length)} hint={`${rows.length} total`} />
        <KpiTile label="Fields changed" value={String(changedFields)} hint="Visible records" />
        <KpiTile label="Deleted" value={String(counts.delete ?? 0)} tone={(counts.delete ?? 0) > 0 ? "bad" : undefined} hint="Restorable snapshots" />
        <KpiTile label="Live sync" value={lastSync ? relTime(lastSync) : "Ready"} tone="good" hint={lastSync ? "Latest activity" : "Waiting"} />
      </KpiGrid>

      <Surface className="mb-4 p-3 sm:p-4" elevated>
        <div className="relative mb-3">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-11 rounded-xl bg-background border-border/70"
            placeholder="Search action, reference, table or field…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <div className="space-y-2.5 min-w-0">
          <SegmentedTabs
            value={action}
            onValueChange={(v) => setAction(v as ActionFilter)}
            items={[
              { value: "all", label: `All ${counts.all ?? 0}`, icon: <Activity className="h-3.5 w-3.5" /> },
              { value: "insert", label: `Created ${counts.insert ?? 0}`, icon: <Plus className="h-3.5 w-3.5" /> },
              { value: "update", label: `Updated ${counts.update ?? 0}`, icon: <Pencil className="h-3.5 w-3.5" /> },
              { value: "delete", label: `Deleted ${counts.delete ?? 0}`, icon: <Trash2 className="h-3.5 w-3.5" /> },
            ]}
          />
          <SegmentedTabs
            value={entity}
            onValueChange={setEntity}
            items={[
              { value: "all", label: `All modules ${entityCounts.all ?? 0}`, icon: <Database className="h-3.5 w-3.5" /> },
              ...entities.map((e) => ({ value: e, label: `${labelForEntity(e)} ${entityCounts[e] ?? 0}` })),
            ]}
          />
        </div>
      </Surface>

      {!authReady ? (
        <Empty>Loading audit records…</Empty>
      ) : filtered.length === 0 ? (
        <Empty>No activity matches your filters.</Empty>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_420px] gap-5 items-start">
          <div className="space-y-6 min-w-0">
            {Object.entries(groups).map(([label, items]) => (
              <section key={label} className="min-w-0">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</h2>
                  <span className="text-[11px] text-muted-foreground/70 tabular-nums">{items.length}</span>
                </div>
                <Surface padded={false} className="overflow-hidden">
                  {items.map((row, index) => {
                    const active = selected?.id === row.id;
                    const fields = Object.keys(row.diff ?? {}).length;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => openDetail(row)}
                        className={cn(
                          "w-full min-w-0 px-3.5 sm:px-4 py-3.5 text-left grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center transition-colors",
                          index > 0 && "border-t border-border/50",
                          active ? "bg-muted/60" : "hover:bg-muted/35",
                        )}
                      >
                        <ActionMark action={row.action} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-semibold tracking-tight truncate">{labelForEntity(row.entity)}</span>
                            {row.ref_no && <span className="shrink-0 max-w-[120px] truncate rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-mono text-muted-foreground">{row.ref_no}</span>}
                          </div>
                          <p className="mt-0.5 text-[12px] text-muted-foreground truncate">{cleanSummary(row)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[11px] tabular-nums text-muted-foreground">{timeOnly(row.at)}</div>
                          <div className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground">
                            <ListChecks className="h-3 w-3" /> {fields}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </Surface>
              </section>
            ))}
          </div>

          {selected && (
            <div className="hidden lg:block">
              <AuditDetailPanel selected={selected} restoring={restoring} onRestore={restore} />
            </div>
          )}
        </div>
      )}

      <Sheet open={mobileDetailOpen && !!selected} onOpenChange={setMobileDetailOpen}>
        <SheetContent side="bottom" className="lg:hidden p-0 max-h-[90vh] rounded-t-3xl overflow-hidden">
          {selected && (
            <div className="max-h-[90vh] overflow-y-auto bg-background">
              <div className="flex justify-center pt-2 pb-1 sticky top-0 bg-background z-10">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>
              <AuditDetailPanel selected={selected} restoring={restoring} onRestore={restore} flush />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AuditDetailPanel({
  selected,
  restoring,
  onRestore,
  flush = false,
}: {
  selected: Row;
  restoring: Record<string, boolean>;
  onRestore: (id: string) => void;
  flush?: boolean;
}) {
  const at = new Date(selected.at);
  const diffEntries = Object.entries(selected.diff ?? {});
  const actLabel = actionLabel[selected.action] ?? selected.action;

  return (
    <aside className={cn(flush ? "bg-background" : "lg:sticky lg:top-4 surface overflow-hidden", "min-w-0")}>
      <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-start gap-3.5 min-w-0">
          <ActionMark action={selected.action} large />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">{actLabel}</span>
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-[10px] text-muted-foreground">{relTime(at)}</span>
            </div>
            <h3 className="mt-1 text-lg font-semibold tracking-tight leading-tight truncate">{labelForEntity(selected.entity)}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">{cleanSummary(selected)}</p>
          </div>
        </div>
      </div>

      <div className="px-5 sm:px-6 py-4 grid grid-cols-2 gap-3 border-b border-border/50">
        {selected.ref_no && <MetaRow icon={<Hash className="h-3.5 w-3.5" />} label="Reference" value={<span className="font-mono">{selected.ref_no}</span>} />}
        <MetaRow icon={<FileText className="h-3.5 w-3.5" />} label="Module" value={labelForEntity(selected.entity)} />
        <MetaRow icon={<CalendarClock className="h-3.5 w-3.5" />} label="Date" value={at.toLocaleDateString()} />
        <MetaRow icon={<Clock className="h-3.5 w-3.5" />} label="Time" value={at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
        <MetaRow icon={<UserIcon className="h-3.5 w-3.5" />} label="Action" value={actLabel} />
        <MetaRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Sync" value="Recorded" />
      </div>

      <div className="px-5 sm:px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold">Changed fields</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">Tap any event to inspect exact before and after values.</div>
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">{diffEntries.length}</span>
        </div>

        {diffEntries.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-4 text-sm text-muted-foreground">No field-level values were captured for this event.</div>
        ) : (
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1 no-scrollbar">
            {diffEntries.map(([field, change]) => (
              <ChangeRow key={field} field={field} oldValue={change?.old} newValue={change?.new} action={selected.action} />
            ))}
          </div>
        )}
      </div>

      <div className="px-5 sm:px-6 py-4 flex gap-2">
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

function ActionMark({ action, large = false }: { action: string; large?: boolean }) {
  const Icon = action === "insert" ? Plus : action === "update" ? Pencil : action === "delete" ? Trash2 : Activity;
  return (
    <span
      className={cn(
        "rounded-full inline-flex items-center justify-center shrink-0",
        large ? "h-11 w-11" : "h-9 w-9",
        action === "insert" && "bg-primary/10 text-primary",
        action === "update" && "bg-muted text-foreground/70",
        action === "delete" && "bg-destructive/10 text-destructive",
      )}
    >
      <Icon className={large ? "h-4.5 w-4.5" : "h-3.5 w-3.5"} />
    </span>
  );
}

function ChangeRow({ field, oldValue, newValue, action }: { field: string; oldValue: unknown; newValue: unknown; action: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-3 min-w-0">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground font-semibold mb-2">{formatField(field)}</div>
      <div className="grid grid-cols-1 gap-2">
        <ValueBlock label={action === "insert" ? "Before" : "Old"} value={oldValue} muted={action !== "insert"} />
        <div className="flex justify-center text-muted-foreground/60 text-xs">↓</div>
        <ValueBlock label={action === "delete" ? "After" : "New"} value={newValue} strong={action !== "delete"} />
      </div>
    </div>
  );
}

function ValueBlock({ label, value, muted, strong }: { label: string; value: unknown; muted?: boolean; strong?: boolean }) {
  return (
    <div className={cn("rounded-lg px-3 py-2 min-w-0", strong ? "bg-foreground text-background" : "bg-muted/60", muted && "opacity-70")}>
      <div className={cn("text-[10px] uppercase tracking-[0.08em]", strong ? "text-background/70" : "text-muted-foreground")}>{label}</div>
      <div className="mt-1 text-[12px] font-mono leading-relaxed break-words tabular-nums">{formatValue(value)}</div>
    </div>
  );
}

function MetaRow({ icon, label, value }: { icon: ReactElement; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/35 px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-semibold flex items-center gap-1.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-[12.5px] font-medium truncate">{value}</dd>
    </div>
  );
}

function labelForEntity(entity: string) {
  return entityLabel[entity] ?? entity.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function cleanSummary(row: Row) {
  const label = labelForEntity(row.entity).toLowerCase();
  const summary = row.summary || `${labelForEntity(row.entity)} ${actionLabel[row.action] ?? row.action}`;
  return summary.replace(row.entity, label).replace(/_/g, " ");
}

function formatField(field: string) {
  return field.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function timeOnly(at: string) {
  return new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function relTime(d: Date) {
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}
