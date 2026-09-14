import { Check, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { haptics } from "@/lib/player/haptics";
import { useSettings } from "@/lib/settings";
import {
  SLEEP_PRESETS,
  type SleepMode,
  type SleepTimerState,
} from "@/views/player/hooks/use-sleep-timer";
import { MobileSheet, MobileSheetEyebrow } from "./mobile-sheet";

const CURATED_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
// The phone gets a longer minute list than the desktop's four, because there is
// no hover menu to reach the rest from and a sheet row costs nothing.
const CURATED_SLEEP_MINUTES = [15, 30, 45, 60, 120];

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${m}:${String(r).padStart(2, "0")}`;
}

// Speed and sleep in one sheet, the desktop SpeedMenu's pairing. Tapping a rate
// or a timer applies it and closes, the streaming-app convention; the custom
// entries stay open because typing a value is not a choice made yet.
export function MobileSpeedSheet({
  open,
  onClose,
  rate,
  onRate,
  sleep,
}: {
  open: boolean;
  onClose: () => void;
  rate: number;
  onRate: (r: number) => void;
  sleep?: SleepTimerState;
}) {
  const t = useT();
  const { settings, update } = useSettings();

  const speeds = useMemo(() => {
    const entries = new Map<number, boolean>();
    for (const s of CURATED_SPEEDS) entries.set(s, false);
    for (const s of settings.customPlaybackSpeeds) if (!entries.has(s)) entries.set(s, true);
    return [...entries.entries()]
      .map(([value, custom]) => ({ value, custom }))
      .sort((a, b) => a.value - b.value);
  }, [settings.customPlaybackSpeeds]);

  const sleepRows = useMemo(() => {
    const minutes = new Map<number, boolean>();
    for (const m of CURATED_SLEEP_MINUTES) minutes.set(m, false);
    for (const m of settings.customSleepMinutes) if (!minutes.has(m)) minutes.set(m, true);
    const minuteRows = [...minutes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([total, custom]) => ({
        id: `m${total}`,
        label: total >= 60 && total % 60 === 0 ? t("{n} hr", { n: total / 60 }) : t("{n} min", { n: total }),
        mode: { kind: "minutes", total, firesAt: 0 } as SleepMode,
        custom,
      }));
    const episodeRows = SLEEP_PRESETS.filter((p) => p.mode.kind !== "minutes").map((p) => ({
      id: p.id,
      label: t(p.label),
      mode: p.mode,
      custom: false,
    }));
    return [...minuteRows, ...episodeRows];
  }, [settings.customSleepMinutes, t]);

  const pickRate = (value: number) => {
    haptics.medium();
    onRate(value);
    onClose();
  };

  const addSpeed = (raw: number): boolean => {
    const v = Math.round(raw * 100) / 100;
    if (!Number.isFinite(v) || v < 0.1 || v > 4) return false;
    if (!CURATED_SPEEDS.includes(v) && !settings.customPlaybackSpeeds.includes(v)) {
      update({ customPlaybackSpeeds: [...settings.customPlaybackSpeeds, v] });
    }
    // Entering a speed is asking for it, so it applies as well as being kept.
    pickRate(v);
    return true;
  };

  const addSleep = (raw: number): boolean => {
    const m = Math.round(raw);
    if (!Number.isFinite(m) || m < 1 || m > 1440 || !sleep) return false;
    if (!CURATED_SLEEP_MINUTES.includes(m) && !settings.customSleepMinutes.includes(m)) {
      update({ customSleepMinutes: [...settings.customSleepMinutes, m] });
    }
    haptics.medium();
    sleep.set({ kind: "minutes", total: m, firesAt: 0 });
    onClose();
    return true;
  };

  const sleepActive = sleep != null && sleep.mode.kind !== "off";

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title={sleep ? t("Speed & sleep") : t("Playback speed")}
      heightClass="max-h-[80vh]"
    >
      <div className="flex flex-col pb-4">
        <MobileSheetEyebrow>{t("Playback speed")}</MobileSheetEyebrow>
        <div className="flex flex-col gap-1 px-3">
          {speeds.map((s) => (
            <OptionRow
              key={s.value}
              label={s.value === 1 ? t("Normal") : `${s.value}×`}
              selected={Math.abs(s.value - rate) < 0.01}
              onClick={() => pickRate(s.value)}
              onRemove={
                s.custom
                  ? () =>
                      update({
                        customPlaybackSpeeds: settings.customPlaybackSpeeds.filter((x) => x !== s.value),
                      })
                  : undefined
              }
            />
          ))}
          <AddValueRow label={t("Custom speed")} placeholder={t("e.g. 1.35")} suffix="×" onAdd={addSpeed} />
        </div>

        {sleep && (
          <>
            <MobileSheetEyebrow>{t("Sleep timer")}</MobileSheetEyebrow>
            <div className="flex flex-col gap-1 px-3">
              {sleepRows.map((p) => {
                const selected =
                  (sleep.mode.kind === "minutes" &&
                    p.mode.kind === "minutes" &&
                    sleep.mode.total === p.mode.total) ||
                  (p.mode.kind !== "minutes" && sleep.mode.kind === p.mode.kind);
                const total = p.mode.kind === "minutes" ? p.mode.total : null;
                return (
                  <OptionRow
                    key={p.id}
                    label={p.label}
                    selected={selected}
                    hint={
                      selected && sleep.mode.kind === "minutes" && sleep.remainingMs != null
                        ? formatRemaining(sleep.remainingMs)
                        : undefined
                    }
                    onClick={() => {
                      haptics.medium();
                      sleep.set(p.mode);
                      onClose();
                    }}
                    onRemove={
                      p.custom && total != null
                        ? () =>
                            update({
                              customSleepMinutes: settings.customSleepMinutes.filter((x) => x !== total),
                            })
                        : undefined
                    }
                  />
                );
              })}
              <AddValueRow label={t("Sleep timer")} placeholder={t("e.g. 20")} suffix={t("min")} onAdd={addSleep} />
              {sleepActive && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.light();
                    sleep.cancel();
                    onClose();
                  }}
                  className="flex min-h-12 items-center rounded-xl px-4 text-start text-[15px] font-medium text-danger active:bg-danger/10"
                >
                  {t("Cancel timer")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </MobileSheet>
  );
}

function OptionRow({
  label,
  selected,
  hint,
  onClick,
  onRemove,
}: {
  label: string;
  selected: boolean;
  hint?: string;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onClick}
        className={`flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl px-4 text-[15px] transition-colors ${
          selected ? "bg-accent-soft text-ink" : "text-ink-muted active:bg-raised/60"
        }`}
      >
        <span className={`truncate ${selected ? "font-semibold" : ""}`}>{label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {hint && <span className="font-jakarta text-[12.5px] tabular-nums text-ink-subtle">{hint}</span>}
          {selected && <Check size={18} strokeWidth={2.4} className="text-accent" />}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={() => {
            haptics.light();
            onRemove();
          }}
          aria-label={t("Remove preset")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle active:bg-danger/15 active:text-danger"
        >
          <X size={16} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

// Typed entry for a value the lists do not carry. Decimal keypad on a phone, and
// Return submits so the keyboard's own key finishes the job.
function AddValueRow({
  label,
  placeholder,
  suffix,
  onAdd,
}: {
  label: string;
  placeholder: string;
  suffix: string;
  onAdd: (value: number) => boolean;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [invalid, setInvalid] = useState(false);
  const submit = () => {
    const n = parseFloat(value.trim().replace(",", "."));
    if (!Number.isFinite(n) || !onAdd(n)) {
      setInvalid(true);
      haptics.light();
      return;
    }
    setValue("");
    setInvalid(false);
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={`mt-1 flex min-h-12 items-center gap-2 rounded-xl border px-4 ${
        invalid ? "border-danger/60" : "border-edge-soft"
      }`}
    >
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        aria-label={label}
        placeholder={placeholder}
        inputMode="decimal"
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none"
      />
      <span className="shrink-0 text-[13px] font-medium text-ink-subtle">{suffix}</span>
      <button
        type="submit"
        aria-label={t("Add preset")}
        className="-me-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted active:bg-raised"
      >
        <Plus size={18} strokeWidth={2.4} />
      </button>
    </form>
  );
}
