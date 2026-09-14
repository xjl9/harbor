import { Bookmark, Check, Popcorn, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import mdblistLogo from "@/assets/addon-logos/mdblist.png";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import traktLogo from "@/assets/trakt.svg";
import simklLogo from "@/assets/simkl.png";
import { AwardTab } from "@/components/award-tab";
import { ClassicAwardBadge, ClassicAwardTab, useClassicAwardWin } from "@/components/card-award";
import { ClapperMini } from "@/components/icons/clapper-mini";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import { MalLogo } from "@/components/icons/mal-logo";
import { LocalDot } from "@/components/local-badge";
import { RtBadge } from "@/components/rt-badge";
import { TopTenRibbon } from "@/components/top-ten-ribbon";
import {
  awardSourceMeta,
  findAnyAwardWins,
  findTopAward,
  parseAwardYear,
} from "@/lib/anime-awards";
import { shortCategory } from "@/lib/anime-award-labels";
import { resolveAwardIcon, useAwardPacks } from "@/lib/award-icons";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useInLocalLibrary } from "@/lib/local-library";
import { animeHasDub, dubSetReady, ensureDubSet, subscribeDubSet } from "@/lib/providers/anime-dub-sub";
import { cinemetaRatingPrefetch, useCinemetaRating } from "@/lib/providers/cinemeta-rating";
import { harborImdbTitle } from "@/lib/providers/harbor-imdb";
import { mdblistCardPrefetch, useMdblistCardScores } from "@/lib/providers/mdblist-batch";
import { omdbPrefetch, useOmdbScores } from "@/lib/providers/omdb";
import { tmdbImdbId, useTmdbImdbId, useTmdbVote } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useSimklCardScores, useSimklCardScoresByAnimeId } from "@/lib/simkl/ratings";
import { isTop10, useTop10Version } from "@/lib/top10-set";
import { observe } from "@/lib/visibility";
import { useMetaWatched } from "@/lib/watched-flag";
import { useInWatchlist } from "@/lib/watchlist";

// The poster chrome desktop draws in pick-card.tsx, sized for a 124px phone tile:
// Top-10 ribbon, award tab or award badge, DUB, New / In Cinema / Rerun, the
// score stack (IMDb, TMDB, MAL, RT, audience, Metacritic, Letterboxd, MDBList,
// Trakt, Simkl), and the watchlist / watched / local-library marks. Every branch
// reads the same settings pick-card does so a badge the user turned off on the
// desktop stays off here too. The hover overlays, tilt and expanding card are
// desktop-only and deliberately absent.

const ANIME_ID = /^(kitsu|mal|anilist|anidb|simkl):/;

const AWARD_TAB_LABEL: Record<string, string> = {
  crunchyroll: "Crunchyroll",
  taaf: "TAAF",
  jmaf: "JMAF",
  r_anime: "r/anime",
  animation_kobe: "Kobe",
};

const WATCHLIST_POS: Record<string, string> = {
  topStart: "top-1.5 start-1.5",
  topEnd: "top-1.5 end-1.5",
  bottomStart: "bottom-1.5 start-1.5",
  bottomEnd: "bottom-1.5 end-1.5",
};

type CardBadge =
  | { kind: "rating"; source: "imdb" | "mal" | "tmdb"; value: string }
  | { kind: "rt"; value: number }
  | { kind: "audience"; value: number }
  | { kind: "metacritic"; value: number }
  | { kind: "letterboxd"; value: number }
  | { kind: "mdblist"; value: number }
  | { kind: "trakt"; value: number }
  | { kind: "simkl"; value: number };

export function isAnimeCardId(id: string): boolean {
  return ANIME_ID.test(id);
}

function stackTop(slots: number, ribbon: boolean): string {
  if (ribbon) return slots >= 2 ? "top-[64px]" : slots === 1 ? "top-[46px]" : "top-[30px]";
  return slots >= 2 ? "top-[44px]" : slots === 1 ? "top-[26px]" : "top-1.5";
}

function circleTop(slots: number): string {
  if (slots >= 3) return "top-[82px]";
  if (slots >= 2) return "top-[56px]";
  if (slots >= 1) return "top-[30px]";
  return "top-1.5";
}

function deriveNew(meta: Meta): boolean {
  return meta.releaseInfo === String(new Date().getFullYear());
}

