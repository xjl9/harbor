// Duplicated from mobile-settings (FOCUS token :40-41, tapHaptic :46-55); single
// source for the onboarding folder. Extract to a shared mobile module next cycle
// when mobile-settings is unfrozen.

// Shared focus token: the same amber scalpel, so focus reads instantly on a
// TV/gamepad as well as touch.
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Light-impact feedback, gated: navigator.vibrate is a no-op on desktop (no
// vibration hardware) and fires on Android touch surfaces.
export function tapHaptic() {
  if (typeof navigator === "undefined") return;
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }
}
