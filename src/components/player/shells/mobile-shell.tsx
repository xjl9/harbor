import {
  Airplay,
  Cast,
  ChevronDown,
  Layers,
  ListVideo,
  Loader2,
  Lock,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  Subtitles as SubsIcon,
  Gauge,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { PlayerShellProps } from "@/lib/player-shells/types";
import { MOBILE_OPEN_EPISODES_EVENT } from "@/lib/player/mobile-events";
import {
  MOBILE_LOCK_PEEK_EVENT,
  setMobileLocked,
  useMobileLocked,
} from "@/lib/player/mobile-lock";
import { haptics } from "@/lib/player/haptics";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { RotatingSeekIcon } from "./mobile-seek-icon";
import { MobilePeekBar, MobileSeekBar } from "./mobile-seek-bar";
import { MobileSpeedSheet } from "./mobile-speed-sheet";
import { MobileSubStyleSheet } from "./mobile-sub-style-sheet";
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
    onPiP,
    onPickAnother,
    canPickAnother,
    capabilities,
    onRate,
    onAudio,
    onSubtitle,
    onAudioDelay,
    onSubDelay,
    onAddSubtitle,
    onEnterSync,
    onMenuOpenChange,
    onPrevEp,
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
  // Subtitle-style sheet is tracked separately from `sheet` on purpose: the
  // shared subtitle menu-header fires onOpenStyleBar() then onClose() back to
  // back, so routing both through setSheet would let the close clobber the open.
  const [subStyleOpen, setSubStyleOpen] = useState(false);
  const locked = useMobileLocked();
  const [lockPeek, setLockPeek] = useState(false);
  const lockPeekTimer = useRef<number | null>(null);
  const reduce = usePrefersReducedMotion();

  const playing = snap.status === "playing";
  const buffering = snap.buffering || snap.status === "loading";
  const isSeries = meta?.type === "series" || hasNextEp || hasPrevEp;
  const rate = snap.rate;

  useEffect(() => {
    onMenuOpenChange?.(sheet.kind !== "none" || subStyleOpen);
  }, [sheet.kind, subStyleOpen, onMenuOpenChange]);

  // While locked, a tap on the gesture stage peeks the unlock pill for 3s.
  useEffect(() => {
    if (!locked) return;
    const onPeek = () => {
      setLockPeek(true);
      if (lockPeekTimer.current) window.clearTimeout(lockPeekTimer.current);
      lockPeekTimer.current = window.setTimeout(() => setLockPeek(false), 3000);
    };
    onPeek();
    window.addEventListener(MOBILE_LOCK_PEEK_EVENT, onPeek);
    return () => {
      window.removeEventListener(MOBILE_LOCK_PEEK_EVENT, onPeek);
      if (lockPeekTimer.current) window.clearTimeout(lockPeekTimer.current);
    };
  }, [locked]);

  // Clear lock on unmount so a new playback never starts locked.
  useEffect(() => () => setMobileLocked(false), []);

  if (pipMode) return null;

  // Locked: hide all chrome, ignore all controls, surface only the unlock pill.
  if (locked) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20">
        <button
          type="button"
          aria-label={t("Unlock")}
          onClick={() => {
            haptics.select();
            setMobileLocked(false);
          }}
          className={`absolute left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md transition-opacity duration-200 active:bg-black/70 ${
            lockPeek ? "pointer-events-auto" : "pointer-events-none"
          }`}
          style={{
            top: "calc(env(safe-area-inset-top, 0px) + 1rem)",
            opacity: lockPeek ? 1 : 0,
          }}
        >
          <Lock size={20} strokeWidth={2.2} />
        </button>
      </div>
    );
  }

  const chromeShown = visible && sheet.kind === "none" && !subStyleOpen;
  const interactive = chromeShown ? "pointer-events-auto" : "pointer-events-none";

  // Chrome does not just cross-fade: each zone translates/scales into place on a
  // fast ease-out and leaves on a slower ease-in, with the scrim leading the
  // controls by a beat. prefers-reduced-motion collapses this to opacity only.
  const showEase = "cubic-bezier(0,0,0.2,1)";
  const hideEase = "cubic-bezier(0.4,0,1,1)";
  const dur = chromeShown ? 200 : 280;
  const ease = chromeShown ? showEase : hideEase;
  const controlsDelay = chromeShown ? "30ms" : "0ms";
  const scrimStyle: CSSProperties = {
    opacity: chromeShown ? 1 : 0,
    transition: `opacity ${dur}ms ${ease}`,
  };
  const zoneStyle = (hidden: string): CSSProperties =>
    reduce
      ? { opacity: chromeShown ? 1 : 0, transition: `opacity ${dur}ms ${ease}`, transitionDelay: controlsDelay }
      : {
          opacity: chromeShown ? 1 : 0,
          transform: chromeShown ? "none" : hidden,
          transition: `opacity ${dur}ms ${ease}, transform ${dur}ms ${ease}`,
          transitionDelay: controlsDelay,
        };

  return (
    <>
      {/* Top scrim + bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/70 to-transparent sm:h-36"
          style={scrimStyle}
        />
        {/* Five 44px targets plus the title do not fit on one 375px line: below sm
            the title drops to its own full-width row instead of being squeezed to
            about six characters. Landscape (the locked steady state) is above sm
            and keeps the single-row bar. */}
        <div
          className={`relative flex flex-wrap items-start gap-x-3 gap-y-1 sm:flex-nowrap ${interactive}`}
          style={{
            ...zoneStyle("translateY(-8px)"),
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
            paddingLeft: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
            paddingRight: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          <IconButton label={t("Close")} onClick={onBack}>
            <ChevronDown size={24} strokeWidth={2.2} />
          </IconButton>
          <span aria-hidden className="pointer-events-none flex-1 sm:hidden" />
          <div className="pointer-events-none order-last mt-0.5 flex w-full min-w-0 flex-col sm:order-none sm:w-auto sm:flex-1">
            <span className="truncate text-[15px] font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
              {title}
            </span>
            {subtitle && (
              <span className="truncate text-[12.5px] text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                {subtitle}
              </span>
            )}
          </div>
          <IconButton
            label={t("Lock screen")}
            onClick={() => {
              haptics.select();
              setMobileLocked(true);
            }}
          >
            <Lock size={20} strokeWidth={2} />
          </IconButton>
          {capabilities.pictureInPicture && (
            <IconButton label={t("Picture in picture")} onClick={onPiP}>
              <PictureInPicture2 size={21} strokeWidth={2} />
            </IconButton>
          )}
          {capabilities.airplay ? (
            <IconButton label={t("AirPlay")} onClick={onCast}>
              <Airplay size={21} strokeWidth={2} />
            </IconButton>
          ) : capabilities.chromecast ? (
            <IconButton label={t("Cast")} onClick={onCast}>
              <Cast size={20} strokeWidth={2} />
            </IconButton>
          ) : null}
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
        className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-8"
        style={zoneStyle("scale(0.96)")}
      >
        <button
          type="button"
          aria-label={t("Rewind")}
          onClick={() => {
            haptics.light();
            onSeekStep(-1);
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white active:bg-white/10 ${interactive}`}
        >
          <RotatingSeekIcon direction="back" seconds={settings.seekBackStepSec} />
        </button>
        <button
          type="button"
          aria-label={buffering ? t("Loading") : playing ? t("Pause") : t("Play")}
          onClick={() => {
            haptics.select();
            onPlayPause();
          }}
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
          onClick={() => {
            haptics.light();
            onSeekStep(1);
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white active:bg-white/10 ${interactive}`}
        >
          <RotatingSeekIcon direction="forward" seconds={settings.seekForwardStepSec} />
        </button>
      </div>

      {/* Bottom scrim + scrubber + action row */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
          style={scrimStyle}
        />
        <div
          className={`relative flex flex-col gap-1.5 ${interactive}`}
          style={{
            ...zoneStyle("translateY(12px)"),
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
              {hasPrevEp && (
                <ActionButton label={t("Previous episode")} onClick={onPrevEp}>
                  <SkipBack size={20} strokeWidth={2} fill="currentColor" />
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

      {/* Peek progress line — a thin timeline that survives chrome auto-hide. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          opacity: chromeShown ? 0 : 1,
          transition: `opacity ${dur}ms ${ease}`,
        }}
      >
        <MobilePeekBar durationSec={snap.durationSec} />
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
        onOpenSubStyle={() => setSubStyleOpen(true)}
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
      <MobileSubStyleSheet open={subStyleOpen} onClose={() => setSubStyleOpen(false)} />
    </>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
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
