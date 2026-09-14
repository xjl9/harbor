import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { HIDE_SCROLL, useReducedMotion, useSheetExit } from "./data";

// Every surface the detail page opens on top of itself (action sheets, the
// episode page, the person page) needs the same two things: a way for a row
// deep inside to dismiss with the exit animation, and a scroll root the
// episode jumper can aim at. Both travel by context so the shells stay dumb.
const CloseContext = createContext<() => void>(() => {});
const ScrollRootContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function useSheetClose(): () => void {
  return useContext(CloseContext);
}

export function usePageScrollRoot(): RefObject<HTMLDivElement | null> | null {
  return useContext(ScrollRootContext);
}

/**
 * Bottom sheet. Mirrors the shape of the season picker and the actions sheet
 * that already ship on the phone (scrim, handle, sticky title, safe areas) so a
 * new sheet cannot drift from them. The exit is timer driven through
 * useSheetExit for the reasons documented there.
 */
export function PhoneSheet({
  title,
  onClose,
  children,
  tall = false,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  tall?: boolean;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const { leaving, close } = useSheetExit(onClose);
  useRegisterSheet(true);
  const node = (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={t("Close")}
        onClick={close}
        className={`absolute inset-0 bg-black/50 ${
          reduced ? "" : leaving ? "md-sheet-fade-out" : "md-sheet-fade"
        }`}
      />
      <div
        className={`relative overflow-y-auto rounded-t-3xl bg-canvas ${HIDE_SCROLL} ${
          tall ? "max-h-[92vh]" : "max-h-[84vh]"
        } ${reduced ? "" : leaving ? "md-sheet-out" : "md-sheet-in"}`}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div className="sticky top-0 z-10 flex flex-col items-center gap-2 bg-canvas pb-2 pt-3">
          <span className="h-1 w-9 rounded-full bg-edge" />
          {title && (
            <p className="max-w-[80%] truncate px-4 text-[13.5px] font-semibold text-ink">{title}</p>
          )}
        </div>
        <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

/**
 * Full-screen page pushed over the detail screen, following the settings page
 * pattern: slides in from the trailing edge, sticky header with a back chevron,
 * slides back out on a timer so a collapsed animation can never strand it.
 */
export function PhonePage({
  title,
  eyebrow,
  onBack,
  children,
  trailing,
  label,
}: {
  title?: string;
  eyebrow?: string;
  onBack: () => void;
  children: ReactNode;
  trailing?: ReactNode;
  label?: string;
}) {
  const t = useT();
  useRegisterSheet(true);
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => onBackRef.current(), 300);
    return () => window.clearTimeout(timer);
  }, [closing]);
  const close = () => setClosing(true);

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      className={`fixed inset-0 z-[70] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <header
        className="flex items-center gap-2 px-3 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("Back")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted"
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          {eyebrow && (
            <p className="truncate text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-ink-subtle">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="truncate font-display text-[19px] font-medium leading-tight tracking-[-0.01em] text-ink">
              {title}
            </h1>
          )}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-1">{trailing}</div>}
      </header>
      <div
        ref={scrollRef}
        data-md-scroll
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 44px)" }}
      >
        <CloseContext.Provider value={close}>
          <ScrollRootContext.Provider value={scrollRef}>{children}</ScrollRootContext.Provider>
        </CloseContext.Provider>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

/** A 44pt circular icon button used by sheet headers and page toolbars. */
export function RoundButton({
  label,
  onClick,
  active = false,
  children,
  className = "",
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 transition-colors motion-reduce:transition-none ${
        active
          ? "bg-accent/15 text-accent ring-accent/30"
          : "bg-surface text-ink ring-edge-soft/70 active:bg-elevated"
      } ${className}`}
    >
      {children}
    </button>
  );
}
