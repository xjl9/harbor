/**
 * Mobile motion system.
 *
 * One place to tune how the phone UI moves. Two curves and one duration scale;
 * anything that needs a third is almost certainly two ideas wearing one coat.
 *
 * Arrivals decelerate, departures accelerate. That asymmetry is what makes a
 * screen feel like it settled rather than stopped.
 *
 * Press is deliberately NOT in here. It is owned by the `button` rule in the
 * base layer of index.css (`transition: scale 90ms var(--ease-out)` plus
 * `scale: 0.97`), which is the only thing that actually renders it. A constant
 * here that nothing consumes is a second source of truth waiting to drift.
 */

/** Arriving. Fast out of the gate, long slow landing. Same curve as --ease-out in index.css. */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";
/** Leaving. Starts gently, accelerates away. Nothing needs to watch it finish. */
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * Durations in ms. Every one of these is a felt quality, not a free parameter.
 * Change them here, feel the whole surface change together.
 */
export const MOTION = {
  /** A surface simply being present: scrims, backgrounds. Short enough to read as "already there". */
  fast: 160,
  /** The standard. A panel enter or exit that reads as a move without ever being waited on. */
  base: 240,
  /** Content settling in behind whatever led the transition. */
  content: 320,
  /** Content holds this long so the shared element is unambiguously the subject. */
  contentDelay: 60,
  /** How far content travels while settling. Past ~12px it reads as a slide, not a settle. */
  contentRise: 10,
  /** The shared-element flight out. The one animation the user is meant to follow with their eye. */
  travel: 380,
  /**
   * How long the source tile keeps painting after the flight starts. The flyer
   * spends its first frames translucent (the screen is fading up through it)
   * and still sitting on the tile, so handing over at t=0 blanks the spot the
   * finger just left. One beat later the flyer has separated and gone opaque.
   */
  handoff: 60,
  /**
   * Leaving: the screen fade and the poster's flight home. One value, because
   * they are one event: the poster has to land exactly as the screen clears,
   * and two constants 20ms apart were indistinguishable and free to drift.
   */
  exit: 260,
  /**
   * Slack on the exit timer. The unmount is driven by this clock, never by an
   * animation event alone: a stylesheet that collapses the animation (reduced
   * motion) or an event that never arrives must not be able to trap the user
   * on a screen with no way out.
   */
  exitGrace: 80,
  /** Image cross-fade once a decode lands. Same duration as the fade in components/poster (which uses the ease-out keyword, not EASE_OUT). */
  image: 300,
  /** A captured origin older than this is stale: background nav, deep link, a tap that went nowhere. */
  originTtl: 900,
} as const;

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * A tap target claimed as the source of a shared-element transition.
 *
 * The element is measured lazily so the rect is correct at the moment the
 * transition actually starts, and again when it plays in reverse. The handle
 * holds the element weakly: a tap that never became a navigation must not pin
 * a detached rail tile in memory.
 */
export type OriginHandle = {
  /** Where the source is right now, or null if it is gone, empty or offscreen. */
  rect(): Rect | null;
  /**
   * Hands the artwork over to the flyer. Without this the "shared" element is a
   * ghost racing its own original: the tile stays painted in the rail while a
   * copy of it flies away.
   */
  hide(): void;
  /** Gives the artwork back. Idempotent, and safe after the element is gone. */
  show(): void;
};

/**
 * Marks a tap target as a valid shared-element source when it has no <Poster>
 * inside it (continue-watching cards paint their own <img>).
 */
export const FLIP_ORIGIN_ATTR = "data-flip-origin";

/** The element a screen animates its shared element *into*. Queried, not prop-drilled. */
export const FLIP_TARGET_ATTR = "data-flip-target";

// Everything the module remembers about the page it is transitioning *from* is
// held weakly. A strong reference here outlives every screen it belongs to.
let pending: WeakRef<HTMLElement> | null = null;
let pendingAt = 0;
let handle: OriginHandle | null = null;
let handleFor: WeakRef<HTMLElement> | null = null;
let hidden: WeakRef<HTMLElement> | null = null;

function deref(ref: WeakRef<HTMLElement> | null): HTMLElement | null {
  return ref?.deref() ?? null;
}

