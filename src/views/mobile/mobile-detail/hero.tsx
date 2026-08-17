import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Star } from "lucide-react";
import { narrowMediaType, type Meta } from "@/lib/cinemeta";
import { Poster, usePosterChain } from "@/components/poster";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import { HeroAwardsCorner } from "@/views/detail/hero-awards";
import { useSettings } from "@/lib/settings";
import {
  EASE_OUT,
  FLIP_TARGET_ATTR,
  MOTION,
  peekOriginPaint,
  sameArtwork,
} from "@/lib/motion";
import type { TmdbDetail } from "@/lib/providers/tmdb";

type HeroSummary = { type: string; wins: number; nominations: number }[];

export function Hero({
  meta,
  detail,
  title,
  logo,
  backdrop,
  year,
  rating,
  isImdb,
  runtime,
  genres,
  awardSummary,
  onBack,
}: {
  meta: Meta;
  detail: TmdbDetail | null;
  title: string;
  logo?: string;
  backdrop?: string;
  year: string;
  rating?: string;
  isImdb: boolean;
  runtime?: string;
  genres: string[];
  awardSummary: HeroSummary;
  onBack: () => void;
}) {
  return (
    <div className="relative">
      <div className="relative aspect-[3/4] [@media(min-width:700px)_and_(min-height:600px)]:aspect-[16/9] max-h-[62vh] w-full overflow-hidden bg-surface">
        {backdrop && <Backdrop src={backdrop} />}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/45 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />
      </div>

      {/* No press override here. This is the most-tapped control on the screen the
          shared-element pass is about, and it pressed harder and slower than the
          posters beside it; the base `button` rule in index.css owns press. */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="absolute start-4 grid h-11 w-11 place-items-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <ChevronLeft size={22} strokeWidth={2.4} className="dir-icon" />
      </button>

      {awardSummary.length > 0 && (
        <div
          className="absolute end-3 z-10"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
        >
          <HeroAwardsCorner
            summary={awardSummary}
            inline
            onDark
            className="max-w-[58vw] text-end"
          />
        </div>
      )}

      <div
        className="absolute inset-x-0 bottom-0 flex items-end gap-4 pb-1"
        style={{
          // The detail page is a fixed overlay, so it never sees the scroller
          // inset. In landscape a flat gutter put the poster under the island.
          paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <HeroPoster meta={meta} detail={detail} />
        <div className="md-rise-in flex min-w-0 flex-1 flex-col gap-2.5 pb-1">
          {logo ? (
            <img
              src={logo}
              alt={title}
              className="max-h-[54px] max-w-[86%] object-contain object-left drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
            />
          ) : (
            <h1 className="font-display text-[28px] font-medium leading-[1.02] tracking-tight text-ink">
              {title}
            </h1>
          )}
          <MetaPills
            year={year}
            rating={rating}
            isImdb={isImdb}
            runtime={runtime}
            genres={genres}
          />
        </div>
      </div>
    </div>
  );
}

// The backdrop is the largest thing on the screen and used to be the one image
// in the app that snapped in at full opacity. It now fades on decode like every
// other image.
//
// One element, deliberately un-keyed: `backdrop` upgrades mid-life (meta's
// background first, then TMDB's once the detail request lands), and a key on
// src tore the element down and rebuilt it at opacity 0: the biggest surface
// on the screen going blank for the length of a second fetch. Left alone, the
// browser keeps painting the decoded frame until the new one is ready, and
// `shown` never resets, so the fade belongs to the first paint only. The stack
// navigating already remounts this: DetailBody is keyed on the meta id.
function Backdrop({ src }: { src: string }) {
  const [shown, setShown] = useState(false);
  return (
    <img
      src={src}
      alt=""
      loading="eager"
      decoding="async"
      onLoad={() => setShown(true)}
      className="absolute inset-0 h-full w-full object-cover"
      style={{
        opacity: shown ? 1 : 0,
        transition: `opacity ${MOTION.image}ms ${EASE_OUT}`,
      }}
    />
  );
}

/**
 * The bitmap the tapped tile is already painting, when it is provably the same
 * artwork as this hero's poster.
 *
 * Posters size their own request from their measured box, so the 124px rail
 * tile, the 104px recommendation tile and this 92px hero all ask for different
 * URLs of one picture. The hero's is a cache miss, which means the shared
 * element would fly an empty rounded rectangle and paint the artwork only after
 * it landed. Matching everything but the size segment is what proves the tap
 * and this hero are the same title, so a stale tap can never seed the wrong art.
 */
function useFlightBitmap(src: string | undefined): string | undefined {
  const held = useRef<string | undefined>(undefined);
  return useMemo(() => {
    if (held.current && sameArtwork(held.current, src)) return held.current;
    const painted = peekOriginPaint();
    held.current = sameArtwork(painted, src) ? painted : undefined;
    return held.current;
  }, [src]);
}

function HeroPoster({
  meta,
  detail,
}: {
  meta: Meta;
  detail: TmdbDetail | null;
}) {
  const { settings } = useSettings();
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster || detail?.poster,
    narrowMediaType(meta.type),
  );
  const flightBitmap = useFlightBitmap(src);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [handedOff, setHandedOff] = useState(false);

  // The borrowed bitmap sits on top until this hero's own decode lands, then
  // cross-fades out over it. Same picture at two sizes, so the swap is invisible
  // And if the hero's decode never lands, the artwork simply stays.
  useEffect(() => {
    const root = wrapRef.current;
    if (!flightBitmap || !root) return;
    setHandedOff(false);
    const done = () => setHandedOff(true);
    // `load` does not bubble, but it does capture.
    root.addEventListener("load", done, true);
    // <Poster> mounts its <img> a tick later (it sizes itself from its measured
    // box first), so an already-cached decode can be in place before this
    // listener exists and would never fire an event. One deferred check, after
    // the flight has landed, catches that case.
    const settled = window.setTimeout(() => {
      const img = root.querySelector<HTMLImageElement>(".harbor-poster img");
      if (img?.complete && img.naturalWidth > 0) done();
    }, MOTION.travel);
    return () => {
      root.removeEventListener("load", done, true);
      window.clearTimeout(settled);
    };
    // Keyed on the borrowed bitmap only: the listener stays attached for the
    // life of the poster, so a later chain upgrade hands off on its own load
    // rather than bringing the borrowed copy back on top of a loaded one.
  }, [flightBitmap]);

  // The landing site for the shared-element flight from the tapped tile.
  return (
    <div
      ref={wrapRef}
      {...{ [FLIP_TARGET_ATTR]: "" }}
      className="relative w-[92px] shrink-0"
    >
      <Poster
        src={src}
        onError={onError}
        seed={meta.id}
        ratio="portrait"
        className="rounded-xl shadow-[0_12px_32px_-14px_rgba(0,0,0,0.7)] ring-1 ring-edge-soft/70"
      />
      {flightBitmap && (
        <img
          src={flightBitmap}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full rounded-xl object-cover ring-1 ring-edge-soft/70"
          style={{
            opacity: handedOff ? 0 : 1,
            transition: `opacity ${MOTION.image}ms ${EASE_OUT}`,
          }}
        />
      )}
    </div>
  );
}

function MetaPills({
  year,
  rating,
  isImdb,
  runtime,
  genres,
}: {
  year: string;
  rating?: string;
  isImdb: boolean;
  runtime?: string;
  genres: string[];
}) {
  // Clean inline metadata (matches the home hero) instead of a row of identical gray
  // capsules — year/runtime recede, the rating is emphasized, genres are subtle.
  const items: React.ReactNode[] = [];
  if (year)
    items.push(
      <span key="y" className="font-medium text-ink">
        {year}
      </span>,
    );
  if (rating)
    items.push(
      <span key="r" className="flex items-center gap-1.5">
        {isImdb ? (
          <ImdbIcon className="h-[14px] w-auto rounded-[3px]" />
        ) : (
          <Star
            size={12}
            strokeWidth={0}
            fill="currentColor"
            className="text-accent"
          />
        )}
        <span className="font-semibold text-ink">{rating}</span>
      </span>,
    );
  if (runtime) items.push(<span key="rt">{runtime}</span>);
  for (const g of genres.slice(0, 3))
    items.push(
      <span key={`g-${g}`} className="text-ink-subtle">
        {g}
      </span>,
    );
  return (
    <div className="flex flex-wrap items-center gap-y-1 text-[13px] text-ink-muted">
      {/* The separator trails its item rather than leading the next one. Carried
          on the front, a wrapped line opened with a stray dot and its own left
          margin indented that line past the one above it, which is what a narrow
          phone showed once the genres pushed this to two lines. */}
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center">
          {it}
          {i < items.length - 1 && (
            <span aria-hidden className="mx-2 text-ink-subtle/40">
              ·
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
