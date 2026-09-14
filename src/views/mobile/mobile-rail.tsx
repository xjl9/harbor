import { useCallback, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { Poster } from "@/components/poster";
import { useSettings } from "@/lib/settings";
import { usePosterChain } from "@/components/poster";
import { useMobileRemote } from "./mobile-remote";
import { TileChrome } from "./browse/card-chrome";
import { CardActionsSheet } from "./browse/card-actions-sheet";
import { useLongPress } from "./browse/use-long-press";

type OpenDetail = (m: Meta) => void;

// Offscreen rails and tiles skip layout/paint entirely; the intrinsic-size
// estimates hold scroll geometry steady while skipped (`auto` re-uses the last
// rendered size once seen). Rails: title + tallest tile; tiles: their own height.
const RAIL_CULL = "[content-visibility:auto] [contain-intrinsic-size:auto_280px]";
const TILE_CULL = "[content-visibility:auto]";

// Press feedback is deliberately absent here. Every <button> already presses at
// one shared scale and speed (see the base layer in index.css); tiles used to
// override it with a slower duration and their own scale target, which is why a
// poster felt different under the finger than the button beside it.

export function RailHeader({
  title,
  kicker,
  onSeeAll,
  trailing,
}: {
  title: ReactNode;
  kicker?: string;
  onSeeAll?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-4">
      <button
        type="button"
        onClick={onSeeAll}
        disabled={!onSeeAll}
        className="flex min-h-[28px] min-w-0 flex-col items-start text-start disabled:cursor-default"
      >
        <span className="flex max-w-full items-center gap-1">
          <h2 className="truncate font-display text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
          {onSeeAll && <ChevronRight size={19} strokeWidth={2.4} className="dir-icon shrink-0 text-ink-subtle" />}
        </span>
        {kicker && (
          <span className="max-w-full truncate text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
            {kicker}
          </span>
        )}
      </button>
      {trailing}
    </div>
  );
}

export function MobileRail({
  title,
  kicker,
  metas,
  onSeeAll,
  onOpenDetail,
  variant = "poster",
  leading,
  trailing,
  awardLookup,
}: {
  title: ReactNode;
  kicker?: string;
  metas: Meta[];
  onSeeAll?: () => void;
  onOpenDetail?: OpenDetail;
  variant?: "poster" | "landscape";
  // A tile placed before the posters (the spotlight rail's person card).
  leading?: ReactNode;
  trailing?: ReactNode;
  // Award lookup names per meta id, for rails whose titles are franchise roots.
  awardLookup?: Record<string, string>;
}) {
  if (metas.length === 0) return null;
  return (
    <section className={`flex flex-col gap-3 ${RAIL_CULL}`}>
      <RailHeader title={title} kicker={kicker} onSeeAll={onSeeAll} trailing={trailing} />
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {leading}
        {metas.map((m, i) =>
          variant === "poster" ? (
            <PosterTile
              key={`${m.id}-${i}`}
              meta={m}
              onOpenDetail={onOpenDetail}
              awardLookupName={awardLookup?.[m.id]}
            />
          ) : (
            <LandscapeTile key={`${m.id}-${i}`} meta={m} onOpenDetail={onOpenDetail} />
          ),
        )}
      </div>
    </section>
  );
}

export function MobileRankRail({
  title,
  metas,
  onSeeAll,
  onOpenDetail,
}: {
  title: string;
  metas: Meta[];
  onSeeAll?: () => void;
  onOpenDetail?: OpenDetail;
}) {
  if (metas.length === 0) return null;
  return (
    <section className={`flex flex-col gap-3 ${RAIL_CULL}`}>
      <RailHeader title={title} onSeeAll={onSeeAll} />
      <div className="flex gap-1 overflow-x-auto ps-4 pe-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {metas.slice(0, 10).map((m, i) => (
          <RankTile key={m.id} meta={m} rank={i + 1} onOpenDetail={onOpenDetail} />
        ))}
      </div>
    </section>
  );
}

function useOpen(onOpenDetail?: OpenDetail) {
  const { openOnHost } = useMobileRemote();
  return (meta: Meta) => (onOpenDetail ? onOpenDetail(meta) : openOnHost(meta));
}

