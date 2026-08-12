import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Poster } from "@/components/poster";
import { formatAirDate } from "@/lib/dates";
import type { KitsuEpisode } from "@/lib/providers/kitsu";
import type { PlayEpisode } from "@/lib/view";
import { useEpisodeWindow } from "./data";
import { SectionTitle } from "./ui";

function seasonKey(ep: KitsuEpisode): number {
  return ep.seasonNumber && ep.seasonNumber > 0 ? ep.seasonNumber : 1;
}

// Lowest-numbered episode of the earliest season — the "Play" entry point.
export function firstAnimeEpisode(episodes: KitsuEpisode[]): KitsuEpisode | null {
  if (episodes.length === 0) return null;
  return [...episodes].sort(
    (a, b) => seasonKey(a) - seasonKey(b) || a.number - b.number,
  )[0];
}

// Map a Kitsu episode to the rich PlayEpisode the stream pipeline + trackers key
// on. Dropping any of these ids breaks anime stream resolution or scrobbling, so
// this mirrors the desktop episode-row mapping exactly.
export function toPlayEpisode(ep: KitsuEpisode): PlayEpisode {
  return {
    season: seasonKey(ep),
    episode: ep.number,
    name: ep.title,
    still: ep.thumbnail ?? ep.thumbnailFallback ?? undefined,
    overview: ep.synopsis || undefined,
    kitsuStreamId: ep.streamId,
    imdbId: ep.imdbId,
    imdbSeason: ep.imdbSeason,
    imdbEpisode: ep.imdbEpisode,
    absoluteNumber: ep.absoluteNumber ?? ep.number,
    tvdbEpisodeId: ep.tvdbEpisodeId,
    sourceMetaId: ep.sourceMetaId,
    airDate: ep.airdate ?? undefined,
    runtime: ep.length ?? undefined,
    rating: ep.rating,
  };
}

export function AnimeEpisodeSection({
  episodes,
  loading,
  onPlay,
}: {
  episodes: KitsuEpisode[];
  loading: boolean;
  onPlay: (ep: PlayEpisode) => void;
}) {
  const seasons = useMemo(() => {
    const set = new Set<number>();
    for (const ep of episodes) set.add(seasonKey(ep));
    return [...set].sort((a, b) => a - b);
  }, [episodes]);

  const [season, setSeason] = useState<number | null>(null);
  const activeSeason = season ?? seasons[0] ?? 1;
  const shown = useMemo(
    () =>
      episodes
        .filter((ep) => seasonKey(ep) === activeSeason)
        .sort((a, b) => a.number - b.number),
    [episodes, activeSeason],
  );
  // The One Piece case: seasonless Kitsu listings fold 1000+ episodes into
  // season 1, so the list must window instead of mounting every row.
  const { renderCount, hasMore, sentinelRef } = useEpisodeWindow(
    shown.length,
    `${activeSeason}|${episodes.length}`,
  );

  if (loading && episodes.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle>Episodes</SectionTitle>
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <EpisodeSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (episodes.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Episodes</SectionTitle>
        {seasons.length > 1 && (
          <SeasonPicker
            seasons={seasons}
            value={activeSeason}
            onChange={setSeason}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {shown.slice(0, renderCount).map((ep) => (
          <AnimeEpisodeItem key={ep.id} ep={ep} onPlay={onPlay} />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
    </section>
  );
}

function AnimeEpisodeItem({
  ep,
  onPlay,
}: {
  ep: KitsuEpisode;
  onPlay: (ep: PlayEpisode) => void;
}) {
  const sub = [
    `E${ep.number}`,
    ep.absoluteNumber && ep.absoluteNumber !== ep.number ? `Abs ${ep.absoluteNumber}` : null,
    ep.length ? `${ep.length} min` : null,
    formatAirDate(ep.airdate) || null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <button
      type="button"
      onClick={() => onPlay(toPlayEpisode(ep))}
      className="flex gap-3.5 rounded-2xl p-2 text-start transition-colors active:bg-elevated/50 motion-reduce:transition-none"
    >
      <div className="relative w-[128px] shrink-0 overflow-hidden rounded-xl">
        <Poster
          src={ep.thumbnail ?? ep.thumbnailFallback ?? undefined}
          seed={`${ep.id}`}
          ratio="landscape"
          lazy="release"
        />
        <span className="absolute start-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {ep.number}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <div className="flex items-center gap-2">
          <p className="line-clamp-1 min-w-0 text-[14px] font-semibold text-ink">
            {ep.title || `Episode ${ep.number}`}
          </p>
          {ep.filler && (
            <span className="inline-flex shrink-0 items-center rounded-[5px] border border-edge-soft bg-elevated/40 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
              Filler
            </span>
          )}
        </div>
        {sub && <p className="text-[11.5px] text-ink-subtle">{sub}</p>}
        {ep.synopsis && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{ep.synopsis}</p>
        )}
      </div>
    </button>
  );
}

function SeasonPicker({
  seasons,
  value,
  onChange,
}: {
  seasons: number[];
  value: number;
  onChange: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink ring-1 ring-edge-soft transition-transform active:scale-[0.97] motion-reduce:transition-none"
      >
        <span>Season {value}</span>
        <ChevronDown size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
          />
          <div
            className="relative z-10 max-h-[60vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-edge-soft/70 bg-elevated p-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            {seasons.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  onChange(n);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-xl px-4 py-3 text-start text-[15px] font-medium transition-colors active:bg-raised/60 ${
                  n === value ? "text-accent" : "text-ink"
                }`}
              >
                Season {n}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function EpisodeSkeleton() {
  return (
    <div className="flex gap-3.5 p-2">
      <div className="aspect-video w-[128px] shrink-0 animate-pulse rounded-xl bg-elevated/60" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-elevated/60" />
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-elevated/50" />
      </div>
    </div>
  );
}
