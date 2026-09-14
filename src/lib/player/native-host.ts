import { invoke } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { isMobileNative, osClass } from "@/lib/platform";
import type { PlayerCapabilities } from "./bridge";

// Which decoder the iOS plugin picked for the current load. Android always
// runs media3 and never reports one, so it stays null there.
export type NativeEngine = "mpv" | "av";

// Set on <html> while the native video view sits behind the web view, so the
// DOM can go transparent and let the picture through (see index.css).
export const NATIVE_VIDEO_BEHIND_CLASS = "native-video-behind";

let engine: NativeEngine | null = null;
const engineListeners = new Set<(e: NativeEngine | null) => void>();

export function nativeEngine(): NativeEngine | null {
  return engine;
}

export function setNativeEngine(next: NativeEngine | null): void {
  if (engine === next) return;
  engine = next;
  for (const l of engineListeners) l(engine);
}

export function onNativeEngineChange(listener: (e: NativeEngine | null) => void): () => void {
  engineListeners.add(listener);
  return () => engineListeners.delete(listener);
}

// iOS renders the native player as a child view behind a transparent web
// view, so the React shell draws the chrome. Android still presents its own
// fullscreen Activity with native controls.
export function nativeWebChrome(): boolean {
  return osClass() === "ios";
}

export function setNativeVideoBehind(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(NATIVE_VIDEO_BEHIND_CLASS, on);
}

export function useNativeEngine(): NativeEngine | null {
  return useSyncExternalStore(onNativeEngineChange, nativeEngine, nativeEngine);
}

/**
 * Capabilities for the native bridge, keyed on the iOS engine. AirPlay and PiP
 * only exist on the AVPlayer path (the mpv controller has neither a route
 * picker nor a PiP controller). The mpv engine takes external subtitle files
 * (sub-add), renders its own subtitles from the same sub-* properties the
 * desktop styles, and exposes sub-fps, so it gets the full subtitle menu, the
 * style sheet and manual timing. AVFoundation can do none of that for a
 * progressive asset, so the AV engine keeps them off. Android keeps its native
 * chrome and never reports an engine, so every engine-gated flag stays off there.
 * Chromecast stays off on iOS: discovery needs Bonjour service types and the
 * multicast entitlement the sideloaded build does not carry.
 */
export function nativeCapabilities(): PlayerCapabilities {
  const ios = osClass() === "ios";
  const av = engine === "av";
  const mpv = engine === "mpv";
  return {
    engine: "native",
    pictureInPicture: ios ? av : true,
    airplay: ios && av,
    chromecast: false,
    hdrPassthrough: true,
    hardwareDecode: true,
    rate: true,
    volume: true,
    subDelay: mpv,
    audioDelay: mpv,
    addSubtitle: mpv,
    subStyle: mpv,
    subSync: mpv,
  };
}

// Subtitle FPS state for the native mpv engine. The desktop panel reads these
// straight from libmpv over invoke; the phone has no such command, so the plugin
// reports the container frame rate with its tracks and the bridge remembers the
// correction it last applied. Reset on every load, like the desktop transition.
export type NativeSubFpsState = { videoFps: number; subFps: number };
let subFpsState: NativeSubFpsState = { videoFps: 0, subFps: 0 };
const subFpsListeners = new Set<() => void>();

export function setNativeSubFpsState(patch: Partial<NativeSubFpsState>): void {
  const next = { ...subFpsState, ...patch };
  if (next.videoFps === subFpsState.videoFps && next.subFps === subFpsState.subFps) return;
  subFpsState = next;
  for (const l of subFpsListeners) l();
}

function subscribeSubFps(cb: () => void): () => void {
  subFpsListeners.add(cb);
  return () => subFpsListeners.delete(cb);
}

export function useNativeSubFpsState(): NativeSubFpsState {
  return useSyncExternalStore(subscribeSubFps, () => subFpsState, () => subFpsState);
}

// Fire-and-forget plugin call for commands only iOS implements. Android
// rejects with "not implemented", which is the expected quiet outcome.
export function nativeInvoke(command: string, payload?: Record<string, unknown>): void {
  if (!isMobileNative()) return;
  try {
    void invoke(`plugin:harbor-player|${command}`, payload === undefined ? undefined : { payload }).catch(
      () => {},
    );
  } catch {
    /* ignore */
  }
}

export function showNativeRoutePicker(): void {
  nativeInvoke("show_route_picker", {});
}

export type NativeHapticKind = "light" | "medium" | "heavy" | "select";

export function nativeHaptic(kind: NativeHapticKind): void {
  if (osClass() !== "ios") return;
  nativeInvoke("haptic", { kind });
}
