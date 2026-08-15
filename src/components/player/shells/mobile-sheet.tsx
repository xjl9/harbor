import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import { projectEndpoint, rubberBand, springBack } from "@/lib/player/gesture-physics";
import { haptics } from "@/lib/player/haptics";

// Shared bottom-sheet chrome for the mobile player: dimmed scrim, rounded top,
// grabber handle, and a direct-manipulation drag-to-dismiss. The WHOLE sheet body
// is draggable (not just the grabber); a drag that begins on a scrolled list is
// yielded to native scrolling. Release commits on velocity OR projected travel and
// otherwise springs back — the same physics the gesture stage uses, so dismiss
// feels identical everywhere. Enter springs with a faint overshoot; exit is a
// crisp 200ms ease-in. prefers-reduced-motion collapses both to a plain fade.

const COMMIT_VELOCITY = 1000; // px/s
const EXIT_MS = 200;

// Playback is locked to landscape, so the notch sits on one side and the rounded
// corner on the other. The panel is full-bleed but its grabber is centered, so a
// one-sided inset would visibly shift the grabber: pad both edges by the larger
// inset instead. Resolves to 0px on desktop and non-notched devices.
const SAFE_X = "max(env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))";

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function findScrollParent(from: HTMLElement | null, boundary: HTMLElement | null): HTMLElement | null {
  let el: HTMLElement | null = from;
  while (el && el !== boundary) {
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function MobileSheet({
  open,
  onClose,
  title,
  children,
  heightClass = "max-h-[62vh]",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  heightClass?: string;
}) {
  const t = useT();
  const [mounted, setMounted] = useState(open);
  const [entered, setEntered] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(0);
  const springStop = useRef<(() => void) | null>(null);
  const reduce = useRef(false);

  // Drag trackers
  const armed = useRef(false);
  const originY = useRef(0);
  const lastY = useRef(0);
  const lastT = useRef(0);
  const velRef = useRef(0);
  const scrollEl = useRef<HTMLElement | null>(null);

  // Mount on open; the enter/exit layout effects below drive the motion.
  useEffect(() => {
    if (open) {
      reduce.current = reducedMotion();
      setMounted(true);
      setExiting(false);
    }
  }, [open]);

  // Enter: measure height, seed off-screen, spring to rest (faint overshoot).
  useLayoutEffect(() => {
    if (!open || !mounted) return;
    const h = panelRef.current?.offsetHeight || Math.round(window.innerHeight * 0.6);
    heightRef.current = h;
    if (reduce.current) {
      setTy(0);
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
    setTy(h);
    setEntered(true);
    const id = requestAnimationFrame(() => {
      springStop.current?.();
      springStop.current = springBack({
        from: h,
        to: 0,
        velocity: 0,
        stiffness: 250,
        damping: 28,
        onUpdate: setTy,
        onRest: () => {
          springStop.current = null;
        },
      });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);

  // Exit: stop any spring, slide/fade out, unmount after the window.
  useEffect(() => {
    if (open || !mounted) return;
    springStop.current?.();
    springStop.current = null;
    setEntered(false);
    setExiting(true);
    if (!reduce.current) {
      const h = heightRef.current || Math.round(window.innerHeight * 0.6);
      requestAnimationFrame(() => setTy(h));
    }
    const id = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
    }, EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);

  useEffect(
    () => () => {
      springStop.current?.();
    },
    [],
  );

  if (!mounted) return null;

  const h = heightRef.current || 1;
  const progress = clamp(1 - ty / h, 0, 1);
  const backdropOpacity = exiting ? 0 : (reduce.current ? (entered ? 0.55 : 0) : progress * 0.55);
  const panelOpacity = reduce.current ? (entered && !exiting ? 1 : 0) : 1;

  // Enter spring, release spring, and active drag all drive `ty` frame-by-frame in
  // JS, so no CSS transition there; only the exit slide/fade is CSS-driven.
  const panelTransition = exiting
    ? reduce.current
      ? `opacity ${EXIT_MS}ms cubic-bezier(0.4,0,1,1)`
      : `transform ${EXIT_MS}ms cubic-bezier(0.4,0,1,1)`
    : "none";

  const onDown = (e: React.PointerEvent) => {
    if (exiting) return;
    armed.current = true;
    originY.current = e.clientY;
    lastY.current = e.clientY;
    lastT.current = performance.now();
    velRef.current = 0;
    scrollEl.current = findScrollParent(e.target as HTMLElement, panelRef.current);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging) {
      const dy = e.clientY - originY.current;
      const val = dy < 0 ? rubberBand(dy, heightRef.current || 400) : dy;
      setTy(clamp(val, -48, heightRef.current || 400));
      const now = performance.now();
      const dt = now - lastT.current;
      if (dt > 0) {
        const inst = ((e.clientY - lastY.current) / dt) * 1000;
        velRef.current = velRef.current * 0.4 + inst * 0.6;
      }
      lastY.current = e.clientY;
      lastT.current = now;
      return;
    }
    if (!armed.current) return;
    const dy = e.clientY - originY.current;
    if (Math.abs(dy) < 6) return;
    const sc = scrollEl.current;
    const atTop = !sc || sc.scrollTop <= 0;
    if (dy > 0 && atTop) {
      setDragging(true);
      springStop.current?.();
      springStop.current = null;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      originY.current = e.clientY;
      lastY.current = e.clientY;
      lastT.current = performance.now();
    } else {
      // Hand the gesture back to native scrolling.
      armed.current = false;
    }
  };
  const endDrag = (commitAllowed: boolean) => {
    armed.current = false;
    if (!dragging) return;
    setDragging(false);
    const height = heightRef.current || 400;
    const dist = Math.max(0, ty);
    const vel = velRef.current;
    const projected = projectEndpoint(dist, vel);
    const commit = commitAllowed && (vel > COMMIT_VELOCITY || projected > height * 0.4 || dist > height * 0.4);
    if (commit) {
      haptics.medium();
      onClose();
      return;
    }
    if (reduce.current) {
      setTy(0);
      return;
    }
    springStop.current?.();
    springStop.current = springBack({
      from: ty,
      to: 0,
      velocity: vel,
      stiffness: 300,
      damping: 30,
      onUpdate: setTy,
      onRest: () => {
        springStop.current = null;
      },
    });
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[70] flex flex-col justify-end">
      <button
        type="button"
        aria-label={t("Close")}
        onClick={onClose}
        className="absolute inset-0 bg-black"
        style={{ opacity: backdropOpacity, transition: exiting ? `opacity ${EXIT_MS}ms ease` : "none" }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => endDrag(true)}
        onPointerCancel={() => endDrag(false)}
        className={`relative flex ${heightClass} touch-pan-y flex-col overflow-hidden rounded-t-[20px] border-t border-edge bg-elevated shadow-[0_-20px_60px_-12px_rgba(0,0,0,0.85)]`}
        style={{
          transform: `translateY(${ty}px)`,
          opacity: panelOpacity,
          transition: panelTransition,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingLeft: SAFE_X,
          paddingRight: SAFE_X,
        }}
      >
        <div className="flex shrink-0 items-center justify-center pt-2.5 pb-1">
          <span aria-hidden className="h-1 w-10 rounded-full bg-ink/20" />
        </div>
        {title && (
          <div className="shrink-0 px-5 pb-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {title}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
