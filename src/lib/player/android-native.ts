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
import {
  nativeCapabilities,
  nativeInvoke,
  nativeWebChrome,
  setNativeEngine,
  setNativeVideoBehind,
  type NativeEngine,
} from "./native-host";
import {
  emptySnapshot,
  type PlayerBridge,
  type PlayerCapabilities,
  type PlayerSnapshot,
  type PlayerSource,
  type TrackInfo,
} from "./bridge";

export { setOrientation, type OrientationLock } from "./native-orientation";
export { nativeEngine, showNativeRoutePicker } from "./native-host";

type Tick = { positionSec: number; durationSec: number; bufferedSec: number; playing: boolean; rate?: number };
type State = { status: "loading" | "ready" | "ended" | "error"; errorCode?: string; engine?: NativeEngine };
type Closed = { positionSec: number; durationSec: number };
type NativeTrack = {
  id: string;
  label: string;
  lang?: string;
  selected: boolean;
  channelCount?: number;
};
type TracksEvent = { audio: NativeTrack[]; subtitle: NativeTrack[] };

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
        if (st.engine === "mpv" || st.engine === "av") setNativeEngine(st.engine);
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
        patch({
          audioTracks: (t.audio ?? []).map((a) => toTrackInfo(a, "audio")),
          subtitleTracks: (t.subtitle ?? []).map((s) => toTrackInfo(s, "subtitle")),
        });
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
      snap = { ...emptySnapshot, status: "loading", volume, muted, rate };
      emit();
      const webChrome = nativeWebChrome();
      setNativeVideoBehind(webChrome);
      // Undefined title is dropped by JSON serialization, and the Rust
      // LoadRequest treats a missing title as None.
      await invoke("plugin:harbor-player|load", {
        payload: {
          url: src.url,
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
    setSecondarySubtitleTrack: noop,
    setSubVisible: noop,
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
    async addSubtitle() {
      return false;
    },
    getSelectedTrackCues(): SubCue[] | null {
      return null;
    },
    getSelectedTrackUrl(): string | null {
      return null;
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
