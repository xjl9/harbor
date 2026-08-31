import { useRef, useState, useSyncExternalStore } from "react";
import { ThumbPreview } from "@/components/player/thumb-preview";
import {
  getPlaybackBuffered,
  setSeekHovering,
  usePlaybackBufferedGated,
  usePlaybackPositionGated,
} from "@/lib/player/playback-clock";
import { useT } from "@/lib/i18n";
import { useTrickplayState } from "@/lib/trickplay";
import { fmtTime, SAFE_INLINE_20, TIME_BEZEL } from "./mobile-chrome";

const BUFFER_PAD_SEC = 4;
const PREVIEW_HALF_WIDTH_PX = 96;

// The finger's position while scrubbing, published as a tiny store so the time
// label in the action row can follow it without the shell re-rendering per move.
let dragSecStore: number | null = null;
const dragListeners = new Set<() => void>();
function publishDragSec(v: number | null) {
  dragSecStore = v;
  for (const l of dragListeners) l();
}
function subscribeDragSec(cb: () => void) {
  dragListeners.add(cb);
  return () => dragListeners.delete(cb);
}
function useSeekDragSec(): number | null {
  return useSyncExternalStore(subscribeDragSec, () => dragSecStore, () => null);
}

// Full-width touch scrubber for the mobile shell. A hairline with an invisible
// thumb read as decoration rather than a control, so the bar carries real weight
// at rest and a visible head, then thickens and blooms under the finger. Seeks
// once, on release: emitting mid-drag makes the native engine stutter behind
// the thumb.
export function MobileSeekBar({
  durationSec,
  active,
  onSeek,
}: {
  durationSec: number;
  active: boolean;
  onSeek: (sec: number) => void;
}) {
  const positionSec = usePlaybackPositionGated(active);
  const bufferedSec = usePlaybackBufferedGated(active);
  const duration = durationSec || 1;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragSec, setDragSec] = useState<number | null>(null);
  const { active: trickplayActive, bufferedOnly } = useTrickplayState();
  const t = useT();

  const shown = dragSec ?? positionSec;
  const ratio = clamp01(shown / duration);
  const liveBufferedSec = dragging ? getPlaybackBuffered() : bufferedSec;
  const bufRatio = clamp01(liveBufferedSec / duration);
  const canFetchPreview =
    !bufferedOnly || shown <= positionSec + Math.max(0, liveBufferedSec - BUFFER_PAD_SEC);

  const secFromClient = (clientX: number): number => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return shown;
    return clamp01((clientX - r.left) / r.width) * duration;
  };
  const moveTo = (sec: number) => {
    setDragSec(sec);
    publishDragSec(sec);
  };
  const end = () => {
    setDragging(false);
    setSeekHovering(false);
    setDragSec(null);
    publishDragSec(null);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label={t("Seek")}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={`${fmtTime(shown)} of ${fmtTime(duration)}`}
      // The visible track is a hairline, but a drag target has to clear the 44pt
      // touch floor or people grab the video instead of the scrubber. The extra
      // band is added ABOVE only: below sits the action row, and stealing its
      // taps would trade one miss for another.
      className="relative cursor-pointer touch-none py-3 before:absolute before:inset-x-0 before:-top-4 before:bottom-0 before:content-['']"
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setDragging(true);
        setSeekHovering(true);
        moveTo(secFromClient(e.clientX));
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        moveTo(secFromClient(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!dragging) return;
        const sec = secFromClient(e.clientX);
        end();
        onSeek(sec);
      }}
      onPointerCancel={end}
      // VoiceOver's increment/decrement on a slider arrives as arrow keys, so
      // without this the scrubber is readable but not operable.
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 10 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -10 : 0;
        if (step !== 0) {
          e.preventDefault();
          onSeek(Math.min(duration, Math.max(0, shown + step)));
          return;
        }
        if (e.key === "Home") {
          e.preventDefault();
          onSeek(0);
        } else if (e.key === "End") {
          e.preventDefault();
          onSeek(duration);
        }
      }}
    >
      <div
        className={`relative w-full overflow-hidden rounded-full bg-white/25 transition-[height] duration-[160ms] ease-out ${
          dragging ? "h-[10px]" : "h-[6px]"
        }`}
      >
        <div className="absolute inset-y-0 left-0 bg-white/45" style={{ width: `${bufRatio * 100}%` }} />
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div
        aria-hidden
        className={`absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_1px_6px_rgba(0,0,0,0.55)] transition-transform duration-[160ms] ease-out ${
          dragging ? "scale-100" : "scale-[0.58]"
        }`}
        style={{ left: `${ratio * 100}%` }}
      />
      {dragging &&
        (trickplayActive ? (
          // ThumbPreview owns frame loading and internal positioning. A zero-width anchor
          // preserves that logic while clamping the card inside the safe-area-padded track.
          <div
            className="pointer-events-none absolute top-1/2 z-10 h-0 w-0"
            style={{
              left: `clamp(${PREVIEW_HALF_WIDTH_PX}px, ${ratio * 100}%, calc(100% - ${PREVIEW_HALF_WIDTH_PX}px))`,
            }}
          >
            <ThumbPreview time={shown} dur={duration} canFetch={canFetchPreview} />
          </div>
        ) : (
          <div className="pointer-events-none absolute -top-9 -translate-x-1/2" style={{ left: `${ratio * 100}%` }}>
            <MobileTimeBezel sec={shown} />
          </div>
        ))}
    </div>
  );
}

export function MobileTimeBezel({ sec }: { sec: number }) {
  return <div className={TIME_BEZEL}>{fmtTime(sec)}</div>;
}

// "12:34 / 1:42:10" for the action row. Follows the finger while scrubbing.
export function MobileTimeLabel({ durationSec, active }: { durationSec: number; active: boolean }) {
  const positionSec = usePlaybackPositionGated(active);
  const dragSec = useSeekDragSec();
  return (
    <span className="font-mono text-[12px] tabular-nums">
      <span className="text-ink">{fmtTime(dragSec ?? positionSec)}</span>
      <span className="text-ink-muted"> / {fmtTime(durationSec)}</span>
    </span>
  );
}

// Hairline timeline that survives after the chrome auto-hides, so playback never
// loses its place. Subscribes only while it is the thing on screen.
export function MobilePeekBar({ durationSec, active }: { durationSec: number; active: boolean }) {
  const positionSec = usePlaybackPositionGated(active);
  const duration = durationSec || 1;
  const ratio = clamp01(positionSec / duration);
  return (
    <div
      aria-hidden
      className="absolute bottom-0 h-[2px] overflow-hidden rounded-full bg-white/10"
      style={{
        marginBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)",
        insetInline: SAFE_INLINE_20,
      }}
    >
      <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
