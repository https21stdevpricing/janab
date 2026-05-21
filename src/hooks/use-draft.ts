import { useEffect, useRef, useState } from "react";

/**
 * Lightweight form draft autosave.
 * - Persists `state` to localStorage under `key` (debounced 400ms).
 * - Returns a hydrated initial value if a draft exists.
 * - Call `clear()` after successful save to drop the draft.
 *
 * Usage:
 *   const [form, setForm, draft] = useDraft("sale:new", { buyer: "", items: [] });
 *   // draft.hasDraft -> show "Restore draft" banner; draft.clear() on submit
 */
export function useDraft<T>(key: string, initial: T) {
  const storageKey = `draft:${key}`;
  const [hasDraft, setHasDraft] = useState(false);
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        setHasDraft(true);
        return JSON.parse(raw) as T;
      }
    } catch {}
    return initial;
  });

  const t = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (t.current) window.clearTimeout(t.current);
    t.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
        setHasDraft(true);
      } catch {}
    }, 400);
    return () => {
      if (t.current) window.clearTimeout(t.current);
    };
  }, [state, storageKey]);

  const clear = () => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
    setHasDraft(false);
  };

  const discard = () => {
    clear();
    setState(initial);
  };

  return [state, setState, { hasDraft, clear, discard }] as const;
}