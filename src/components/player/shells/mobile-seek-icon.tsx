import { RotateCcw, RotateCw } from "lucide-react";

// ±N seconds glyph: a circular-arrow with the step count nested inside, the
// universal skip affordance. `seconds` reflects the user's configured step.
export function RotatingSeekIcon({
  direction,
  seconds = 10,
}: {
  direction: "back" | "forward";
  seconds?: number;
}) {
  const Arrow = direction === "back" ? RotateCcw : RotateCw;
  return (
    <span className="relative flex h-10 w-10 items-center justify-center">
      <Arrow size={38} strokeWidth={1.7} />
      <span className="absolute text-[11px] font-bold tabular-nums">{seconds}</span>
    </span>
  );
}
