import { createHtml5Bridge } from "@/lib/player/html5";
import { createMpvBridge, probeMpv, type MpvRect } from "@/lib/player/mpv";
import { createNativeBridge } from "@/lib/player/android-native";
import type { PlayerBridge } from "@/lib/player/bridge";
import { isLinuxDesktop, isMacDesktop, isMobileNative, isWindowsDesktop, osClass } from "@/lib/platform";

export const SYNC_DRIFT_TOLERANCE_S = 0.6;
export const SYNC_SUPPRESS_MS = 1400;
export const SYNC_PLAY_LOOKAHEAD_S = 0.4;
export const SYNC_MAX_AGE_S = 30;
export const SYNC_SEEK_JUMP_S = 10;
export const HOST_HEARTBEAT_MS = 1000;
export const GUEST_ESCAPE_MS = 45_000;
export const READY_STALE_MS = 20_000;
export const SEEK_APPLY_DEBOUNCE_MS = 120;
export const DURATION_MISMATCH_S = 4;
export const ROOM_STALL_MS = 9000;
export const SLOW_LOAD_MS = 50_000;
export const STUCK_AUTORETRY_MS = 18_000;
export const NEVER_STARTED_CEILING_MS = 45_000;
export const BLACK_SCREEN_GRACE_MS = 6_000;
export const MAX_AUTORETRY_ATTEMPTS = 5;
export const CHROME_HIDE_MS_PLAYING = 1800;
export const CHROME_HIDE_MS_PAUSED = 4500;
export const CHROME_HIDE_MS_RESUME = 1000;
// Touch needs a longer window than a mouse: there is no hover to signal presence,
// so controls must linger after a reveal tap. Matches the Netflix/YouTube feel.
export const CHROME_HIDE_MS_MOBILE = 3000;

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function embedFlags(
  engine: "html5" | "mpv" | "native",
  mpvEmbed: boolean,
  videoWidth: number,
  videoHeight: number,
): { mpvEmbedWindowsActive: boolean; stageBg: string } {
  const embedOn = engine === "mpv" && mpvEmbed;
  const mpvEmbedWindowsActive = embedOn && isWindowsDesktop();
  const hasFrame = videoWidth > 0 && videoHeight > 0;
  const macShowing = embedOn && isMacDesktop() && hasFrame;
  const linuxShowing = embedOn && isLinuxDesktop() && hasFrame;
  return {
    mpvEmbedWindowsActive,
    stageBg: mpvEmbedWindowsActive || macShowing || linuxShowing ? "" : "bg-black",
  };
}

// What WKWebView's <video> can actually decode: the MP4 family and HLS. Handed an
// MKV, or HEVC/AC3 inside one, it does not raise an error, it simply never fires
// loadeddata, which is exactly what "the in-app player keeps loading" looks like
// from the outside. Anything unrecognised counts as not playable, because the
// fallback is the native surface, which plays everything.
const IOS_WEBVIEW_PLAYABLE = /\.(mp4|m4v|mov|webm|m3u8)(\?|#|$)/i;

export function iosWebviewCanPlay(url: string | undefined): boolean {
  if (!url) return false;
  try {
    // Relative base so a bare path is still parsed rather than throwing.
    return IOS_WEBVIEW_PLAYABLE.test(new URL(url.trim(), "http://harbor.local").pathname);
  } catch {
    return false;
  }
}

export function formatNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export async function pickBridge(
  want: "auto" | "html5" | "mpv" | "native",
  engineSetting: "auto" | "html5" | "mpv" | "native",
  notWebReady: boolean,
  mpvOpts: {
    anime4k: boolean;
    hdrToSdr: boolean;
    rtxHdr?: boolean;
    rtxVsr?: boolean;
    embed?: boolean;
    anime4kShaders?: string[];
    d3d11Flip?: boolean;
    macEdr?: boolean;
    extraOptions?: string;
    fullDownload?: boolean;
    getEmbedRect?: () => Promise<MpvRect | null> | MpvRect | null;
  },
  srcUrl?: string,
): Promise<{ bridge: PlayerBridge; engine: "html5" | "mpv" | "native" }> {
  // Native mobile build: the native player (media3/ExoPlayer on Android,
  // AVPlayer on iOS) decodes MKV/HEVC the webview can't, so it stays the
  // default. On iOS an explicit html5 engine setting is honored as a
  // deliberate escape hatch to the in-webview player. The hatch checks the raw
  // setting, not `want`: live content force-computes `want` to html5 for the
  // desktop/web path and must still get the native surface here (Android
  // already ignores `want` entirely).
  if (isMobileNative()) {
    // The hatch only opens for something the webview can decode. It used to open
    // for anything, so choosing the in-app player and then playing an MKV handed
    // the source to a <video> that could never open it and sat on a spinner with
    // no error and no way out. The native surface plays every format, so falling
    // back to it costs the chrome the setting asked for and nothing else.
    if (osClass() === "ios" && engineSetting === "html5" && iosWebviewCanPlay(srcUrl)) {
      return { bridge: createHtml5Bridge(), engine: "html5" };
    }
    return { bridge: createNativeBridge(), engine: "native" };
  }
  if (want === "html5") return { bridge: createHtml5Bridge(), engine: "html5" };
  if (want === "mpv") {
    const probe = await probeMpv();
    if (probe.available) return { bridge: createMpvBridge(mpvOpts), engine: "mpv" };
    console.warn("[harbor] mpv requested but libmpv probe failed; falling back to in-webview html5 decode (high memory). Reason:", probe.error);
    return { bridge: createHtml5Bridge(), engine: "html5" };
  }
  const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isDesktop || notWebReady) {
    const probe = await probeMpv();
    if (probe.available) return { bridge: createMpvBridge(mpvOpts), engine: "mpv" };
    if (isDesktop) console.warn("[harbor] desktop libmpv probe failed; falling back to in-webview html5 decode (high memory). Reason:", probe.error);
  }
  return { bridge: createHtml5Bridge(), engine: "html5" };
}
