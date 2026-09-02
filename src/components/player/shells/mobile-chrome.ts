// Shared vocabulary for every floating element of the mobile player: one
// material, one safe-area rule, one motion curve. Anything that floats over the
// video (play disc, HUDs, lock pill, time bezel) draws from here so the shell,
// the gesture stage and the seek bar cannot drift apart.

// Warm-black glass. Matches the mobile tab bar so the player reads as the same app.
export const CHROME_SURFACE =
  "bg-[color-mix(in_srgb,var(--color-canvas)_72%,transparent)] backdrop-blur-xl border border-white/[0.08]";

// Time bezel used by the plain scrubber, the trickplay card and the scrub HUD.
export const TIME_BEZEL = `${CHROME_SURFACE} rounded-[10px] px-2.5 py-1 font-jakarta text-[13px] font-semibold tabular-nums text-ink`;

// Playback is landscape, so the notch sits on one side and the corner on the
// other. Chrome pads BOTH edges by the larger inset so it stays symmetric.
export const SAFE_X = "max(env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))";
export const SAFE_INLINE_20 = `calc(${SAFE_X} + 20px)`;

export const SHOW_MS = 180;
export const HIDE_MS = 240;
export const SHOW_EASE = "var(--ease-out)";
export const HIDE_EASE = "cubic-bezier(0.4,0,1,1)";

export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function fmtRate(rate: number): string {
  const r = Math.round(rate * 100) / 100;
  return `${r}x`;
}
