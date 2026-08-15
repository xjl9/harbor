import { useRef, useState } from "react";
import {
  getPlaybackBuffered,
  setSeekHovering,
  usePlaybackBuffered,
  usePlaybackBufferedGated,
  usePlaybackPosition,
  usePlaybackPositionGated,
} from "@/lib/player/playback-clock";

// Full-width touch scrubber for the mobile shell. Thin at rest, thickens on grab
// (the YouTube "grow on grab"), three layers (buffered / played / remaining), a
// draggable handle, and a live time bezel above the finger while scrubbing.
export function MobileSeekBar({
  durationSec,
  visible,
  onSeek,
}: {
  durationSec: number;
  visible: boolean;
  onSeek: (sec: number) => void;
}) {
  const positionSec = usePlaybackPositionGated(visible);
  const bufferedSec = usePlaybackBufferedGated(visible);
  const duration = durationSec || 1;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragSec, setDragSec] = useState<number | null>(null);
  const lastEmitAtRef = useRef(0);

  const shown = dragSec ?? positionSec;
  const ratio = clamp01(shown / duration);
  const bufRatio = clamp01((dragging ? getPlaybackBuffered() : bufferedSec) / duration);

  const secFromClient = (clientX: number): number => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return shown;
    return clamp01((clientX - r.left) / r.width) * duration;
  };

  return (
    <div className="flex items-center gap-3">
      <TimeLabel sec={shown} />
      <div
        ref={trackRef}
        className="relative flex-1 cursor-pointer touch-none py-3"
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          setDragging(true);
          setSeekHovering(true);
          setDragSec(secFromClient(e.clientX));
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const sec = secFromClient(e.clientX);
          setDragSec(sec);
          const now = Date.now();
          if (now - lastEmitAtRef.current > 120) {
            lastEmitAtRef.current = now;
            onSeek(sec);
          }
        }}
        onPointerUp={(e) => {
          if (!dragging) return;
          const sec = secFromClient(e.clientX);
          setDragging(false);
          setSeekHovering(false);
          setDragSec(null);
          onSeek(sec);
        }}
        onPointerCancel={() => {
          setDragging(false);
          setSeekHovering(false);
          setDragSec(null);
        }}
      >
        <div
          className={`relative w-full overflow-hidden rounded-full bg-white/22 transition-[height] duration-150 ${
            dragging ? "h-[7px]" : "h-[4px]"
          }`}
        >
          <div
            className="absolute inset-y-0 left-0 bg-white/30"
            style={{ width: `${bufRatio * 100}%` }}
          />
          <div
            className="absolute inset-y-0 left-0 bg-accent"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <div
          aria-hidden
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(0,0,0,0.35)] transition-[width,height] duration-150 ${
            dragging ? "h-[18px] w-[18px]" : "h-[13px] w-[13px]"
          }`}
          style={{ left: `${ratio * 100}%` }}
        />
        {dragging && (
          <div
            className="pointer-events-none absolute -top-9 -translate-x-1/2 rounded-lg bg-black/80 px-2.5 py-1 font-mono text-[13px] font-semibold tabular-nums text-white backdrop-blur-sm"
            style={{ left: `${ratio * 100}%` }}
          >
            {fmt(shown)}
          </div>
        )}
      </div>
      <TimeLabel sec={-Math.max(0, duration - shown)} remaining />
    </div>
  );
}

// A thin, non-interactive progress line that survives after the chrome auto-hides,
// so the timeline never fully vanishes during playback. Reads the clock ungated
// (the full bar's gated hook goes quiet with the chrome) and draws only two layers.
export function MobilePeekBar({ durationSec }: { durationSec: number }) {
  const positionSec = usePlaybackPosition();
  const bufferedSec = usePlaybackBuffered();
  const duration = durationSec || 1;
  const ratio = clamp01(positionSec / duration);
  const bufRatio = clamp01(bufferedSec / duration);
  return (
    <div aria-hidden className="relative h-[2px] w-full overflow-hidden bg-white/15">
      <div className="absolute inset-y-0 left-0 bg-white/25" style={{ width: `${bufRatio * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

function TimeLabel({ sec, remaining }: { sec: number; remaining?: boolean }) {
  return (
    <span className="min-w-[46px] shrink-0 text-center font-mono text-[12.5px] tabular-nums text-white/85">
      {remaining ? `-${fmt(Math.abs(sec))}` : fmt(sec)}
    </span>
  );
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
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
