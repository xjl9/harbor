import { useSyncExternalStore } from "react";

// Screen-lock state for the touch player, shared between the shell (which owns the
// lock button + unlock pill) and the gesture stage (which must ignore every
// gesture while locked). Kept as a tiny external store rather than an event so both
// sides can read the current value synchronously without a round-trip.

let locked = false;
const listeners = new Set<() => void>();

export function getMobileLocked(): boolean {
  return locked;
}

export function setMobileLocked(v: boolean): void {
  if (locked === v) return;
  locked = v;
  for (const l of listeners) l();
}

export function subscribeMobileLocked(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMobileLocked(): boolean {
  return useSyncExternalStore(subscribeMobileLocked, getMobileLocked, () => false);
}

// Fired by the gesture stage when a tap lands while locked, so the shell can peek
// the unlock pill without unlocking.
export const MOBILE_LOCK_PEEK_EVENT = "harbor:mobile-lock-peek";