function isInCinema(meta: Meta): boolean {
  return meta.type === "movie" && meta.inTheaters === true;
}

function isRerun(meta: Meta): boolean {
  if (meta.type !== "movie" || !meta.releaseDate) return false;
  const released = Date.parse(meta.releaseDate);
  if (Number.isNaN(released)) return false;
  return (Date.now() - released) / (1000 * 60 * 60 * 24 * 30.44) > 9;
}

// Resolves the IMDb id a card's badges key on: tt ids are their own key, TMDB
// ids go through the shared resolver cache.
export function useCardImdbId(meta: Meta): string | undefined {
  const resolved = useTmdbImdbId(meta.id);
  return meta.id.startsWith("tt") ? meta.id : (resolved ?? undefined);
}

export function TileChrome({
  meta,
  hostRef,
  awardLookupName,
  flagRerun = false,
}: {
  meta: Meta;
  // The tile element, observed so provider prefetches only run once it is on screen.
  hostRef: React.RefObject<HTMLElement | null>;
  awardLookupName?: string;
  flagRerun?: boolean;
}) {
  const t = useT();
  const { settings } = useSettings();
  const anime = isAnimeCardId(meta.id);
  const imdbId = useCardImdbId(meta);
  const altIds = useMemo(() => [imdbId], [imdbId]);

  const dubReady = useSyncExternalStore(subscribeDubSet, dubSetReady);
  useEffect(() => {
    if (settings.showDubBadge && anime) ensureDubSet();
  }, [anime, settings.showDubBadge]);
  const hasDub = settings.showDubBadge && anime && dubReady && animeHasDub(meta.id);

  useTop10Version();
  const showTop10 = settings.top10Ribbon && isTop10(meta.id, meta.name);
  const ribbonLeft = showTop10 && settings.top10RibbonSide === "left";
  const ribbonRight = showTop10 && settings.top10RibbonSide === "right";

  const inCinema = isInCinema(meta);
  const rerun = (inCinema || flagRerun) && isRerun(meta);
  const showCinema = inCinema && !rerun;
  const isNew = !rerun && !inCinema && deriveNew(meta);
  const stateBadge = settings.showCardBadges && (rerun || showCinema || isNew);

  // Ratings. Harbor's own IMDb title feed first, then OMDb, then Cinemeta, then
  // whatever the catalog inlined, matching desktop precedence.
  const omdb = useOmdbScores(imdbId);
  const [harborRating, setHarborRating] = useState<string | undefined>();
  const wantHarbor = !anime && settings.showImdbBadge && !!imdbId;
  useEffect(() => {
    setHarborRating(undefined);
    if (!wantHarbor || !imdbId) return;
    let cancelled = false;
    harborImdbTitle(imdbId)
      .then((r) => {
        if (!cancelled && r != null) setHarborRating(r.toFixed(1));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wantHarbor, imdbId]);
  const hasInlineImdb = meta.id.startsWith("tt") && !!meta.imdbRating;
  const wantCinemetaRating = settings.showImdbBadge && !anime && !hasInlineImdb;
  const cinemetaRating = useCinemetaRating(wantCinemetaRating ? imdbId : undefined);
  const imdbValue = anime
    ? undefined
    : (harborRating ?? omdb?.imdbRating ?? cinemetaRating ?? (meta.id.startsWith("tt") ? meta.imdbRating : undefined));
  const tmdbVote = useTmdbVote(
    settings.showTmdbBadge && !anime ? meta.id : undefined,
    meta.type === "series" ? "series" : "movie",
    settings.tmdbKey,
  );
  const mediaKind = meta.type === "series" ? "show" : "movie";
  const wantMdblist =
    settings.showPopcornBadge ||
    settings.showMetacriticBadge ||
    settings.showLetterboxdBadge ||
    settings.showMdblistBadge ||
    settings.showTraktBadge ||
    settings.showSimklBadge;
  const cardScores = useMdblistCardScores(wantMdblist ? imdbId : undefined, mediaKind);
  const simklImdb = useSimklCardScores(settings.showSimklBadge && !anime ? imdbId : undefined);
  const simklAnime = useSimklCardScoresByAnimeId(settings.showSimklBadge && anime ? meta.id : undefined);
  const simklValue = (anime ? simklAnime : simklImdb).score ?? cardScores?.simkl ?? null;

  const badges: CardBadge[] = [];
  if (anime) {
    if (settings.showMalBadge && meta.imdbRating)
      badges.push({ kind: "rating", source: "mal", value: meta.imdbRating });
  } else {
    if (settings.showImdbBadge && imdbValue) badges.push({ kind: "rating", source: "imdb", value: imdbValue });
    if (settings.showTmdbBadge && tmdbVote) badges.push({ kind: "rating", source: "tmdb", value: tmdbVote });
  }
  if (settings.showSimklBadge && simklValue != null) badges.push({ kind: "simkl", value: simklValue });
  if (settings.showRtBadge && omdb?.rtCritics != null) badges.push({ kind: "rt", value: omdb.rtCritics });
  if (settings.showPopcornBadge && cardScores?.rtAudience != null)
    badges.push({ kind: "audience", value: cardScores.rtAudience });
  if (settings.showMetacriticBadge && cardScores?.metacritic != null)
    badges.push({ kind: "metacritic", value: cardScores.metacritic });
  if (settings.showLetterboxdBadge && cardScores?.letterboxd != null)
    badges.push({ kind: "letterboxd", value: cardScores.letterboxd });
  if (settings.showMdblistBadge && cardScores?.score != null) badges.push({ kind: "mdblist", value: cardScores.score });
  if (settings.showTraktBadge && cardScores?.trakt != null) badges.push({ kind: "trakt", value: cardScores.trakt });

  // Provider prefetches wait for the tile to scroll into view, the same gate the
  // desktop card uses so a long rail does not fan out hundreds of requests.
  useEffect(() => {
    if (!settings.omdbKey && !settings.mdblistKey && !wantCinemetaRating) return;
    const el = hostRef.current;
    if (!el) return;
    let off: (() => void) | null = observe(el, async (visible) => {
      if (!visible) return;
      off?.();
      off = null;
      const id = meta.id.startsWith("tt") ? meta.id : await tmdbImdbId(settings.tmdbKey, meta.id);
      if (!id) return;
      if (settings.omdbKey) omdbPrefetch(settings.omdbKey, id);
      if (settings.mdblistKey && wantMdblist) mdblistCardPrefetch(id, mediaKind);
      if (wantCinemetaRating) cinemetaRatingPrefetch(id, meta.type === "series" ? "series" : "movie");
    });
    return () => off?.();
  }, [hostRef, meta.id, meta.type, settings.tmdbKey, settings.omdbKey, settings.mdblistKey, wantMdblist, wantCinemetaRating, mediaKind]);

  const inWatchlist = useInWatchlist(meta.id, altIds);
  const watched = useMetaWatched(meta.id, meta.type, imdbId);
  const inLocal = useInLocalLibrary(meta.id, altIds);

  const awardYear = parseAwardYear(meta.releaseInfo);
  const awardImdb = !anime && (settings.awardTabs || settings.showCardBadges) ? imdbId : undefined;
  const classicWin = useClassicAwardWin(meta, awardImdb);
  const animeWin = anime
    ? (findTopAward(awardLookupName ?? meta.name, awardYear) ?? findTopAward(meta.name, awardYear))
    : null;
  const hasAwardWin = !!animeWin || !!classicWin;
  const awardTop = hasAwardWin && settings.awardTabs && settings.awardTabPosition === "top";
  const awardBelow = hasAwardWin && settings.awardTabs && settings.awardTabPosition === "below";
  const leftAwardBadge = settings.showCardBadges && !settings.awardTabs && hasAwardWin;
  const topLeftSlots = (hasDub ? 1 : 0) + (stateBadge ? 1 : 0) + (leftAwardBadge ? 1 : 0);

  const bookmarkTopEnd = inWatchlist && settings.watchlistBadge === "topEnd";
  const watchedPos =
    settings.badgePlacement === "top"
      ? "bottom-1.5 end-1.5"
      : `end-1.5 ${circleTop((ribbonRight ? 1 : 0) + (bookmarkTopEnd ? 1 : 0))}`;
  const watchlistPos =
    settings.watchlistBadge === "topEnd"
      ? `end-1.5 ${circleTop(ribbonRight ? 1 : 0)}`
      : settings.watchlistBadge === "topStart"
        ? `start-1.5 ${circleTop(topLeftSlots + (ribbonLeft ? 1 : 0))}`
        : WATCHLIST_POS[settings.watchlistBadge];

  return (
    <>
      {showTop10 && <TopTenRibbon side={settings.top10RibbonSide} />}
      {hasDub && (
        <span
          className={`pointer-events-none absolute start-1.5 ${stackTop(0, ribbonLeft)} z-10 rounded-md bg-accent/90 px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-[0.14em] text-canvas ring-1 ring-black/10`}
        >
          DUB
        </span>
      )}
      {settings.showCardBadges && (
        <>
          {rerun && (
            <span className={`pointer-events-none absolute start-1.5 ${stackTop(hasDub ? 1 : 0, ribbonLeft)} flex items-center gap-1 rounded-md border border-edge-soft bg-canvas/95 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink-muted`}>
              <RefreshCcw size={8} strokeWidth={2.4} />
              {t("Rerun")}
            </span>
          )}
          {showCinema && (
            <span className={`pointer-events-none absolute start-1.5 ${stackTop(hasDub ? 1 : 0, ribbonLeft)} flex items-center gap-1 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink`}>
              <ClapperMini size={9} />
              {t("In Cinema")}
            </span>
          )}
          {isNew && (
            <span className={`pointer-events-none absolute start-1.5 ${stackTop(hasDub ? 1 : 0, ribbonLeft)} rounded-md border border-edge-soft bg-canvas/95 px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-ink`}>
              {t("New")}
            </span>
          )}
          {!settings.awardTabs && anime && animeWin && (
            <AnimeAwardBadge win={animeWin} slots={(hasDub ? 1 : 0) + (stateBadge ? 1 : 0)} ribbon={ribbonLeft} />
          )}
          {!settings.awardTabs && !anime && (
            <ClassicAwardBadge win={classicWin} stacked={!!stateBadge} dubShift={ribbonLeft} />
          )}
        </>
      )}
      {settings.awardTabs && anime && animeWin && (
        <span className={`pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 ${awardTop ? "top-1.5" : awardBelow ? "bottom-1.5" : "bottom-7"}`}>
          <AwardTab label={animeTabLabel(animeWin, awardLookupName ?? meta.name, awardYear)} className="scale-[0.9]" />
        </span>
      )}
      {settings.awardTabs && !anime && <ClassicAwardTab win={classicWin} below={awardBelow} top={awardTop} />}
      {inWatchlist && settings.watchlistBadge !== "off" && (
        <span
          className={`pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full bg-canvas/95 text-ink ring-1 ring-edge-soft/70 ${watchlistPos}`}
          aria-label={t("In watchlist")}
        >
          <Bookmark size={11} strokeWidth={2.6} fill="currentColor" />
        </span>
      )}
      {settings.showWatchedBadge && watched && (
        <span
          className={`pointer-events-none absolute flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white ring-1 ring-emerald-300/40 ${watchedPos}`}
          aria-label={t("Watched")}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      {settings.showLocalLibraryBadge && inLocal && (
        <LocalDot className={`bottom-1.5 ${settings.watchlistBadge === "bottomStart" ? "start-9" : "start-1.5"}`} />
      )}
      <ScoreStack badges={badges} limit={settings.cardBadgeLimit} placement={settings.badgePlacement} raised={awardBelow} />
    </>
  );
}

function animeTabLabel(win: ReturnType<typeof findTopAward>, name: string, year?: number): string {
  if (!win) return "";
  if (win.source === "crunchyroll") {
    const count = findAnyAwardWins(name, year).filter((w) => w.source === "crunchyroll").length || 1;
    return `${count} ${count === 1 ? "Award" : "Awards"}`;
  }
  return AWARD_TAB_LABEL[win.source] ?? awardSourceMeta(win.source).shortName;
}

function AnimeAwardBadge({
  win,
  slots,
  ribbon,
}: {
  win: NonNullable<ReturnType<typeof findTopAward>>;
  slots: number;
  ribbon: boolean;
}) {
  const t = useT();
  useAwardPacks();
  const src = awardSourceMeta(win.source);
  const custom = resolveAwardIcon(win.source);
  const label = slots > 0 ? `${win.year}` : `${win.year} ${t(shortCategory(win))}`;
  return (
    <span
      className={`pointer-events-none absolute start-1.5 inline-flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded-md bg-canvas/95 px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.12em] text-ink ring-1 ring-edge-soft/60 ${stackTop(slots, ribbon)}`}
    >
      <img
        src={custom ?? src.iconSmall}
        alt=""
        width={10}
        height={10}
        draggable={false}
        className={`h-2.5 w-2.5 shrink-0 object-contain ${!custom && win.source === "animation_kobe" ? "brightness-0 invert" : ""}`}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

function metacriticTone(v: number): string {
  if (v >= 61) return "bg-emerald-500";
  if (v >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function BadgeContent({ badge }: { badge: CardBadge }) {
  switch (badge.kind) {
    case "rating":
      return (
        <span className="flex items-center gap-1">
          {badge.source === "mal" ? (
            <MalLogo className="h-[10px] w-auto text-ink-muted" />
          ) : badge.source === "tmdb" ? (
            <span className="text-[8px] font-bold leading-none tracking-tight text-ink-muted">TMDB</span>
          ) : (
            <ImdbIcon className="h-[10px] w-auto rounded-[2px]" />
          )}
          <span>{badge.value}</span>
        </span>
      );
    case "rt":
      return (
        <span className="flex items-center gap-0.5">
          <RtBadge score={badge.value} className="h-[11px] w-auto" />
          <span>{badge.value}%</span>
        </span>
      );
    case "audience":
      return (
        <span className="flex items-center gap-0.5">
          <Popcorn size={11} strokeWidth={2.4} className={badge.value >= 60 ? "text-accent" : "text-ink-muted"} />
          <span>{Math.round(badge.value)}%</span>
        </span>
      );
    case "metacritic":
      return (
        <span className={`flex h-[12px] min-w-[14px] items-center justify-center rounded-[3px] px-0.5 text-[8px] font-bold text-white ${metacriticTone(badge.value)}`}>
          {Math.round(badge.value)}
        </span>
      );
    case "letterboxd":
      return (
        <span className="flex items-center gap-0.5">
          <img src={letterboxdLogo} alt="" className="h-[10px] w-[10px] rounded-[2px] object-cover" />
          <span>{(badge.value / 2).toFixed(1)}</span>
        </span>
      );
    case "mdblist":
      return (
        <span className="flex items-center gap-0.5">
          <img src={mdblistLogo} alt="" className="h-[10px] w-[10px] rounded-[2px] object-contain" />
          <span>{Math.round(badge.value)}</span>
        </span>
      );
    case "trakt":
      return (
        <span className="flex items-center gap-0.5">
          <img src={traktLogo} alt="" className="h-[10px] w-[10px] object-contain" />
          <span>{Math.round(badge.value)}%</span>
        </span>
      );
    case "simkl":
      return (
        <span className="flex items-center gap-0.5">
          <img src={simklLogo} alt="" className="h-[10px] w-[10px] rounded-[2px] object-contain" />
          <span>{Math.round(badge.value)}</span>
        </span>
      );
  }
}

function ScoreStack({
  badges,
  limit = 3,
  placement = "bottom",
  raised = false,
}: {
  badges: CardBadge[];
  limit?: number;
  placement?: "top" | "bottom";
  raised?: boolean;
}) {
  const shown = badges.slice(0, Math.max(1, limit));
  if (shown.length === 0) return null;
  // A 124px poster has room for three badges at full size; beyond that the
  // stack shrinks from its end edge like the desktop card instead of clipping.
  const scale = shown.length <= 2 ? 1 : shown.length === 3 ? 0.9 : shown.length === 4 ? 0.78 : 0.68;
  return (
    <div
      style={scale < 1 ? { transform: `scale(${scale})`, transformOrigin: "right" } : undefined}
      className={`pointer-events-none absolute end-1.5 flex items-center gap-1 whitespace-nowrap rounded-md bg-canvas/95 px-1.5 py-0.5 text-[9.5px] font-semibold text-ink ${
        placement === "top" ? "top-1.5" : raised ? "bottom-8" : "bottom-1.5"
      }`}
    >
      {shown.map((b, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="opacity-30">·</span>}
          <BadgeContent badge={b} />
        </span>
      ))}
    </div>
  );
}

// Shared by the rail tile and the grid tile so both get the same chrome and the
// same long-press behaviour without duplicating the wiring.
export function useTileHost() {
  return useRef<HTMLButtonElement>(null);
}
