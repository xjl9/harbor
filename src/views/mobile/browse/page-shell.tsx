import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { ScrollRootContext } from "@/components/row";
import { useT } from "@/lib/i18n";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { useRegisterSheet } from "../mobile-sheet-lock";

const SHELL_CSS = `
@keyframes mb-page-out { from { transform: translate3d(0,0,0); opacity: 1; } to { transform: translate3d(24px,0,0); opacity: 0; } }
.mb-page-out { animation: mb-page-out 220ms var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) { .mb-page-out { animation: none; } }
`;

// Full-screen browse page for the phone: brand pages, genre pages, see-all grids
// and the people sheets all share this frame. It is portaled to the body at the
// same layer MobileDetail uses (z-50) rather than the settings pages' z-[70]:
// these pages open a detail sheet from inside themselves, and MobileDetail also
// portals to the body at z-50, so the later sibling wins and the detail lands on
// top. A higher layer here would bury the detail under the page that opened it.
// The scroller is published through ScrollRootContext so MobileCatalogGrid can
// virtualize against this page instead of the tab scroller underneath.
export function MobilePageShell({
  title,
  kicker,
  onBack,
  children,
  header,
  bleedHeader = false,
}: {
  title?: string;
  kicker?: string;
  onBack: () => void;
  children: ReactNode;
  // Optional replacement for the default title bar, for pages with a hero. It
  // receives the animated close so its own back button leaves the same way.
  header?: (close: () => void) => ReactNode;
  // Let the header run under the status bar (hero pages paint their own art).
  bleedHeader?: boolean;
}) {
  const t = useT();
  useRegisterSheet(true);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLeaving(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const node = (
    <div
      ref={setScrollEl}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onBack();
      }}
      className={`fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-canvas ${
        leaving ? "mb-page-out" : "animate-slide-from-right"
      }`}
      style={{
        ...MOBILE_SAFE_X,
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
      }}
    >
      <style>{SHELL_CSS}</style>
      <ScrollRootContext.Provider value={scrollEl}>
        {header ? header(() => setLeaving(true)) : (
          <header
            className={`sticky top-0 z-20 flex items-center gap-2 px-3 pb-2 backdrop-blur-md ${
              bleedHeader ? "bg-canvas/40" : "bg-canvas/85"
            }`}
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
          >
            <button
              type="button"
              onClick={() => setLeaving(true)}
              aria-label={t("Back")}
              className="no-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-transform active:scale-90"
            >
              <ChevronLeft size={24} strokeWidth={2.3} className="dir-icon" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col">
              {kicker && (
                <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                  {kicker}
                </span>
              )}
              {title && (
                <h1 className="truncate font-display text-[19px] font-medium leading-tight tracking-tight text-ink">
                  {title}
                </h1>
              )}
            </div>
          </header>
        )}
        {children}
      </ScrollRootContext.Provider>
    </div>
  );
  return node;
}

// Back control for pages that draw their own header over artwork.
export function PageBackButton({ onBack, light = false }: { onBack: () => void; light?: boolean }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={t("Back")}
      className={`no-press grid h-11 w-11 shrink-0 place-items-center rounded-full ring-1 transition-transform active:scale-90 ${
        light
          ? "bg-black/45 text-white ring-white/10 backdrop-blur-md"
          : "bg-surface text-ink ring-edge-soft"
      }`}
    >
      <ChevronLeft size={22} strokeWidth={2.4} className="dir-icon" />
    </button>
  );
}

export function portalPage(node: ReactNode): ReactNode {
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
