import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { CHROME_SURFACE } from "./mobile-chrome";

// The touch player carries a real gesture vocabulary - double-tap either side to
// skip, drag across to scrub, drag up and down at the edges for brightness and
// volume, hold anywhere for 2x - and absolutely nothing on screen said so. A
// feature nobody can find is indistinguishable from one that does not exist, and
// "there is nothing here" is a fair reading of a player that looks like a play
// button and a bar.
//
// One hint per playback, three playbacks, then never again. Deliberately not a
// tutorial or an overlay you have to dismiss: it appears with the chrome, says one
// thing, and leaves on its own.

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

  useEffect(() => {
    if (index >= 3 || !visible) return;
    setShown(true);
    bump(index + 1);
    const id = window.setTimeout(() => setShown(false), SHOW_MS);
    return () => window.clearTimeout(id);
    // Once per mount: a hint that reappeared every time the chrome came back would
    // be nagging rather than teaching.
  }, [index, visible]);

  if (index >= 3) return null;
  const lines = [
    t("Double-tap either side to skip"),
    t("Drag across the picture to scrub"),
    t("Hold anywhere for 2x speed"),
  ];
  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex justify-center px-6"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 240ms var(--ease-out), transform 240ms var(--ease-out)",
      }}
    >
      <span
        className={`${CHROME_SURFACE} rounded-full px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink`}
      >
        {lines[index]}
      </span>
    </div>
  );
}
