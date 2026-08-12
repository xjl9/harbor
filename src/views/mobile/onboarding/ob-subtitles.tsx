import { ChevronRight, X } from "lucide-react";
import { useState } from "react";
import { Flag } from "@/components/flag";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { SubLangsSheet } from "./sub-langs-sheet";

// Header copy mirrors src/components/onboarding/subtitles-step.tsx; the desktop
// chip-cloud LanguagesPicker is replaced with a bottom-sheet picker for touch.
// Toggle math is order-preserving: first match wins at playback, so pick order
// is the priority order.
export function ObSubtitles() {
  const { settings, update } = useSettings();
  const t = useT();
  const [sheetOpen, setSheetOpen] = useState(false);
  const value = settings.preferredSubLangs;

  const toggle = (lang: string) =>
    update({
      preferredSubLangs: value.includes(lang)
        ? value.filter((l) => l !== lang)
        : [...value, lang],
    });

  return (
    <div className="flex flex-col gap-6">
      <span className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
        {t("Step 4 · Subtitles")}
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[30px] font-medium leading-[1.08] tracking-tight text-ink">
          {t("Pick your subtitle languages")}
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {t(
            "When playback starts, Harbor finds and loads a subtitle in one of these languages automatically. The first available match wins, so put your main language first.",
          )}
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {value.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-edge-soft bg-canvas/40 px-3 py-2.5">
            {value.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => toggle(lang)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-3.5 text-[12.5px] font-semibold text-accent transition-colors active:bg-accent/25"
              >
                <Flag language={lang} size="sm" showLabel={false} />
                <span>{lang}</span>
                <X size={11} strokeWidth={2.4} className="opacity-70" />
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex h-12 w-full items-center justify-between rounded-xl border border-edge-soft px-4 text-[15px] font-medium text-ink transition-colors active:bg-raised/50"
        >
          {t("Add languages")}
          <ChevronRight size={18} strokeWidth={2.2} className="dir-icon text-ink-subtle" />
        </button>
      </div>
      {sheetOpen && (
        <SubLangsSheet value={value} onToggle={toggle} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}
