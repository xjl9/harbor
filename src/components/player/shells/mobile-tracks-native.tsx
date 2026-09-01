import { Check, RotateCcw } from "lucide-react";
import type { TrackInfo } from "@/lib/player/bridge";
import { useT } from "@/lib/i18n";
import { haptics } from "@/lib/player/haptics";
import { subtitleTrackLanguageLabel } from "@/lib/subtitles/track-label";
import { languageName } from "@/lib/subtitles/language";

// Track list for the native mobile engines. The desktop menu bodies bundle
// subtitle search, auto sync and the style bar, none of which the native
// surfaces can honor, so the native path gets a plain picker plus an optional
// delay stepper when the engine (mpv on iOS) supports one.
export function NativeTrackList({
  kind,
  tracks,
  selectedId,
  onSelect,
  delaySec,
  onDelay,
  onClose,
}: {
  kind: "audio" | "subtitle";
  tracks: TrackInfo[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  delaySec?: number;
  onDelay?: (sec: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const pick = (id: string | null) => {
    haptics.select();
    onSelect(id);
    onClose();
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3">
        {kind === "subtitle" && (
          <Row label={t("Off")} selected={selectedId == null} onClick={() => pick(null)} />
        )}
        {tracks.length === 0 && kind === "subtitle" && (
          <div className="px-4 py-4 text-[13px] leading-relaxed text-ink-muted">
            {t("No subtitles are built into this file.")}
          </div>
        )}
        {tracks.length === 0 && kind === "audio" && (
          <div className="px-4 py-4 text-[13px] leading-relaxed text-ink-muted">
            {t("This file has one audio track.")}
          </div>
        )}
        {tracks.map((tr) => (
          <Row
            key={tr.id}
            label={trackLabel(tr, kind)}
            detail={trackDetail(tr)}
            selected={tr.id === selectedId}
            onClick={() => pick(tr.id)}
          />
        ))}
      </div>
      {onDelay && typeof delaySec === "number" && <DelayStepper delaySec={delaySec} onDelay={onDelay} />}
    </div>
  );
}

function Row({
  label,
  detail,
  selected,
  onClick,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-12 shrink-0 items-center justify-between rounded-xl px-4 text-[15px] transition-colors ${
        selected ? "bg-accent-soft text-ink" : "text-ink-muted active:bg-raised/60"
      }`}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={`truncate ${selected ? "font-semibold" : ""}`}>{label}</span>
        {detail && <span className="truncate text-[12px] text-ink-subtle">{detail}</span>}
      </span>
      {selected && <Check size={18} strokeWidth={2.4} className="shrink-0 text-accent" />}
    </button>
  );
}

function DelayStepper({ delaySec, onDelay }: { delaySec: number; onDelay: (sec: number) => void }) {
  const t = useT();
  const round = (v: number) => Math.round(v * 100) / 100;
  const step = (d: number) => {
    haptics.light();
    onDelay(round(delaySec + d));
  };
  const stepClass =
    "px-3 py-1.5 text-[13px] font-semibold tabular-nums text-ink-muted active:bg-elevated";
  return (
    <div className="flex items-center justify-between gap-3 border-t border-edge-soft px-4 py-3">
      <span className="text-[13px] font-semibold text-ink">{t("Sync Offset")}</span>
      <div className="flex items-center gap-2">
        <span
          className={`font-mono text-[13px] font-bold tabular-nums ${delaySec !== 0 ? "text-accent" : "text-ink-muted"}`}
        >
          {delaySec > 0 ? "+" : ""}
          {delaySec.toFixed(2)}s
        </span>
        {delaySec !== 0 && (
          <button
            type="button"
            onClick={() => onDelay(0)}
            aria-label={t("Reset sync")}
            className="flex h-8 w-8 items-center justify-center rounded-md bg-raised text-ink-subtle"
          >
            <RotateCcw size={13} strokeWidth={2.2} />
          </button>
        )}
        <div className="flex items-stretch overflow-hidden rounded-lg bg-raised">
          <button type="button" onClick={() => step(-0.1)} className={stepClass}>
            -0.1s
          </button>
          <div className="w-px bg-edge-soft/50" />
          <button type="button" onClick={() => step(0.1)} className={stepClass}>
            +0.1s
          </button>
        </div>
      </div>
    </div>
  );
}

function trackLabel(tr: TrackInfo, kind: "audio" | "subtitle"): string {
  if (kind === "subtitle") return subtitleTrackLanguageLabel(tr);
  if (tr.lang) return languageName(tr.lang);
  return tr.label || "Audio";
}

function trackDetail(tr: TrackInfo): string | undefined {
  const parts: string[] = [];
  if (tr.label && tr.label !== tr.lang && tr.label !== trackLabel(tr, tr.kind)) parts.push(tr.label);
  if (tr.channelCount) parts.push(`${tr.channelCount}ch`);
  if (tr.forced) parts.push("Forced");
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
