import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  claimOrigin,
  flipIn,
  flipOut,
  resetFlip,
  FLIP_TARGET_ATTR,
  MOTION,
  type OriginHandle,
  type Rect,
} from "@/lib/motion";
import type { Meta } from "@/lib/cinemeta";
import { awardSummary, pickHeroAwards, useAwards } from "@/lib/providers/wikidata";
import { mergeBundledAwards } from "@/lib/awards-history";
import { useSettings } from "@/lib/settings";
import { useHideAnimeMetas } from "@/lib/anime-hide";
import { sizeImageUrl } from "@/lib/img-size";
import { useMobileRemote } from "../mobile-remote";
import {
  DETAIL_CSS,
  firstEpisode,
  seasonList,
  useCinemetaFull,
  useReducedMotion,
  useTmdbDetail,
} from "./data";
import { Hero } from "./hero";
import { DetailActions } from "./actions";
import { Line, Overview } from "./ui";
import { EpisodeSection } from "./episodes";
import { AnimeEpisodeSection, firstAnimeEpisode, toPlayEpisode } from "./anime-episodes";
import { CastRow, CastSkeleton, CrewSection } from "./cast";
import { RecRail } from "./recommendations";
import { AwardsSection } from "./awards";
import { dedupeCharacters, dedupeMeta, dedupeRelated, isAnimeId, useAnimeDetail } from "./anime-data";
import {
  AnimeInfo,
  AnimeRelatedRow,
  AnimeStats,
  AnimeTitles,
  CharactersRow,
  hasAnimeTitles,
  relatedToMeta,
} from "./anime";
import { useAnimeAnilistDetails } from "@/views/detail/use-anime-anilist-details";
import { useAnimeCharacters } from "@/views/detail/use-anime-characters";
import { useMalRating } from "@/lib/mal-rating";

