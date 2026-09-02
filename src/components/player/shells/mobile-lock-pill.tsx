import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { MOBILE_LOCK_PEEK_EVENT, setMobileLocked } from "@/lib/player/mobile-lock";
import { haptics } from "@/lib/player/haptics";
import { CHROME_SURFACE } from "./mobile-chrome";
import { MOBILE_GLYPH_SIZE } from "./mobile-button";
import { MobileGlyph } from "./mobile-glyph";
import { MOBILE_GLYPH } from "./mobile-icons";

const LABEL_MS = 1200;
const PEEK_MS = 3000;

// The only chrome while locked. Mounts the moment the lock engages, so it can
// say "Locked" for a beat before fading; after that a tap on the stage peeks it
// for a few seconds so the user can find the way out.
export function MobileLockPill() {
  const t = useT();
  const [label, setLabel] = useState(true);
  const [peek, setPeek] = useState(true);
  const peekTimer = useRef<number | null>(null);

  useEffect(() => {
    const labelId = window.setTimeout(() => setLabel(false), LABEL_MS);
    const armPeek = (ms: number) => {
      setPeek(true);
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
      peekTimer.current = window.setTimeout(() => setPeek(false), ms);
    };
    armPeek(PEEK_MS);
    const onPeek = () => armPeek(PEEK_MS);
    window.addEventListener(MOBILE_LOCK_PEEK_EVENT, onPeek);
    return () => {
      window.clearTimeout(labelId);
      window.removeEventListener(MOBILE_LOCK_PEEK_EVENT, onPeek);
      if (peekTimer.current) window.clearTimeout(peekTimer.current);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <button
        type="button"
        aria-label={t("Unlock")}
        onClick={() => {
          haptics.select();
          setMobileLocked(false);
        }}
        className={`${CHROME_SURFACE} absolute left-1/2 flex h-11 min-w-11 -translate-x-1/2 items-center justify-center gap-2 rounded-full text-ink transition-[opacity,padding] duration-200 active:bg-white/10 ${
          label ? "px-4" : "px-0"
        } ${peek ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          opacity: peek ? 1 : 0,
        }}
      >
        <MobileGlyph url={MOBILE_GLYPH.lock} size={MOBILE_GLYPH_SIZE} />
        {label && <span className="text-[13px] font-medium">{t("Locked")}</span>}
      </button>
    </div>
  );
}
