// Bottom-anchored mobile surfaces have to clear the floating tab bar and, when a
// stream is up, the now playing bar stacked above it. mobile-shell measures both
// and publishes --mobile-chrome-h on the document.
//
// The 84px floor is what the tab bar alone needs. Keeping it as the floor means a
// surface that renders before the first measurement lands, or one mounted outside
// the shell, spaces itself exactly as it did before this value was measured at all.
export const MOBILE_CHROME_CLEARANCE =
  "calc(env(safe-area-inset-bottom, 0px) + max(84px, var(--mobile-chrome-h, 0px) + 16px))";
