import { useEffect, useState } from "react";
import { CHROME_SURFACE, SAFE_BOTTOM, SAFE_INLINE_20, fmtTime } from "./mobile-chrome";

// Taking back a scrub.
//
// A big seek is the one player action that destroys information: the place you were
// is gone, and the only way back is to scrub again and guess. Every other
// destructive action in software offers an undo; this one traditionally does not,
// so people scrub timidly instead of freely.
//
// Offered only when the jump was large enough to have been a mistake worth undoing,
// and it stays out of the way: a small pill that expires on its own.

const MIN_JUMP_SEC = 45;
const LIFETIME_MS = 6000;

export type SeekUndo = { from: number; at: number } | null;

export function MobileSeekUndo({
  undo,
  onUndo,
  onDismiss,
}: {
  undo: SeekUndo;
  onUndo: (sec: number) => void;
  onDismiss: () => void;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!undo) {
      setShown(false);
      return;
    }
    setShown(true);
    const id = window.setTimeout(() => {
      setShown(false);
      onDismiss();
    }, LIFETIME_MS);
    return () => window.clearTimeout(id);
  }, [undo, onDismiss]);

  if (!undo) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
      style={{
        // Above the folio, not over it: this appears while the chrome is up, and
        // covering the scrubber with the way back to where you were is perverse.
        bottom: `calc(${SAFE_BOTTOM} + 168px)`,
        paddingInline: SAFE_INLINE_20,
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(6px)",
        transition: "opacity 200ms var(--ease-out), transform 200ms var(--ease-out)",
      }}
    >
      <button
        type="button"
        onClick={() => {
          onUndo(undo.from);
          setShown(false);
          onDismiss();
        }}
        className={`pointer-events-auto flex h-11 items-center gap-2 rounded-full px-4 ${CHROME_SURFACE} active:scale-[0.97]`}
      >
        <span className="font-jakarta text-[11px] uppercase tracking-[0.14em] text-ink-muted">
          Back to
        </span>
        <span className="font-jakarta text-[13px] font-semibold tabular-nums text-ink">
          {fmtTime(undo.from)}
        </span>
      </button>
    </div>
  );
}

export const SEEK_UNDO_MIN_JUMP_SEC = MIN_JUMP_SEC;
