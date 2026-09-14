import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Delete, Lock } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useParental } from "@/lib/parental";
import { useActiveKid } from "@/lib/profiles";
import type { View } from "./mobile-browse";
import { useRegisterSheet } from "./mobile-sheet-lock";
import {
  phoneNavItemForView,
  usePhoneNavItems,
  type PhoneNavItem,
  type PhoneNavTarget,
} from "./nav-config";

const SWITCHER_CSS = `
.harbor-vs-panel {
  transform-origin: top right;
  animation: harbor-vs-open 220ms var(--ease-out) both;
}
[dir="rtl"] .harbor-vs-panel {
  transform-origin: top left;
}
.harbor-vs-panel.is-closing {
  animation: harbor-vs-close 180ms var(--ease-out) both;
  pointer-events: none;
}
@keyframes harbor-vs-open {
  0% { opacity: 0; transform: scale(0.94) translateY(-8px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes harbor-vs-close {
  0% { opacity: 1; transform: scale(1) translateY(0); }
  100% { opacity: 0; transform: scale(0.96) translateY(-6px); }
}
.harbor-vs-row {
  animation: harbor-vs-row 260ms var(--ease-out) both;
}
@keyframes harbor-vs-row {
  0% { opacity: 0; transform: translateY(-5px); }
  100% { opacity: 1; transform: translateY(0); }
}
.harbor-pin-sheet {
  animation: harbor-pin-up 320ms var(--ease-out) both;
}
@keyframes harbor-pin-up {
  0% { transform: translateY(24px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}
.harbor-pin-sheet.is-shaking {
  animation: harbor-pin-shake 340ms ease;
}
@keyframes harbor-pin-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-8px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-5px); }
  80% { transform: translateX(5px); }
}
@media (prefers-reduced-motion: reduce) {
  .harbor-vs-panel,
  .harbor-vs-panel.is-closing,
  .harbor-vs-row,
  .harbor-pin-sheet,
  .harbor-pin-sheet.is-shaking {
    animation: none;
  }
}
`;

// How long the panel's close animation runs. A timer rather than animationend,
// because reduced motion removes the animation and the event would never come.
const CLOSE_MS = 180;

export function MobileViewSwitcher({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (target: PhoneNavTarget) => void;
}) {
  const t = useT();
  const items = usePhoneNavItems();
  const { unlock } = useParental();
  const kid = useActiveKid();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  // The row whose icon is playing. The desktop plays a nav icon on hover; a
  // phone has no hover, so the press is the cue and the icon keeps playing
  // while the panel fades out under the finger.
  const [pressed, setPressed] = useState<PhoneNavItem["id"] | null>(null);
  const [pinFor, setPinFor] = useState<PhoneNavItem | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = phoneNavItemForView(items, view);
  const currentLabel = t(current?.label ?? "nav.home");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setClosing(true);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setPressed(null);
    }, CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const pick = (item: PhoneNavItem) => {
    if (item.gated) setPinFor(item);
    else onNavigate(item.target);
    setClosing(true);
  };

  const primary = items.filter((it) => it.primary);
  const secondary = items.filter((it) => !it.primary);

  return (
    <div ref={rootRef} className="relative flex flex-col items-end">
      <style>{SWITCHER_CSS}</style>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("Browsing {section}. Change section", { section: currentLabel })}
        onClick={() => (open ? setClosing(true) : setOpen(true))}
        className="flex h-11 max-w-[min(60vw,260px)] items-center gap-1 rounded-full border border-white/10 bg-black/25 pe-2 ps-3.5 text-ink backdrop-blur-md"
      >
        <span className="truncate text-[13.5px] font-semibold">{currentLabel}</span>
        <ChevronDown
          size={16}
          strokeWidth={2.4}
          className="shrink-0 text-white/55 transition-transform duration-200"
          style={{ transform: open && !closing ? "rotate(180deg)" : "none" }}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t("Sections")}
          className={`harbor-vs-panel absolute end-0 top-[calc(100%+8px)] flex w-[min(264px,calc(100vw-24px))] flex-col gap-0.5 overflow-y-auto overscroll-y-contain rounded-[18px] border border-edge-soft/60 p-1.5 shadow-[0_20px_46px_-16px_rgba(0,0,0,0.62)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden${
            closing ? " is-closing" : ""
          }`}
          style={{
            // Layered so a translucent elevated token (Aurora's glass) still
            // reads over a hero instead of dissolving into it.
            background:
              "linear-gradient(color-mix(in oklab, var(--color-elevated) 95%, transparent), color-mix(in oklab, var(--color-elevated) 95%, transparent)), var(--color-canvas)",
            // The desktop list is seventeen items long; the phone shows the same
            // list and scrolls once it would run under the tab bar.
            maxHeight:
              "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 152px)",
          }}
        >
          {primary.map((item, i) => (
            <MenuRow
              key={item.id}
              item={item}
              index={i}
              on={item.target.kind === "view" && item.target.view === view}
              playing={pressed === item.id}
              onPress={() => setPressed(item.id)}
              onPick={() => pick(item)}
            />
          ))}
          {primary.length > 0 && secondary.length > 0 && (
            <span aria-hidden className="mx-3 my-1 block h-px shrink-0 bg-edge-soft/70" />
          )}
          {secondary.map((item, i) => (
            <MenuRow
              key={item.id}
              item={item}
              index={primary.length + i}
              on={item.target.kind === "view" && item.target.view === view}
              playing={pressed === item.id}
              onPress={() => setPressed(item.id)}
              onPick={() => pick(item)}
            />
          ))}
        </div>
      )}

      {pinFor && (
        <MobilePinSheet
          kids={!!kid}
          verify={unlock}
          onUnlock={() => {
            const target = pinFor.target;
            setPinFor(null);
            onNavigate(target);
          }}
          onCancel={() => setPinFor(null)}
        />
      )}
    </div>
  );
}

