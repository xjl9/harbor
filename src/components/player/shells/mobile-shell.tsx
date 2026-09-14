import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FullscreenClock } from "@/components/player/fullscreen-clock";
import { capabilityFlags } from "@/lib/player/bridge";
import type { PlayerShellProps } from "@/lib/player-shells/types";
import {
  MOBILE_OPEN_EPISODES_EVENT,
  MOBILE_SEEK_COMMITTED_EVENT,
  type MobileSeekCommittedDetail,
} from "@/lib/player/mobile-events";
import { haptics } from "@/lib/player/haptics";
import {
  nativeSubStyleFromSettings,
  setNativeSubStyle,
  setNativeZoom,
} from "@/lib/player/android-native";
import { nativeCapabilities, useNativeEngine } from "@/lib/player/native-host";
import { getPlaybackPosition, subscribePlaybackClock } from "@/lib/player/playback-clock";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { MobileTogetherSheet } from "@/views/mobile/mobile-together-sheet";
import { MobileActionRow } from "./mobile-action-row";
import { MOBILE_OPEN_XRAY_EVENT } from "./mobile-chrome-events";
import { MobileCoach } from "./mobile-coach";
import { MobileEpisodesSheet } from "./mobile-episodes-sheet";
import { MobileSeekUndo, SEEK_UNDO_MIN_JUMP_SEC, type SeekUndo } from "./mobile-seek-undo";
import { MobileGlyph } from "./mobile-glyph";
import { MOBILE_GLYPH, seekGlyph } from "./mobile-icons";
import {
  HIDE_EASE,
  HIDE_MS,
  SAFE_BOTTOM,
  SAFE_INLINE_20,
  SHOW_EASE,
  SHOW_MS,
} from "./mobile-chrome";
import { MobileMoreSheet } from "./mobile-more-sheet";
import { MobileChatSheet, MobileChatToast, MobileRoomButton, useMobileRoom, useUnreadChat } from "./mobile-room";
import { MobilePeekBar, MobileSeekBar } from "./mobile-seek-bar";
import { MobileSpeedSheet } from "./mobile-speed-sheet";
import { MobileStatsCard } from "./mobile-stats-card";
import { MobileSubStyleSheet } from "./mobile-sub-style-sheet";
import { MobileSubtitleFps } from "./mobile-subtitle-fps";
import { MobileTopBar } from "./mobile-top-bar";
import { MobileTracksSheet } from "./mobile-tracks-sheet";

type SheetState =
  | { kind: "none" }
  | { kind: "tracks"; tab: "subtitles" | "audio" }
  | { kind: "speed" }
  | { kind: "more" }
  | { kind: "episodes" }
  | { kind: "chat" };

