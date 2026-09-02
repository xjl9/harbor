import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { CHROME_SURFACE } from "./mobile-chrome";

// One hint, once, on the first three playbacks - then never again.
//
// The touch player has a real gesture vocabulary and nothing on screen said so, so
// a viewer had no way to discover any of it. This teaches one thing per playback
// and gets out of the way.
//
// It is deliberately fire-once-per-mount. Keying the effect on chrome visibility
// re-showed the same hint every single time the controls came back, which turned a
// teaching aid into something that would not go away.

const KEY = "harbor.player.coach.v1";
const SHOW_MS = 3200;

function seen(): number {
  try {
    const raw = Number(localStorage.getItem(KEY) ?? "0");
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

function bump(next: number) {
  try {
    localStorage.setItem(KEY, String(next));
  } catch {}
}

export function MobileCoach({ visible }: { visible: boolean }) {
  const t = useT();
  const [index] = useState(seen);
  const [shown, setShown] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    if (index >= 3 || !visible || firedRef.current) return;
    firedRef.current = true;
    bump(index + 1);
    setShown(true);
    const id = window.setTimeout(() => setShown(false), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [index, visible]);

  // Goes with the chrome. Left on its own it outlived the controls it was
  // describing and sat over the picture.
  useEffect(() => {
    if (!visible) setShown(false);
  }, [visible]);

  if (index >= 3 || !shown) return null;
  const lines = [
    t("Double-tap either side to skip"),
    t("Drag across the picture to scrub"),
    t("Hold anywhere for 2x speed"),
  ];
  return (
    <div
      // Under the title, not across the middle. The centre of the frame is where the
      // transport sits in landscape, and a hint that covers the play button is worse
      // than no hint.
      className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-6"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + 68px)",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(-6px)",
        transition: "opacity 240ms var(--ease-out), transform 240ms var(--ease-out)",
      }}
    >
      <span
        className={`${CHROME_SURFACE} rounded-full px-3.5 py-2 font-jakarta text-[11px] uppercase tracking-[0.14em] text-ink`}
      >
        {lines[index]}
      </span>
    </div>
  );
}