/**
 * Origin capture is a single document-level listener rather than a prop on
 * every tile, because the same detail screen is opened from rails, search,
 * library, recommendations and collections. One listener keeps all of those
 * call sites free of transition plumbing, and only artwork-bearing buttons
 * ever qualify, so taps on ordinary controls cannot hijack the transition.
 * Nothing is measured here: pointerdown often precedes a scroll, and a forced
 * layout on every touch is not worth a rect we may never use.
 */
function onPointerDown(e: Event) {
  const from = e.target instanceof Element ? e.target.closest("button, a") : null;
  if (!(from instanceof HTMLElement)) {
    pending = null;
    return;
  }
  const art =
    from.querySelector<HTMLElement>(".harbor-poster") ??
    (from.hasAttribute(FLIP_ORIGIN_ATTR) ? from : null);
  pending = art ? new WeakRef(art) : null;
  pendingAt = Date.now();
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
}

function pendingOrigin(): HTMLElement | null {
  const el = deref(pending);
  if (!el || Date.now() - pendingAt > MOTION.originTtl) return null;
  return el;
}

/** The last bitmap the tapped artwork actually painted, if the tap is still fresh. */
export function peekOriginPaint(): string | undefined {
  const el = pendingOrigin();
  return el ? paintedSrc(el) : undefined;
}

/**
 * Two URLs pointing at the same artwork at different sizes. Tiles size their
 * own request from their measured box, so a 124px rail poster and a 92px hero
 * poster are different URLs of one picture; only the size segment differs.
 */
export function sameArtwork(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return artworkKey(a) === artworkKey(b);
}

function artworkKey(url: string): string {
  return url.replace(/(\/t\/p\/)(w\d+|original)(\/)/, "$1$3").split("?")[0];
}

function paintedSrc(el: HTMLElement): string | undefined {
  const imgs = el instanceof HTMLImageElement ? [el] : [...el.querySelectorAll("img")];
  // Last first: <Poster> keeps the previous decode underneath the current one.
  for (let i = imgs.length - 1; i >= 0; i--) {
    const img = imgs[i];
    if (img.complete && img.naturalWidth > 0 && img.currentSrc) return img.currentSrc;
  }
  return undefined;
}

function hideOrigin(el: HTMLElement) {
  // Never leave two tiles hidden: if a previous flight failed to restore its
  // source, the next one puts it back. visibility (not display/opacity) so the
  // rail keeps its geometry and the tile's decoded bitmap stays warm.
  const prev = deref(hidden);
  if (prev && prev !== el) prev.style.visibility = "";
  el.style.visibility = "hidden";
  hidden = new WeakRef(el);
}

function showOrigin(el: HTMLElement) {
  el.style.visibility = "";
  if (deref(hidden) === el) hidden = null;
}

function makeHandle(target: HTMLElement): OriginHandle {
  const ref = new WeakRef(target);
  return {
    rect() {
      const el = ref.deref();
      // Detached (the source screen re-rendered) or scrolled out of sight: a
      // poster flying in from outside the viewport reads as a glitch, not a move.
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return null;
      if (r.bottom < 0 || r.top > window.innerHeight) return null;
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    },
    hide() {
      const el = ref.deref();
      if (el) hideOrigin(el);
    },
    show() {
      const el = ref.deref();
      if (el) showOrigin(el);
    },
  };
}

/**
 * Takes ownership of the most recent artwork tap, if it is recent enough to
 * have caused this navigation. Returns null for deep links, programmatic
 * navigation, and anything opened from a control without artwork, which is the
 * signal to fall back to a plain fade.
 *
 * Claiming is idempotent rather than destructive: React StrictMode invokes
 * layout effects twice in development, and a claim consumed by the first pass
 * left the surviving pass with nothing to fly, so the entrance never played in
 * a dev build. The TTL and the liveness checks in rect() do the expiring.
 */
export function claimOrigin(): OriginHandle | null {
  const el = pendingOrigin();
  if (!el) return null;
  if (deref(handleFor) !== el || !handle) {
    handleFor = new WeakRef(el);
    handle = makeHandle(el);
  }
  return handle;
}

