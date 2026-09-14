// Cross-surface intents for the phone shell. A surface outside the tab tree (a
// fullscreen picker modal, for example) cannot reach state that lives inside a
// tab, and the target tab is not mounted yet when the request is made, so a bare
// event would be missed. The flag survives the tab switch and the destination
// consumes it on mount.

export const MOBILE_INTENT_EVENT = "harbor:mobile-intent";

// "debrid" has no sub-screen: debrid keys are managed on the profile page
// itself, so arriving at that tab is the whole action. "library" is the same
// shape for the My Stuff tab, which the section menu on the home tab cannot
// switch to on its own. "theme" opens the theme picker, which the shell hosts
// itself so any surface (a settings row, an onboarding step) can send the user
// there without owning the page.
export type MobileIntent = "addons" | "settings" | "debrid" | "theme" | "library";

let pending: MobileIntent | null = null;

export function requestMobileIntent(intent: MobileIntent): void {
  pending = intent;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MOBILE_INTENT_EVENT, { detail: intent }));
}

export function consumeMobileIntent(intent: MobileIntent): boolean {
  if (pending !== intent) return false;
  pending = null;
  return true;
}
