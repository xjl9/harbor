// Touch feedback for the mobile player, funneled through a single call site so a
// future native Tauri haptics plugin swaps in one place. navigator.vibrate is a
// no-op on desktop and on iOS WKWebView (ignored there); Android touch surfaces
// get the buzz for free. Never throws — feedback is never load-bearing.
//
// Three intensities map the meaning of the interaction, not a raw duration:
//   light()  — a small discrete tick (a seek tap, crossing an edge)
//   medium() — a committing action (dismiss, snap, detent select)
//   select() — a selection landing (radio pick, play/pause, source swap)

function buzz(pattern: number | number[]): void {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}

export function light(): void {
  buzz(7);
}

export function medium(): void {
  buzz(14);
}

export function select(): void {
  buzz(10);
}

export const haptics = { light, medium, select };
