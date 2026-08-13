import {
  Airplay,
  ChevronDown,
  Layers,
  ListVideo,
  Loader2,
  Pause,
  Play,
  SkipForward,
  Subtitles as SubsIcon,
  Gauge,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PlayerShellProps } from "@/lib/player-shells/types";
import { MOBILE_OPEN_EPISODES_EVENT } from "@/lib/player/mobile-events";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { RotatingSeekIcon } from "./mobile-seek-icon";
import { MobileSeekBar } from "./mobile-seek-bar";
import { MobileSpeedSheet } from "./mobile-speed-sheet";
import { MobileTracksSheet } from "./mobile-tracks-sheet";

type SheetState = { kind: "none" } | { kind: "tracks"; tab: "subtitles" | "audio" } | { kind: "speed" };

// Touch-first player shell for native mobile. Deliberately does NOT use the
// desktop tight/compact/mid slot system (that width logic null-returns nearly
// every control on a phone). Three zones over the video — top bar, center
// transport cluster, bottom scrubber + action row — plus bottom sheets.
export function MobileShell(props: PlayerShellProps) {
  const {
    snap,
    visible,
    pipMode,
    engine,
    onBack,
    onPlayPause,
    onSeek,
    onSeekStep,
    onCast,
    onPickAnother,
    canPickAnother,
    onRate,
    onAudio,
    onSubtitle,
    onAudioDelay,
    onSubDelay,
    onAddSubtitle,
    onEnterSync,
    onMenuOpenChange,
    onNextEp,
    hasNextEp,
    hasPrevEp,
    title,
    subtitle,
    meta,
    metaImdbId,
    metaTitle,
    metaReleaseDate,
    season,
    episode,
  } = props;
  const t = useT();
  const { settings } = useSettings();
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });

  const playing = snap.status === "playing";
  const buffering = snap.buffering || snap.status === "loading";
  const isSeries = meta?.type === "series" || hasNextEp || hasPrevEp;
  const rate = snap.rate;

  useEffect(() => {
    onMenuOpenChange?.(sheet.kind !== "none");
  }, [sheet.kind, onMenuOpenChange]);

  if (pipMode) return null;

  const chromeShown = visible && sheet.kind === "none";
  const interactive = chromeShown ? "pointer-events-auto" : "pointer-events-none";
  const fade = `transition-opacity duration-200 ${chromeShown ? "opacity-100" : "opacity-0"}`;

  return (
    <>
      {/* Top scrim + bar */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-20 ${fade}`}>
        <div aria-hidden className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/70 to-transparent" />
        <div
          className={`relative flex items-start gap-3 ${interactive}`}
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
            paddingLeft: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
            paddingRight: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          <IconButton label={t("Close")} onClick={onBack}>
            <ChevronDown size={24} strokeWidth={2.2} />
          </IconButton>
          <div className="mt-0.5 flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
              {title}
            </span>
            {subtitle && (
              <span className="truncate text-[12.5px] text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                {subtitle}
              </span>
            )}
          </div>
          <IconButton label={t("AirPlay")} onClick={onCast}>
            <Airplay size={21} strokeWidth={2} />
          </IconButton>
          <IconButton
            label={t("Audio & Subtitles")}
            onClick={() => setSheet({ kind: "tracks", tab: "subtitles" })}
          >
            <SubsIcon size={21} strokeWidth={2} />
          </IconButton>
        </div>
      </div>

      {/* Center transport cluster */}
      <div
        className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-8 ${fade}`}
      >
        <button
          type="button"
          aria-label={t("Rewind")}
          onClick={() => onSeekStep(-1)}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white active:bg-white/10 ${interactive}`}
        >
          <RotatingSeekIcon direction="back" seconds={settings.seekBackStepSec} />
        </button>
        <button
          type="button"
          aria-label={buffering ? t("Loading") : playing ? t("Pause") : t("Play")}
          onClick={onPlayPause}
          className={`flex h-[76px] w-[76px] items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md active:bg-black/65 ${interactive}`}
        >
          {buffering ? (
            <Loader2 size={40} strokeWidth={2} className="animate-spin" />
          ) : playing ? (
            <Pause size={40} strokeWidth={1.6} fill="currentColor" />
          ) : (
            <Play size={40} strokeWidth={1.6} fill="currentColor" className="ml-1" />
          )}
        </button>
        <button
          type="button"
          aria-label={t("Fast forward")}
          onClick={() => onSeekStep(1)}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white active:bg-white/10 ${interactive}`}
        >
          <RotatingSeekIcon direction="forward" seconds={settings.seekForwardStepSec} />
        </button>
      </div>

      {/* Bottom scrim + scrubber + action row */}
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 ${fade}`}>
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        <div
          className={`relative flex flex-col gap-1.5 ${interactive}`}
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
            paddingLeft: "calc(env(safe-area-inset-left, 0px) + 1rem)",
            paddingRight: "calc(env(safe-area-inset-right, 0px) + 1rem)",
          }}
        >
          <MobileSeekBar durationSec={snap.durationSec} visible={visible} onSeek={onSeek} />
          <div className="flex items-center justify-between">
            <ActionButton
              label={t("Playback speed")}
              onClick={() => setSheet({ kind: "speed" })}
              text={Math.abs(rate - 1) > 0.01 ? `${rate}×` : undefined}
            >
              <Gauge size={20} strokeWidth={2} />
            </ActionButton>
            <div className="flex items-center gap-1">
              {canPickAnother && (
                <ActionButton label={t("Switch source")} onClick={onPickAnother}>
                  <Layers size={20} strokeWidth={2} />
                </ActionButton>
              )}
              {isSeries && (
                <ActionButton
                  label={t("Episodes")}
                  onClick={() => window.dispatchEvent(new CustomEvent(MOBILE_OPEN_EPISODES_EVENT))}
                >
                  <ListVideo size={20} strokeWidth={2} />
                </ActionButton>
              )}
              {hasNextEp && (
                <ActionButton label={t("Next episode")} onClick={onNextEp}>
                  <SkipForward size={20} strokeWidth={2} fill="currentColor" />
                </ActionButton>
              )}
            </div>
          </div>
        </div>
      </div>

      <MobileTracksSheet
        open={sheet.kind === "tracks"}
        initialTab={sheet.kind === "tracks" ? sheet.tab : "subtitles"}
        onClose={() => setSheet({ kind: "none" })}
        engine={engine}
        audioTracks={snap.audioTracks}
        subtitleTracks={snap.subtitleTracks}
        audioDelaySec={snap.audioDelaySec}
        subDelaySec={snap.subDelaySec}
        onAudio={onAudio}
        onSubtitle={onSubtitle}
        onAudioDelay={onAudioDelay}
        onSubDelay={onSubDelay}
        onAddSubtitle={onAddSubtitle}
        onEnterSync={onEnterSync}
        metaImdbId={metaImdbId}
        metaTitle={metaTitle}
        metaReleaseDate={metaReleaseDate}
        season={season}
        episode={episode}
      />
      <MobileSpeedSheet
        open={sheet.kind === "speed"}
        onClose={() => setSheet({ kind: "none" })}
        rate={rate}
        onRate={onRate}
      />
    </>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)] active:bg-white/15"
    >
      {children}
    </button>
  );
}

function ActionButton({
  label,
  onClick,
  text,
  children,
}: {
  label: string;
  onClick: () => void;
  text?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-white/90 active:bg-white/10"
    >
      {children}
      {text && <span className="text-[13px] font-bold tabular-nums">{text}</span>}
    </button>
  );
}
