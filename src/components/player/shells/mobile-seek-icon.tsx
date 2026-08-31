import { useEffect, useState } from "react";

// Skip glyph: an open arc with a 60 degree gap at the top and an arrowhead on
// the leading tip, the step count sitting at the optical center. Drawn by hand
// rather than lucide's RotateCw so the arc weight matches the 2px icon family
// and the numeral has room. Bump `spin` to nudge the arc a quarter turn.
export function RotatingSeekIcon({
  direction,
  seconds = 10,
  spin = 0,
}: {
  direction: "back" | "forward";
  seconds?: number;
  spin?: number;
}) {
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (!spin) return;
    setTurn(90);
    const id = window.setTimeout(() => setTurn(0), 220);
    return () => window.clearTimeout(id);
  }, [spin]);

  // Authored clockwise for "forward"; "back" is the same path mirrored, which
  // also mirrors the press rotation so both arcs turn in their travel direction.
  const mirror = direction === "back" ? "scale(-1,1) " : "";
  return (
    <span className="relative flex h-[26px] w-[26px] items-center justify-center">
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        style={{
          transform: `${mirror}rotate(${turn}deg)`,
          transformOrigin: "50% 50%",
          transition: "transform 220ms var(--ease-out)",
        }}
      >
        <path d="M 18.5 3.47 A 11 11 0 1 1 7.5 3.47" />
        <path d="M 5.96 7.7 L 7.5 3.47 L 3.07 2.69" />
      </svg>
      <span className="absolute font-mono text-[10px] font-semibold leading-none tabular-nums">{seconds}</span>
    </span>
  );
}
