import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LiveEvent = "*" | "INSERT" | "UPDATE" | "DELETE";
type LiveTable = string | { table: string; event?: LiveEvent };

export function useLiveSync({
  channelName,
  tables,
  load,
  debounceMs = 140,
  pollMs = 15_000,
}: {
  channelName: string;
  tables: LiveTable[];
  load: () => Promise<void> | void;
  debounceMs?: number;
  pollMs?: number;
}) {
  const loadRef = useRef(load);
  const timerRef = useRef<number | undefined>(undefined);
  const runIdRef = useRef(0);
  const mountedRef = useRef(false);
  const [isLive, setIsLive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const refreshNow = useCallback(async () => {
    if (!mountedRef.current) return;
    const runId = ++runIdRef.current;
    setIsRefreshing(true);
    try {
      await loadRef.current();
      if (mountedRef.current && runId === runIdRef.current) {
        setLastSyncedAt(new Date());
        setLastError(null);
      }
    } catch (error) {
      if (mountedRef.current && runId === runIdRef.current) {
        const err = error instanceof Error ? error : new Error(String(error));
        setLastError(err);
        console.error(`${channelName} refresh failed`, err);
      }
    } finally {
      if (mountedRef.current && runId === runIdRef.current) setIsRefreshing(false);
    }
  }, [channelName]);

  const scheduleRefresh = useCallback(
    (delay = debounceMs) => {
      if (typeof window === "undefined") return;
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(refreshNow, delay);
    },
    [debounceMs, refreshNow],
  );

  useEffect(() => {
    mountedRef.current = true;
    refreshNow();

    const channel = supabase.channel(channelName);
    tables.forEach((item) => {
      const table = typeof item === "string" ? item : item.table;
      const event = typeof item === "string" ? "*" : (item.event ?? "*");
      channel.on("postgres_changes", { event, schema: "public", table }, () => scheduleRefresh());
    });
    channel.subscribe((status) => setIsLive(status === "SUBSCRIBED"));

    const refreshVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh(0);
    };
    const refreshImmediate = () => scheduleRefresh(0);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshImmediate);
    window.addEventListener("online", refreshImmediate);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(refreshImmediate);
    const pollTimer = pollMs > 0 ? window.setInterval(refreshVisible, pollMs) : undefined;

    return () => {
      mountedRef.current = false;
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshImmediate);
      window.removeEventListener("online", refreshImmediate);
      subscription.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [channelName, pollMs, refreshNow, scheduleRefresh, tables]);

  return { isLive, isRefreshing, lastSyncedAt, lastError, refresh: () => scheduleRefresh(0) };
}