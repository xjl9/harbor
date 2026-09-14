import { invoke, addPluginListener, type PluginListener } from "@tauri-apps/api/core";

// Raised when the native overlay asks for something only the React side can do.
export const NATIVE_PLAYER_ACTION_EVENT = "harbor:native-player-action";

// Whether a following episode exists. Current state rather than a property of a
// url, so it is set here instead of threaded through every load() call site.
let canNextEpisode = false;
export function setNativeCanNext(value: boolean): void {
  canNextEpisode = value;
}
import type { SubCue } from "@/lib/subtitles/parser";
import type { SubtitleLoadMetadata } from "@/lib/subtitles/types";
import type { Settings } from "@/lib/settings/types";
import { prepareSubtitle } from "@/lib/subtitles/prepare";
import { takePreparedSubtitle } from "@/lib/subtitles/prepared-registry";
import { isSafeProviderSubtitleUrl } from "@/lib/subtitles/provider-url";
import { subtitleTrackDownloadHeaders } from "@/lib/subtitles/provider-auth";
import { markLimitReached } from "@/lib/subtitles/limit-signal";
import { toNativeFileUrl } from "./local-url";
import {
  nativeCapabilities,
  nativeEngine,
  nativeInvoke,
  nativeWebChrome,
  setNativeEngine,
  setNativeSubFpsState,
  setNativeVideoBehind,
  type NativeEngine,
} from "./native-host";
import {
  emptySnapshot,
  type Chapter,
  type PlayerBridge,
  type PlayerCapabilities,
  type PlayerSnapshot,
  type PlayerSource,
  type TrackInfo,
} from "./bridge";

// Subtitle appearance for the native mpv engine, the wire shape of the plugin's
// set_sub_style. The desktop applies the same settings through applySubStyle;
// the phone has no mpv_set_property command, so the plugin maps them instead.
export type NativeSubStyle = {
  fontSize: number;
  color: string;
  borderSize: number;
  borderColor: string;
  boxOpacity: number;
  marginY: number;
  alignX: string;
  bold: boolean;
  style: string;
  boxColor: string;
  opacity: number;
};

export function nativeSubStyleFromSettings(
  s: Pick<
    Settings,
    | "subFontSize"
    | "subFontColor"
    | "subBorderSize"
    | "subBorderColor"
    | "subBoxOpacity"
    | "subMarginY"
    | "subAlignX"
    | "subBold"
    | "subStyle"
    | "subBoxColor"
    | "subOpacity"
  >,
): NativeSubStyle {
  return {
    fontSize: Number(s.subFontSize) || 32,
    color: s.subFontColor,
    borderSize: Number(s.subBorderSize) || 0,
    borderColor: s.subBorderColor,
    boxOpacity: Number(s.subBoxOpacity ?? 0.6),
    marginY: Number(s.subMarginY) || 0,
    alignX: s.subAlignX,
    bold: !!s.subBold,
    style: s.subStyle,
    boxColor: s.subBoxColor || "#000000",
    opacity: Number(s.subOpacity ?? 1),
  };
}

// Remembered so a freshly created mpv core (first load, or an engine swap from
// AVPlayer) gets the viewer's style without waiting for a settings change.
let lastSubStyle: NativeSubStyle | null = null;

export function setNativeSubStyle(style: NativeSubStyle): void {
  lastSubStyle = style;
  if (nativeEngine() === "mpv") nativeInvoke("set_sub_style", style);
}

/** 0 restores no correction; otherwise the source frame rate, 1..240. */
export function setNativeSubFps(fps: number): void {
  const value = fps === 0 || (fps >= 1 && fps <= 240) ? fps : 0;
  setNativeSubFpsState({ subFps: value });
  if (nativeEngine() === "mpv") nativeInvoke("set_sub_fps", { fps: value });
}

export { setOrientation, type OrientationLock } from "./native-orientation";

/// Crop the picture to fill the screen instead of fitting it. A scope film on a
/// phone letterboxes to a thin band, and the trade - losing the sides of the frame
/// to gain its height - is the viewer's to make, so it is a control rather than a
/// setting. No-ops on any surface without the native plugin.
export function setNativeZoom(fill: boolean): void {
  nativeInvoke("set_zoom", { fill });
}
export { nativeEngine, showNativeRoutePicker } from "./native-host";

