import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { useSettings } from "@/lib/settings";
import { MOBILE_CHROME_TOGGLE_EVENT } from "@/lib/player/mobile-events";
import { getMobileLocked, subscribeMobileLocked, MOBILE_LOCK_PEEK_EVENT } from "@/lib/player/mobile-lock";
import { haptics } from "@/lib/player/haptics";
import { rubberBand, springBack } from "@/lib/player/gesture-physics";
import { clearDismissVars, dismissCommits, setDismissVars } from "./mobile-gesture-dismiss";
import { DoubleTapHud, HoldPill, ScrubHud, VerticalMeter, type TapHud } from "./mobile-gesture-huds";

// A dismiss sample older than this is stale; treat the finger as stopped.
const DISMISS_VEL_WINDOW_MS = 90;

const AXIS_LOCK_PX = 12;
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 500;
const TAP_HUD_HOLD_MS = 600;
const TAP_HUD_FADE_MS = 320;

type Mode = null | "scrub" | "volume" | "brightness" | "dismiss" | "none";

type Gesture = {
  // The finger that started this gesture. Every later read must resolve THIS
  // touch, never touches[0]: with a second finger down the list order is not
  // ours to assume.
  touchId: number;
  startX: number;
  startY: number;
  region: "left" | "center" | "right";
  mode: Mode;
  basePos: number;
  baseVol: number;
  baseBright: number;
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// A second finger landing this soon after the first is a deliberate two-finger
// gesture. Later than this it is the hand holding the phone: in landscape a thumb
// rests on the glass constantly, and counting it as a gesture partner made the
// player ignore every touch until the hand was lifted off entirely.
const MULTI_INTENT_MS = 250;

function findTouch(list: React.TouchList, id: number): React.Touch | null {
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}

// The touch model for the native player. Sits above the video (and above the
// mouse-only DragClickStage, which is not rendered on mobile) but below the
// control bars, so buttons keep working. Owns: single-tap toggle, double-tap
// cumulative seek, horizontal scrub, vertical volume/brightness, two-finger
// play/pause, long-press 2x, pinch fill/fit, and swipe-down dismiss.
export function MobileGestureStage({
  durationSec,
  volume,
  onVolume,
  onSeek,
  onPlayPause,
  onDismiss,
  rate = 1,
  onHoldRate,
  onFill,
  canVolume = true,
  canRate = true,
}: {
  durationSec: number;
  volume: number;
  onVolume: (v: number) => void;
  onSeek: (sec: number) => void;
  onPlayPause: () => void;
  onDismiss: () => void;
  rate?: number;
  onHoldRate?: (r: number) => void;
  onFill?: (fill: boolean) => void;
  // Engine capability gates. Default true until the plumbing layer wires them.
  canVolume?: boolean;
  canRate?: boolean;
}) {
  const { settings } = useSettings();
  const stageRef = useRef<HTMLDivElement>(null);
  const g = useRef<Gesture | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const maxTouches = useRef(0);
  // When the current finger-down sequence began, for the deliberate-multi window.
  const firstTouchAt = useRef(0);
  // Set when a second finger interrupts an in-progress single-finger drag, so the
  // all-fingers-lifted handler clears that drag's UI and does not misfire play/pause.
  const dragAbandonedByMulti = useRef(false);
  const scrubTarget = useRef(0);
  const brightness = useRef(1);

  const tapAt = useRef(0);
  const tapSide = useRef<"L" | "R" | null>(null);
  const seekAccum = useRef(0);
  const seekBase = useRef(0);
  const undoTimer = useRef<number | null>(null);
  const pendingToggle = useRef(false);
  const tapHudTimer = useRef<number | null>(null);
  const lockedRef = useRef(getMobileLocked());
  useEffect(() => subscribeMobileLocked(() => (lockedRef.current = getMobileLocked())), []);

  const playerRootRef = useRef<HTMLElement | null>(null);
  const dismissRaw = useRef(0);
  const dismissVel = useRef(0);
  const lastMoveY = useRef(0);
  const lastMoveT = useRef(0);
  const dismissSpringStop = useRef<(() => void) | null>(null);

  const longPressTimer = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const baseRate = useRef(1);
  const pinchStart = useRef(0);
  const pinchedRef = useRef(false);
  const [holdPill, setHoldPill] = useState(false);

  const [tapHud, setTapHud] = useState<TapHud | null>(null);
  const [scrubUi, setScrubUi] = useState<number | null>(null);
  const [volUi, setVolUi] = useState<number | null>(null);
  const [brightUi, setBrightUi] = useState<number | null>(null);
  const [dismissUi, setDismissUi] = useState(0);
  const [dim, setDim] = useState(0);

  const duration = durationSec || 1;

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const releaseHold = () => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    setHoldPill(false);
    onHoldRate?.(baseRate.current);
  };
  const resetMulti = () => {
    maxTouches.current = 0;
    pinchedRef.current = false;
    pinchStart.current = 0;
    dragAbandonedByMulti.current = false;
  };
  const clearDragUi = () => {
    setScrubUi(null);
    setVolUi(null);
    setBrightUi(null);
    setDim(0);
    clearDismissVars(playerRootRef.current);
    setDismissUi(0);
  };
  const touchDist = (a: React.Touch, b: React.Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  // React registers touchmove passively, so preventDefault there is a no-op.
  // touch-none already blocks scrolling; this native listener is only to stop
  // the two-finger browser zoom while a pinch is being read.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (e.touches.length >= 2 && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  useEffect(
    () => () => {
      dismissSpringStop.current?.();
      clearDismissVars(playerRootRef.current);
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
      if (tapHudTimer.current) window.clearTimeout(tapHudTimer.current);
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    },
    [],
  );

  const regionOf = (x: number, w: number): Gesture["region"] =>
    x < w / 3 ? "left" : x > (2 * w) / 3 ? "right" : "center";

  const toggleChrome = () => window.dispatchEvent(new CustomEvent(MOBILE_CHROME_TOGGLE_EVENT));

  const showTapHud = (side: "L" | "R", count: number) => {
    setTapHud({ side, count, leaving: false });
    if (tapHudTimer.current) window.clearTimeout(tapHudTimer.current);
    tapHudTimer.current = window.setTimeout(() => {
      setTapHud((h) => (h ? { ...h, leaving: true } : h));
      tapHudTimer.current = window.setTimeout(() => setTapHud(null), TAP_HUD_FADE_MS);
    }, TAP_HUD_HOLD_MS);
  };

  // Tap zones use the same left/center/right thirds as the drag regions. Center is
  // a direct play/pause target. On the sides, chrome toggles OPTIMISTICALLY on the
  // first tap (no disambiguation lag); a second tap within the double-tap window
  // undoes that toggle and seeks instead.
  const handleTap = (x: number, w: number) => {
    const region = regionOf(x, w);
    if (region === "center") {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      pendingToggle.current = false;
      tapAt.current = 0;
      haptics.select();
      onPlayPause();
      return;
    }
    const side: "L" | "R" = region === "right" ? "R" : "L";
    const now = Date.now();
    const isDouble = now - tapAt.current < DOUBLE_TAP_MS && tapSide.current === side;
    tapAt.current = now;
    tapSide.current = side;
    if (isDouble) {
      if (pendingToggle.current) {
        toggleChrome();
        pendingToggle.current = false;
      }
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      const step = side === "R" ? settings.seekForwardStepSec : settings.seekBackStepSec;
      seekAccum.current += side === "R" ? step : -step;
      onSeek(clamp(seekBase.current + seekAccum.current, 0, duration));
      haptics.light();
      showTapHud(side, seekAccum.current);
      return;
    }
    seekAccum.current = 0;
    seekBase.current = getPlaybackPosition();
    toggleChrome();
    pendingToggle.current = true;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => {
      pendingToggle.current = false;
      tapAt.current = 0;
    }, DOUBLE_TAP_MS);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    rect.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (!playerRootRef.current) {
      playerRootRef.current = (e.currentTarget as HTMLElement).closest("[data-harbor-player]");
    }
    // A new touch overrides any in-flight spring-back from a released drag.
    dismissSpringStop.current?.();
    dismissSpringStop.current = null;
    const nowTs = performance.now();
    if (e.touches.length === 1) firstTouchAt.current = nowTs;
    const deliberateMulti = e.touches.length >= 2 && nowTs - firstTouchAt.current <= MULTI_INTENT_MS;
    // Only a deliberate multi-touch raises the watermark. An incidental finger must
    // not latch this, or every later single-finger gesture is discarded by the
    // maxTouches guards until all fingers lift.
    if (deliberateMulti) maxTouches.current = Math.max(maxTouches.current, e.touches.length);
    if (e.touches.length >= 2 && !deliberateMulti) {
      // Resting hand. Leave any in-flight gesture alone; if none is running, fall
      // through and start one from the finger that actually just landed.
      if (g.current) return;
    } else if (e.touches.length >= 2) {
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      cancelLongPress();
      // A second finger during an active single-finger drag abandons it.
      if (g.current && g.current.mode && g.current.mode !== "none") {
        dragAbandonedByMulti.current = true;
        clearDragUi();
      }
      if (onFill && e.touches.length === 2) pinchStart.current = touchDist(e.touches[0], e.touches[1]);
      g.current = null;
      return;
    }
    const t0 = e.changedTouches[0] ?? e.touches[0];
    if (!t0) return;
    dismissRaw.current = 0;
    dismissVel.current = 0;
    lastMoveY.current = t0.clientY;
    lastMoveT.current = performance.now();
    cancelLongPress();
    if (onHoldRate && canRate && !lockedRef.current) {
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        if (!g.current || g.current.mode !== null || maxTouches.current >= 2) return;
        holdingRef.current = true;
        baseRate.current = rate;
        onHoldRate(2);
        haptics.light();
        setHoldPill(true);
      }, LONG_PRESS_MS);
    }
    g.current = {
      touchId: t0.identifier,
      startX: t0.clientX,
      startY: t0.clientY,
      region: regionOf(t0.clientX - (rect.current?.left ?? 0), rect.current?.width ?? 1),
      mode: null,
      basePos: getPlaybackPosition(),
      baseVol: volume,
      baseBright: brightness.current,
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (lockedRef.current) return;
    if (onFill && e.touches.length >= 2 && pinchStart.current > 0) {
      const scale = touchDist(e.touches[0], e.touches[1]) / pinchStart.current;
      if (!pinchedRef.current && (scale > 1.15 || scale < 0.85)) {
        pinchedRef.current = true;
        onFill(scale > 1);
        haptics.medium();
      }
      return;
    }
    if (holdingRef.current) return;
    const gg = g.current;
    const r = rect.current;
    if (!gg || !r || maxTouches.current >= 2) return;
    const t0 = findTouch(e.touches, gg.touchId);
    if (!t0) return;
    const dx = t0.clientX - gg.startX;
    const dy = t0.clientY - gg.startY;
    if (gg.mode === null) {
      if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
      cancelLongPress();
      if (Math.abs(dx) > Math.abs(dy)) gg.mode = "scrub";
      else if (gg.region === "left") gg.mode = "brightness";
      else if (gg.region === "right") gg.mode = canVolume ? "volume" : "none";
      else gg.mode = dy > 0 ? "dismiss" : "none";
    }
    if (gg.mode === "scrub") {
      const target = clamp(gg.basePos + (dx / r.width) * duration, 0, duration);
      scrubTarget.current = target;
      setScrubUi(target);
    } else if (gg.mode === "volume") {
      const v = clamp(gg.baseVol - dy / r.height, 0, 1);
      onVolume(v);
      setVolUi(v);
    } else if (gg.mode === "brightness") {
      const b = clamp(gg.baseBright - dy / r.height, 0.1, 1);
      brightness.current = b;
      setDim(1 - b);
      setBrightUi(b);
    } else if (gg.mode === "dismiss") {
      // Follow the finger 1:1 downward; resist an upward over-drag with a band.
      const d = dy < 0 ? rubberBand(dy, r.height) : dy;
      dismissRaw.current = Math.max(0, d);
      setDismissUi(clamp(dismissRaw.current / r.height, 0, 1));
      setDismissVars(playerRootRef.current, d, r.height);
      const now = performance.now();
      const dt = now - lastMoveT.current;
      if (dt > 0) {
        const inst = ((t0.clientY - lastMoveY.current) / dt) * 1000;
        dismissVel.current = dismissVel.current * 0.4 + inst * 0.6;
      }
      lastMoveY.current = t0.clientY;
      lastMoveT.current = now;
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const gg = g.current;
    const r = rect.current;
    // Locked: swallow every gesture; a tap peeks the unlock pill.
    if (lockedRef.current) {
      cancelLongPress();
      if (gg && gg.mode == null) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(MOBILE_LOCK_PEEK_EVENT));
      }
      g.current = null;
      resetMulti();
      return;
    }
    // A long-press that fired owns this touch: release the 2x and swallow the lift.
    if (holdingRef.current) {
      cancelLongPress();
      releaseHold();
      g.current = null;
      resetMulti();
      return;
    }
    cancelLongPress();
    if (e.touches.length === 0) {
      const wasMulti = maxTouches.current >= 2;
      const wasPinch = pinchedRef.current;
      const wasAbandonedDrag = dragAbandonedByMulti.current;
      resetMulti();
      // Two-finger tap = play/pause (VLC convention), but not after a pinch or an interrupted drag.
      if (wasMulti && !wasPinch && !wasAbandonedDrag && (gg == null || gg.mode == null)) {
        onPlayPause();
        g.current = null;
        return;
      }
    }
    if (!gg || !r) return;
    if (gg.mode === null) {
      // No axis lock and no long-press fired: a tap, however long it was held.
      e.preventDefault();
      handleTap(gg.startX - r.left, r.width);
    } else if (gg.mode === "scrub") {
      e.preventDefault();
      onSeek(scrubTarget.current);
      setScrubUi(null);
    } else if (gg.mode === "dismiss") {
      const h = r.height;
      const dist = dismissRaw.current;
      // The EMA only advances on touchmove, so a finger that stops and rests keeps
      // whatever velocity it last had. projectEndpoint multiplies that by ~499, so
      // dragging down a little, pausing, then lifting used to project past the commit
      // threshold and close the player on a gesture the viewer had visibly abandoned.
      // A sample older than the window is not evidence of motion.
      const sinceMove = performance.now() - lastMoveT.current;
      const vel = sinceMove > DISMISS_VEL_WINDOW_MS ? 0 : dismissVel.current;
      if (dismissCommits(dist, vel, h)) {
        haptics.medium();
        onDismiss();
      } else {
        dismissSpringStop.current?.();
        dismissSpringStop.current = springBack({
          from: dist,
          to: 0,
          velocity: vel,
          onUpdate: (v) => {
            const d = Math.max(0, v);
            setDismissVars(playerRootRef.current, d, h);
            setDismissUi(clamp(d / h, 0, 1));
          },
          onRest: () => {
            clearDismissVars(playerRootRef.current);
            setDismissUi(0);
            dismissSpringStop.current = null;
          },
        });
      }
    } else if (gg.mode === "volume") {
      window.setTimeout(() => setVolUi(null), 500);
    } else if (gg.mode === "brightness") {
      window.setTimeout(() => setBrightUi(null), 500);
    }
    g.current = null;
  };

  // The system took the touch (incoming call, control center, edge swipe): drop
  // everything as if the finger had never landed, so no HUD, hold or half-dismiss
  // is left behind.
  const onTouchCancel = () => {
    cancelLongPress();
    releaseHold();
    dismissSpringStop.current?.();
    dismissSpringStop.current = null;
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    pendingToggle.current = false;
    clearDragUi();
    dismissRaw.current = 0;
    dismissVel.current = 0;
    g.current = null;
    resetMulti();
  };

  return (
    <div
      ref={stageRef}
      className="pointer-events-auto absolute inset-0 z-[6] touch-none select-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      {dim > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-canvas" style={{ opacity: dim * 0.85 }} />
      )}
      {holdPill && <HoldPill />}
      {dismissUi > 0.04 && (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center text-ink/80">
          <ChevronDown size={26} strokeWidth={2} style={{ transform: `translateY(${dismissUi * 16}px)` }} />
        </div>
      )}
      {tapHud && <DoubleTapHud hud={tapHud} />}
      {scrubUi != null && <ScrubHud sec={scrubUi} duration={duration} />}
      {volUi != null && <VerticalMeter side="right" value={volUi} />}
      {brightUi != null && <VerticalMeter side="left" value={brightUi} />}
    </div>
  );
}