// Long-press actions shared by every tile shape: a hold opens the card sheet,
// the same actions the desktop card offers on right-click.
function useCardSheet(meta: Meta, onOpenDetail?: OpenDetail) {
  const open = useOpen(onOpenDetail);
  const [sheet, setSheet] = useState(false);
  const onLong = useCallback(() => setSheet(true), []);
  const press = useLongPress(onLong);
  const node = sheet ? (
    <CardActionsSheet meta={meta} onClose={() => setSheet(false)} onOpenDetail={open} />
  ) : null;
  return { open, press, node };
}

function RankTile({ meta, rank, onOpenDetail }: { meta: Meta; rank: number; onOpenDetail?: OpenDetail }) {
  const { settings } = useSettings();
  const { open, press, node } = useCardSheet(meta, onOpenDetail);
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  return (
    <>
      <button
        type="button"
        onClick={() => open(meta)}
        {...press}
        className={`w-[164px] shrink-0 select-none text-start [-webkit-touch-callout:none] ${TILE_CULL} [contain-intrinsic-size:auto_210px]`}
      >
        <div className="relative w-full" style={{ aspectRatio: "164 / 184" }}>
          {/* Confident solid serif numeral, an editorial ranked list rather than a ghost outline. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 -start-[3%] select-none font-medium leading-[0.7] text-raised"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: rank >= 10 ? "134px" : "180px",
              letterSpacing: "-0.06em",
            }}
          >
            {rank}
          </span>
          <div className="absolute bottom-0 end-0 w-[64%]">
            <Poster
              src={src}
              onError={onError}
              seed={meta.id}
              ratio="portrait"
              lazy="release"
              className="rounded-[12px] shadow-[0_14px_32px_-16px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.07]"
            />
          </div>
        </div>
        <p className="mt-2 line-clamp-1 ps-[36%] text-[12px] font-medium text-ink-muted">{meta.name}</p>
      </button>
      {node}
    </>
  );
}

export function PosterTile({
  meta,
  onOpenDetail,
  awardLookupName,
  width = "w-[124px]",
}: {
  meta: Meta;
  onOpenDetail?: OpenDetail;
  awardLookupName?: string;
  width?: string;
}) {
  const { settings } = useSettings();
  const { open, press, node } = useCardSheet(meta, onOpenDetail);
  const hostRef = useRef<HTMLButtonElement>(null);
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  return (
    <>
      <button
        ref={hostRef}
        type="button"
        onClick={() => open(meta)}
        {...press}
        className={`${width} shrink-0 select-none text-start [-webkit-touch-callout:none] ${TILE_CULL} [contain-intrinsic-size:auto_235px]`}
      >
        <div className="relative">
          <Poster src={src} onError={onError} seed={meta.id} ratio="portrait" lazy="release" className="rounded-lg ring-1 ring-white/[0.06]" />
          <TileChrome meta={meta} hostRef={hostRef} awardLookupName={awardLookupName} />
        </div>
        {!settings.hidePosterTitles && (
          <p className="mt-1.5 line-clamp-2 min-h-[2.7em] text-[12.5px] font-medium leading-snug text-ink-muted">
            {meta.name}
          </p>
        )}
      </button>
      {node}
    </>
  );
}

function LandscapeTile({ meta, onOpenDetail }: { meta: Meta; onOpenDetail?: OpenDetail }) {
  const { open, press, node } = useCardSheet(meta, onOpenDetail);
  const bg = meta.background ?? meta.poster;
  return (
    <>
      <button
        type="button"
        onClick={() => open(meta)}
        {...press}
        className={`w-[240px] shrink-0 select-none text-start [-webkit-touch-callout:none] ${TILE_CULL} [contain-intrinsic-size:auto_160px]`}
      >
        {/* Poster (not a raw img) so backdrops get tier right-sizing plus release-mode
            unload; the raw w1280 img here was a top offender in the rail decode weight. */}
        <Poster src={bg} seed={meta.id} ratio="landscape" lazy="release" className="rounded-lg ring-1 ring-edge-soft/50" />
        <p className="mt-1.5 line-clamp-1 text-[13px] font-medium text-ink-muted">{meta.name}</p>
      </button>
      {node}
    </>
  );
}
