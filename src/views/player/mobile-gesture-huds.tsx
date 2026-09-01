import { ChevronLeft, ChevronRight, ChevronsRight, Sun, Volume2 } from "lucide-react";
import { CHROME_SURFACE, fmtTime } from "@/components/player/shells/mobile-chrome";

// Every transient HUD the gesture stage draws, on the one chrome material.
export const hudClass = `${CHROME_SURFACE} text-ink`;

export type TapHud = { side: "L" | "R"; count: number; leaving: boolean };

const TAP_HUD_CSS = `
@keyframes harbor-tap-chev {
  from { opacity: 0; transform: translateX(var(--tap-from)); }
  to { opacity: 1; transform: none; }
}
.harbor-tap-chev { animation: harbor-tap-chev 180ms var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  .harbor-tap-chev { animation: none; }
}
`;

// One disc at the center of the tapped third, two chevrons landing 60ms apart,
// the running total underneath. Re-keyed per tap so the chevrons replay.
export function DoubleTapHud({ hud }: { hud: TapHud }) {
  const Chev = hud.side === "R" ? ChevronRight : ChevronLeft;
  const from = hud.side === "R" ? "-6px" : "6px";
  return (
    <div
      className={`pointer-events-none absolute top-1/2 flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full ${hudClass} transition-opacity duration-[320ms] ${
        hud.leaving ? "opacity-0" : "opacity-100"
      }`}
      style={{ left: hud.side === "R" ? "83.333%" : "16.667%" }}
    >
      <style>{TAP_HUD_CSS}</style>
      <div key={hud.count} className="flex items-center" style={{ ["--tap-from" as string]: from }}>
        <Chev size={18} strokeWidth={2} className="harbor-tap-chev -mr-2" />
        <Chev size={18} strokeWidth={2} className="harbor-tap-chev" style={{ animationDelay: "60ms" }} />
      </div>
      <span className="mt-0.5 font-mono text-[13px] font-semibold tabular-nums">
        {hud.count > 0 ? "+" : ""}
        {hud.count}
      </span>
    </div>
  );
}

export function ScrubHud({
  sec,
  duration,
  tier,
  delta,
}: {
  sec: number;
  duration: number;
  tier?: string | null;
  delta?: number;
}) {
  // The delta is what a viewer is actually judging while scrubbing - "how far am I
  // moving", not "what absolute timestamp is this" - and the tier tells them why the
  // same finger travel is suddenly worth less, which is otherwise just a control
  // that stopped responding properly.
  const signed =
    delta == null || Math.abs(delta) < 1
      ? null
      : `${delta > 0 ? "+" : "-"}${fmtTime(Math.abs(delta))}`;
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-[14px] px-5 py-2.5 ${hudClass}`}
    >
      <span className="font-mono text-[18px] font-semibold tabular-nums">
        {fmtTime(sec)}
        <span className="text-ink-muted"> / {fmtTime(duration)}</span>
      </span>
      {(signed || tier) && (
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
          {signed && <span className="text-accent">{signed}</span>}
          {tier && <span>{tier}</span>}
        </span>
      )}
    </div>
  );
}

export function HoldPill() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-8 flex justify-center">
      <div
        className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 font-mono text-[13px] font-semibold tabular-nums ${hudClass} animate-in fade-in slide-in-from-top-1 duration-200`}
      >
        2x
        <ChevronsRight size={16} strokeWidth={2} />
      </div>
    </div>
  );
}

// iOS-style capsule: a slim well with a solid fill, the icon anchored below.
// No number: the fill height is the reading.
export function VerticalMeter({ side, value }: { side: "left" | "right"; value: number }) {
  const Icon = side === "left" ? Sun : Volume2;
  return (
    <div
      className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 text-ink"
      style={{
        [side === "left" ? "left" : "right"]: `calc(env(safe-area-inset-${side}, 0px) + 32px)`,
      }}
    >
      <div className="relative h-[140px] w-3 overflow-hidden rounded-full bg-white/20">
        <div className="absolute inset-x-0 bottom-0 bg-ink" style={{ height: `${value * 100}%` }} />
      </div>
      <Icon size={16} strokeWidth={2} />
    </div>
  );
}
