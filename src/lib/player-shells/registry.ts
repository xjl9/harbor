import { Transport } from "@/components/player/transport";
import { MinimalShell } from "@/components/player/shells/minimal-shell";
import { MobileShell } from "@/components/player/shells/mobile-shell";
import { isMobileNative } from "@/lib/platform";
import type { PlayerShellMeta } from "./types";

export const PLAYER_SHELLS: PlayerShellMeta[] = [
  {
    id: "default",
    name: "Harbor default",
    description: "The full transport bar Harbor ships with.",
    Component: Transport,
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Title, play / pause, and a thin seek bar. Everything else hidden.",
    Component: MinimalShell,
  },
];

// Not part of PLAYER_SHELLS (which drives the desktop shell picker): the touch
// shell is selected implicitly on native mobile, never offered as a desktop choice.
const MOBILE_SHELL: PlayerShellMeta = {
  id: "mobile",
  name: "Mobile touch",
  description: "Touch-first shell: three-zone controls, gestures, and bottom sheets.",
  Component: MobileShell,
};

export function getPlayerShell(id: string): PlayerShellMeta {
  // Native mobile always uses the touch shell; the configured desktop shell (with
  // its width-based slot system) is unusable on a phone. Desktop is unaffected.
  if (isMobileNative()) return MOBILE_SHELL;
  return PLAYER_SHELLS.find((s) => s.id === id) ?? PLAYER_SHELLS[0];
}

export type { PlayerShellMeta, PlayerShellProps } from "./types";
