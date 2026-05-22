import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDismissOnBack } from "@/hooks/use-dismiss-on-back";

/**
 * Bottom sheet with native swipe-down-to-close gesture.
 * - Drag the handle (or anywhere outside scrollable content) to dismiss.
 * - Threshold: drag > 35% of sheet height OR flick velocity > 0.6 px/ms.
 * - Closes on Esc and Android back (via useDismissOnBack).
 */
export function DragSheet({
  open,
  onOpenChange,
  children,
  className,
  heightVh = 88,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: ReactNode;
  className?: string;
  heightVh?: number;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const startT = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const dragging = useRef(false);

  useDismissOnBack(open, () => onOpenChange(false));

  // Mount / animate transitions
  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => setVisible(true));
    } else if (mounted) {
      setVisible(false);
      const t = window.setTimeout(() => { setMounted(false); setDragY(0); }, 260);
      return () => window.clearTimeout(t);
    }
  }, [open, mounted]);

  // Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only react to primary pointer/touch
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragging.current = true;
    startY.current = e.clientY;
    lastY.current = e.clientY;
    startT.current = performance.now();
    lastT.current = startT.current;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const dy = Math.max(0, e.clientY - startY.current);
    lastY.current = e.clientY;
    lastT.current = performance.now();
    setDragY(dy);
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const h = sheetRef.current?.offsetHeight ?? 600;
    const dy = lastY.current - startY.current;
    const dt = Math.max(1, lastT.current - startT.current);
    const velocity = dy / dt; // px per ms
    const shouldClose = dy > h * 0.35 || velocity > 0.6;
    if (shouldClose) {
      onOpenChange(false);
    } else {
      setDragY(0);
    }
  };

  if (!mounted) return null;

  const translate = visible ? dragY : (sheetRef.current?.offsetHeight ?? 1000);
  const overlayOpacity = visible
    ? Math.max(0, 1 - dragY / ((sheetRef.current?.offsetHeight ?? 600) * 1.2))
    : 0;

  return (
    <div className="fixed inset-0 z-50" aria-modal="true" role="dialog">
      <div
        className="absolute inset-0 bg-black/55 transition-opacity duration-200"
        style={{ opacity: overlayOpacity }}
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={sheetRef}
        className={cn(
          "absolute inset-x-0 bottom-0 bg-background rounded-t-2xl shadow-2xl flex flex-col touch-none",
          className,
        )}
        style={{
          height: `${heightVh}vh`,
          transform: `translateY(${translate}px)`,
          transition: dragging.current ? "none" : "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)",
          willChange: "transform",
        }}
      >
        {/* Drag region — captures gesture, contains grab handle */}
        <div
          className="pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
        </div>
        {children}
      </div>
    </div>
  );
}