type Tick = { positionSec: number; durationSec: number; bufferedSec: number; playing: boolean; rate?: number   // Optional: iOS reports the decoded picture size, Android does not send these.
  videoWidth?: number;
  videoHeight?: number;
};
type State = {
  status: "loading" | "ready" | "ended" | "error";
  errorCode?: string;
  engine?: NativeEngine;
  // Optional: iOS reports the decoded picture size once it knows, Android does not
  // send these at all.
  videoWidth?: number;
  videoHeight?: number;
};
type Closed = { positionSec: number; durationSec: number };
type NativeTrack = {
  id: string;
  label: string;
  lang?: string;
  selected: boolean;
  channelCount?: number;
  // iOS only (mpv fills all of them, AVPlayer the flags); Android sends none, and
  // an absent flag reads as false.
  codec?: string;
  title?: string;
  forced?: boolean;
  default?: boolean;
  hearingImpaired?: boolean;
  external?: boolean;
  externalFilename?: string;
  secondary?: boolean;
};
type TracksEvent = {
  audio: NativeTrack[];
  subtitle: NativeTrack[];
  chapters?: Array<{ title?: string; startSec: number }>;
  videoFps?: number;
};
// What the JS side knows about a subtitle it handed to mpv, keyed by the path mpv
// reports back as the track's external-filename. mpv only knows a file; the menu
// needs the provider, the release match and the parsed cues for manual timing.
type ExternalSubtitle = {
  url: string;
  lang?: string;
  title?: string;
  cues?: SubCue[];
  metadata?: SubtitleLoadMetadata;
};

/**
 * PlayerBridge backed by the native mobile plugin (tauri-plugin-harbor-player):
 * media3/ExoPlayer in its own fullscreen Android Activity; on iOS an AVPlayer
 * or mpv view mounted behind a transparent web view so the React shell draws
 * the chrome (webChrome). This bridge forwards load/transport commands and
 * mirrors the player's position/state into a PlayerSnapshot so resume +
 * scrobble work.
 */
