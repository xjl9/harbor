import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Flag } from "@/components/flag";
import { useT } from "@/lib/i18n";
import { ALL_LANGUAGE_NAMES } from "@/lib/subtitles/language";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { useKeyboardInset } from "../use-keyboard-inset";
import { FOCUS, tapHaptic } from "./ob-shared";

// Cloned from the mobile-settings RegionSheet skeleton, adapted to multi-select:
// rows toggle in place (no auto-dismiss on pick); scrim or Done dismisses.
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
    window.setTimeout(onClose, 300);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ALL_LANGUAGE_NAMES;
    return ALL_LANGUAGE_NAMES.filter((l) => l.toLowerCase().includes(q));
  }, [query]);

  const open = entered && !leaving;
  const selected = new Set(value);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center transition-[padding] duration-150"
      style={{ paddingBottom: keyboardInset }}
    >
      <button
        type="button"
        aria-label={t("Close")}
        onClick={dismiss}
        className={`no-press absolute inset-0 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "oklch(0.12 0.006 48 / 0.62)" }}
      />
      <div
        className={`relative z-10 flex max-h-[78vh] w-full max-w-md flex-col rounded-t-3xl border border-edge bg-elevated shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)] transition-transform duration-300 [transition-timing-function:var(--ease-out)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink/20" />
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[19px] font-medium text-ink">
              {t("Subtitle languages")}
            </h3>
            <span className="font-mono text-[12px] tabular-nums text-ink-subtle">
              {value.length}
            </span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search languages")}
            aria-label={t("Search languages")}
            className={`mt-3 w-full rounded-xl border border-edge-soft bg-canvas/60 px-3.5 py-2.5 text-[16px] text-ink placeholder:text-ink-subtle ${FOCUS}`}
          />
        </div>
        <div className="mt-2 flex-1 overflow-y-auto px-3">
          {filtered.map((lang) => {
            const active = selected.has(lang);
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  tapHaptic();
                  onToggle(lang);
                }}
                className={`grid w-full grid-cols-[24px_1fr_20px] items-center gap-3 px-2 py-3.5 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
              >
                <span className="flex justify-center">
                  <Flag language={lang} size="sm" showLabel={false} />
                </span>
                <span
                  className={`truncate text-[15px] ${active ? "font-medium text-ink" : "text-ink-muted"}`}
                >
                  {lang}
                </span>
                {active ? (
                  <Check size={18} strokeWidth={2.6} className="harbor-pop text-accent" />
                ) : (
                  <span />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-4 text-[13px] text-ink-subtle">
              {t("No language matches that search.")}
            </p>
          )}
        </div>
        <div className="px-5 pt-3">
          <button
            type="button"
            onClick={dismiss}
            className="flex h-12 w-full items-center justify-center rounded-full bg-ink text-[15px] font-semibold text-canvas transition-transform active:scale-[0.98]"
          >
            {t("Done")}
          </button>
        </div>
      </div>
    </div>
  );
}
