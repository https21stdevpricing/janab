import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Bell, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { fmtDate } from "@/lib/format";

type N = { id: string; at: string; kind: string; severity: string; title: string; body: string | null; link: string | null; read: boolean };

export function NotificationsBell() {
  const [items, setItems] = useState<N[]>([]);
  const [open, setOpen] = useState(false);
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

  return (
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
            <div key={n.id} className={`p-3 border-b flex gap-2 cursor-pointer hover:bg-muted/40 ${!n.read ? "bg-primary/[0.04]" : ""}`}
              onClick={() => { markOne(n.id); if (n.link) { setOpen(false); window.location.assign(n.link); } }}>
              <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${dot(n.severity)}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground truncate">{n.body}</div>}
                <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(n.at)} · {new Date(n.at).toLocaleTimeString()}</div>
              </div>
              {!n.read && <Badge variant="secondary" className="h-5">new</Badge>}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}