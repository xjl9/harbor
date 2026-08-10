import { useEffect, useState } from "react";

/**
 * Height in px currently occupied by the on-screen keyboard, measured via the
 * VisualViewport API. Bottom-anchored sheets add this as an offset so the
 * keyboard never covers their inputs. Returns 0 when no keyboard is shown, when
 * the platform already resizes the layout (gap collapses to ~0), or when the API
 * is unavailable.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setInset(gap > 40 ? Math.round(gap) : 0);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
