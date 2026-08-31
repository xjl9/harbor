import { projectEndpoint } from "@/lib/player/gesture-physics";

// Swipe-down dismiss: the video frame (the [data-harbor-player] ancestor's
// video mount) shrinks + rounds + follows the finger 1:1 through CSS vars, so it
// reads as throwing the player away rather than dimming it.

const DISMISS_COMMIT_FRAC = 0.3;
const DISMISS_COMMIT_VELOCITY = 1000; // px/s, a fast flick commits regardless of travel
const DISMISS_MAX_SCALE_DROP = 0.1; // frame shrinks to 0.9 at full travel
const DISMISS_MAX_RADIUS = 22; // px corner rounding at full travel

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function setDismissVars(el: HTMLElement | null, d: number, height: number): void {
  if (!el) return;
  const prog = clamp(Math.max(0, d) / height, 0, 1);
  el.style.setProperty("--player-dismiss-ty", `${d}px`);
  el.style.setProperty("--player-dismiss-scale", `${1 - prog * DISMISS_MAX_SCALE_DROP}`);
  el.style.setProperty("--player-dismiss-radius", `${prog * DISMISS_MAX_RADIUS}px`);
}

export function clearDismissVars(el: HTMLElement | null): void {
  if (!el) return;
  el.style.removeProperty("--player-dismiss-ty");
  el.style.removeProperty("--player-dismiss-scale");
  el.style.removeProperty("--player-dismiss-radius");
}

export function dismissCommits(dist: number, vel: number, height: number): boolean {
  const projected = projectEndpoint(dist, vel);
  return vel > DISMISS_COMMIT_VELOCITY || projected > height * DISMISS_COMMIT_FRAC || dist > height * DISMISS_COMMIT_FRAC;
}
