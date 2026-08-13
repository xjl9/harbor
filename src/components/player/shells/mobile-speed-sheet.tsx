import { Check } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MobileSheet } from "./mobile-sheet";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// Playback-speed sheet. Tap a rate, it applies and closes (no Apply button),
// matching the streaming-app convention.
export function MobileSpeedSheet({
  open,
  onClose,
  rate,
  onRate,
}: {
  open: boolean;
  onClose: () => void;
  rate: number;
  onRate: (r: number) => void;
}) {
  const t = useT();
  return (
    <MobileSheet open={open} onClose={onClose} title={t("Playback speed")} heightClass="max-h-[62vh]">
      <div className="flex flex-col gap-1 px-3 pb-3">
        {SPEEDS.map((s) => {
          const selected = Math.abs(s - rate) < 0.01;
          return (
            <button
              key={s}
              type="button"
              onClick={() => {
                onRate(s);
                onClose();
              }}
              className={`flex h-12 items-center justify-between rounded-xl px-4 text-[15px] transition-colors ${
                selected ? "bg-white/10 text-ink" : "text-ink-muted active:bg-white/5"
              }`}
            >
              <span className={selected ? "font-semibold" : ""}>{s === 1 ? t("Normal") : `${s}×`}</span>
              {selected && <Check size={18} strokeWidth={2.4} className="text-accent" />}
            </button>
          );
        })}
      </div>
    </MobileSheet>
  );
}
