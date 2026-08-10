import { invoke, addPluginListener, type PluginListener } from "@tauri-apps/api/core";
import type { SubCue } from "@/lib/subtitles/parser";
import {
  emptySnapshot,
  type PlayerBridge,
  type PlayerCapabilities,
  type PlayerSnapshot,
  type PlayerSource,
} from "./bridge";

type Tick = { positionSec: number; durationSec: number; bufferedSec: number; playing: boolean };
type State = { status: "loading" | "ready" | "ended" | "error"; errorCode?: string };
type Closed = { positionSec: number; durationSec: number };

const CAPS: PlayerCapabilities = {
  engine: "native",
  pictureInPicture: true,
  airplay: false,
  chromecast: false,
  hdrPassthrough: true,
  hardwareDecode: true,
};

/**
 * PlayerBridge backed by the native Android media3/ExoPlayer plugin
 * (tauri-plugin-harbor-player). The native player runs in its own fullscreen
 * Activity; this bridge forwards load/transport commands and mirrors the
 * player's position/state into a PlayerSnapshot so resume + scrobble work.
 */
export function createNativeBridge(): PlayerBridge {
  let snap: PlayerSnapshot = { ...emptySnapshot };
  const listeners = new Set<(s: PlayerSnapshot) => void>();
  const pluginListeners: PluginListener[] = [];
  let disposed = false;

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
          status: t.playing ? "playing" : snap.status === "loading" ? "loading" : "paused",
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
        patch({ positionSec: c.positionSec, durationSec: c.durationSec || snap.durationSec, status: "ended" });
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
    setAudioTrack: noop,
    setSubtitleTrack: noop,
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
    async screenshot() {
      return { ok: false, error: "not supported" };
    },
    setAbLoop: noop,
    requestPiP: noopAsync,
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

function mapError(code?: string): PlayerSnapshot["errorCode"] {
  if (!code) return "unknown";
  const c = code.toUpperCase();
  if (c.includes("DECOD")) return "decode";
  if (c.includes("IO") || c.includes("NETWORK") || c.includes("HTTP")) return "network";
  if (c.includes("SOURCE") || c.includes("PARSING") || c.includes("CONTAINER")) return "source";
  return "unknown";
}
