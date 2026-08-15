import { useCallback, useEffect, useRef, useState } from "react";
import { meta as fetchCinemetaMeta, narrowMediaType, type Meta } from "@/lib/cinemeta";
import { tmdbDetails, type TmdbDetail } from "@/lib/providers/tmdb";
import { EASE_IN, EASE_OUT, MOTION } from "@/lib/motion";

// Same incremental windowing as desktop anime-episodes: long seasons (absolute
// orderings can fold 1000+ episodes into one list) mount in steps instead of
// all at once, growing as an offscreen sentinel nears the viewport.
const WINDOW_STEP = 60;

export function useEpisodeWindow(total: number, resetSig: string) {
  const [renderCount, setRenderCount] = useState(WINDOW_STEP);
  useEffect(() => {
    setRenderCount(WINDOW_STEP);
  }, [resetSig]);
  const hasMore = renderCount < total;
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRenderCount((c) => (c >= total ? c : Math.min(total, c + WINDOW_STEP)));
        }
      },
      { rootMargin: "1200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, total]);
  return { renderCount, hasMore, sentinelRef };
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Live, not a snapshot. The media query updates while the screen is open (the
 * OS toggle is reachable from the control centre mid-session), and a screen
 * that decided once at mount how it was allowed to close could be left holding
 * an exit animation the stylesheet had since turned off.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/**
 * Dismissal for the detail screen's sheets. `leaving` flips first so the panel
 * can play its exit, then the parent's `onClose` runs and the sheet unmounts.
 *
 * The clock is the point. Listening for animationend is the obvious way to time
 * this and the wrong one: reduced motion collapses the animation, a backgrounded
 * tab need never deliver the event, and either case strands the user holding a
 * sheet that will not close. The timer always fires; the animation is only what
 * happens to be painted while it runs. Closing is one-shot, so a second tap on a
 * sheet already on its way out cannot restart the exit or close twice.
 *
 * Mirrors the render/leaving shape of useSheetPresence in ../remote-extras, kept
 * local because these sheets are mounted conditionally by their parent rather
 * than held open by a prop, and because every value here comes from lib/motion.
 */
export function useSheetExit(onClose: () => void): { leaving: boolean; close: () => void } {
  const reduced = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const closed = useRef(false);
  const timer = useRef(0);
  // onClose is a fresh closure on every parent render; hold the latest one
  // rather than rebuilding the timer around it.
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    if (reduced) {
      latest.current();
      return;
    }
    setLeaving(true);
    timer.current = window.setTimeout(() => latest.current(), MOTION.exit + MOTION.exitGrace);
  }, [reduced]);

  return { leaving, close };
}

// The detail screen no longer slides in as a slab. The tapped poster carries the
// transition (see lib/motion + detail.tsx) and everything here exists to stay out
// of its way: the screen only materialises, content only settles. Durations and
// curves come from the motion system so this stylesheet has no opinions of its own.
export const DETAIL_CSS = `
@keyframes md-detail-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes md-detail-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes md-rise-in { from { opacity: 0; transform: translate3d(0, ${MOTION.contentRise}px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
@keyframes md-sheet-in { from { transform: translate3d(0, 100%, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes md-sheet-out { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, 100%, 0); } }
@keyframes md-sheet-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes md-zoom-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
@keyframes md-zoom-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.94); } }
@keyframes md-accordion { from { opacity: 0; transform: translate3d(0, -4px, 0); } to { opacity: 1; transform: translate3d(0, 0, 0); } }
.md-detail-in { animation: md-detail-in ${MOTION.fast}ms ${EASE_OUT} both; }
.md-detail-out { animation: md-detail-out ${MOTION.exit}ms ${EASE_IN} both; }
/* No will-change on any of these. An element with a running transform/opacity
   animation is already promoted for the length of that animation; baking the
   hint into the class holds a compositor layer for the whole life of the screen
   Worst on .md-rise-in, which wraps the tallest column in the app. */
.md-rise-in { animation: md-rise-in ${MOTION.content}ms ${EASE_OUT} ${MOTION.contentDelay}ms both; }
.md-sheet-in { animation: md-sheet-in ${MOTION.base}ms ${EASE_OUT} both; }
.md-sheet-fade { animation: md-sheet-fade ${MOTION.fast}ms ${EASE_OUT} both; }
.md-zoom-in { animation: md-zoom-in ${MOTION.base}ms ${EASE_OUT} both; }
.md-accordion { animation: md-accordion ${MOTION.fast}ms ${EASE_OUT} both; }
/* Departures. The entrance played backwards on the departure curve, and every
   one of them on the single exit duration: a scrim that cleared before its panel
   had finished leaving would hand the user a bright screen with a sheet still
   sliding off it. They are one event, so they get one clock.
   pointer-events is dropped for the same reason the unmount is timer-driven: a
   sheet on its way out must not be able to take another tap.
   The scrim reuses md-detail-out's keyframes; one surface fading away is one idea. */
.md-sheet-out { animation: md-sheet-out ${MOTION.exit}ms ${EASE_IN} both; pointer-events: none; }
.md-sheet-fade-out { animation: md-detail-out ${MOTION.exit}ms ${EASE_IN} both; pointer-events: none; }
.md-zoom-out { animation: md-zoom-out ${MOTION.exit}ms ${EASE_IN} both; pointer-events: none; }
/* Same fade, but for a leaving surface that is itself the full-screen backdrop.
   Dropping pointer-events there would not make it inert, it would make it
   transparent to taps: for the whole exit the screen is still painted while a
   second impatient tap falls through to whatever is underneath. A backdrop keeps
   swallowing until it is gone; its children carry the inert classes. */
.md-fade-out { animation: md-detail-out ${MOTION.exit}ms ${EASE_IN} both; }
@media (prefers-reduced-motion: reduce) {
  /* The -out classes are deliberately absent: animation:none also nulls the
     animation-name, so animationend never fires and anything watching for it
     waits forever. The global reduced-motion reset in index.css already
     collapses them to 0.01ms, which reads as instant and still completes.
     Nothing here is load-bearing either way — useSheetExit closes on a timer,
     and under reduced motion it unmounts without ever painting these. */
  .md-detail-in, .md-rise-in, .md-sheet-in, .md-sheet-fade, .md-zoom-in, .md-accordion { animation: none; }
}
`;

