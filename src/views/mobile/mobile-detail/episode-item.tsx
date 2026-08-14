import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Poster } from "@/components/poster";
import { daysFromTodayLocal, formatAirDate } from "@/lib/dates";
import { formatRelativeWatched, type EpisodeProgress } from "@/lib/episode-progress";
import { SPOILER_TEXT_CLASS, SPOILER_THUMB_CLASS, type SpoilerMask } from "@/lib/spoilers";
import { useT } from "@/lib/i18n";
import type { Ep } from "./data";
import { EpisodeRating, Line } from "./ui";

const isUpcoming = (date?: string | null): boolean => {
  const d = daysFromTodayLocal(date);
  return d != null && d > 0;
};

export function EpisodeItem({
  ep,
  onPlay,
  progress,
  spoiler,
  nextUp,
  showRating,
  download,
}: {
  ep: Ep;
  onPlay: (ep: Ep) => void;
  progress: EpisodeProgress;
  spoiler: SpoilerMask;
  nextUp: boolean;
  showRating: boolean;
  // Optional trailing control (offline download button). Rendered as a sibling
  // of the play button so it stays a valid, separately-focusable target.
  download?: ReactNode;
}) {
  const t = useT();
  const upcoming = isUpcoming(ep.airDate);
  const watchedAgo = progress.startedAt > 0 ? formatRelativeWatched(progress.startedAt) : "";
  const sub = [
    `S${ep.season} E${ep.episode}`,
    ep.runtime ? `${ep.runtime} min` : null,
    formatAirDate(ep.airDate) || null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <div className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => onPlay(ep)}
        className="flex min-w-0 flex-1 gap-3.5 rounded-2xl p-2 text-start transition-colors active:bg-elevated/50 motion-reduce:transition-none"
      >
      <div
        className={`relative w-[128px] shrink-0 overflow-hidden rounded-xl ${
          nextUp ? "ring-1 ring-accent/60" : ""
        }`}
      >
        <div className={`${upcoming ? "opacity-70" : ""} ${spoiler.thumb ? SPOILER_THUMB_CLASS : ""}`}>
          <Poster src={ep.still} seed={`${ep.season}-${ep.episode}`} ratio="landscape" lazy="release" />
        </div>
        <span className="absolute start-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {ep.episode}
        </span>
        {progress.watched && (
          <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/22 text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
        {showRating && ep.imdbRating != null && ep.imdbRating > 0 && (
          <EpisodeRating value={ep.imdbRating} isImdb />
        )}
        {progress.ratio > 0.01 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/55">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.max(2, progress.ratio * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <div className="flex items-center gap-2">
          <p
            className={`line-clamp-1 min-w-0 text-[14px] font-semibold ${
              upcoming ? "text-ink-muted" : "text-ink"
            } ${spoiler.title ? SPOILER_TEXT_CLASS : ""}`}
          >
            {ep.name || `Episode ${ep.episode}`}
          </p>
          {upcoming && (
            <span className="inline-flex shrink-0 items-center rounded-[5px] border border-edge-soft bg-elevated/40 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
              Upcoming
            </span>
          )}
        </div>
        {sub && (
          <p className="text-[11.5px] text-ink-subtle">
            {sub}
            {progress.watched && watchedAgo && (
              <span className="text-emerald-300/85">
                {"  ·  "}
                {t("Watched {ago}", { ago: watchedAgo })}
              </span>
            )}
            {!progress.watched && progress.ratio > 0.01 && watchedAgo && (
              <span className="text-accent/85">
                {"  ·  "}
                {t("{pct}% watched", { pct: Math.round(progress.ratio * 100) })}
              </span>
            )}
          </p>
        )}
        {ep.overview && (
          <p
            className={`line-clamp-2 text-[12px] leading-relaxed text-ink-muted ${
              spoiler.desc ? SPOILER_TEXT_CLASS : ""
            }`}
          >
            {ep.overview}
          </p>
        )}
      </div>
      </button>
      {download && <div className="shrink-0 pe-1">{download}</div>}
    </div>
  );
}

export function EpisodeSkeleton() {
  return (
    <div className="flex gap-3.5 p-2">
      <div className="aspect-video w-[128px] shrink-0 animate-pulse rounded-xl bg-elevated/70" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <Line className="w-2/3" />
        <Line className="w-1/3" />
        <Line className="w-full" />
      </div>
    </div>
  );
}
