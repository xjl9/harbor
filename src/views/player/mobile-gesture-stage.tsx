import { ChevronsLeft, ChevronsRight, ChevronDown, Sun, Volume2 } from "lucide-react";
import { useRef, useState } from "react";
import { getPlaybackPosition } from "@/lib/player/playback-clock";
import { useSettings } from "@/lib/settings";
import { MOBILE_CHROME_TOGGLE_EVENT } from "@/lib/player/mobile-events";

const AXIS_LOCK_PX = 12;
const TAP_MAX_MS = 260;
const DOUBLE_TAP_MS = 300;
const SINGLE_TAP_DELAY = 320;
const DISMISS_COMMIT_FRAC = 0.25;

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
}: {
  durationSec: number;
  volume: number;
  onVolume: (v: number) => void;
  onSeek: (sec: number) => void;
  onPlayPause: () => void;
  onDismiss: () => void;
}) {
  const { settings } = useSettings();
  const g = useRef<Gesture | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const maxTouches = useRef(0);
  const scrubTarget = useRef(0);
  const brightness = useRef(1);
  const dismissProg = useRef(0);

  const tapAt = useRef(0);
  const tapSide = useRef<"L" | "R" | null>(null);
  const seekAccum = useRef(0);
  const seekBase = useRef(0);
  const singleTapTimer = useRef<number | null>(null);
  const pillTimer = useRef<number | null>(null);

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

  const handleTap = (x: number, w: number) => {
    const side: "L" | "R" = x < w / 2 ? "L" : "R";
    const now = Date.now();
    const isDouble = now - tapAt.current < DOUBLE_TAP_MS && tapSide.current === side;
    if (isDouble) {
      if (singleTapTimer.current) window.clearTimeout(singleTapTimer.current);
      const step = side === "R" ? settings.seekForwardStepSec : settings.seekBackStepSec;
      seekAccum.current += side === "R" ? step : -step;
      onSeek(clamp(seekBase.current + seekAccum.current, 0, duration));
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
      if (singleTapTimer.current) window.clearTimeout(singleTapTimer.current);
      singleTapTimer.current = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(MOBILE_CHROME_TOGGLE_EVENT));
        tapAt.current = 0;
      }, SINGLE_TAP_DELAY);
    }
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[6] touch-none select-none"
      onTouchStart={(e) => {
        rect.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
        maxTouches.current = Math.max(maxTouches.current, e.touches.length);
        if (e.touches.length >= 2) {
          if (singleTapTimer.current) window.clearTimeout(singleTapTimer.current);
          g.current = null;
          return;
        }
        const t0 = e.touches[0];
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
        const gg = g.current;
        const r = rect.current;
        if (!gg || !r || maxTouches.current >= 2) return;
        const t0 = e.touches[0];
        const dx = t0.clientX - gg.startX;
        const dy = t0.clientY - gg.startY;
        if (gg.mode === null) {
          if (Math.hypot(dx, dy) < AXIS_LOCK_PX) return;
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
          const p = clamp(dy / r.height, 0, 1);
          dismissProg.current = p;
          setDismissUi(p);
        }
      }}
      onTouchEnd={(e) => {
        const gg = g.current;
        const r = rect.current;
        const now = Date.now();
        // All fingers lifted. A two-finger gesture with no single-finger drag =
        // play/pause tap (VLC convention).
        if (e.touches.length === 0) {
          const wasMulti = maxTouches.current >= 2;
          maxTouches.current = 0;
          if (wasMulti && (gg == null || gg.mode == null)) {
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
          if (dismissProg.current > DISMISS_COMMIT_FRAC) onDismiss();
          dismissProg.current = 0;
          setDismissUi(0);
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
      {dismissUi > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: dismissUi * 0.5 }}
        />
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
