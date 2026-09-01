// Window events that bridge the touch player's decoupled pieces. The gesture
// stage and shell (components layer) fire these; the chrome-visibility hook and
// overlay layers (player view) listen. Kept in their own module so the shell
// does not need to import the heavier player-utils (bridge factories).

// Fired by the gesture stage to flip the shared chrome visibility state.
export const MOBILE_CHROME_TOGGLE_EVENT = "harbor:mobile-chrome-toggle";
// Fired by the shell to open the episode panel (its state lives in player.tsx).
export const MOBILE_OPEN_EPISODES_EVENT = "harbor:mobile-open-episodes";

// Fired when a scrub commits, carrying where playback WAS. A large seek is the one
// player action that destroys information, and nothing else in the app knows the
// old position once the engine has moved.
export const MOBILE_SEEK_COMMITTED_EVENT = "harbor:mobile-seek-committed";
export type MobileSeekCommittedDetail = { fromSec: number; toSec: number };
