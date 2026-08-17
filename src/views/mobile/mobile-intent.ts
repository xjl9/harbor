// Cross-surface intents for the phone shell. A surface outside the tab tree (a
// fullscreen picker modal, for example) cannot reach state that lives inside a
// tab, and the target tab is not mounted yet when the request is made, so a bare
// event would be missed. The flag survives the tab switch and the destination
// consumes it on mount.

export const MOBILE_INTENT_EVENT = "harbor:mobile-intent";

// "debrid" has no sub-screen of its own: debrid keys are managed on the profile
// page itself, so switching to that tab is the whole action. It still goes
// through the flag so the destination clears it and a later visit cannot
// re-trigger.
type Intent = "addons" | "settings" | "debrid";

let pending: Intent | null = null;

export function requestMobileIntent(intent: Intent): void {
  pending = intent;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MOBILE_INTENT_EVENT, { detail: intent }));
}

export function consumeMobileIntent(intent: Intent): boolean {
  if (pending !== intent) return false;
  pending = null;
  return true;
}
