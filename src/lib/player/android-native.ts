import { invoke, addPluginListener, type PluginListener } from "@tauri-apps/api/core";
import { isMobileNative } from "@/lib/platform";
import type { SubCue } from "@/lib/subtitles/parser";
import {
  emptySnapshot,
  type PlayerBridge,
  type PlayerCapabilities,
  type PlayerSnapshot,
  type PlayerSource,
  type TrackInfo,
} from "./bridge";

type Tick = { positionSec: number; durationSec: number; bufferedSec: number; playing: boolean };
type State = { status: "loading" | "ready" | "ended" | "error"; errorCode?: string };
type Closed = { positionSec: number; durationSec: number };
type NativeTrack = {
  id: string;
  label: string;
  lang?: string;
  selected: boolean;
  channelCount?: number;
};
type TracksEvent = { audio: NativeTrack[]; subtitle: NativeTrack[] };

export type OrientationLock = "landscape" | "portrait" | "auto";

let pendingRestore: ReturnType<typeof setTimeout> | null = null;

/**
 * Forces device orientation on native mobile builds. "landscape" locks the play
 * flow (connecting screen through playback) the way every streaming app does;
 * "auto" restores free rotation on exit. No-op on desktop/web. Despite the file
 * name this drives both iOS and Android (see createNativeBridge).
 *
 * The connecting screen and the player are separate nav frames, so committing to
 * a stream unmounts the first (which restores) and mounts the second (which
 * re-locks) back to back. Deferring the "auto" restore one frame lets an
 * immediately following "landscape" cancel it, so that handoff never flashes
 * portrait; a genuine exit has no follow-up lock and the restore lands.
 */
export async function setOrientation(mode: OrientationLock): Promise<void> {
  if (!isMobileNative()) return;
  if (pendingRestore) {
    clearTimeout(pendingRestore);
    pendingRestore = null;
  }
  if (mode === "auto") {
    pendingRestore = setTimeout(() => {
      pendingRestore = null;
      void invoke("plugin:harbor-player|set_orientation", { payload: { mode: "auto" } }).catch(() => {});
    }, 260);
    return;
  }
  await invoke("plugin:harbor-player|set_orientation", { payload: { mode } }).catch(() => {});
}

const CAPS: PlayerCapabilities = {
  engine: "native",
  pictureInPicture: true,
  airplay: false,
  chromecast: false,
  hdrPassthrough: true,
  hardwareDecode: true,
};

/**
 * PlayerBridge backed by the native mobile plugin (tauri-plugin-harbor-player):
 * media3/ExoPlayer in its own fullscreen Android Activity, AVPlayer in its own
 * fullscreen iOS view controller. This bridge forwards load/transport commands
 * and mirrors the player's position/state into a PlayerSnapshot so resume +
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
    );
  };

  const noop = () => {};
  const noopAsync = async () => {};

  return {
    attach: noop,
    detach: noop,
    async load(src: PlayerSource) {
      await ensureListeners();
      snap = { ...emptySnapshot, status: "loading" };
      emit();
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
        },
      });
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
    setVolume: noop,
    setMuted: noop,
    setRate: noop,
    setAudioTrack(id: string) {
      void invoke("plugin:harbor-player|set_audio_track", { payload: { trackId: id } }).catch(noop);
    },
    setSubtitleTrack(id: string | null) {
      void invoke("plugin:harbor-player|set_subtitle_track", { payload: { trackId: id } }).catch(noop);
    },
    setSecondarySubtitleTrack: noop,
    setSubVisible: noop,
    setSubDelay: noop,
    setAudioDelay: noop,
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
      return CAPS;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snap);
      return () => listeners.delete(listener);
    },
    destroy() {
      disposed = true;
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
