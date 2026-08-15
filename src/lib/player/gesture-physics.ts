// Pure release-physics helpers shared by every direct-manipulation gesture in the
// mobile player: swipe-down dismiss (gesture stage), sheet drag-to-close, and any
// snap. No React, no DOM tree — trivially unit- and tsc-checkable. Springs are
// tuned once here so dismiss, sheets, and snaps all feel like one hand.

// Where a flick would come to rest if it kept decelerating from `pos` at
// `velocity` (px/s). Mirrors the iOS UIScrollView projection: higher velocity
// projects a proportionally longer travel. `decel` is the per-frame retention
// (0.998 ≈ a long, natural glide; lower stops sooner).
export function projectEndpoint(pos: number, velocity: number, decel = 0.998): number {
  return pos + (velocity / 1000) * (decel / (1 - decel));
}

// iOS rubber-band resistance: as `delta` grows past a boundary, the returned,
// resisted offset asymptotes toward `dim`, so an over-drag feels like pulling
// against a band rather than moving freely. Sign-preserving.
export function rubberBand(delta: number, dim: number, resist = 0.55): number {
  if (dim <= 0) return delta;
  const sign = delta < 0 ? -1 : 1;
  const d = Math.abs(delta);
  return sign * (1 - 1 / ((d * resist) / dim + 1)) * dim;
}

export type SpringOptions = {
  from: number;
  to: number;
  // Release velocity in units/second (the value's units, e.g. px/s).
  velocity?: number;
  stiffness?: number;
  damping?: number;
  mass?: number;
  // Settle thresholds: below both the spring is considered at rest.
  restDelta?: number;
  restSpeed?: number;
  onUpdate: (value: number) => void;
  onRest?: () => void;
};

// A tiny critically-tunable spring value driver. Integrates a damped spring from
// `from` to `to`, seeded with the release velocity, and reports each frame through
// onUpdate. Returns a stop() that cancels the animation. Falls back to a single
// snap when rAF is unavailable (SSR / tests), so it stays import-safe.
export function springBack(opts: SpringOptions): () => void {
  const {
    from,
    to,
    velocity = 0,
    stiffness = 300,
    damping = 30,
    mass = 1,
    restDelta = 0.1,
    restSpeed = 0.2,
    onUpdate,
    onRest,
  } = opts;

  if (typeof requestAnimationFrame === "undefined") {
    onUpdate(to);
    onRest?.();
    return () => {};
  }

  let value = from;
  let vel = velocity;
  let raf = 0;
  let last = 0;
  let stopped = false;

  const step = (now: number) => {
    if (stopped) return;
    if (last === 0) last = now;
    // Clamp dt so a backgrounded tab resuming does not explode the integrator.
    const dt = Math.min(0.064, (now - last) / 1000) || 1 / 60;
    last = now;

    // Semi-implicit Euler on a damped spring: F = -k·x - c·v.
    const springForce = -stiffness * (value - to);
    const dampingForce = -damping * vel;
    const accel = (springForce + dampingForce) / mass;
    vel += accel * dt;
    value += vel * dt;

    if (Math.abs(vel) < restSpeed && Math.abs(value - to) < restDelta) {
      value = to;
      onUpdate(value);
      onRest?.();
      return;
    }
    onUpdate(value);
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}