// A loop end that has just fired leaves the clock sitting past B until the engine's
// next tick lands the seek, so the jump back is fenced for a moment instead of
// being requested again on every clock update in between.
const LOOP_SEEK_FENCE_MS = 900;

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
    meta,
    sleep,
    download,
    onDownloadStart,
    onDownloadCancel,
    onDownloadReset,
    homeServerQualityControl,
  } = props;
  // The native bridge's capabilities change when the iOS plugin reports which
  // engine took the load; subscribing here re-renders the shell at that moment
  // instead of waiting for the next snapshot to carry the change through.
  const nativeEngineName = useNativeEngine();
  const capabilities = engine === "native" ? nativeCapabilities() : props.capabilities;
  const flags = capabilityFlags(capabilities);
  const nativeMpv = engine === "native" && nativeEngineName === "mpv";
  const t = useT();
  const { settings } = useSettings();
  const [sheet, setSheet] = useState<SheetState>({ kind: "none" });
  // Subtitle-style sheet is tracked separately from `sheet` on purpose: the
  // shared subtitle menu-header fires onOpenStyleBar() then onClose() back to
  // back, so routing both through setSheet would let the close clobber the open.
  const [subStyleOpen, setSubStyleOpen] = useState(false);
  // Watch Together is a full page rather than a sheet, and can be opened from the
  // More sheet as that sheet closes, so it has its own flag for the same reason.
  const [togetherOpen, setTogetherOpen] = useState(false);
  const [statsOn, setStatsOn] = useState(false);
  const reduce = usePrefersReducedMotion();
  const room = useMobileRoom();
  const unread = useUnreadChat(room.chat, room.clientId, sheet.kind === "chat");

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
  // Bumped on each press so the glyph remounts and its animation runs again;
  // a CSS animation will not restart on an element that never changed.
  const [backTick, setBackTick] = useState(0);
  const [fwdTick, setFwdTick] = useState(0);

  const chromeShown = visible && sheet.kind === "none" && !subStyleOpen && !togetherOpen;
  const interactive = useLingeringInteractive(chromeShown);

  useEffect(() => {
    onMenuOpenChange?.(sheet.kind !== "none" || subStyleOpen || togetherOpen);
  }, [sheet.kind, subStyleOpen, togetherOpen, onMenuOpenChange]);

  // The Episodes button fires the shared event rather than opening the sheet
  // directly, so anything else on the phone that asks for the episode list (the
  // event predates this sheet) lands in the same place.
  useEffect(() => {
    const onOpen = () => setSheet({ kind: "episodes" });
    window.addEventListener(MOBILE_OPEN_EPISODES_EVENT, onOpen);
    return () => window.removeEventListener(MOBILE_OPEN_EPISODES_EVENT, onOpen);
  }, []);

  // mpv renders its own subtitles on the phone, so the viewer's subtitle settings
  // have to reach it the way applySubStyle reaches desktop libmpv. Sent on every
  // change; the bridge also remembers it for an mpv core that starts later.
  useEffect(() => {
    if (engine !== "native") return;
    setNativeSubStyle(nativeSubStyleFromSettings(settings));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    engine,
    nativeEngineName,
    settings.subFontSize,
    settings.subFontColor,
    settings.subBorderSize,
    settings.subBorderColor,
    settings.subBoxOpacity,
    settings.subMarginY,
    settings.subAlignX,
    settings.subBold,
    settings.subStyle,
    settings.subBoxColor,
    settings.subOpacity,
  ]);

  // A-B loop. The native bridges cannot loop a range themselves (setAbLoop is a
  // no-op there), so the loop is a seek back to A whenever the clock crosses B,
  // which works the same on every engine. Cleared when the title changes.
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;
  const titleKey = `${title}|${season ?? ""}|${episode ?? ""}`;
  useEffect(() => {
    setLoopA(null);
    setLoopB(null);
  }, [titleKey]);
  useEffect(() => {
    if (loopA == null || loopB == null || loopB <= loopA) return;
    let fencedUntil = 0;
    return subscribePlaybackClock(() => {
      const now = Date.now();
      if (now < fencedUntil) return;
      if (getPlaybackPosition() >= loopB - 0.05) {
        fencedUntil = now + LOOP_SEEK_FENCE_MS;
        onSeekRef.current(loopA);
      }
    });
  }, [loopA, loopB]);

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
  // No uniform active:scale here any more. A single scale driven by a transition
  // reads as the timing function rather than as the control reacting, so the
  // transport glyphs carry hand-authored squash instead and the button itself
  // only dims while held.
  const press = "active:opacity-70 transition-opacity duration-100";
  const closeSheet = () => setSheet({ kind: "none" });
  const engineName =
    engine === "native"
      ? nativeEngineName === "mpv"
        ? "libmpv"
        : nativeEngineName === "av"
          ? "AVFoundation"
          : "Native"
      : engine === "mpv"
        ? "libmpv"
        : "HTML5";
  const selectedSubtitle = snap.subtitleTracks.find((x) => x.selected) ?? null;

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
        onMore={() => {
          haptics.select();
          setSheet({ kind: "more" });
        }}
        roomSlot={
          room.inRoom ? (
            <MobileRoomButton
              unread={unread}
              onOpen={() => {
                haptics.select();
                setSheet({ kind: "chat" });
              }}
            />
          ) : null
        }
        belowBar={
          settings.fullscreenClockEnabled ? (
            <FullscreenClock durationSec={snap.durationSec} playbackRate={snap.rate} active={chromeShown} fullscreen />
          ) : null
        }
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
            setBackTick((t) => t + 1);
            onSeekStep(-settings.seekBackStepSec);
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-ink ${press} ${hit}`}
        >
          <MobileGlyph
            key={backTick}
            className={backTick > 0 ? "harbor-seek-back" : ""}
            url={seekGlyph("back", settings.seekBackStepSec)}
            size={34}
          />
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
            <MobileGlyph
              key={playing ? "playing" : "paused"}
              className="harbor-ctl-pop"
              url={playing ? MOBILE_GLYPH.playing : MOBILE_GLYPH.paused}
              size={42}
            />
          )}
        </button>
        <button
          type="button"
          aria-label={t("Fast forward")}
          onClick={() => {
            haptics.light();
            setFwdTick((t) => t + 1);
            onSeekStep(settings.seekForwardStepSec);
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-ink ${press} ${hit}`}
        >
          <MobileGlyph
            key={fwdTick}
            className={fwdTick > 0 ? "harbor-seek-fwd" : ""}
            url={seekGlyph("forward", settings.seekForwardStepSec)}
            size={34}
          />
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
            paddingBottom: `calc(${SAFE_BOTTOM} + 12px)`,
            paddingInline: SAFE_INLINE_20,
          }}
        >
          <MobileSeekBar
            durationSec={snap.durationSec}
            active={chromeShown}
            onSeek={onSeek}
            segments={props.skipSegments}
            chapters={snap.chapters}
            loop={loopA != null ? { a: loopA, b: loopB } : null}
          />
          <MobileActionRow
            durationSec={snap.durationSec}
            active={chromeShown}
            videoWidth={snap.videoWidth}
            videoHeight={snap.videoHeight}
            hdrGamma={snap.hdrGamma}
            rate={rate}
            showRate={flags.rate}
            sleepActive={sleep != null && sleep.mode.kind !== "off"}
            canPickAnother={canPickAnother}
            hasPrevEp={hasPrevEp}
            hasNextEp={hasNextEp}
            showPiP={capabilities.pictureInPicture}
            showEpisodes={meta?.type === "series"}
            onSpeed={() => setSheet({ kind: "speed" })}
            onPickAnother={onPickAnother}
            onPrevEp={onPrevEp}
            onNextEp={onNextEp}
            onPiP={onPiP}
            onEpisodes={() => {
              haptics.select();
              window.dispatchEvent(new CustomEvent(MOBILE_OPEN_EPISODES_EVENT));
            }}
          />
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-10"
        style={{ opacity: chromeShown ? 0 : 1, transition: `opacity ${dur}ms ${ease}` }}
      >
        <MobilePeekBar durationSec={snap.durationSec} active={!chromeShown} />
      </div>

      {statsOn && <MobileStatsCard snap={snap} engineName={engineName} />}
      <MobileChatToast suppressed={sheet.kind === "chat" || togetherOpen} />

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
        onClose={closeSheet}
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
        subtitleFooter={
          nativeMpv ? (
            <MobileSubtitleFps
              track={selectedSubtitle}
              hasSecondary={snap.subtitleTracks.some((x) => x.secondary)}
            />
          ) : undefined
        }
      />
      <MobileSpeedSheet
        open={sheet.kind === "speed"}
        onClose={closeSheet}
        rate={rate}
        onRate={onRate}
        sleep={sleep}
      />
      <MobileMoreSheet
        open={sheet.kind === "more"}
        onClose={closeSheet}
        statsOn={statsOn}
        onToggleStats={() => setStatsOn((v) => !v)}
        download={download}
        onDownloadStart={onDownloadStart}
        onDownloadCancel={onDownloadCancel}
        onDownloadReset={onDownloadReset}
        homeServerQualityControl={homeServerQualityControl}
        onXray={
          settings.xrayEnabled
            ? () => window.dispatchEvent(new CustomEvent(MOBILE_OPEN_XRAY_EVENT))
            : undefined
        }
        onTogether={() => setTogetherOpen(true)}
        loop={{ a: loopA, b: loopB }}
        onLoopA={() => {
          const pos = Math.max(0, getPlaybackPosition());
          setLoopA(pos);
          setLoopB((b) => (b != null && b <= pos ? null : b));
        }}
        onLoopB={() => {
          const pos = getPlaybackPosition();
          if (loopA != null && pos > loopA) setLoopB(pos);
        }}
        onLoopClear={() => {
          setLoopA(null);
          setLoopB(null);
        }}
      />
      <MobileEpisodesSheet open={sheet.kind === "episodes"} onClose={closeSheet} onRestart={() => onSeek(0)} />
      {room.inRoom && <MobileChatSheet open={sheet.kind === "chat"} onClose={closeSheet} />}
      <MobileSubStyleSheet open={subStyleOpen} onClose={() => setSubStyleOpen(false)} />
      {togetherOpen && <MobileTogetherSheet onClose={() => setTogetherOpen(false)} />}
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