function MenuRow({
  item,
  index,
  on,
  playing,
  onPress,
  onPick,
}: {
  item: PhoneNavItem;
  index: number;
  on: boolean;
  playing: boolean;
  onPress: () => void;
  onPick: () => void;
}) {
  const t = useT();
  const label = t(item.label);
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={on ? "true" : undefined}
      aria-label={item.gated ? t("chrome.lockedRequiresPin", { label }) : undefined}
      onPointerDown={onPress}
      onClick={onPick}
      // The stagger stops after the first rows: a seventeen-row list that
      // dribbled in for four hundred milliseconds would feel slow, not lively.
      style={{ animationDelay: `${Math.min(index, 8) * 24}ms` }}
      className={`harbor-vs-row flex min-h-12 w-full shrink-0 items-center gap-3 rounded-[13px] px-3 py-2 text-start transition-colors active:bg-raised/70 ${
        on ? "bg-raised/55" : ""
      }`}
    >
      <span
        className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center ${
          on ? "text-accent" : "text-ink-muted"
        }`}
      >
        {item.render(on, playing)}
      </span>
      <span
        className={`min-w-0 flex-1 break-words text-[15px] font-semibold leading-tight ${
          on ? "text-ink" : "text-ink-muted"
        }`}
      >
        {label}
      </span>
      {item.gated && <Lock size={14} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />}
    </button>
  );
}

// The desktop's ParentalPinModal keeps a hidden text input focused so a keyboard
// can type the PIN, and refocuses it on every keypad tap. On a phone that tap
// happens inside a user gesture, so iOS would raise the software keyboard over
// the keypad. This sheet has no input: the on-screen keys are the only entry,
// verified through the same useParental().unlock the desktop uses.
function MobilePinSheet({
  kids,
  verify,
  onUnlock,
  onCancel,
}: {
  kids: boolean;
  verify: (pin: string) => Promise<boolean>;
  onUnlock: () => void;
  onCancel: () => void;
}) {
  useRegisterSheet(true);
  const t = useT();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (pin.length !== 4 || busy) return;
    let cancelled = false;
    setBusy(true);
    void verify(pin).then((ok) => {
      if (cancelled) return;
      setBusy(false);
      if (ok) {
        onUnlock();
        return;
      }
      setError(t("Wrong PIN"));
      setPin("");
      setShaking(true);
      window.setTimeout(() => setShaking(false), 360);
    });
    return () => {
      cancelled = true;
    };
    // Verification runs once per completed PIN, not on every re-render of
    // the callbacks around it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const tap = (digit: string) => {
    if (busy) return;
    setError(null);
    setPin((p) => (p.length >= 4 ? p : p + digit));
  };
  const backspace = () => {
    if (busy) return;
    setError(null);
    setPin((p) => p.slice(0, -1));
  };

  const title = kids ? t("Grown-ups only") : t("Enter your PIN");
  const sub = kids
    ? t("Ask a grown-up to enter the parent PIN.")
    : t("Parental controls are on. Enter your PIN to access settings.");

  const keyClass = kids
    ? "bg-white/15 text-white ring-1 ring-white/30 active:bg-white/25"
    : "bg-raised/60 text-ink ring-1 ring-edge-soft active:bg-raised";

  return createPortal(
    <div
      className="fixed inset-0 z-[280] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`harbor-pin-sheet relative w-full max-w-[520px] overflow-hidden rounded-t-[28px] border-t border-edge-soft px-6 pt-3 ${
          kids ? "text-white" : "text-ink"
        }${shaking ? " is-shaking" : ""}`}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
          paddingLeft: "max(24px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(24px, env(safe-area-inset-right, 0px))",
          background: kids
            ? "linear-gradient(180deg, #3aa6c4 0%, #1c789f 55%, #0c4a6e 100%)"
            : "linear-gradient(var(--color-elevated), var(--color-elevated)), var(--color-canvas)",
        }}
      >
        {kids && (
          <img
            src="/kids/doodles/lilbluewhale.png"
            alt=""
            draggable={false}
            className="pointer-events-none absolute -bottom-3 -end-3 h-24 w-auto opacity-90"
            style={{ transform: "scaleX(-1)" }}
          />
        )}
        <span
          aria-hidden
          className={`mx-auto mb-4 block h-1 w-9 rounded-full ${kids ? "bg-white/40" : "bg-ink/20"}`}
        />
        <div className="relative flex flex-col gap-1 pb-5">
          <h2
            className={`text-[20px] font-medium tracking-tight ${
              kids ? "font-display text-[22px] font-bold" : ""
            }`}
          >
            {title}
          </h2>
          <p className={`text-[13px] leading-relaxed ${kids ? "text-white/85" : "text-ink-muted"}`}>
            {sub}
          </p>
        </div>

        <div dir="ltr" className="relative flex items-center justify-center gap-3.5 pb-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              aria-hidden
              className={`h-3.5 w-3.5 rounded-full ring-1 transition-all duration-150 ${
                pin.length > i
                  ? kids
                    ? "scale-110 bg-white ring-white"
                    : "scale-110 bg-ink ring-ink"
                  : kids
                    ? "bg-transparent ring-white/50"
                    : "bg-transparent ring-edge"
              }`}
            />
          ))}
        </div>
        <p
          aria-live="polite"
          className={`min-h-[20px] pb-3 text-center text-[12.5px] font-medium ${
            kids ? "text-amber-200" : "text-danger"
          }`}
        >
          {error ?? ""}
        </p>

        <div dir="ltr" className="relative grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => tap(d)}
              disabled={busy}
              className={`flex h-14 items-center justify-center rounded-2xl text-[22px] font-semibold tabular-nums transition-transform active:scale-95 disabled:opacity-40 ${keyClass}`}
            >
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={onCancel}
            className={`flex h-14 items-center justify-center rounded-2xl text-[14px] font-semibold ${
              kids ? "text-white/80" : "text-ink-muted"
            }`}
          >
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={() => tap("0")}
            disabled={busy}
            className={`flex h-14 items-center justify-center rounded-2xl text-[22px] font-semibold tabular-nums transition-transform active:scale-95 disabled:opacity-40 ${keyClass}`}
          >
            0
          </button>
          <button
            type="button"
            onClick={backspace}
            disabled={busy || pin.length === 0}
            aria-label={t("Delete")}
            className={`flex h-14 items-center justify-center rounded-2xl transition-transform active:scale-95 disabled:opacity-40 ${
              kids ? "text-white" : "text-ink"
            }`}
          >
            <Delete size={22} strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
