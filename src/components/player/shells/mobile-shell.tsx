import { useEffect, useState, type CSSProperties } from "react";
import { capabilityFlags } from "@/lib/player/bridge";
import type { PlayerShellProps } from "@/lib/player-shells/types";
import {
  MOBILE_SEEK_COMMITTED_EVENT,
  type MobileSeekCommittedDetail,
} from "@/lib/player/mobile-events";
import { haptics } from "@/lib/player/haptics";
import { setNativeZoom } from "@/lib/player/android-native";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { MobileActionRow } from "./mobile-action-row";
import { MobileCoach } from "./mobile-coach";
import { MobileSeekUndo, SEEK_UNDO_MIN_JUMP_SEC, type SeekUndo } from "./mobile-seek-undo";
import { MobileGlyph } from "./mobile-glyph";
import { MOBILE_GLYPH, seekGlyph } from "./mobile-icons";
import {
  HIDE_EASE,
  HIDE_MS,
  SAFE_INLINE_20,
  SHOW_EASE,
  SHOW_MS,
} from "./mobile-chrome";
import { MobilePeekBar, MobileSeekBar } from "./mobile-seek-bar";
import { MobileSpeedSheet } from "./mobile-speed-sheet";
import { MobileSubStyleSheet } from "./mobile-sub-style-sheet";
import { MobileTopBar } from "./mobile-top-bar";
import { MobileTracksSheet } from "./mobile-tracks-sheet";

type SheetState = { kind: "none" } | { kind: "tracks"; tab: "subtitles" | "audio" } | { kind: "speed" };

