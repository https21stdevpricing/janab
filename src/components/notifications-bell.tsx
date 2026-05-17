import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Plus, Eye, ExternalLink } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { fmtDate, inr } from "@/lib/format";
import { lookupDoc, type DocLookupResult } from "@/lib/doc-lookup";

type N = { id: string; at: string; kind: string; severity: string; title: string; body: string | null; link: string | null; read: boolean };

export function NotificationsBell() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ notif: N; doc: DocLookupResult | null } | null>(null);
  const navigate = useNavigate();
  const channelName = useRef(`notif-bell-${Math.random().toString(36).slice(2)}`);

  const load = async () => {
    const { data } = await supabase
      .from("notifications" as never).select("*").order("at", { ascending: false }).limit(30) as any;
    setItems((data ?? []) as N[]);
  };

  useEffect(() => {
    let alive = true;
    load();
    const ch = supabase
      .channel(channelName.current)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        if (alive) load();
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, []);

  const unread = items.filter(i => !i.read).length;

  const markAll = async () => {
    await supabase.from("notifications" as never).update({ read: true } as never).eq("read" as never, false);
    load();
  };
  const markOne = async (id: string) => {
    await supabase.from("notifications" as never).update({ read: true } as never).eq("id" as never, id);
    load();
  };

  const dot = (s: string) =>
    s === "error" ? "bg-destructive" : s === "warning" ? "bg-amber-500" : s === "success" ? "bg-emerald-500" : "bg-sky-500";

  // Strict ref extraction: prefix-NNN (digits required after the hyphen)
  const refOf = (n: N): string | null => {
    const text = `${n.title ?? ""} ${n.body ?? ""}`;
    const m = text.match(/\b(INV|PO|TP|QUO|QT|PAY|RI|PY|EXP)[-/]?\d[A-Z0-9-]*/i);
    return m ? m[0].toUpperCase().replace("/", "-") : null;
  };

  const openPreview = async (n: N) => {
    markOne(n.id);
    setOpen(false);
    const ref = refOf(n);
    let doc: DocLookupResult | null = null;
    if (ref) {
      try { doc = await lookupDoc(ref); } catch { doc = null; }
    }
    setPreview({ notif: n, doc });
  };
  const openAction = (n: N) => {
    markOne(n.id); setOpen(false); setPreview(null);
    if (n.link) { navigate({ to: n.link as any }); return; }
    const ref = refOf(n);
    if (ref) navigate({ to: "/app/lookup", search: { q: ref } as any });
    else navigate({ to: "/app/audit" });
  };

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between p-2 border-b">
          <div className="text-sm font-semibold">Notifications</div>
          <div className="flex gap-1">
            {unread > 0 && <Button size="sm" variant="ghost" onClick={markAll}><Check className="h-3.5 w-3.5" /> Mark all</Button>}
            <Button size="sm" variant="ghost" asChild onClick={() => setOpen(false)}><Link to="/app/audit">View all</Link></Button>
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">No notifications yet.</div>
          ) : items.map(n => (
            <div key={n.id} className={`p-3 border-b flex gap-2 hover:bg-muted/40 ${!n.read ? "bg-primary/[0.04]" : ""}`}>
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dot(n.severity)}`} />
              <button className="min-w-0 flex-1 text-left" onClick={() => openPreview(n)} title="Open preview">
                <div className="text-sm font-medium truncate">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground truncate">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(n.at)} · {new Date(n.at).toLocaleTimeString()}</div>
              </button>
              <div className="flex flex-col items-end gap-1">
                {!n.read && <Badge variant="secondary" className="h-5">new</Badge>}
                <div className="flex gap-0.5">
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Preview doc" onClick={() => openPreview(n)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Open entry / page" onClick={() => openAction(n)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
    <NotificationPreview state={preview} onClose={() => setPreview(null)} onOpenFull={() => preview && openAction(preview.notif)} />
    </>
  );
}

function NotificationPreview({
  state, onClose, onOpenFull,
}: { state: { notif: N; doc: DocLookupResult | null } | null; onClose: () => void; onOpenFull: () => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4" /> {state?.notif.title}
          </DialogTitle>
        </DialogHeader>
        {state && (
          <div className="space-y-3 text-sm">
            {state.notif.body && <p className="text-muted-foreground">{state.notif.body}</p>}
            {state.doc ? (
              <div className="rounded-md border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="uppercase text-[10px]">{state.doc.kind}</Badge>
                  <span className="font-mono text-sm font-semibold">
                    {state.doc.header.invoice_no ?? state.doc.header.po_no ?? state.doc.header.tp_no ?? state.doc.header.quote_no ?? state.doc.header.payment_no}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">{fmtDate(state.doc.header.date)}</span>
                </div>
                {state.doc.party && <div className="text-sm">{state.doc.party.name}</div>}
                <div className="flex justify-between pt-1 border-t mt-1">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold tabular-nums">{inr(state.doc.totals.total)}</span>
                </div>
                {state.doc.outstanding && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Balance</span>
                    <span className={`font-semibold tabular-nums ${state.doc.outstanding.balance > 0 ? "text-destructive" : "text-primary"}`}>{inr(state.doc.outstanding.balance)}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground border rounded-md p-2">No linked document found. Tap “Open” to view the full page.</div>
            )}
            <div className="text-[10px] text-muted-foreground">{fmtDate(state.notif.at)} · {new Date(state.notif.at).toLocaleTimeString()}</div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={onOpenFull}><ExternalLink className="h-4 w-4" /> Open full</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}