/**
 * FLIP delta between a captured source rect and an element's natural rect.
 *
 * Uniform scale off the width, aligned centre to centre. Two aspect ratios in
 * play (portrait posters, 16:9 cards) and non-uniform scale would squash the
 * artwork, so a landscape source grows out of its own centre instead of
 * morphing. Returns null when there is nothing worth animating.
 */
function flipTransform(from: Rect, el: HTMLElement): string | null {
  const to = el.getBoundingClientRect();
  if (to.width < 1 || to.height < 1) return null;
  const scale = Math.min(6, Math.max(0.08, from.w / to.width));
  const dx = from.x + from.w / 2 - (to.left + to.width / 2);
  const dy = from.y + from.h / 2 - (to.top + to.height / 2);
  if (Math.abs(dx) < 2 && Math.abs(dy) < 2 && Math.abs(scale - 1) < 0.02) return null;
  return `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
}

// A flight can be interrupted by the next one (close during open, or an in-stack
// navigation), so the entrance's completion handler is tracked and cancelled
// rather than left to fire against whatever transform is running by then.
const pendingEnd = new WeakMap<HTMLElement, (ev: TransitionEvent) => void>();

function clearEnd(el: HTMLElement) {
  const handler = pendingEnd.get(el);
  if (!handler) return;
  el.removeEventListener("transitionend", handler);
  pendingEnd.delete(el);
}

// will-change is set here, on the element that is about to move, and cleared in
// resetFlip when it stops. It is never baked into a class: a compositor layer
// that outlives its animation is GPU memory held for nothing.
function lift(el: HTMLElement) {
  el.style.transformOrigin = "center";
  el.style.willChange = "transform";
  el.style.zIndex = "20";
  // The hero poster sits between gradient overlays; it has to travel above them.
  if (!el.style.position) el.style.position = "relative";
}

/** Returns the element to the stylesheet's care. Safe to call at any point in a flight. */
export function resetFlip(el: HTMLElement) {
  clearEnd(el);
  el.style.transition = "";
  el.style.transform = "";
  el.style.willChange = "";
  el.style.zIndex = "";
  el.style.position = "";
  el.style.transformOrigin = "";
}

/**
 * Plays `el` from a captured source rect to its own laid-out position.
 * Transform only: no width, height or offset is ever animated.
 * Returns false when there was nothing worth animating, so the caller can leave
 * the source tile visible instead of hiding it for a flight that never happens.
 */
export function flipIn(el: HTMLElement, from: Rect, duration = MOTION.travel): boolean {
  const start = flipTransform(from, el);
  if (!start) return false;
  clearEnd(el);
  lift(el);
  el.style.transition = "none";
  el.style.transform = start;
  void el.offsetWidth; // flush, so the next write is a transition and not a jump
  el.style.transition = `transform ${duration}ms ${EASE_OUT}`;
  el.style.transform = "translate3d(0, 0, 0) scale(1)";
  const done = (ev: TransitionEvent) => {
    if (ev.target !== el || ev.propertyName !== "transform") return;
    resetFlip(el);
  };
  el.addEventListener("transitionend", done);
  pendingEnd.set(el, done);
  return true;
}

/**
 * Plays `el` back toward a source rect, on the departure curve. The caller
 * unmounts on its own exit clock, so this never needs to clean up after itself.
 *
 * One forced layout, not two: `lift` only writes transformOrigin/willChange/
 * z-index/position, none of which affect the `transform: none` starting value,
 * so it can happen before the single flush. This lands on the one frame that
 * has to be smooth, with both the home page and the whole detail DOM mounted.
 */
export function flipOut(el: HTMLElement, to: Rect, duration = MOTION.exit): boolean {
  clearEnd(el);
  lift(el);
  // Measure the natural rect: an entrance flight may still be mid-transform.
  el.style.transition = "none";
  el.style.transform = "none";
  void el.offsetWidth;
  const end = flipTransform(to, el);
  if (!end) {
    resetFlip(el);
    return false;
  }
  el.style.transition = `transform ${duration}ms ${EASE_IN}`;
  el.style.transform = end;
  return true;
}