export const HIDE_SCROLL = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export type Ep = {
  season: number;
  episode: number;
  name?: string;
  still?: string;
  overview?: string;
  runtime?: number | null;
  airDate?: string | null;
  imdbRating?: number | null;
};

export type SeasonOption = { number: number; label: string };

export function useCinemetaFull(meta: Meta): Meta | null {
  const [full, setFull] = useState<Meta | null>(
    meta.videos && meta.videos.length > 0 ? meta : null,
  );
  useEffect(() => {
    setFull(meta.videos && meta.videos.length > 0 ? meta : null);
    if (!meta.id.startsWith("tt")) return;
    let alive = true;
    fetchCinemetaMeta(narrowMediaType(meta.type), meta.id)
      .then((m) => {
        if (alive && m) setFull(m);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [meta.id, meta.type]);
  return full;
}

export function useTmdbDetail(meta: Meta, key: string): { detail: TmdbDetail | null; loading: boolean } {
  const [detail, setDetail] = useState<TmdbDetail | null>(null);
  const [loading, setLoading] = useState(!!key);
  useEffect(() => {
    setDetail(null);
    if (!key) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let alive = true;
    tmdbDetails(key, meta)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [key, meta.id]);
  return { detail, loading };
}

export function seasonList(full: Meta | null, detail: TmdbDetail | null): number[] {
  const set = new Set<number>();
  for (const v of full?.videos ?? []) {
    if (typeof v.season === "number" && v.season >= 1) set.add(v.season);
  }
  if (set.size === 0) for (const s of detail?.seasons ?? []) set.add(s.seasonNumber);
  return [...set].sort((a, b) => a - b);
}

export function firstEpisode(
  full: Meta | null,
  seasons: number[],
): { season: number; episode: number } | null {
  const vids = (full?.videos ?? []).filter(
    (v) => typeof v.season === "number" && v.season >= 1 && typeof v.episode === "number",
  );
  if (vids.length > 0) {
    const sorted = [...vids].sort((a, b) => a.season! - b.season! || a.episode! - b.episode!);
    return { season: sorted[0].season!, episode: sorted[0].episode! };
  }
  if (seasons.length > 0) return { season: seasons[0], episode: 1 };
  return null;
}

export function tmdbTvId(meta: Meta, detail: TmdbDetail | null): number | null {
  if (detail?.kind === "tv" && Number.isFinite(detail.id)) return detail.id;
  const m = meta.id.match(/^tmdb:tv:(\d+)$/);
  return m ? Number(m[1]) : null;
}

export function stillFrom(path: string | null, url?: string): string | undefined {
  if (path) return path.startsWith("http") ? path : `https://image.tmdb.org/t/p/w300${path}`;
  return url;
}