// Touch-first player shell for native mobile. Deliberately does NOT use the
// desktop tight/compact/mid slot system (that width logic null-returns nearly
// every control on a phone). Three zones over the video: top bar, center
// transport, bottom scrubber + action row, plus bottom sheets.
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
    metaImdbId,
    metaTitle,
    metaReleaseDate,
    season,
    episode,
  } = props;
  const capabilities = props.capabilities;
  const flags = capabilityFlags(capabilities);
  const t = useT();
  const { settings } = useSettings();
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  // Subtitle-style sheet is tracked separately from `sheet` on purpose: the
  // shared subtitle menu-header fires onOpenStyleBar() then onClose() back to
  // back, so routing both through setSheet would let the close clobber the open.
  const [subStyleOpen, setSubStyleOpen] = useState(false);
  const reduce = usePrefersReducedMotion();

  const enginePlaying = snap.status === "playing";
  const buffering = snap.buffering || snap.status === "loading";
  // The engine is across a bridge, so its status lags the tap by a frame or several
  // and the button sat on the old glyph the whole time - which reads as the control
  // being slow rather than the pipeline being asynchronous. Show the intent
  // immediately and let the engine's own state take over as soon as it agrees.
  const [pendingPlaying, setPendingPlaying] = useState<boolean | null>(null);
  useEffect(() => {
    if (pendingPlaying !== null && pendingPlaying === enginePlaying) setPendingPlaying(null);
  }, [pendingPlaying, enginePlaying]);
  const playing = pendingPlaying ?? enginePlaying;
  const rate = snap.rate;
  // Local, not persisted: filling is a per-title decision and carrying it into the
  // next thing you watch would crop a 16:9 show for no reason.
  const [fillMode, setFillMode] = useState(false);

  const chromeShown = visible && sheet.kind === "none" && !subStyleOpen;
  const interactive = useLingeringInteractive(chromeShown);

  useEffect(() => {
    onMenuOpenChange?.(sheet.kind !== "none" || subStyleOpen);
  }, [sheet.kind, subStyleOpen, onMenuOpenChange]);

  // Offer the way back after a jump big enough to have been a mistake. Small
  // corrections are not worth a pill; losing forty minutes of your place is.
  const [seekUndo, setSeekUndo] = useState<SeekUndo>(null);
  useEffect(() => {
    const onCommitted = (e: Event) => {
      const d = (e as CustomEvent<MobileSeekCommittedDetail>).detail;
      if (!d) return;
      if (Math.abs(d.toSec - d.fromSec) < SEEK_UNDO_MIN_JUMP_SEC) return;
      setSeekUndo({ from: d.fromSec, at: Date.now() });
    };
    window.addEventListener(MOBILE_SEEK_COMMITTED_EVENT, onCommitted);
    return () => window.removeEventListener(MOBILE_SEEK_COMMITTED_EVENT, onCommitted);
  }, []);


  // Publish how much room the bottom chrome is taking so the subtitle overlay can
  // sit above it instead of underneath the scrubber and the clock. Cleared when the
  // controls hide, so dialogue returns to its configured margin.
  useEffect(() => {
    // Published on the document root, not on [data-harbor-player]. The mobile player
    // is portaled to body while another player root can still exist inside #root, so
    // querySelector could hand back the wrong element and the variable never reached
    // the overlay that needed it. Inheriting from :root cannot miss.
    const root = document.documentElement;
    root.style.setProperty("--player-chrome-lift", chromeShown ? "112px" : "0px");
    return () => {
      root.style.removeProperty("--player-chrome-lift");
    };
  }, [chromeShown]);

  if (pipMode) return null;

  // Chrome does not just cross-fade: each zone translates/scales into place on a
  // fast ease-out and leaves on a slower ease-in, with the scrim leading the
  // controls by a beat. prefers-reduced-motion collapses this to opacity only.
  const dur = chromeShown ? SHOW_MS : HIDE_MS;
  const ease = chromeShown ? SHOW_EASE : HIDE_EASE;
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
  const hit = interactive ? "pointer-events-auto" : "pointer-events-none";
  const press = "active:scale-[0.94] transition-transform duration-100";

  return (
    <>
      <MobileTopBar
        title={title}
        subtitle={subtitle}
        season={season}
        episode={episode}
        showAirplay={capabilities.airplay}
        showCast={capabilities.chromecast}
        scrimStyle={scrimStyle}
        zoneStyle={zoneStyle("translateY(-8px)")}
        interactive={interactive}
        onBack={onBack}
        fillMode={fillMode}
        onToggleFill={() => {
          haptics.medium();
          setFillMode((v) => {
            setNativeZoom(!v);
            return !v;
          });
        }}
        onCast={onCast}
        onTracks={() => setSheet({ kind: "tracks", tab: "subtitles" })}
      />

      {/* Center transport in landscape, where the picture fills the frame and the
          middle of the screen is the middle of the picture.
          In portrait it drops to sit just above the scrubber instead: a scope film
          letterboxes to a band, so screen-centre is usually BLACK, and the controls
          hung there in a void with the picture somewhere else entirely. Grouping
          them with the rest of the chrome keeps the frame clear and puts every
          control in one place. */}
      <div
        className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-14 [@media(orientation:portrait)]:items-end [@media(orientation:portrait)]:pb-[150px]"
        style={zoneStyle("scale(0.96)")}
      >
        <button
          type="button"
          aria-label={t("Rewind")}
          onClick={() => {
            haptics.light();
            onSeekStep(-settings.seekBackStepSec);
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-ink ${press} ${hit}`}
        >
          <MobileGlyph url={seekGlyph("back", settings.seekBackStepSec)} size={34} />
        </button>
        <button
          type="button"
          aria-label={buffering ? t("Loading") : playing ? t("Pause") : t("Play")}
          onClick={() => {
            haptics.select();
            setPendingPlaying(!playing);
            onPlayPause();
          }}
          className={`flex h-20 w-20 items-center justify-center rounded-full text-ink ${press} ${hit}`}
        >
          {buffering ? (
            <span
              aria-hidden
              className="h-9 w-9 animate-spin rounded-full border-2 border-ink-muted border-t-transparent"
            />
          ) : (
            <MobileGlyph url={playing ? MOBILE_GLYPH.playing : MOBILE_GLYPH.paused} size={42} />
          )}
        </button>
        <button
          type="button"
          aria-label={t("Fast forward")}
          onClick={() => {
            haptics.light();
            onSeekStep(settings.seekForwardStepSec);
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-ink ${press} ${hit}`}
        >
          <MobileGlyph url={seekGlyph("forward", settings.seekForwardStepSec)} size={34} />
        </button>
      </div>

      {/* Bottom scrim + scrubber + action row */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20">
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-40"
          style={{
            ...scrimStyle,
            backgroundImage:
              "linear-gradient(to top, color-mix(in srgb, var(--color-canvas) 85%, transparent) 0%, color-mix(in srgb, var(--color-canvas) 40%, transparent) 45%, transparent 100%)",
          }}
        />
        <div
          className={`relative flex flex-col gap-1 ${hit}`}
          style={{
            ...zoneStyle("translateY(12px)"),
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
            paddingInline: SAFE_INLINE_20,
          }}
        >
          <MobileSeekBar
            durationSec={snap.durationSec}
            active={chromeShown}
            onSeek={onSeek}
            segments={props.skipSegments}
          />
          <MobileActionRow
            durationSec={snap.durationSec}
            active={chromeShown}
            videoWidth={snap.videoWidth}
            videoHeight={snap.videoHeight}
            hdrGamma={snap.hdrGamma}
            rate={rate}
            showRate={flags.rate}
            canPickAnother={canPickAnother}
            hasPrevEp={hasPrevEp}
            hasNextEp={hasNextEp}
            showPiP={capabilities.pictureInPicture}
            onSpeed={() => setSheet({ kind: "speed" })}
            onPickAnother={onPickAnother}
            onPrevEp={onPrevEp}
            onNextEp={onNextEp}
            onPiP={onPiP}
          />
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{ opacity: chromeShown ? 0 : 1, transition: `opacity ${dur}ms ${ease}` }}
      >
        <MobilePeekBar durationSec={snap.durationSec} active={!chromeShown} />
      </div>

      <MobileCoach visible={chromeShown} />

      <MobileSeekUndo
        undo={seekUndo}
        onUndo={(sec) => {
          haptics.select();
          onSeek(sec);
        }}
        onDismiss={() => setSeekUndo(null)}
      />

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

// Controls stay tappable through the hide transition. Flipping pointer-events
// off in the same render that starts the fade eats the tap that was already on
// its way down, and a fading button that ignores you reads as broken.
function useLingeringInteractive(shown: boolean): boolean {
  const [interactive, setInteractive] = useState(shown);
  useEffect(() => {
    if (shown) {
      setInteractive(true);
      return;
    }
    const id = window.setTimeout(() => setInteractive(false), HIDE_MS);
    return () => window.clearTimeout(id);
  }, [shown]);
  return interactive;
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
