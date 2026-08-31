// The mobile player's glyphs, from the icon set in public/player-icons.
//
// A local map rather than getCustomIcon: that lookup is keyed by PlayerControlId,
// whose CONTROL_META is an exhaustive Record shared with both desktop chrome
// configs, and widening it for controls only the phone has would force entries
// into surfaces that do not render them. Mobile is a different control surface,
// so it names its own.
//
// Controls with no matching asset (lock, subtitles) deliberately keep their lucide
// glyph rather than getting a lookalike drawn for them.

const B = "/player-icons/";

export const MOBILE_GLYPH = {
  close: `${B}back.svg`,
  playing: `${B}play-pause--paused.svg`,
  paused: `${B}play-pause--playing.svg`,
  prevEpisode: `${B}prev-episode.svg`,
  nextEpisode: `${B}next-episode.svg`,
  pickAnother: `${B}pick-another.svg`,
  episodes: `${B}aspect.svg`,
  pipInactive: `${B}pip--inactive.svg`,
  pipActive: `${B}pip--active.svg`,
  castIdle: `${B}cast--idle.svg`,
  castConnected: `${B}cast--connected.svg`,
  audio: `${B}audio.svg`,
} as const;

// The set ships a glyph per seek step with the number drawn into it, so the button
// can show the step the viewer actually configured instead of a generic arrow.
// Steps outside this list fall back to the unnumbered arrow.
const SEEK_STEPS = [1, 3, 5, 10, 15, 30, 60, 90];

export function seekGlyph(direction: "back" | "forward", seconds: number): string {
  const name = direction === "back" ? "seek-back" : "seek-forward";
  return SEEK_STEPS.includes(seconds) ? `${B}${name}-${seconds}.png` : `${B}${name}.svg`;
}
