import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { FOCUS, tapHaptic } from "./ob-shared";

// Header copy mirrors src/components/onboarding/layout-step.tsx; the desktop
// screenshot cards are replaced with the mobile shell's wireframe plates.
export function ObLayout() {
  const { settings, update } = useSettings();
  const t = useT();
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[26px] font-medium leading-tight tracking-tight text-ink">
          {t("Pick a home layout")}
        </h2>
        <p className="text-[14px] leading-relaxed text-ink-muted">
          {t("You can switch later in Settings under Library & metadata.")}
        </p>
      </div>
      <LayoutPlates value={settings.homeMode} onChange={(v) => update({ homeMode: v })} />
    </div>
  );
}

// Duplicated from mobile-settings LayoutChoice; extract to
// src/views/mobile/layout-choice.tsx next cycle when mobile-settings is unfrozen.
function LayoutPlates({
  value,
  onChange,
}: {
  value: "harbor" | "classic";
  onChange: (v: "harbor" | "classic") => void;
}) {
  const t = useT();
  const opts: Array<{ v: "harbor" | "classic"; label: string; desc: string }> = [
    { v: "harbor", label: t("Cinematic"), desc: t("Hero carousel, Top 10, curated rails.") },
    { v: "classic", label: t("Classic"), desc: t("Your addons as rows, install order.") },
  ];
  return (
    <div role="radiogroup" aria-label={t("Home layout")} className="grid grid-cols-2 gap-3">
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            onClick={() => {
              if (active) return;
              tapHaptic();
              onChange(o.v);
            }}
            className={`no-press relative rounded-2xl border bg-surface/50 p-3 text-start transition-colors ${FOCUS} ${
              active ? "border-accent ring-1 ring-accent" : "border-edge-soft"
            }`}
          >
            <div className="rounded-xl bg-canvas/60 p-2.5">
              <div className="h-24">
                {o.v === "harbor" ? (
                  <div className="flex h-full flex-col gap-1.5">
                    <div className="h-14 rounded-md bg-raised" />
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="h-5 rounded bg-edge" />
                      <div className="h-5 rounded bg-edge" />
                      <div className="h-5 rounded bg-edge" />
                    </div>
                  </div>
                ) : (
                  <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded bg-edge" />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <span
              className={`mt-2 block font-display text-[15px] ${active ? "text-ink" : "text-ink-muted"}`}
            >
              {o.label}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-subtle">
              {o.desc}
            </span>
            {active && (
              <span className="harbor-pop absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
