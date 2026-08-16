// Bottom-anchored mobile surfaces have to clear the floating tab bar and, when a
// stream is up, the now playing bar stacked above it. mobile-shell measures both
// and publishes --mobile-chrome-h on the document.
//
// The 84px floor is what the tab bar alone needs. Keeping it as the floor means a
// surface that renders before the first measurement lands, or one mounted outside
// the shell, spaces itself exactly as it did before this value was measured at all.
export const MOBILE_CHROME_CLEARANCE =
  "calc(env(safe-area-inset-bottom, 0px) + max(84px, var(--mobile-chrome-h, 0px) + 16px))";

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
