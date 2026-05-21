import { useEffect } from "react";

/**
 * Closes an overlay (sheet/dialog/drawer) when the user presses the
 * device back button. Pushes a history entry while open; on `popstate`,
 * fires `onClose`. Safe to call on the server (no-ops).
 */
export function useDismissOnBack(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = { __overlay: true, t: Date.now() };
    try {
      window.history.pushState(marker, "");
    } catch {}
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // If state is still our marker, pop it so we don't leave dangling entries.
      try {
        if (window.history.state && (window.history.state as any).__overlay) {
          window.history.back();
        }
      } catch {}
    };
  }, [open, onClose]);
}