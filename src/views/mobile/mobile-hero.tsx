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
    <section className="relative -mt-3 mb-1">
      <div className="relative h-[62svh] min-h-[440px] w-full overflow-hidden">
        <button
          type="button"
          aria-label={`Open ${current.name}`}
          onClick={open}
          className="absolute inset-0 z-0 block h-full w-full text-start"
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
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-3.5 px-5 pb-7"
          style={{
            opacity: textOn ? 1 : 0,
            transform: textOn ? "translateY(0)" : "translateY(8px)",
            transition: reduce ? "none" : `opacity ${TEXT_MS}ms ease, transform ${TEXT_MS}ms ease`,
          }}
        >
          <span className="inline-flex items-center gap-1.5 self-start text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/85">
            <TrendingUp size={12} strokeWidth={2.8} className="text-accent" />
            #{safeActive + 1} in {kindLabel(current.type)} Today
          </span>
          {logo ? (
            <img
              src={logo}
              alt={current.name}
              className="max-h-[84px] max-w-[80%] object-contain object-left drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]"
            />
          ) : (
            <h2 className="font-display text-[38px] font-medium leading-[0.98] tracking-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
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
              className="flex h-[54px] flex-1 items-center justify-center gap-2.5 rounded-full bg-white text-[16px] font-semibold text-black shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] transition-transform duration-150 active:scale-[0.97]"
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
              className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-transform duration-150 active:scale-[0.94]"
            >
              {inWl ? <Check size={20} strokeWidth={2.6} className="text-accent" /> : <Plus size={21} strokeWidth={2.2} />}
            </button>
            <button
              type="button"
              aria-label="More info"
              onClick={open}
              className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white backdrop-blur-md transition-transform duration-150 active:scale-[0.94]"
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