export function createNativeBridge(): PlayerBridge {
  let snap: PlayerSnapshot = { ...emptySnapshot };
  const listeners = new Set<(s: PlayerSnapshot) => void>();
  const pluginListeners: PluginListener[] = [];
  let disposed = false;
  // The native players take metadata with the load itself (iOS Now Playing /
  // lock screen), so setMediaInfo stashes the title for the next load rather
  // than pushing it live. use-player-media calls setMediaInfo synchronously in
  // its effect while useBridgeLoad's load fires after an await, so the stash is
  // populated in time, and it survives auto-retry / stream-switch reloads.
  let mediaTitle: string | undefined;
  // Mirrored locally: the plugin reports position/rate on tick but never
  // volume, and mute is expressed as volume 0 on the native side.
  let volume = 1;
  let muted = false;
  let rate = 1;
  // Bumped per load, so a subtitle still downloading for the previous title
  // never lands on the next one.
  let loadGeneration = 0;
  const externalByPath = new Map<string, ExternalSubtitle>();
  let subtitleCleanups: Array<() => void> = [];

  const releaseSubtitles = () => {
    for (const cleanup of subtitleCleanups) {
      try {
        cleanup();
      } catch {
        /* the temp file is already gone */
      }
    }
    subtitleCleanups = [];
    externalByPath.clear();
  };

  // Folds what the JS side knows about a subtitle it added back into the track
  // mpv reports, the way the desktop bridge maps external-filename to metadata.
  const withExternal = (info: TrackInfo): TrackInfo => {
    const ext = info.externalFilename ? externalByPath.get(info.externalFilename) : undefined;
    if (!ext) return info;
    const m = ext.metadata;
    return {
      ...info,
      lang: ext.lang || info.lang,
      title: ext.title || info.title,
      url: ext.url,
      originalUrl: m?.originalUrl ?? ext.url,
      forced: info.forced || m?.forced === true,
      hearingImpaired: info.hearingImpaired || m?.hearingImpaired === true,
      format: m?.format,
      release: m?.release,
      provider: m?.provider,
      providerDerived: m?.providerDerived,
      fps: m?.fps,
      downloads: m?.downloads,
      author: m?.author,
      uploadedAt: m?.uploadedAt,
      rating: m?.rating,
      productionType: m?.productionType,
      releaseType: m?.releaseType,
      foreignOnly: m?.foreignOnly,
      machineTranslated: m?.machineTranslated,
      fromTrusted: m?.fromTrusted,
      providerMatch: m?.providerMatch,
      downloadAuth: m?.downloadAuth,
      prepared: m?.prepared,
      autoSelectionEligible: m?.autoSelectionEligible,
    };
  };

  const emit = () => {
    const s = snap;
    for (const l of listeners) l(s);
  };
  const patch = (p: Partial<PlayerSnapshot>) => {
    snap = { ...snap, ...p };
    emit();
  };

  const ensureListeners = async () => {
    if (pluginListeners.length > 0 || disposed) return;
    pluginListeners.push(
      await addPluginListener("harbor-player", "tick", (t: Tick) => {
        // Only once the engine reports a real size, and only when it changes: this
        // runs about once a second and patching identical numbers would re-render
        // the shell for nothing.
        if (
          typeof t.videoWidth === "number" &&
          typeof t.videoHeight === "number" &&
          t.videoWidth > 0 &&
          t.videoHeight > 0 &&
          (t.videoWidth !== snap.videoWidth || t.videoHeight !== snap.videoHeight)
        ) {
          // Once per change, into the buffer the Diagnostics screen shows. Where the
          // picture SITS cannot be read reliably from a screenshot - twice now a
          // layout has been called broken from one and turned out correct - but the
          // decoded size against the viewport states it exactly. If a rotation leaves
          // the picture wrong, this is the difference between a measurement and
          // another guess.
          console.warn(
            `[player] picture ${t.videoWidth}x${t.videoHeight} viewport ${window.innerWidth}x${window.innerHeight}`,
          );
          patch({ videoWidth: t.videoWidth, videoHeight: t.videoHeight });
        }
        patch({
          positionSec: t.positionSec,
          durationSec: t.durationSec || snap.durationSec,
          bufferedSec: t.bufferedSec,
          rate: typeof t.rate === "number" && t.rate > 0 ? t.rate : snap.rate,
          status: t.playing
            ? "playing"
            : snap.status === "loading"
              ? "loading"
              : snap.status === "ended"
                ? "ended"
                : "paused",
          buffering: false,
        });
      }),
      await addPluginListener("harbor-player", "state", (st: State) => {
        if (st.engine === "mpv" || st.engine === "av") {
          const previous = nativeEngine();
          setNativeEngine(st.engine);
          // A new mpv core starts with mpv's own subtitle look. Its sub-* options
          // persist across files on the same core, so the style only has to follow
          // the engine's arrival, not every load.
          if (st.engine === "mpv" && previous !== "mpv" && lastSubStyle) {
            nativeInvoke("set_sub_style", lastSubStyle);
          }
        }
        // Only once the engine reports a real decoded size. Absent on Android and
        // before the first frame, and the shell shows no quality badge until then
        // rather than guessing one from the stream title.
        if (typeof st.videoWidth === "number" && typeof st.videoHeight === "number") {
          if (st.videoWidth > 0 && st.videoHeight > 0) {
            patch({ videoWidth: st.videoWidth, videoHeight: st.videoHeight });
          }
        }
        if (st.status === "error") {
          patch({ status: "error", errorCode: mapError(st.errorCode), errorMessage: st.errorCode ?? "Playback error" });
        } else if (st.status === "ready") {
          patch({ status: snap.status === "paused" ? "paused" : "playing", buffering: false });
        } else if (st.status === "loading") {
          patch({ buffering: true });
        } else if (st.status === "ended") {
          patch({ status: "ended" });
        }
      }),
      await addPluginListener("harbor-player", "closed", (c: Closed) => {
        // Genuine teardown of the native Activity (user backed out / finished).
        // Stream swaps reuse the singleTask Activity via onNewIntent and no longer
        // emit "closed" (see PlayerActivity.releasePlayer notify flag), and a
        // JS-initiated destroy() flips `disposed` first, so this reliably means
        // the native player surface is gone. Flag it so the React view pops back.
        if (disposed) return;
        patch({
          positionSec: c.positionSec,
          durationSec: c.durationSec || snap.durationSec,
          status: "ended",
          nativeClosed: true,
        });
      }),
      await addPluginListener("harbor-player", "tracks", (t: TracksEvent) => {
        const next: Partial<PlayerSnapshot> = {
          audioTracks: (t.audio ?? []).map((a) => toTrackInfo(a, "audio")),
          subtitleTracks: (t.subtitle ?? []).map((s) => withExternal(toTrackInfo(s, "subtitle"))),
        };
        // Absent on Android and on the AV engine, where the snapshot keeps its
        // empty list rather than being cleared by a payload that never had one.
        if (Array.isArray(t.chapters)) {
          next.chapters = t.chapters
            .filter((c) => typeof c.startSec === "number" && Number.isFinite(c.startSec))
            .map((c): Chapter => ({ title: c.title ?? "", startSec: c.startSec }));
        }
        patch(next);
        if (typeof t.videoFps === "number" && t.videoFps > 0) {
          setNativeSubFpsState({ videoFps: t.videoFps });
        }
      }),
      // The overlay cannot resolve a stream itself, so it asks. Forwarded as a
      // window event because the player view owns the episode logic and this
      // module has no route back to it.
      await addPluginListener("harbor-player", "action", (a: { kind?: string }) => {
        if (!a?.kind) return;
        window.dispatchEvent(new CustomEvent(NATIVE_PLAYER_ACTION_EVENT, { detail: a.kind }));
      }),
    );
  };

  const noop = () => {};
  const noopAsync = async () => {};

  return {
    attach: noop,
    detach: noop,
    async load(src: PlayerSource) {
      await ensureListeners();
      loadGeneration += 1;
      releaseSubtitles();
      setNativeSubFpsState({ subFps: 0, videoFps: 0 });
      snap = { ...emptySnapshot, status: "loading", volume, muted, rate };
      emit();
      const webChrome = nativeWebChrome();
      setNativeVideoBehind(webChrome);
      // Undefined title is dropped by JSON serialization, and the Rust
      // LoadRequest treats a missing title as None.
      await invoke("plugin:harbor-player|load", {
        payload: {
          // A saved download is an absolute path; both native players want a URL.
          url: toNativeFileUrl(src.url),
          headers: src.headers ?? {},
          subtitles: (src.subtitles ?? []).map((s) => ({
            url: s.url,
            lang: s.lang,
            label: s.lang ?? s.id,
          })),
          startAtSec: src.startAtSec ?? 0,
          title: mediaTitle,
          canNext: canNextEpisode,
          webChrome,
        },
      });
      // A reload keeps the user's transport settings; the plugin starts fresh.
      if (rate !== 1) nativeInvoke("set_rate", { rate });
      if (muted || volume !== 1) nativeInvoke("set_volume", { volume: muted ? 0 : volume });
    },
    async play() {
      await invoke("plugin:harbor-player|play").catch(noop);
    },
    pause() {
      void invoke("plugin:harbor-player|pause").catch(noop);
    },
    seek(sec: number) {
      void invoke("plugin:harbor-player|seek", { payload: { positionSec: sec } }).catch(noop);
    },
    setVolume(v: number) {
      volume = Math.max(0, Math.min(1, v));
      patch({ volume });
      if (!muted) nativeInvoke("set_volume", { volume });
    },
    setMuted(m: boolean) {
      muted = m;
      patch({ muted });
      nativeInvoke("set_volume", { volume: m ? 0 : volume });
    },
    setRate(r: number) {
      rate = r > 0 ? r : 1;
      patch({ rate });
      nativeInvoke("set_rate", { rate });
    },
    setAudioTrack(id: string) {
      void invoke("plugin:harbor-player|set_audio_track", { payload: { trackId: id } }).catch(noop);
    },
    setSubtitleTrack(id: string | null) {
      void invoke("plugin:harbor-player|set_subtitle_track", { payload: { trackId: id } }).catch(noop);
    },
    // mpv draws the second line itself (secondary-sid), so nothing reaches the
    // web subtitle overlay. AVPlayer has no second subtitle slot.
    setSecondarySubtitleTrack(id: string | null) {
      if (nativeEngine() !== "mpv") return;
      nativeInvoke("set_secondary_subtitle_track", { trackId: id });
    },
    setSubVisible(on: boolean) {
      if (nativeEngine() !== "mpv") return;
      nativeInvoke("set_sub_visible", { visible: on });
    },
    setSubDelay(sec: number) {
      patch({ subDelaySec: sec });
      nativeInvoke("set_sub_delay", { seconds: sec });
    },
    setAudioDelay(sec: number) {
      patch({ audioDelaySec: sec });
      nativeInvoke("set_audio_delay", { seconds: sec });
    },
    setPanscan: noop,
    setVideoZoom: noop,
    setAspectOverride: noop,
    setStretch: noop,
    setVideoEq: noop,
    setAnime4kShaders: noop,
    // The desktop mpv path, minus the desktop-only selection queue: provider and
    // search results are downloaded and prepared in JS (encoding repair, zip
    // extraction, auth headers) into a temp file mpv reads, and the metadata is
    // kept against that path for the menu. AVPlayer cannot take a sidecar.
    async addSubtitle(
      url: string,
      lang?: string,
      title?: string,
      select?: boolean,
      metadata?: SubtitleLoadMetadata,
    ): Promise<boolean> {
      if (nativeEngine() !== "mpv") return false;
      const generation = loadGeneration;
      const providerDerived = metadata?.providerDerived ?? Boolean(metadata?.provider);
      const transferred = takePreparedSubtitle(url);
      if (!transferred && providerDerived && !isSafeProviderSubtitleUrl(url)) return false;
      let target = url;
      let cues = transferred?.cues;
      let cleanup: (() => void) | null = transferred?.cleanup ?? null;
      if (transferred) {
        target = transferred.playableUrl;
      } else if (/^https?:/i.test(url)) {
        const requestHeaders = subtitleTrackDownloadHeaders(metadata?.downloadAuth, url, providerDerived);
        try {
          const prepared = await prepareSubtitle({
            url,
            language: lang,
            format: metadata?.format,
            encoding: metadata?.encoding,
            release: metadata?.release,
            filename: metadata?.rawFilename,
            requestHeaders,
          });
          target = prepared.playableUrl;
          cues = prepared.cues;
          cleanup = prepared.cleanup;
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          if (/status 429/.test(message)) {
            markLimitReached(url);
            return false;
          }
          // Preparation writes a temp file on device; if that step is what failed,
          // a plain public URL can still go straight to mpv, which fetches it
          // itself. Anything that needed provider auth headers cannot.
          if (providerDerived || (requestHeaders && Object.keys(requestHeaders).length > 0)) {
            return false;
          }
        }
      } else if (/^file:\/\//i.test(url)) {
        try {
          target = decodeURIComponent(url.replace(/^file:\/\//i, ""));
        } catch {
          target = url.replace(/^file:\/\//i, "");
        }
      }
      if (disposed || generation !== loadGeneration) {
        cleanup?.();
        return false;
      }
      externalByPath.set(target, { url, lang, title, cues, metadata });
      try {
        await invoke("plugin:harbor-player|add_subtitle", {
          payload: { url: target, title: title ?? null, lang: lang ?? null, select: select ?? true },
        });
      } catch {
        externalByPath.delete(target);
        cleanup?.();
        return false;
      }
      if (cleanup) subtitleCleanups.push(cleanup);
      return true;
    },
    getSelectedTrackCues(): SubCue[] | null {
      const selected = snap.subtitleTracks.find((t) => t.selected);
      const ext = selected?.externalFilename ? externalByPath.get(selected.externalFilename) : undefined;
      return ext?.cues && ext.cues.length > 0 ? ext.cues : null;
    },
    getSelectedTrackUrl(): string | null {
      const selected = snap.subtitleTracks.find((t) => t.selected);
      if (!selected?.external || !selected.externalFilename) return null;
      return externalByPath.get(selected.externalFilename)?.url ?? selected.externalFilename;
    },
    setAudioNormalize: noop,
    setMediaInfo(info) {
      mediaTitle = info.title || undefined;
    },
    async screenshot() {
      return { ok: false, error: "not supported" };
    },
    setAbLoop: noop,
    async requestPiP() {
      await invoke("plugin:harbor-player|enter_pip").catch(noop);
    },
    exitPiP: noopAsync,
    requestFullscreen: noopAsync,
    exitFullscreen: noopAsync,
    capabilities(): PlayerCapabilities {
      return nativeCapabilities();
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snap);
      return () => listeners.delete(listener);
    },
    destroy() {
      disposed = true;
      releaseSubtitles();
      setNativeSubFpsState({ subFps: 0, videoFps: 0 });
      setNativeVideoBehind(false);
      setNativeEngine(null);
      void invoke("plugin:harbor-player|stop").catch(noop);
      for (const pl of pluginListeners) void pl.unregister().catch(noop);
      pluginListeners.length = 0;
      listeners.clear();
    },
  };
}

function toTrackInfo(t: NativeTrack, kind: "audio" | "subtitle"): TrackInfo {
  return {
    id: t.id,
    label: t.label || t.lang || (kind === "audio" ? "Audio" : "Subtitle"),
    lang: t.lang || undefined,
    kind,
    selected: !!t.selected,
    channelCount: t.channelCount,
    // Uppercased like the desktop bridge, which is what the text-versus-image
    // subtitle checks (isTextSubTrack) and the menu's codec label expect.
    codec: t.codec ? t.codec.toUpperCase() : undefined,
    title: t.title || undefined,
    forced: t.forced === true,
    default: t.default === true,
    hearingImpaired: t.hearingImpaired === true,
    external: t.external === true,
    externalFilename: t.externalFilename || undefined,
    secondary: t.secondary === true,
  };
}

function mapError(code?: string): PlayerSnapshot["errorCode"] {
  if (!code) return "unknown";
  const c = code.toUpperCase();
  if (c.includes("DECOD")) return "decode";
  if (c.includes("IO") || c.includes("NETWORK") || c.includes("HTTP")) return "network";
  if (c.includes("SOURCE") || c.includes("PARSING") || c.includes("CONTAINER")) return "source";
  return "unknown";
}
