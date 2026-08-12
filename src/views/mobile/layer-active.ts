import { createContext, useContext, useEffect, useState } from "react";

/* Matches the 260ms layer transition plus a small buffer. */
const PARK_DELAY_MS = 300;

/**
 * Visibility of the enclosing mobile tab/view layer. Defaults to true so
 * consumers rendered outside the layered shell (detail overlay, player)
 * behave as always-visible.
 */
export const LayerActiveContext = createContext(true);

export function useLayerActive(): boolean {
  return useContext(LayerActiveContext);
}

/**
 * True once an inactive layer's exit transition has finished, so the layer can
 * be fully hidden (visibility + content-visibility) the way the desktop view
 * stack parks its layers in App.tsx. Unparks synchronously on activation
 * because the returned value is gated on `!active`.
 */
export function useLayerParked(active: boolean): boolean {
  const [parked, setParked] = useState(!active);
  useEffect(() => {
    if (active) {
      setParked(false);
      return;
    }
    const t = window.setTimeout(() => setParked(true), PARK_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [active]);
  return parked && !active;
}