export function MobileDetail({ meta, onClose }: { meta: Meta; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const [stack, setStack] = useState<Meta[]>([meta]);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The tile this screen was opened from: the flight home, and the artwork we
  // owe it back. Only the root entry owns one: after in-stack navigation the
  // source tile belongs to a body that no longer exists, and closing falls back
  // to a plain fade.
  const rootOrigin = useRef<OriginHandle | null>(null);
  // Where the next flight starts. Written by the only two things that can
  // legitimately start one (opening the screen, tapping a related poster) and
  // read (never consumed) by the layout effect, so StrictMode's second
  // invocation replays the same flight instead of finding nothing left.
  const flight = useRef<{ from: Rect; origin: OriginHandle | null } | null>(null);
  const openedFor = useRef<string | null>(null);
  const finished = useRef(false);

  // Hosts mount this unkeyed, so opening a second title reuses the instance that
  // just finished closing. Reset the whole exit state machine with the stack, or
  // the new screen renders in the exiting state and dismisses itself.
  useEffect(() => {
    setStack([meta]);
    setClosing(false);
    finished.current = false;
  }, [meta.id]);

  const current = stack[stack.length - 1] ?? meta;
  const isRoot = stack.length === 1;

  const heroPoster = useCallback(
    () => scrollRef.current?.querySelector<HTMLElement>(`[${FLIP_TARGET_ATTR}]`) ?? null,
    [],
  );

  // The single exit path. Guarded, because two clocks race to call it (the exit
  // animation and the timer that exists in case the animation never fires) and
  // because a second tap must not close the screen twice.
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    rootOrigin.current?.show();
    onClose();
  }, [onClose]);

  // Whatever happens to this screen (close, an error boundary, the tab going
  // away), the tile we borrowed gets its artwork back.
  useEffect(() => () => rootOrigin.current?.show(), []);

  // Fires on open and on every in-stack navigation, so a "More Like This"
  // poster flies up into the hero exactly the way a home rail poster does.
  useLayoutEffect(() => {
    // Scroll first, measure second. The reset used to live in a passive effect,
    // which ran *after* the transform was written and moved the landing site
    // out from under a flight that was already running toward it.
    scrollRef.current?.scrollTo({ top: 0 });

    if (isRoot && openedFor.current !== current.id) {
      openedFor.current = current.id;
      rootOrigin.current?.show();
      const origin = reduced ? null : claimOrigin();
      const from = origin?.rect() ?? null;
      rootOrigin.current = origin;
      flight.current = from ? { from, origin } : null;
    }

    const el = heroPoster();
    const next = reduced ? null : flight.current;
    if (!el || !next) return;
    // Hide the source only if there really is a flight: the whole point is that
    // one object moves, so the tile stays hidden until the screen gives it back
    // (finish(), or the unmount cleanup above, whichever comes first).
    if (!flipIn(el, next.from)) return () => resetFlip(el);
    const handoff = window.setTimeout(() => next.origin?.hide(), MOTION.handoff);
    return () => {
      window.clearTimeout(handoff);
      resetFlip(el);
    };
  }, [current.id, isRoot, reduced, heroPoster]);

  // Unmount is driven by this clock, not by the exit animation's event. Reduced
  // motion collapses the animation, and a collapsed or cancelled animation can
  // fire no event at all; onAnimationEnd below is only the fast path.
  //
  // The timer depends on `closing` alone. Callers hand us a fresh onClose on
  // every render of the host screen, and a timer keyed on that identity would
  // be torn down and restarted by unrelated re-renders. An exit that never
  // arrives is exactly the failure this clock exists to prevent.
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => finishRef.current(), MOTION.exit + MOTION.exitGrace);
    return () => window.clearTimeout(t);
  }, [closing]);

  const close = useCallback(() => {
    if (closing) return;
    if (reduced) {
      finish();
      return;
    }
    const el = heroPoster();
    const home = isRoot ? (rootOrigin.current?.rect() ?? null) : null;
    const flying = !!el && !!home && flipOut(el, home);
    // No flight home (deep link, in-stack entry, tile scrolled out of the rail):
    // give the artwork back now and let the screen simply fade off it.
    if (!flying) rootOrigin.current?.show();
    setClosing(true);
  }, [closing, reduced, finish, isRoot, heroPoster]);

  const back = useCallback(() => {
    if (closing) return;
    if (stack.length > 1) {
      // Popping is not a flight: the tile we flew up from went away with the
      // body that owned it, so the hero simply appears.
      flight.current = null;
      setStack((s) => s.slice(0, -1));
    } else close();
  }, [closing, stack.length, close]);

  const openMeta = useCallback(
    (m: Meta) => {
      if (closing || current.id === m.id) return;
      // Measured here, in the tap handler, while the tapped tile is still
      // mounted: by the time the layout effect runs, React has already replaced
      // the body that owned it and there is nothing left to measure.
      const from = (reduced ? null : claimOrigin()?.rect()) ?? null;
      // No origin handle: the tile unmounts in the same commit the flight
      // starts, which is the handoff, so there is nothing to hide or restore.
      flight.current = from ? { from, origin: null } : null;
      setStack((s) => (s[s.length - 1]?.id === m.id ? s : [...s, m]));
    },
    [closing, reduced, current.id],
  );

  const node = (
    <div
      ref={scrollRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      onAnimationEnd={(e) => {
        if (closing && e.target === e.currentTarget) finish();
      }}
      className={`fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-canvas ${
        closing ? "md-detail-out" : "md-detail-in"
      }`}
    >
      <style>{DETAIL_CSS}</style>
      {/* While leaving, the screen keeps swallowing taps (pointer-events-none on
          the overlay would let them fall through to the rail behind and open
          something else) but its own controls go inert, so a tap can neither
          close twice nor navigate into a body the pending unmount destroys. */}
      <div className={closing ? "pointer-events-none contents" : "contents"}>
        <DetailBody key={current.id} meta={current} onBack={back} onOpenMeta={openMeta} />
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

function DetailBody({
  meta,
  onBack,
  onOpenMeta,
}: {
  meta: Meta;
  onBack: () => void;
  onOpenMeta: (m: Meta) => void;
}) {
  const { settings } = useSettings();
  const { playOnHost, openOnHost } = useMobileRemote();
  const key = settings.tmdbKey;
  const isAnime = isAnimeId(meta.id);
  const full = useCinemetaFull(meta);
  const tmdb = useTmdbDetail(meta, key);
  const anime = useAnimeDetail(meta, isAnime);
  const detail = isAnime ? anime.detail : tmdb.detail;
  const loading = isAnime ? anime.loading : tmdb.loading;

  // Everything below the synopsis mounts in one commit the moment the fetch
  // resolves, which measured as a single 348ms block landing 121ms into the open
  // transition and visibly froze it. Hold those sections until the travel ends.
  // Every fetch runs from this component, so this delays paint and nothing else.
  const settleReduced = useReducedMotion();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const t = window.setTimeout(() => setSettled(true), settleReduced ? 0 : MOTION.travel);
    return () => window.clearTimeout(t);
  }, [meta.id, settleReduced]);

  const anilist = useAnimeAnilistDetails(anime.canonicalId, isAnime);
  const animeCharacters = useAnimeCharacters(anime.canonicalId, isAnime);
  // Anime streams resolve against the canonical kitsu id, not the browse id.
  const playMeta = useMemo(
    () => (isAnime ? { ...meta, id: anime.canonicalId ?? meta.id } : meta),
    [isAnime, meta, anime.canonicalId],
  );
  const malRating = useMalRating(
    isAnime
      ? { ...meta, id: anime.canonicalId ?? meta.id, imdbRating: detail?.rating ?? meta.imdbRating }
      : undefined,
  );

  const handlePerson = useCallback(
    (id: number, name: string) => openOnHost({ id: `person:${id}`, type: "movie", name } as Meta),
    [openOnHost],
  );

  const isSeries = !isAnime && (detail?.kind === "tv" || meta.type === "series");
  const title = detail?.title || meta.name;
  const logo = detail?.logo || meta.logo;
  // TMDB details hand back /original here (up to ~4K, tens of MB decoded); w1280
  // already exceeds any phone-width hero box. Non-TMDB URLs pass through untouched.
  const backdropSrc = detail?.backdrop || full?.background || meta.background || meta.poster;
  const backdrop = backdropSrc ? sizeImageUrl(backdropSrc, 1280) : undefined;
  const year = (detail?.year || meta.releaseInfo || "").slice(0, 4);
  const imdbRating = meta.imdbRating || full?.imdbRating;
  const rating = isAnime ? malRating : imdbRating || detail?.rating;
  const runtime = detail?.runtime;
  const genres = (detail?.genres?.length ? detail.genres : meta.genres) ?? [];
  const overview = detail?.overview || full?.description || meta.description || "";

  const imdbId = detail?.imdbId ?? (meta.id.startsWith("tt") ? meta.id : null);
  const releaseYear = Number(year) || undefined;
  const liveAwards = useAwards(imdbId ?? undefined, isSeries);
  const awards = useMemo(
    () => mergeBundledAwards(liveAwards, meta.name, releaseYear),
    [liveAwards, meta.name, releaseYear],
  );
  const awardGroups = useMemo(() => awardSummary(awards), [awards]);
  const heroAwardSummary = useMemo(() => pickHeroAwards(awardGroups), [awardGroups]);

  const seasons = useMemo(() => seasonList(full, detail), [full, detail]);
  const first = useMemo(() => firstEpisode(full, seasons), [full, seasons]);
  const trailerId = detail?.trailerCandidates?.[0] ?? meta.trailerStreams?.[0]?.ytId ?? null;

  const { recItems, simItems } = useMemo(() => {
    if (!detail) return { recItems: [] as Meta[], simItems: [] as Meta[] };
    if (!isAnime) return { recItems: detail.recommendations, simItems: detail.similar };
    const seenIds = new Set<string>([meta.id]);
    const seenNames = new Set<string>([meta.name.trim().toLowerCase()]);
    const recItems = dedupeMeta(detail.recommendations, seenIds, seenNames);
    const simItems = dedupeMeta(detail.similar, seenIds, seenNames);
    return { recItems, simItems };
  }, [detail, isAnime, meta.id, meta.name]);

  const shownRecItems = useHideAnimeMetas(recItems);
  const shownSimItems = useHideAnimeMetas(simItems);

  const onPlay = () => {
    if (isAnime) {
      const firstAnime = firstAnimeEpisode(anime.episodes);
      if (firstAnime) playOnHost(playMeta, { playEpisode: toPlayEpisode(firstAnime) });
      else playOnHost(playMeta);
    } else if (isSeries && first) {
      playOnHost(meta, { season: first.season, episode: first.episode });
    } else {
      playOnHost(meta);
    }
  };

  return (
    <div>
      <Hero
        meta={meta}
        detail={detail}
        title={title}
        logo={logo}
        backdrop={backdrop}
        year={year}
        rating={rating}
        isImdb={!isAnime && !!imdbRating}
        runtime={runtime}
        genres={genres}
        awardSummary={heroAwardSummary}
        onBack={onBack}
      />

      {/* Capped and left aligned so it sits on the same edge as the hero's poster
          and title. Uncapped, a landscape phone ran the synopsis to about 130
          characters a line and stretched Play across the whole screen. Portrait is
          narrower than the cap, so it is unchanged. */}
      <div
        className="md-rise-in flex w-full max-w-[640px] flex-col gap-8 px-5 pt-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 44px)" }}
      >
        <DetailActions meta={meta} detail={detail} title={title} trailerId={trailerId} onPlay={onPlay} />

        {overview ? (
          <Overview text={overview} />
        ) : (isAnime ? loading : key && loading) ? (
          <div className="flex flex-col gap-2.5">
            <Line className="w-full" />
            <Line className="w-full" />
            <Line className="w-2/3" />
          </div>
        ) : null}

        {settled && (
          <>
        {isSeries && (
          <EpisodeSection
            meta={meta}
            full={full}
            detail={detail}
            tmdbKey={key}
            seasons={seasons}
            onPlay={(ep) => playOnHost(meta, { season: ep.season, episode: ep.episode })}
          />
        )}

        {isAnime && (
          <AnimeEpisodeSection
            meta={playMeta}
            imdbId={imdbId}
            episodes={anime.episodes}
            loading={anime.loading}
            onPlay={(ep) => playOnHost(playMeta, { playEpisode: ep })}
          />
        )}

        {detail && <CrewSection detail={detail} onPerson={handlePerson} />}

        {detail && detail.cast.length > 0 ? (
          <CastRow cast={detail.cast} onPerson={isAnime ? undefined : handlePerson} />
        ) : (isAnime ? loading : key && loading) ? (
          <CastSkeleton />
        ) : null}

        {isAnime && animeCharacters.length > 0 && (
          <CharactersRow characters={dedupeCharacters(animeCharacters)} />
        )}

        {detail && shownRecItems.length > 0 && (
          <RecRail title="More Like This" items={shownRecItems} onOpen={onOpenMeta} />
        )}

        {detail && shownSimItems.length > 0 && (
          <RecRail title="You Might Also Like" items={shownSimItems} onOpen={onOpenMeta} />
        )}

        {isAnime && anilist && anilist.relatedAnime.length > 0 && (
          <AnimeRelatedRow
            title="Related Anime"
            nodes={dedupeRelated(anilist.relatedAnime)}
            onOpen={(n) => onOpenMeta(relatedToMeta(n))}
          />
        )}

        {isAnime && anilist && anilist.adaptations.length > 0 && (
          <AnimeRelatedRow title="Adaptations" nodes={dedupeRelated(anilist.adaptations)} />
        )}

        {isAnime && (detail || anilist) && (
          <AnimeInfo detail={detail} anilist={anilist} malRating={malRating} />
        )}

        {isAnime && anilist && hasAnimeTitles(anilist, title) && (
          <AnimeTitles details={anilist} primaryTitle={title} />
        )}

        {isAnime && anilist && anilist.statusDistribution.length > 0 && (
          <AnimeStats details={anilist} />
        )}

        {awardGroups.length > 0 && <AwardsSection groups={awardGroups} awards={awards} />}
          </>
        )}
      </div>
    </div>
  );
}
