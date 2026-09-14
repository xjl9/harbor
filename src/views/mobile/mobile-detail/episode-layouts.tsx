import { useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowDownUp,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  EyeOff,
  GalleryHorizontal,
  Info,
  LayoutGrid,
  List,
  Shuffle,
  X,
} from "lucide-react";
import { Search } from "@/components/icons/search-icon";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { daysFromTodayLocal } from "@/lib/dates";
import type { EpisodeProgress } from "@/lib/episode-progress";
import { useT } from "@/lib/i18n";
import type { Season } from "@/lib/providers/tmdb";
import { SPOILER_TEXT_CLASS, SPOILER_THUMB_CLASS, type SpoilerMask } from "@/lib/spoilers";
import { toggleAutoDownload, useIsAutoDownloaded } from "@/lib/auto-download";
import type { Ep } from "./data";
import { EpisodeRating } from "./ui";
import { SheetRow } from "./sheet-ui";
import { PhoneSheet, RoundButton, useSheetClose } from "./sheets";

export type EpisodeLayout = "list" | "strip" | "grid";
export type EpisodeSort = "oldest" | "newest";

// ---------------------------------------------------------------------------
// Toolbar

export function EpisodeLayoutToggle({
  value,
  onChange,
}: {
  value: EpisodeLayout;
  onChange: (v: EpisodeLayout) => void;
}) {
  const t = useT();
  const options: { key: EpisodeLayout; label: string; icon: typeof List }[] = [
    { key: "list", label: t("List view"), icon: List },
    { key: "strip", label: t("Horizontal view"), icon: GalleryHorizontal },
    { key: "grid", label: t("Grid view"), icon: LayoutGrid },
  ];
  return (
    <div
      role="group"
      aria-label={t("Episode layout")}
      className="flex h-11 shrink-0 items-center gap-0.5 rounded-full bg-surface p-1 ring-1 ring-edge-soft/70"
    >
      {options.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`flex h-9 w-10 items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${
            value === key ? "bg-ink text-canvas" : "text-ink-muted"
          }`}
        >
          <Icon size={16} strokeWidth={2.2} />
        </button>
      ))}
    </div>
  );
}

export function EpisodeToolbar({
  layout,
  onLayout,
  sort,
  allWatched,
  onOpenOptions,
  searchActive,
  onToggleSearch,
  onRandom,
  onOpenDownloads,
  autoDownload,
}: {
  layout: EpisodeLayout;
  onLayout: (v: EpisodeLayout) => void;
  sort: EpisodeSort;
  allWatched: boolean;
  onOpenOptions: () => void;
  searchActive: boolean;
  onToggleSearch: () => void;
  onRandom: (() => void) | null;
  onOpenDownloads: (() => void) | null;
  autoDownload: boolean;
}) {
  const t = useT();
  return (
    <div className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <EpisodeLayoutToggle value={layout} onChange={onLayout} />
      <RoundButton
        label={`${sort === "newest" ? t("Newest") : t("Oldest")} · ${
          allWatched ? t("Mark season as unwatched") : t("Mark season as watched")
        }`}
        onClick={onOpenOptions}
        active={allWatched}
      >
        {allWatched ? (
          <EyeOff size={17} strokeWidth={2.1} />
        ) : (
          <ArrowDownUp size={17} strokeWidth={2.1} />
        )}
      </RoundButton>
      <RoundButton label={t("Search episodes")} onClick={onToggleSearch} active={searchActive}>
        <Search size={17} strokeWidth={2.2} />
      </RoundButton>
      {onRandom && (
        <RoundButton label={t("Play a random episode")} onClick={onRandom}>
          <Shuffle size={17} strokeWidth={2.1} />
        </RoundButton>
      )}
      {onOpenDownloads && (
        <RoundButton
          label={autoDownload ? t("Auto-downloading new episodes") : t("Download")}
          onClick={onOpenDownloads}
          active={autoDownload}
        >
          <ArrowDownToLine size={17} strokeWidth={2.1} />
        </RoundButton>
      )}
    </div>
  );
}

