// Touch feedback for the mobile player, funneled through a single call site so a
// future native Tauri haptics plugin swaps in one place. navigator.vibrate is a
// no-op on desktop and on iOS WKWebView (ignored there); Android touch surfaces
// get the buzz for free. Never throws — feedback is never load-bearing.
//
// Three intensities map the meaning of the interaction, not a raw duration:
//   light()  — a small discrete tick (a seek tap, crossing an edge)
//   medium() — a committing action (dismiss, snap, detent select)
//   select() — a selection landing (radio pick, play/pause, source swap)

import { isMobileNative } from "@/lib/platform";
import { nativeHaptic, type NativeHapticKind } from "./native-host";

function buzz(pattern: number | number[], kind: NativeHapticKind): void {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) {
    // WKWebView has no vibrate API; the native plugin drives UIFeedbackGenerator.
    if (isMobileNative()) nativeHaptic(kind);
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function light(): void {
  buzz(7, "light");
}

export function medium(): void {
  buzz(14, "medium");
}

export function select(): void {
  buzz(10, "select");
}

export const haptics = { light, medium, select };
