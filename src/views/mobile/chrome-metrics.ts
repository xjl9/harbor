// Bottom-anchored mobile surfaces have to clear the floating tab bar and, when a
// stream is up, the now playing bar stacked above it. mobile-shell measures both
// and publishes --mobile-chrome-h on the document.
//
// The measurement is `window.innerHeight - barTop`, so --mobile-chrome-h already
// spans the bar, its own bottom padding AND the home-indicator inset underneath.
// Adding env(safe-area-inset-bottom) on top of it therefore counted that inset
// twice, parking about 34px of dead space under the last row of every scrolling
// tab on a notched phone.
//
// The floor still has to carry the inset itself, because it is what applies
// before the first measurement lands or outside the shell entirely, where nothing
// has measured the bar. 72px is the bar without an indicator, so the floor comes
// out at the same 84px it used to be on a device with a 12px inset and grows with
// the inset instead of being added to it.
export const MOBILE_CHROME_CLEARANCE =
  "max(calc(env(safe-area-inset-bottom, 0px) + 72px), calc(var(--mobile-chrome-h, 0px) + 16px))";

// Full-screen pages are portaled outside the tab scrollers, so they never inherit
// the side inset those got. Held on a side, the Dynamic Island covers one long
// edge and eats whatever sits against it. Both values are 0 in portrait.
//
// Apply to a root with no horizontal padding of its own; a root that already has
// a gutter wants max(gutter, inset) instead, or the inline style drops the gutter.
export const MOBILE_SAFE_X = {
  paddingLeft: "env(safe-area-inset-left, 0px)",
  paddingRight: "env(safe-area-inset-right, 0px)",
} as const;