export function EpisodeSearchField({
  value,
  onChange,
  matched,
}: {
  value: string;
  onChange: (v: string) => void;
  matched: number | null;
}) {
  const t = useT();
  return (
    <div className="flex h-12 items-center gap-2.5 rounded-2xl bg-surface px-3.5 ring-1 ring-edge-soft/70">
      <Search size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
      <input
        autoFocus
        type="search"
        inputMode="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("Search by episode number or title")}
        aria-label={t("Search episodes")}
        // 16px keeps iOS from zooming the page when the field takes focus.
        className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-subtle"
      />
      {value.trim() !== "" && (
        <>
          <span className="shrink-0 text-[12.5px] tabular-nums text-ink-subtle">{matched ?? 0}</span>
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={t("Clear")}
            className="-me-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted"
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheets

export function EpisodeOptionsSheet({
  sort,
  onSort,
  allWatched,
  onMarkSeason,
  onClose,
}: {
  sort: EpisodeSort;
  onSort: (s: EpisodeSort) => void;
  allWatched: boolean;
  onMarkSeason: (watched: boolean) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <PhoneSheet title={t("Episodes")} onClose={onClose}>
      <OptionsBody sort={sort} onSort={onSort} allWatched={allWatched} onMarkSeason={onMarkSeason} />
    </PhoneSheet>
  );
}

function OptionsBody({
  sort,
  onSort,
  allWatched,
  onMarkSeason,
}: {
  sort: EpisodeSort;
  onSort: (s: EpisodeSort) => void;
  allWatched: boolean;
  onMarkSeason: (watched: boolean) => void;
}) {
  const t = useT();
  const close = useSheetClose();
  return (
    <div className="flex flex-col px-3 pb-1">
      <h3 className="px-3 pb-1 pt-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {t("Sort")}
      </h3>
      {(["oldest", "newest"] as const).map((s) => (
        <SheetRow
          key={s}
          icon={<ArrowDownUp size={19} strokeWidth={2} />}
          label={s === "newest" ? t("Newest") : t("Oldest")}
          active={sort === s}
          trailing={sort === s ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined}
          onClick={() => {
            onSort(s);
            close();
          }}
        />
      ))}
      <h3 className="px-3 pb-1 pt-3 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {t("This season")}
      </h3>
      <SheetRow
        icon={
          allWatched ? <EyeOff size={19} strokeWidth={2} /> : <CheckCheck size={19} strokeWidth={2.2} />
        }
        label={allWatched ? t("Mark season as unwatched") : t("Mark season as watched")}
        sublabel={allWatched ? undefined : t("Aired episodes only")}
        onClick={() => {
          onMarkSeason(!allWatched);
          close();
        }}
      />
    </div>
  );
}

export function EpisodeDownloadsSheet({
  meta,
  pending,
  onDownloadSeason,
  onClose,
}: {
  meta: Meta;
  pending: number;
  onDownloadSeason: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <PhoneSheet title={t("Download")} onClose={onClose}>
      <DownloadsBody meta={meta} pending={pending} onDownloadSeason={onDownloadSeason} />
    </PhoneSheet>
  );
}

function DownloadsBody({
  meta,
  pending,
  onDownloadSeason,
}: {
  meta: Meta;
  pending: number;
  onDownloadSeason: () => void;
}) {
  const t = useT();
  const close = useSheetClose();
  const autoOn = useIsAutoDownloaded(meta.id);
  return (
    <div className="flex flex-col px-3 pb-1">
      <SheetRow
        icon={<Download size={19} strokeWidth={2} />}
        label={pending > 0 ? t("Download this season") : t("Season saved offline")}
        sublabel={pending > 0 ? t("{n} episodes", { n: pending }) : undefined}
        disabled={pending === 0}
        onClick={() => {
          onDownloadSeason();
          close();
        }}
      />
      <SheetRow
        icon={autoOn ? <Check size={19} strokeWidth={2.4} /> : <CalendarClock size={19} strokeWidth={2} />}
        label={t("Auto-download new episodes")}
        sublabel={autoOn ? t("On. New episodes grab themselves.") : t("Grab each new episode as it airs")}
        active={autoOn}
        trailing={autoOn ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined}
        onClick={() => {
          toggleAutoDownload(meta);
          close();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strip and grid cards

const isUpcoming = (date?: string | null): boolean => {
  const d = daysFromTodayLocal(date);
  return d != null && d > 0;
};

export function EpisodeCard({
  ep,
  progress,
  spoiler,
  nextUp,
  showRating,
  showDescription,
  onPlay,
  onInfo,
  trailing,
  className = "",
}: {
  ep: Ep;
  progress: EpisodeProgress;
  spoiler: SpoilerMask;
  nextUp: boolean;
  showRating: boolean;
  showDescription: boolean;
  onPlay: (ep: Ep) => void;
  onInfo: (ep: Ep) => void;
  trailing?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const upcoming = isUpcoming(ep.airDate);
  const partial = !progress.watched && progress.ratio > 0.01;
  const minsLeft =
    partial && ep.runtime ? Math.max(1, Math.round(ep.runtime * (1 - progress.ratio))) : 0;
  return (
    <div className={`flex flex-col gap-2 ${className}`} data-ep={ep.episode}>
      <div className={`relative overflow-hidden rounded-xl ${nextUp ? "ring-1 ring-accent/60" : ""}`}>
        <button
          type="button"
          onClick={() => onPlay(ep)}
          aria-label={t("Play {title}", { title: ep.name || t("Episode {number}", { number: ep.episode }) })}
          className="block w-full text-start"
        >
          <div
            className={`${upcoming ? "opacity-60 saturate-50" : progress.watched ? "opacity-60" : ""} ${
              spoiler.thumb ? SPOILER_THUMB_CLASS : ""
            }`}
          >
            <Poster src={ep.still} seed={`${ep.season}-${ep.episode}`} ratio="landscape" lazy="release" />
          </div>
        </button>
        <span className="pointer-events-none absolute start-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {ep.episode}
        </span>
        <button
          type="button"
          onClick={() => onInfo(ep)}
          aria-label={t("Episode details")}
          className="no-press absolute end-0 top-0 flex h-11 w-11 items-center justify-center text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]"
        >
          <Info size={17} strokeWidth={2.2} />
        </button>
        {progress.watched ? (
          <span className="pointer-events-none absolute bottom-1.5 end-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200 backdrop-blur-sm">
            <Check size={11} strokeWidth={3} />
            {t("Watched")}
          </span>
        ) : minsLeft > 0 ? (
          <span className="pointer-events-none absolute bottom-1.5 end-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-accent backdrop-blur-sm">
            {t("{n}m left", { n: minsLeft })}
          </span>
        ) : ep.runtime ? (
          <span className="pointer-events-none absolute bottom-1.5 end-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur-sm">
            {t("{n}m", { n: ep.runtime })}
          </span>
        ) : null}
        {showRating && ep.imdbRating != null && ep.imdbRating > 0 && (
          <EpisodeRating value={ep.imdbRating} isImdb />
        )}
        {partial && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-black/55">
            <div className="h-full bg-accent" style={{ width: `${Math.max(2, progress.ratio * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="flex items-start gap-1">
        <button type="button" onClick={() => onPlay(ep)} className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
          <span className="flex items-center gap-1.5">
            <span
              className={`line-clamp-2 text-[13px] font-semibold leading-snug ${
                upcoming ? "text-ink-muted" : "text-ink"
              } ${spoiler.title ? SPOILER_TEXT_CLASS : ""}`}
            >
              {ep.name || t("Episode {number}", { number: ep.episode })}
            </span>
            {upcoming && (
              <span className="inline-flex shrink-0 items-center rounded-[5px] border border-edge-soft bg-elevated/40 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
                {t("Upcoming")}
              </span>
            )}
          </span>
          <span className="text-[11.5px] text-ink-subtle">
            {t("S{season} E{episode}", { season: ep.season, episode: ep.episode })}
          </span>
          {showDescription && ep.overview && (
            <p
              className={`line-clamp-2 text-[12px] leading-relaxed text-ink-muted ${
                spoiler.desc ? SPOILER_TEXT_CLASS : ""
              }`}
            >
              {ep.overview}
            </p>
          )}
        </button>
        {trailing && <span className="-me-2 -mt-1 shrink-0">{trailing}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pager and jump

export function EpisodePager({
  page,
  pageCount,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const t = useT();
  if (pageCount <= 1) return null;
  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12px] tabular-nums text-ink-subtle">
        {t("{start}-{end} of {total}", { start, end, total })}
      </span>
      <div className="flex items-center gap-1">
        <RoundButton label={t("Previous")} onClick={() => onChange(Math.max(0, page - 1))}>
          <ChevronLeft size={18} strokeWidth={2.2} className={`dir-icon ${page === 0 ? "opacity-30" : ""}`} />
        </RoundButton>
        <span className="min-w-[56px] text-center text-[13px] font-semibold tabular-nums text-ink">
          {page + 1} / {pageCount}
        </span>
        <RoundButton
          label={t("Next")}
          onClick={() => onChange(Math.min(pageCount - 1, page + 1))}
        >
          <ChevronRight
            size={18}
            strokeWidth={2.2}
            className={`dir-icon ${page === pageCount - 1 ? "opacity-30" : ""}`}
          />
        </RoundButton>
      </div>
    </div>
  );
}

export function GoToEpisode({ max, onGo }: { max: number; onGo: (n: number) => void }) {
  const t = useT();
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = parseInt(v, 10);
        if (Number.isFinite(n) && n >= 1 && n <= max) {
          onGo(n);
          setV("");
        }
      }}
      className="flex items-center gap-2"
    >
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={t("Go to ep")}
        aria-label={t("Go to episode")}
        className="h-11 w-[120px] rounded-xl bg-surface px-3.5 text-[16px] text-ink outline-none ring-1 ring-inset ring-edge-soft/70 placeholder:text-ink-subtle focus:ring-accent/50"
      />
      <button
        type="submit"
        disabled={!v}
        className="h-11 rounded-xl bg-surface px-4 text-[13.5px] font-semibold text-ink ring-1 ring-edge-soft/70 disabled:opacity-40"
      >
        {t("Go")}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Random episode (desktop random-episode-button.tsx, minus the tooltip chrome)

export function pickRandomEpisode(seasons: Season[]): { season: number; episode: number } | null {
  const today = new Date().toISOString().slice(0, 10);
  const real = seasons.filter((s) => s.seasonNumber >= 1 && s.episodeCount > 0);
  const aired = real.filter((s) => !s.airDate || s.airDate.slice(0, 10) <= today);
  const pool = aired.length > 0 ? aired : real;
  const total = pool.reduce((n, s) => n + s.episodeCount, 0);
  if (total === 0) return null;
  let r = Math.floor(Math.random() * total);
  for (const s of pool) {
    if (r < s.episodeCount) return { season: s.seasonNumber, episode: r + 1 };
    r -= s.episodeCount;
  }
  return null;
}
