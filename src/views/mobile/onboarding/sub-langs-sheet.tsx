import { ArrowLeft, Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Flag } from "@/components/flag";
import { useT } from "@/lib/i18n";
import { ALL_LANGUAGE_NAMES } from "@/lib/subtitles/language";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { useKeyboardInset } from "../use-keyboard-inset";
import { FOCUS, tapHaptic } from "./ob-shared";

const ANIM_MS = 260;
const TOP_INSET = "max(calc(env(safe-area-inset-top, 0px) + 12px), 52px)";

// Full-page language picker, portaled to document.body. It must NOT live inside
// the onboarding step wrapper: `.animate-step-in` retains a translateY(0)
// transform (fill-mode: both), which makes that element the containing block for
// position:fixed descendants and also clips them inside the step's
// overflow-y-auto scroll column. Portaling to the body escapes that ancestor so
// `fixed inset-0` resolves against the viewport as intended.
export function SubLangsSheet({
  value,
  onToggle,
  onClose,
}: {
  value: string[];
  onToggle: (lang: string) => void;
  onClose: () => void;
}) {
  useRegisterSheet(true);
  const t = useT();
  const keyboardInset = useKeyboardInset();
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, ANIM_MS);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_LANGUAGE_NAMES;
    return ALL_LANGUAGE_NAMES.filter((l) => l.toLowerCase().includes(q));
  }, [query]);

  // First-match-wins order: the 1-based position doubles as the priority badge.
  const order = useMemo(() => {
    const m = new Map<string, number>();
    value.forEach((lang, i) => m.set(lang, i + 1));
    return m;
  }, [value]);

  const open = entered && !leaving;

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex flex-col bg-canvas transition-opacity duration-[260ms] ${
        open ? "opacity-100" : "opacity-0"
      }`}
      style={{ paddingTop: TOP_INSET }}
    >
      {/* Ambient amber wash to match the onboarding shell. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />

      <div
        className={`flex min-h-0 flex-1 flex-col transition-transform duration-[260ms] [transition-timing-function:var(--ease-out)] ${
          open ? "translate-y-0" : "translate-y-2"
        }`}
      >
        <header className="flex items-center gap-1 px-3 pb-2">
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("Back")}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-raised active:text-ink ${FOCUS}`}
          >
            <ArrowLeft size={20} strokeWidth={2.2} className="dir-icon" />
          </button>
          <h2 className="font-display text-[20px] font-medium tracking-tight text-ink">
            {t("Subtitle languages")}
          </h2>
          <span className="ms-auto me-2 font-mono text-[12px] tabular-nums text-ink-subtle">
            {value.length}
          </span>
        </header>

        <div className="px-5">
          <div className="relative">
            <Search
              size={16}
              strokeWidth={2.2}
              aria-hidden
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search languages")}
              aria-label={t("Search languages")}
              className={`w-full rounded-xl border border-edge-soft bg-canvas/60 py-3 pe-3.5 ps-10 text-[16px] text-ink placeholder:text-ink-subtle ${FOCUS}`}
            />
          </div>
        </div>

        <div
          className="mt-1 flex-1 overflow-y-auto px-3 pt-1"
          style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : 8 }}
        >
          {filtered.map((lang) => {
            const idx = order.get(lang);
            const active = idx !== undefined;
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  tapHaptic();
                  onToggle(lang);
                }}
                className={`grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 rounded-xl px-2.5 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
                style={{ minHeight: 52 }}
              >
                <span className="flex justify-center">
                  <Flag language={lang} size="md" showLabel={false} />
                </span>
                <span
                  className={`truncate text-[15px] ${
                    active ? "font-semibold text-ink" : "text-ink-muted"
                  }`}
                >
                  {lang}
                </span>
                {active ? (
                  <span className="harbor-pop inline-flex h-6 items-center gap-1 rounded-full bg-accent/15 px-2 text-accent">
                    <span className="font-mono text-[11px] font-bold tabular-nums">{idx}</span>
                    <Check size={13} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full border border-edge" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-8 text-center text-[13px] text-ink-subtle">
              {t("No language matches that search.")}
            </p>
          )}
        </div>

        {/* The keyboard covers a bottom-anchored button, so hide it while typing;
            the top back arrow always dismisses. */}
        {keyboardInset === 0 && (
          <div
            className="shrink-0 px-5 pt-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <button
              type="button"
              onClick={dismiss}
              className="flex h-[52px] w-full items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-canvas"
            >
              {value.length > 0 ? t("Done") : t("Close")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
