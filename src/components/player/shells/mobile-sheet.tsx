import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

// Shared bottom-sheet chrome for the mobile player: dimmed scrim, rounded top,
// grabber handle, swipe-down / tap-scrim to close. One sheet look for tracks,
// speed, and anything else the touch shell surfaces.
export function MobileSheet({
  open,
  onClose,
  title,
  children,
  heightClass = "max-h-[62vh]",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  heightClass?: string;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setEntered(false);
    const id = window.setTimeout(() => setMounted(false), 260);
    return () => window.clearTimeout(id);
  }, [open]);

  if (!mounted) return null;

  const translate = entered ? dragY : null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[70] flex flex-col justify-end">
      <button
        type="button"
        aria-label={t("Close")}
        onClick={onClose}
        className={`absolute inset-0 bg-black/55 transition-opacity duration-200 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative flex ${heightClass} flex-col overflow-hidden rounded-t-[20px] border-t border-edge bg-elevated shadow-[0_-20px_60px_-12px_rgba(0,0,0,0.85)]`}
        style={{
          transform:
            translate == null
              ? "translateY(100%)"
              : `translateY(${translate}px)`,
          transition: dragStartRef.current == null ? "transform 260ms cubic-bezier(0.2,0,0,1)" : "none",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-center pt-2.5 pb-1"
          onPointerDown={(e) => {
            dragStartRef.current = e.clientY;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (dragStartRef.current == null) return;
            setDragY(Math.max(0, e.clientY - dragStartRef.current));
          }}
          onPointerUp={() => {
            if (dragStartRef.current == null) return;
            const committed = dragY > 90;
            dragStartRef.current = null;
            setDragY(0);
            if (committed) onClose();
          }}
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-white/25" />
        </div>
        {title && (
          <div className="shrink-0 px-5 pb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {title}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
