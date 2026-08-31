import { invoke } from "@tauri-apps/api/core";
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

/**
 * Capabilities for the native bridge, keyed on the iOS engine. AirPlay and PiP
 * only exist on the AVPlayer path (the mpv controller has neither a route
 * picker nor a PiP controller). Subtitle add/style/sync all depend on the web
 * subtitle renderer, which the native surfaces bypass. Android keeps its native
 * chrome, so the flags only matter to the iOS shell.
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
    addSubtitle: false,
    subStyle: false,
    subSync: false,
  };
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
