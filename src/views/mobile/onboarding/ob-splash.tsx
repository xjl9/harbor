import { useEffect, useRef, useState } from "react";
import { HarborMark } from "@/components/icons/harbor-mark";
import { useT } from "@/lib/i18n";

// Timing parity with the desktop splash-step; the poster wall is deliberately
// dropped on mobile (network + compositing cost before the user has done anything).
const SPLASH_DURATION_MS = 2600;

export function ObSplash({ onAdvance }: { onAdvance: () => void }) {
  const t = useT();
  const [out, setOut] = useState(false);
  const advanced = useRef(false);

  useEffect(() => {
    const fadeAt = window.setTimeout(() => setOut(true), SPLASH_DURATION_MS - 380);
    const advanceAt = window.setTimeout(() => {
      if (advanced.current) return;
      advanced.current = true;
      onAdvance();
    }, SPLASH_DURATION_MS);
    return () => {
      clearTimeout(fadeAt);
      clearTimeout(advanceAt);
    };
  }, [onAdvance]);

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-3 text-center ${
        out ? "animate-splash-out" : ""
      }`}
    >
      <h1 className="animate-splash-title flex items-center gap-3 font-display text-[56px] font-medium leading-none tracking-tight text-ink">
        <HarborMark className="h-[1em] w-[1em] shrink-0" />
        <span style={{ transform: "translateY(0.04em)" }}>
          Harb
          <span
            className="inline-block"
            style={{ transform: "rotate(7deg)", transformOrigin: "50% 65%" }}
          >
            o
          </span>
          r
        </span>
      </h1>
      <p
        className="animate-splash-title text-[12px] uppercase tracking-[0.42em] text-ink-muted"
        style={{ animationDelay: "260ms" }}
      >
        {t("For watching things")}
      </p>
    </div>
  );
}
