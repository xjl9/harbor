import { ChevronsLeft, ChevronsRight, ChevronDown, Sun, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { useSettings } from "@/lib/settings";
import { MOBILE_CHROME_TOGGLE_EVENT } from "@/lib/player/mobile-events";
import {
  getMobileLocked,
  subscribeMobileLocked,
  MOBILE_LOCK_PEEK_EVENT,
} from "@/lib/player/mobile-lock";
import { haptics } from "@/lib/player/haptics";
import { projectEndpoint, rubberBand, springBack } from "@/lib/player/gesture-physics";

const AXIS_LOCK_PX = 12;
const TAP_MAX_MS = 260;
const DOUBLE_TAP_MS = 300;
const DISMISS_COMMIT_FRAC = 0.3;
const DISMISS_COMMIT_VELOCITY = 1000; // px/s — a fast flick commits regardless of travel
const DISMISS_MAX_SCALE_DROP = 0.1; // frame shrinks to 0.9 at full travel
const DISMISS_MAX_RADIUS = 22; // px corner rounding at full travel

type Mode = null | "scrub" | "volume" | "brightness" | "dismiss" | "none";

type Gesture = {
  startX: number;
  startY: number;
  startT: number;
  region: "left" | "center" | "right";
  mode: Mode;
  basePos: number;
  baseVol: number;
  baseBright: number;
};

// The touch model for the native player. Sits above the video (and above the
// mouse-only DragClickStage, which is not rendered on mobile) but below the
// control bars, so buttons keep working. Owns: single-tap toggle, double-tap
// cumulative seek, horizontal scrub, vertical volume/brightness, two-finger
// play/pause, and swipe-down dismiss. preventDefault suppresses the synthesized
// mouse click that would otherwise fire play/pause under the finger.
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
}: {
  durationSec: number;
  volume: number;
  onVolume: (v: number) => void;
  onSeek: (sec: number) => void;
  onPlayPause: () => void;
  onDismiss: () => void;
  // Optional gesture vocabulary: long-press ramps to 2x (transient, restored on
  // release); pinch snaps between fill (true) and fit (false).
  rate?: number;
  onHoldRate?: (r: number) => void;
  onFill?: (fill: boolean) => void;
}) {
  const { settings } = useSettings();
  const g = useRef<Gesture | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const maxTouches = useRef(0);
  // Set when a second finger interrupts an in-progress single-finger drag, so the
  // all-fingers-lifted handler clears that drag's UI and does not misfire play/pause.
  const dragAbandonedByMulti = useRef(false);
  const scrubTarget = useRef(0);
  const brightness = useRef(1);
  const dismissProg = useRef(0);

  const tapAt = useRef(0);
  const tapSide = useRef<"L" | "R" | null>(null);
  const seekAccum = useRef(0);
  const seekBase = useRef(0);
  const undoTimer = useRef<number | null>(null);
  const pendingToggle = useRef(false);
  const pillTimer = useRef<number | null>(null);
  const lockedRef = useRef(getMobileLocked());
  useEffect(() => subscribeMobileLocked(() => (lockedRef.current = getMobileLocked())), []);

  // Swipe-down dismiss: the video frame (the [data-harbor-player] ancestor's
  // video mount) shrinks + rounds + follows the finger 1:1 through CSS vars, so it
  // reads as throwing the player away rather than dimming it.
  const playerRootRef = useRef<HTMLElement | null>(null);
  const dismissRaw = useRef(0);
  const dismissVel = useRef(0);
  const lastMoveY = useRef(0);
  const lastMoveT = useRef(0);
  const dismissSpringStop = useRef<(() => void) | null>(null);

  // Long-press → 2x hold, and pinch → fill/fit snap.
  const longPressTimer = useRef<number | null>(null);
  const holdingRef = useRef(false);
  const baseRate = useRef(1);
  const pinchStart = useRef(0);
  const pinchedRef = useRef(false);
  const [holdPill, setHoldPill] = useState(false);

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
  const touchDist = (a: React.Touch, b: React.Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

  const setDismissVars = (d: number) => {
    const el = playerRootRef.current;
    if (!el) return;
    const h = rect.current?.height ?? window.innerHeight;
    const prog = clamp(Math.max(0, d) / h, 0, 1);
    el.style.setProperty("--player-dismiss-ty", `${d}px`);
    el.style.setProperty("--player-dismiss-scale", `${1 - prog * DISMISS_MAX_SCALE_DROP}`);
    el.style.setProperty("--player-dismiss-radius", `${prog * DISMISS_MAX_RADIUS}px`);
  };
  const clearDismissVars = () => {
    const el = playerRootRef.current;
    if (!el) return;
    el.style.removeProperty("--player-dismiss-ty");
    el.style.removeProperty("--player-dismiss-scale");
    el.style.removeProperty("--player-dismiss-radius");
  };

  useEffect(
    () => () => {
      dismissSpringStop.current?.();
      clearDismissVars();
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    },
    [],
  );

  const [ripple, setRipple] = useState<"L" | "R" | null>(null);
  const [pill, setPill] = useState<number>(0);
  const [scrubUi, setScrubUi] = useState<number | null>(null);
  const [volUi, setVolUi] = useState<number | null>(null);
  const [brightUi, setBrightUi] = useState<number | null>(null);
  const [dismissUi, setDismissUi] = useState(0);
  const [dim, setDim] = useState(0);

  const duration = durationSec || 1;
  const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

  const regionOf = (x: number, w: number): Gesture["region"] =>
    x < w / 3 ? "left" : x > (2 * w) / 3 ? "right" : "center";

  const toggleChrome = () => window.dispatchEvent(new CustomEvent(MOBILE_CHROME_TOGGLE_EVENT));

  // Tap zones use the same left/center/right thirds as the drag regions. Center is
  // a direct play/pause target. On the sides, chrome toggles OPTIMISTICALLY on the
  // first tap (no 320ms disambiguation lag); a second tap within the double-tap
  // window undoes that toggle and seeks instead.
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
      setRipple(side);
      window.setTimeout(() => setRipple((r) => (r === side ? null : r)), 420);
      setPill(seekAccum.current);
      if (pillTimer.current) window.clearTimeout(pillTimer.current);
      pillTimer.current = window.setTimeout(() => setPill(0), 700);
      tapAt.current = now;
      tapSide.current = side;
    } else {
      tapAt.current = now;
      tapSide.current = side;
      seekAccum.current = 0;
      seekBase.current = getPlaybackPosition();
      toggleChrome();
      pendingToggle.current = true;
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => {
        pendingToggle.current = false;
        tapAt.current = 0;
      }, DOUBLE_TAP_MS);
    }
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[6] touch-none select-none"
      onTouchStart={(e) => {
        rect.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (!playerRootRef.current) {
          playerRootRef.current = (e.currentTarget as HTMLElement).closest("[data-harbor-player]");
        }
        // A new touch overrides any in-flight spring-back from a released drag.
        dismissSpringStop.current?.();
        dismissSpringStop.current = null;
        maxTouches.current = Math.max(maxTouches.current, e.touches.length);
        if (e.touches.length >= 2) {
          if (undoTimer.current) window.clearTimeout(undoTimer.current);
          cancelLongPress();
          // A second finger during an active single-finger drag abandons it: clear
          // that drag's transient UI now and flag it so the lift handler does not
          // fire a stray two-finger play/pause.
          if (g.current && g.current.mode && g.current.mode !== "none") {
            dragAbandonedByMulti.current = true;
            setScrubUi(null);
            setVolUi(null);
            setBrightUi(null);
            setDim(0);
            // The spring was already stopped and nulled above; just clear the
            // frame's dismiss transform so an abandoned swipe doesn't linger.
            clearDismissVars();
            setDismissUi(0);
            dismissProg.current = 0;
          }
          if (onFill && e.touches.length === 2) pinchStart.current = touchDist(e.touches[0], e.touches[1]);
          g.current = null;
          return;
        }
        const t0 = e.touches[0];
        dismissRaw.current = 0;
        dismissVel.current = 0;
        lastMoveY.current = t0.clientY;
        lastMoveT.current = performance.now();
        // Arm the long-press → 2x hold (cancelled by any drag or second finger).
        cancelLongPress();
        if (onHoldRate && !lockedRef.current) {
          longPressTimer.current = window.setTimeout(() => {
            if (!g.current || g.current.mode !== null || maxTouches.current >= 2) return;
            holdingRef.current = true;
            baseRate.current = rate;
            onHoldRate(2);
            haptics.light();
            setHoldPill(true);
          }, 500);
        }
        g.current = {
          startX: t0.clientX,
          startY: t0.clientY,
          startT: Date.now(),
          region: regionOf(t0.clientX - (rect.current?.left ?? 0), rect.current?.width ?? 1),
          mode: null,
          basePos: getPlaybackPosition(),
          baseVol: volume,
          baseBright: brightness.current,
        };
      }}
      onTouchMove={(e) => {
        if (lockedRef.current) return;
        // Pinch → fill/fit snap (handled before the single-finger guard below).
        if (onFill && e.touches.length >= 2 && pinchStart.current > 0) {
          e.preventDefault();
          const dist = touchDist(e.touches[0], e.touches[1]);
          const scale = dist / pinchStart.current;
          if (!pinchedRef.current && scale > 1.15) {
            pinchedRef.current = true;
            onFill(true);
            haptics.medium();
          } else if (!pinchedRef.current && scale < 0.85) {
            pinchedRef.current = true;
            onFill(false);
            haptics.medium();
          }
          return;
        }
        if (holdingRef.current) {
          e.preventDefault();
          return;
        }
        const gg = g.current;
        const r = rect.current;
        if (!gg || !r || maxTouches.current >= 2) return;
        const t0 = e.touches[0];
        const dx = t0.clientX - gg.startX;
        const dy = t0.clientY - gg.startY;
        if (gg.mode === null) {
          if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
          // A real drag cancels the pending long-press.
          cancelLongPress();
          if (Math.abs(dx) > Math.abs(dy)) {
            gg.mode = "scrub";
          } else if (gg.region === "left") {
            gg.mode = "brightness";
          } else if (gg.region === "right") {
            gg.mode = "volume";
          } else {
            gg.mode = dy > 0 ? "dismiss" : "none";
          }
        }
        if (gg.mode === "none") return;
        e.preventDefault();
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
          const p = clamp(dismissRaw.current / r.height, 0, 1);
          dismissProg.current = p;
          setDismissUi(p);
          setDismissVars(d);
          const now = performance.now();
          const dt = now - lastMoveT.current;
          if (dt > 0) {
            const inst = ((t0.clientY - lastMoveY.current) / dt) * 1000;
            dismissVel.current = dismissVel.current * 0.4 + inst * 0.6;
          }
          lastMoveY.current = t0.clientY;
          lastMoveT.current = now;
        }
      }}
      onTouchEnd={(e) => {
        const gg = g.current;
        const r = rect.current;
        const now = Date.now();
        // Locked: swallow every gesture; a quick tap peeks the unlock pill.
        if (lockedRef.current) {
          if (gg && gg.mode == null && r && now - gg.startT < TAP_MAX_MS) {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent(MOBILE_LOCK_PEEK_EVENT));
          }
          g.current = null;
          maxTouches.current = 0;
          return;
        }
        cancelLongPress();
        // Release a 2x hold back to the prior rate; swallow the lift.
        if (holdingRef.current) {
          releaseHold();
          g.current = null;
          maxTouches.current = 0;
          pinchedRef.current = false;
          pinchStart.current = 0;
          return;
        }
        // All fingers lifted. A two-finger gesture with no single-finger drag =
        // play/pause tap (VLC convention) — but NOT if it was a pinch.
        if (e.touches.length === 0) {
          const wasMulti = maxTouches.current >= 2;
          const wasPinch = pinchedRef.current;
          const wasAbandonedDrag = dragAbandonedByMulti.current;
          maxTouches.current = 0;
          pinchedRef.current = false;
          pinchStart.current = 0;
          dragAbandonedByMulti.current = false;
          // Two-finger tap = play/pause, but not after a pinch or an interrupted drag.
          if (wasMulti && !wasPinch && !wasAbandonedDrag && (gg == null || gg.mode == null)) {
            onPlayPause();
            g.current = null;
            return;
          }
        }
        if (!gg || !r) return;
        if (gg.mode === null) {
          const elapsed = now - gg.startT;
          if (elapsed < TAP_MAX_MS) {
            e.preventDefault();
            handleTap(gg.startX - r.left, r.width);
          }
        } else if (gg.mode === "scrub") {
          e.preventDefault();
          onSeek(scrubTarget.current);
          setScrubUi(null);
        } else if (gg.mode === "dismiss") {
          const h = r.height;
          const dist = dismissRaw.current;
          const vel = dismissVel.current;
          const projected = projectEndpoint(dist, vel);
          const commit =
            vel > DISMISS_COMMIT_VELOCITY || projected > h * DISMISS_COMMIT_FRAC || dist > h * DISMISS_COMMIT_FRAC;
          if (commit) {
            haptics.medium();
            dismissProg.current = 0;
            onDismiss();
          } else {
            // Spring the frame back to rest, seeded with the release velocity.
            dismissSpringStop.current?.();
            dismissSpringStop.current = springBack({
              from: dist,
              to: 0,
              velocity: vel,
              onUpdate: (v) => {
                const d = Math.max(0, v);
                setDismissVars(d);
                setDismissUi(clamp(d / h, 0, 1));
              },
              onRest: () => {
                clearDismissVars();
                setDismissUi(0);
                dismissProg.current = 0;
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
      }}
    >
      {dim > 0 && (
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: dim * 0.85 }} />
      )}
      {holdPill && (
        <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
          <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-4 py-1.5 text-[14px] font-bold tabular-nums text-white backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200">
            2×
            <ChevronsRight size={16} strokeWidth={2.6} />
          </div>
        </div>
      )}
      {dismissUi > 0.04 && (
        <div className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-1 text-white/80">
          <ChevronDown size={26} strokeWidth={2.2} style={{ transform: `translateY(${dismissUi * 16}px)` }} />
        </div>
      )}
      {ripple && (
        <div
          className={`pointer-events-none absolute inset-y-0 ${ripple === "L" ? "left-0" : "right-0"} flex w-2/5 items-center justify-center`}
        >
          <div className="flex flex-col items-center gap-1 rounded-full bg-white/10 px-6 py-8 text-white animate-in fade-in zoom-in-95 duration-200">
            {ripple === "L" ? <ChevronsLeft size={30} strokeWidth={2.4} /> : <ChevronsRight size={30} strokeWidth={2.4} />}
          </div>
        </div>
      )}
      {pill !== 0 && (
        <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 rounded-full bg-black/75 px-4 py-1.5 text-[15px] font-bold tabular-nums text-white backdrop-blur-sm">
          {pill > 0 ? "+" : ""}
          {pill}s
        </div>
      )}
      {scrubUi != null && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl bg-black/75 px-5 py-2.5 font-mono text-[20px] font-semibold tabular-nums text-white backdrop-blur-sm">
          {fmt(scrubUi)} / {fmt(duration)}
        </div>
      )}
      {volUi != null && <VerticalMeter side="right" value={volUi} icon={<Volume2 size={22} strokeWidth={2} />} />}
      {brightUi != null && <VerticalMeter side="left" value={brightUi} icon={<Sun size={22} strokeWidth={2} />} />}
    </div>
  );
}

function VerticalMeter({ side, value, icon }: { side: "left" | "right"; value: number; icon: React.ReactNode }) {
  return (
    <div
      className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${side === "left" ? "left-8" : "right-8"} flex flex-col items-center gap-2`}
    >
      <div className="text-white">{icon}</div>
      <div className="relative h-32 w-1.5 overflow-hidden rounded-full bg-white/25">
        <div className="absolute inset-x-0 bottom-0 bg-white" style={{ height: `${value * 100}%` }} />
      </div>
      <span className="font-mono text-[12px] font-semibold tabular-nums text-white">{Math.round(value * 100)}</span>
    </div>
  );
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
