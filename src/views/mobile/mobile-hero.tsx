import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Info, Play, Plus, TrendingUp } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { sizeImageUrl } from "@/lib/img-size";
import { useSettings } from "@/lib/settings";
import { useHeroLogos } from "@/components/anime-hero/use-hero-logos";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import { useMobileRemote } from "./mobile-remote";
import { useLayerActive } from "./layer-active";

const AUTO_MS = 8000;
const DISSOLVE_MS = 900;
const TEXT_MS = 340;
const PILL_PAUSE_MS = 12000;
/* w780 is plenty for a phone-width full-bleed hero; wider viewports get w1280. */
const PHONE_MAX_CSS_PX = 600;

function upsize(url?: string): string | undefined {
  if (!url) return url;
  return sizeImageUrl(url, window.innerWidth <= PHONE_MAX_CSS_PX ? 780 : 1280);
}

function kindLabel(t: Meta["type"]): string {
  if (t === "series") return "Series";
  if (t === "anime") return "Anime";
  return "Movies";
}

function prefersReduced(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function MobileHero({ slides, onOpenDetail }: { slides: Meta[]; onOpenDetail?: (m: Meta) => void }) {
  const { settings } = useSettings();
  const { openOnHost, playOnHost } = useMobileRemote();
  const layerActive = useLayerActive();
  const shown = useMemo(() => slides.slice(0, 6), [slides]);
  const logos = useHeroLogos(slides, settings);

  const [slots, setSlots] = useState<[number, number]>([0, 0]);
  const [front, setFront] = useState<0 | 1>(0);
  const [active, setActive] = useState(0);
  const [textOn, setTextOn] = useState(true);
  const [reduce, setReduce] = useState(prefersReduced);

  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const frontRef = useRef(front);
  frontRef.current = front;
  const activeRef = useRef(active);
  activeRef.current = active;
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;
  const busyRef = useRef(false);
  const pausedUntil = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // Warm only the current and upcoming slide while this layer is visible; the
  // old preload-all kept six w1280 decodes alive per hidden browse view.
  useEffect(() => {
    if (!layerActive || shown.length === 0) return;
    const cur = slots[front] < shown.length ? slots[front] : 0;
    for (const i of [cur, (cur + 1) % shown.length]) {
      const m = shown[i];
      const u = m ? upsize(m.background) ?? m.poster : undefined;
      if (u) {
        const img = new Image();
        img.src = u;
      }
    }
  }, [layerActive, shown, slots, front]);

  useEffect(() => {
    const n = shown.length;
    const s = slotsRef.current;
    if (activeRef.current >= n || s[0] >= n || s[1] >= n) {
      setSlots([0, 0]);
      setFront(0);
      setActive(0);
      setTextOn(true);
      busyRef.current = false;
    }
  }, [shown.length]);

  const goTo = useCallback((i: number) => {
    const cur = slotsRef.current[frontRef.current];
    if (i === cur || busyRef.current) return;
    const back = (frontRef.current ^ 1) as 0 | 1;
    setSlots((s): [number, number] => (back === 0 ? [i, s[1]] : [s[0], i]));
    setFront(back);
    if (reduceRef.current) {
      setActive(i);
      setTextOn(true);
      return;
    }
    busyRef.current = true;
    setTextOn(false);
    timers.current.push(
      window.setTimeout(() => {
        setActive(i);
        setTextOn(true);
      }, TEXT_MS),
      window.setTimeout(() => {
        busyRef.current = false;
      }, DISSOLVE_MS),
    );
  }, []);

  useEffect(() => {
    if (!layerActive || shown.length < 2) return;
    const id = window.setInterval(() => {
      if (reduceRef.current || busyRef.current || Date.now() < pausedUntil.current) return;
      const cur = slotsRef.current[frontRef.current];
      goTo((cur + 1) % shown.length);
    }, AUTO_MS);
    return () => window.clearInterval(id);
  }, [layerActive, shown.length, goTo]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const bgOf = (i: number): string | undefined => {
    const m = shown[i];
    return m ? upsize(m.background) ?? m.poster : undefined;
  };

  const safeActive = active < shown.length ? active : 0;
  const current = shown[safeActive];
  const target = slots[front] < shown.length ? slots[front] : 0;
  const logo = current ? logos[current.id] ?? current.logo : undefined;
  const year = (current?.releaseInfo ?? "").slice(0, 4);
  const inWl = useInWatchlist(current?.id);

  if (!current) return null;

  const open = () => (onOpenDetail ? onOpenDetail(current) : openOnHost(current));
  const src0 = bgOf(slots[0]);
  const src1 = bgOf(slots[1]);
  const layerTransition = reduce ? "none" : `opacity ${DISSOLVE_MS}ms ease-in-out`;

  return (
    <section
      className="relative -mt-3 mb-1"
      // Any touch on the hero freezes the rotation, not just a tap on the dots.
      // The carousel used to keep its cadence while a finger was on the way
      // down, so a Play press aimed at the visible title could commit to the
      // NEXT one: pressing Play under Project Hail Mary opened Backrooms.
      // pointerdown lands before the click, so arming the pause here makes the
      // slide the user pressed the slide that acts.
      onPointerDown={() => {
        pausedUntil.current = Date.now() + PILL_PAUSE_MS;
      }}
      style={{
        // The scroller insets its children past the Dynamic Island, which is right
        // for headings and cards but would letterbox a cinematic backdrop. Bleed
        // back out to the screen edge; the caption column below re-applies the
        // inset to itself so only the artwork sits under the island.
        marginLeft: "calc(-1 * env(safe-area-inset-left, 0px))",
        marginRight: "calc(-1 * env(safe-area-inset-right, 0px))",
      }}
    >
      {/* The 440px floor keeps the hero cinematic on small portrait phones, but taken
          literally it outgrows a landscape viewport that is itself only ~435px tall,
          hiding every row behind a full screen of scroll. Cap the floor to the
          viewport so short screens still reveal the top of the first row. */}
      {/* A tablet held on its side is wide but short: 62svh of an 820pt viewport is
          a 508pt hero, which pushed continue watching under the floating tab bar
          at rest, so the first row a returning viewer wants was covered until
          they scrolled. The window is bounded above at 900px so portrait, which
          has the height to spend, keeps the full 62svh, and bounded below at
          500px so a landscape phone keeps its own 50svh rule. */}
      <div className="relative h-[62svh] min-h-[min(440px,72svh)] [@media(max-height:500px)]:h-[50svh] [@media(max-height:500px)]:min-h-0 [@media(min-width:700px)_and_(min-height:500px)_and_(max-height:900px)]:h-[48svh] [@media(min-width:700px)_and_(min-height:500px)_and_(max-height:900px)]:min-h-0 w-full overflow-hidden">
        <button
          type="button"
          aria-label={`Open ${current.name}`}
          onClick={open}
          className="no-press absolute inset-0 z-0 block h-full w-full text-start"
        >
          {src0 && (
            <img
              key="l0"
              src={src0}
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: front === 0 ? 1 : 0, transition: layerTransition }}
            />
          )}
          {src1 && (
            <img
              key="l1"
              src={src1}
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ opacity: front === 1 ? 1 : 0, transition: layerTransition }}
            />
          )}
          {/* Cinematic blend: image reads clean up top, dissolves into the page canvas at
              the bottom so the rows below feel like they emerge from the film still. */}
          <div className="absolute inset-x-0 bottom-0 top-[30%] bg-gradient-to-t from-canvas via-canvas/70 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-canvas to-transparent" />
        </button>
        {/* The column is capped so landscape does not stretch Play into a 740px
            slab. Portrait is narrower than the cap and so is unaffected, and the
            box stays anchored to the inline start, which flips under RTL. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex max-w-[560px] flex-col gap-3.5 [@media(max-height:500px)]:gap-2"
          style={{
            // No chrome reservation here. The bars are pinned to the bottom of the
            // screen and this hero never reaches it: 62svh in portrait, 50svh on a
            // short viewport. Reserving their height just pushed the caption up and
            // left a dead band above the first row. The scroller still reserves it
            // via MOBILE_CHROME_CLEARANCE, which is what actually needs it.
            paddingBottom: "1.75rem",
            // Landscape puts the Dynamic Island on one side, and a flat 20px gutter
            // ran Play underneath it. Take the larger of the two per side.
            paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
            opacity: textOn ? 1 : 0,
            transform: textOn ? "translateY(0)" : "translateY(8px)",
            transition: reduce ? "none" : `opacity ${TEXT_MS}ms ease, transform ${TEXT_MS}ms ease`,
          }}
        >
          {/* The stack is taller than a landscape hero, so the least load-bearing
              rows step aside there rather than clipping the title off the top. */}
          <span className="inline-flex items-center gap-1.5 self-start text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/85 [@media(max-height:500px)]:hidden">
            <TrendingUp size={12} strokeWidth={2.8} className="text-accent" />
            #{safeActive + 1} in {kindLabel(current.type)} Today
          </span>
          {logo ? (
            <img
              src={logo}
              alt={current.name}
              className="max-h-[84px] max-w-[80%] object-contain object-left drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] [@media(max-height:500px)]:max-h-[52px]"
            />
          ) : (
            <h2 className="font-display text-[38px] font-medium leading-[0.98] tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] [@media(max-height:500px)]:text-[27px]">
              {current.name}
            </h2>
          )}
          <div className="flex items-center gap-3 text-[13px] text-white/75">
            {year && <span className="font-medium">{year}</span>}
            {current.imdbRating && (
              <span className="flex items-center gap-1.5">
                <ImdbIcon className="h-[15px] w-auto rounded-[3px]" />
                <span className="font-semibold text-white">{current.imdbRating}</span>
              </span>
            )}
            {current.genres?.[0] && <span className="text-white/65">{current.genres[0]}</span>}
          </div>
          <div className={`mt-1.5 flex items-center gap-2.5 ${textOn ? "pointer-events-auto" : "pointer-events-none"}`}>
            <button
              type="button"
              onClick={() => playOnHost(current)}
              className="flex h-[54px] flex-1 items-center justify-center gap-2.5 rounded-full bg-white text-[16px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] [@media(max-height:500px)]:h-[46px]"
            >
              <Play size={19} strokeWidth={0} fill="currentColor" />
              Play
            </button>
            <button
              type="button"
              aria-label={inWl ? "In My List" : "Add to My List"}
              onClick={() =>
                toggleWatchlist({ id: current.id, type: current.type, name: current.name, poster: current.poster })
              }
              className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md [@media(max-height:500px)]:h-[46px] [@media(max-height:500px)]:w-[46px]"
            >
              {inWl ? <Check size={20} strokeWidth={2.6} className="text-accent" /> : <Plus size={21} strokeWidth={2.2} />}
            </button>
            <button
              type="button"
              aria-label="More info"
              onClick={open}
              className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md [@media(max-height:500px)]:h-[46px] [@media(max-height:500px)]:w-[46px]"
            >
              <Info size={21} strokeWidth={2.2} />
            </button>
          </div>
          {shown.length > 1 && (
            <div className="pointer-events-auto mt-1 flex items-center gap-1.5">
              {shown.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  aria-label={`Show ${m.name}`}
                  onClick={() => {
                    pausedUntil.current = Date.now() + PILL_PAUSE_MS;
                    goTo(i);
                  }}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === target ? "w-6 bg-accent" : "w-1 bg-white/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
