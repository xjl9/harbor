import { useCallback, useRef } from "react";

const HOLD_MS = 420;
const SLOP_PX = 10;

// Long-press on a poster opens the card actions sheet, the phone stand-in for the
// desktop right-click menu. A press that moves more than the slop is a scroll
// and must not fire; a press that fires must swallow the click the finger lift
// would otherwise produce, or the sheet and the detail page would open together.
export function useLongPress(onLongPress: () => void) {
  const timer = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
    origin.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        fired.current = true;
        origin.current = null;
        onLongPress();
      }, HOLD_MS);
    },
    [onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const o = origin.current;
      if (!o) return;
      if (Math.abs(e.clientX - o.x) > SLOP_PX || Math.abs(e.clientY - o.y) > SLOP_PX) clear();
    },
    [clear],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!fired.current) return;
    fired.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // iOS raises contextmenu for the system callout on a held image; keep the
      // native menu out and let the press timer own the gesture.
      e.preventDefault();
      if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === "mouse") {
        clear();
        fired.current = true;
        onLongPress();
      }
    },
    [clear, onLongPress],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    onClickCapture,
    onContextMenu,
  };
}
