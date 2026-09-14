import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import {
  awardSummary,
  pickHeroAwards,
  useAwards,
} from "@/lib/providers/wikidata";
import { parseKitsuId } from "@/lib/providers/kitsu";
import { mergeBundledAwards } from "@/lib/awards-history";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useHideAnimeMetas } from "@/lib/anime-hide";
import { sizeImageUrl } from "@/lib/img-size";
import { openUrl } from "@/lib/window";
import { lastPlayedEpisode } from "@/lib/resume";
import { manualWatchedState } from "@/lib/manual-watched";
import { orderedSectionKeys } from "@/lib/detail-customization";
import { stremioIdToTraktTarget, type IdResolution } from "@/lib/trakt/ids";
import { useTogether } from "@/lib/together/provider";
import { HeroRatings } from "@/views/detail/hero-ratings";
import { isTitleUpcoming } from "@/views/detail/helpers";
import { StreamingLinks } from "@/views/detail/streaming-links";
import { WatchOn } from "@/views/detail/watch-on";
import { MobilePerson } from "../destinations";
import { useMobileRemote } from "../mobile-remote";
import { useRegisterSheet } from "../mobile-sheet-lock";
import {
  DETAIL_CSS,
  firstEpisode,
  seasonList,
  useCastFallbackDetail,
  useCinemetaFull,
  useDetailLayout,
  useRatingSources,
  useReducedMotion,
  useTmdbDetail,
  useWatchProviders,
  type Ep,
} from "./data";
import { Hero } from "./hero";
import { DetailActions, isResumingMovie } from "./actions";
import { Line, Overview } from "./ui";
import { EpisodeSection } from "./episodes";
import {
  AnimeEpisodeSection,
  firstAnimeEpisode,
  toPlayEpisode,
} from "./anime-episodes";
import { CastRow, CastSkeleton, CrewSection } from "./cast";
import { RecRail } from "./recommendations";
import { AwardsSection } from "./awards";
import {
  dedupeCharacters,
  dedupeMeta,
  dedupeRelated,
  isAnimeId,
  useAnimeDetail,
} from "./anime-data";
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
import { MOBILE_INTENT_EVENT } from "../mobile-intent";
import { PhoneCollectionRow, PhoneLetterboxdPanel } from "./sections";
import { PhoneMediaGallery } from "./gallery";
import { AnilistCommentsPhone, LetterboxdReviewsPhone, TraktCommentsPhone } from "./comments";
import { EpisodePage } from "./episode-page";
import { PersonPage } from "./person-page";

export function MobileDetail({
  meta,
  onClose,
}: {
  meta: Meta;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // This screen covers the shell, and it fades in rather than cutting, so for the
  // length of that fade the browse chrome underneath shows through - the cast pill
  // landing on top of this screen's own back button. Registering as a sheet takes
  // that chrome away for as long as the screen is mounted, closing animation included.
  useRegisterSheet(true);

  // A cross-surface intent means "take me somewhere else in the app". This
  // screen is a fixed overlay owned by local state in whichever view opened it
  // (mobile-search, mobile-genre-page), so it is not in the navigation stack and
  // no view-level call can dismiss it: it would sit on top of the tab the intent
  // just switched to, and the button that fired it would look like it had only
  // closed the picker. Standing down here covers every owner at once.
  useEffect(() => {
    const onIntent = () => onCloseRef.current();
    window.addEventListener(MOBILE_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(MOBILE_INTENT_EVENT, onIntent);
  }, []);
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
  const flight = useRef<{ from: Rect; origin: OriginHandle | null } | null>(
    null,
  );
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
    () =>
      scrollRef.current?.querySelector<HTMLElement>(`[${FLIP_TARGET_ATTR}]`) ??
      null,
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
    const handoff = window.setTimeout(
      () => next.origin?.hide(),
      MOTION.handoff,
    );
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
    const t = window.setTimeout(
      () => finishRef.current(),
      MOTION.exit + MOTION.exitGrace,
    );
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
      data-md-scroll
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
        <DetailBody
          key={current.id}
          meta={current}
          onBack={back}
          onOpenMeta={openMeta}
        />
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(node, document.body)
    : node;
}

// Agent-built phone Person page, when the destinations module provides one.
// Held in a local so the conditional below narrows it.
const ExternalPerson = MobilePerson;

function DetailBody({
  meta,
  onBack,
  onOpenMeta,
}: {
  meta: Meta;
  onBack: () => void;
  onOpenMeta: (m: Meta) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { playOnHost, snapshot } = useMobileRemote();
  const { snapshot: room, claimHost } = useTogether();
  const key = settings.tmdbKey;
  const isAnime = isAnimeId(meta.id);
  const full = useCinemetaFull(meta);
  const tmdb = useTmdbDetail(meta, key);
  const anime = useAnimeDetail(meta, isAnime);
  const kitsuId = anime.canonicalId ? parseKitsuId(anime.canonicalId) : null;
  // Desktop fills an empty or placeholder cast from TVDB; the phone does too.
  const detail = useCastFallbackDetail(meta, isAnime ? anime.detail : tmdb.detail, kitsuId);
  const loading = isAnime ? anime.loading : tmdb.loading;

  // Everything below the synopsis mounts in one commit the moment the fetch
  // resolves, which measured as a single 348ms block landing 121ms into the open
  // transition and visibly froze it. Hold those sections until the travel ends.
  // Every fetch runs from this component, so this delays paint and nothing else.
  const settleReduced = useReducedMotion();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const t = window.setTimeout(
      () => setSettled(true),
      settleReduced ? 0 : MOTION.travel,
    );
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
      ? {
          ...meta,
          id: anime.canonicalId ?? meta.id,
          imdbRating: detail?.rating ?? meta.imdbRating,
        }
      : undefined,
  );

  // Person taps used to forward to the desktop host. They now open on the
  // phone: the destinations Person page when it exists, otherwise the
  // filmography page built here from the desktop person hooks.
  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [episodePage, setEpisodePage] = useState<{ season: number; episode: number } | null>(null);
  const handlePerson = useCallback(
    (id: number, name: string) => setPerson({ id, name }),
    [],
  );

  const isSeries =
    !isAnime && (detail?.kind === "tv" || meta.type === "series");
  const title = detail?.title || meta.name;
  const logo = detail?.logo || meta.logo;
  // TMDB details hand back /original here (up to ~4K, tens of MB decoded); w1280
  // already exceeds any phone-width hero box. Non-TMDB URLs pass through untouched.
  const backdropSrc =
    detail?.backdrop || full?.background || meta.background || meta.poster;
  const backdrop = backdropSrc ? sizeImageUrl(backdropSrc, 1280) : undefined;
  const year = (detail?.year || meta.releaseInfo || "").slice(0, 4);
  const runtime = detail?.runtime;
  const genres = (detail?.genres?.length ? detail.genres : meta.genres) ?? [];
  const overview =
    detail?.overview || full?.description || meta.description || "";

  const imdbId = detail?.imdbId ?? (meta.id.startsWith("tt") ? meta.id : null);
  const { scores, mdblist, harborImdb } = useRatingSources(
    imdbId,
    meta.type === "movie" ? "movie" : "show",
  );
  // Same precedence as desktop: hosted IMDb, OMDb, then the Cinemeta figure.
  const imdbRatingValue =
    harborImdb ??
    scores?.imdbRating ??
    (meta.id.startsWith("tt") ? meta.imdbRating : undefined) ??
    full?.imdbRating;
  const rating = isAnime ? malRating : imdbRatingValue || detail?.rating || meta.imdbRating;
  const ratings = (
    // The rating links are desktop-size; the negative margin grows each hit
    // area to the 44pt floor without spreading the wrapped rows apart.
    <div className="empty:hidden [&_button]:-my-[13px] [&_button]:min-h-11">
      <HeroRatings
        compact
        bare
        rating={rating || undefined}
        isAnime={isAnime}
        scores={scores}
        mdblist={mdblist}
        imdbId={imdbId}
        mediaType={meta.type === "movie" ? "movie" : "show"}
        ratingSource={isAnime || imdbRatingValue ? "imdb" : "tmdb"}
        animeImdbRating={isAnime ? harborImdb : null}
        onOpenUrl={openUrl}
      />
    </div>
  );

  const availability = useMemo(() => {
    const ids = new Set(
      [meta.id, detail ? `tmdb:${detail.kind}:${detail.id}` : "", detail?.imdbId ?? ""]
        .filter(Boolean)
        .map((id) => id.toLowerCase()),
    );
    const tmdbId =
      detail?.id ??
      (() => {
        const match = meta.id.match(/^tmdb:(?:movie|tv|series):(\d+)$/i);
        return match ? Number(match[1]) : undefined;
      })();
    const imdb = (
      detail?.imdbId ?? (meta.id.startsWith("tt") ? meta.id : undefined)
    )?.toLowerCase();
    const matches = (item: NonNullable<typeof snapshot.library>["local"][number]) =>
      ids.has(item.id.toLowerCase()) ||
      (tmdbId != null && item.tmdbId === tmdbId) ||
      (!!imdb && item.imdbId?.toLowerCase() === imdb);
    const local = snapshot.library?.local?.some(matches) ?? false;
    const providers = new Set<"jellyfin" | "emby" | "plex">();
    for (const item of snapshot.library?.mediaServers ?? []) {
      if (!matches(item)) continue;
      for (const provider of item.mediaServerProviders ?? []) providers.add(provider);
    }
    return { local, providers: [...providers] };
  }, [meta.id, detail, snapshot.library]);

  const releaseYear = Number(year) || undefined;
  const liveAwards = useAwards(imdbId ?? undefined, isSeries);
  const awards = useMemo(
    () => mergeBundledAwards(liveAwards, meta.name, releaseYear),
    [liveAwards, meta.name, releaseYear],
  );
  const awardGroups = useMemo(() => awardSummary(awards), [awards]);
  const heroAwardSummary = useMemo(
    () => pickHeroAwards(awardGroups),
    [awardGroups],
  );

  const seasons = useMemo(() => seasonList(full, detail), [full, detail]);
  const first = useMemo(() => firstEpisode(full, seasons), [full, seasons]);
  const trailerId =
    detail?.trailerCandidates?.[0] ?? meta.trailerStreams?.[0]?.ytId ?? null;
  const watchProviders = useWatchProviders(detail, !isAnime);
  const layout = useDetailLayout();
  const upcoming = !loading && isTitleUpcoming(detail, meta);

  const { recItems, simItems } = useMemo(() => {
    if (!detail) return { recItems: [] as Meta[], simItems: [] as Meta[] };
    if (!isAnime)
      return { recItems: detail.recommendations, simItems: detail.similar };
    const seenIds = new Set<string>([meta.id]);
    const seenNames = new Set<string>([meta.name.trim().toLowerCase()]);
    const recItems = dedupeMeta(detail.recommendations, seenIds, seenNames);
    const simItems = dedupeMeta(detail.similar, seenIds, seenNames);
    return { recItems, simItems };
  }, [detail, isAnime, meta.id, meta.name]);

  const shownRecItems = useHideAnimeMetas(recItems);
  const shownSimItems = useHideAnimeMetas(simItems);

  // Resume where the user left off, as the desktop Play does, unless that
  // episode has since been marked unwatched by hand.
  const lastPlay = useMemo(() => {
    if (!isSeries) return null;
    const lp = lastPlayedEpisode(meta.id);
    if (!lp || lp.season < 1 || lp.episode < 1) return null;
    if (manualWatchedState(meta.id, lp.season, lp.episode) === false) return null;
    return lp;
  }, [isSeries, meta.id]);
  const inSession = room.state === "joined" && room.participants.length >= 2;
  const playLabel = inSession
    ? t("Play Together")
    : lastPlay
      ? t("Resume S{s}:E{e}", { s: lastPlay.displaySeason ?? lastPlay.season, e: lastPlay.episode })
      : isResumingMovie(meta)
        ? t("Resume")
        : t("Play");

  const onPlay = () => {
    if (inSession) claimHost(true);
    if (isAnime) {
      const firstAnime = firstAnimeEpisode(anime.episodes);
      if (firstAnime)
        playOnHost(playMeta, { playEpisode: toPlayEpisode(firstAnime) });
      else playOnHost(playMeta);
    } else if (isSeries && (lastPlay || first)) {
      const target = lastPlay ?? first!;
      playOnHost(meta, { season: target.season, episode: target.episode });
    } else {
      playOnHost(meta);
    }
  };

  const playEpisode = (ep: Ep) =>
    playOnHost(meta, {
      season: ep.season,
      episode: ep.episode,
      playEpisode: {
        season: ep.season,
        episode: ep.episode,
        name: ep.name,
        still: ep.still,
        overview: ep.overview,
        runtime: ep.runtime ?? undefined,
      },
    });

  const traktResolution = useMemo((): IdResolution => {
    if (isAnime) return { ok: false, reason: "anime" };
    const tmdbId = detail?.id;
    const ids: Record<string, string | number> = {};
    if (imdbId) ids.imdb = imdbId;
    if (tmdbId) ids.tmdb = tmdbId;
    if (isSeries && (imdbId || (tmdbId && detail?.kind === "tv"))) {
      return { ok: true, target: { kind: "show", ids } } as IdResolution;
    }
    if (!isSeries && (imdbId || tmdbId)) {
      return { ok: true, target: { kind: "movie", ids } } as IdResolution;
    }
    return stremioIdToTraktTarget(meta.id);
  }, [meta.id, isSeries, isAnime, imdbId, detail?.id, detail?.kind]);

  // The customizable part of the page, keyed exactly as desktop keys its
  // sections so an order or hidden set arranged there is honored here.
  const sections: Array<{ key: string; node: ReactNode }> = [];
  if (detail) {
    sections.push({ key: "crew", node: <CrewSection detail={detail} onPerson={handlePerson} /> });
  }
  if (detail && detail.cast.length > 0) {
    sections.push({
      key: "cast",
      node: <CastRow cast={detail.cast} onPerson={isAnime ? undefined : handlePerson} />,
    });
  } else if (isAnime ? loading : key && loading) {
    sections.push({ key: "cast", node: <CastSkeleton /> });
  }
  if (isAnime && animeCharacters.length > 0) {
    sections.push({
      key: "animeCharacters",
      node: <CharactersRow characters={dedupeCharacters(animeCharacters)} />,
    });
  }
  if (detail?.collection) {
    sections.push({
      key: "collection",
      node: <PhoneCollectionRow collection={detail.collection} currentId={meta.id} onOpen={onOpenMeta} />,
    });
  }
  if (detail && shownRecItems.length > 0) {
    sections.push({
      key: "moreLikeThis",
      node: <RecRail title={t("More Like This")} items={shownRecItems} onOpen={onOpenMeta} />,
    });
  }
  if (detail && shownSimItems.length > 0) {
    sections.push({
      key: "similar",
      node: <RecRail title={t("You Might Also Like")} items={shownSimItems} onOpen={onOpenMeta} />,
    });
  }
  if (isAnime && anilist && anilist.relatedAnime.length > 0) {
    sections.push({
      key: "animeRelated",
      node: (
        <AnimeRelatedRow
          title={t("Related Anime")}
          nodes={dedupeRelated(anilist.relatedAnime)}
          onOpen={(n) => onOpenMeta(relatedToMeta(n))}
        />
      ),
    });
  }
  if (isAnime && anilist && anilist.adaptations.length > 0) {
    sections.push({
      key: "animeAdaptations",
      node: <AnimeRelatedRow title={t("Adaptations")} nodes={dedupeRelated(anilist.adaptations)} />,
    });
  }
  if (detail) {
    sections.push({
      key: "mediaGallery",
      node: <PhoneMediaGallery detail={detail} title={title} logo={logo} metaId={meta.id} />,
    });
  }
  if (awardGroups.length > 0) {
    sections.push({ key: "awards", node: <AwardsSection groups={awardGroups} awards={awards} /> });
  }
  if (isAnime && anilist && hasAnimeTitles(anilist, title)) {
    sections.push({ key: "animeTitles", node: <AnimeTitles details={anilist} primaryTitle={title} /> });
  }
  if (isAnime && (detail || anilist)) {
    sections.push({
      key: "info",
      node: <AnimeInfo detail={detail} anilist={anilist} malRating={malRating} />,
    });
  }
  if (isAnime && anilist && anilist.statusDistribution.length > 0) {
    sections.push({ key: "animeStats", node: <AnimeStats details={anilist} /> });
  }
  if (!isAnime && settings.showTraktComments === true) {
    sections.push({ key: "traktComments", node: <TraktCommentsPhone resolution={traktResolution} /> });
  }
  if (isAnime && settings.showAnilistComments === true) {
    sections.push({
      key: "anilistComments",
      node: <AnilistCommentsPhone harborId={anime.canonicalId ?? meta.id} />,
    });
  }
  if (!isAnime) {
    sections.push({ key: "letterboxdPanel", node: <PhoneLetterboxdPanel meta={meta} imdbId={imdbId} /> });
    sections.push({ key: "letterboxdReviews", node: <LetterboxdReviewsPhone meta={meta} imdbId={imdbId} /> });
  }
  const byKey = new Map(sections.map((s) => [s.key, s.node]));
  const ordered = orderedSectionKeys(
    sections.map((s) => s.key),
    layout,
  ).filter((k) => !layout.hidden.includes(k));

  return (
    <div>
      <Hero
        meta={meta}
        detail={detail}
        title={title}
        logo={logo}
        backdrop={backdrop}
        year={year}
        ratings={ratings}
        runtime={runtime}
        genres={genres}
        awardSummary={heroAwardSummary}
        availability={availability}
        onBack={onBack}
      />

      {/* Capped and left aligned so it sits on the same edge as the hero's poster
          and title. Uncapped, a landscape phone ran the synopsis to about 130
          characters a line and stretched Play across the whole screen. Portrait is
          narrower than the cap, so it is unchanged. */}
      <div
        className="md-rise-in flex w-full max-w-[640px] flex-col gap-8 pt-5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 44px)",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <DetailActions
          meta={meta}
          detail={detail}
          title={title}
          logo={logo}
          trailerId={trailerId}
          onPlay={onPlay}
          playLabel={playLabel}
          upcoming={upcoming}
          isAnime={isAnime}
          isSeries={isSeries}
          trackerId={isAnime ? (anime.canonicalId ?? meta.id) : meta.id}
        />

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
            {isAnime && anime.streamers.length > 0 && <StreamingLinks streamers={anime.streamers} />}
            {!isAnime && watchProviders.length > 0 && <WatchOn providers={watchProviders} />}

            {isSeries && (
              <EpisodeSection
                meta={meta}
                full={full}
                detail={detail}
                tmdbKey={key}
                seasons={seasons}
                onPlay={playEpisode}
                onOpenEpisode={(ep) => setEpisodePage({ season: ep.season, episode: ep.episode })}
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

            {ordered.map((k) => (
              <div key={k} data-section={k} className="contents">
                {byKey.get(k)}
              </div>
            ))}
          </>
        )}
      </div>

      {episodePage && (
        <EpisodePage
          seriesMeta={meta}
          season={episodePage.season}
          episode={episodePage.episode}
          onBack={() => setEpisodePage(null)}
          onPlay={playEpisode}
          onPerson={handlePerson}
        />
      )}
      {person &&
        (ExternalPerson ? (
          <Suspense fallback={null}>
            <ExternalPerson personId={String(person.id)} onBack={() => setPerson(null)} />
          </Suspense>
        ) : (
          <PersonPage
            personId={person.id}
            onBack={() => setPerson(null)}
            onOpenMeta={(m) => {
              setPerson(null);
              setEpisodePage(null);
              onOpenMeta(m);
            }}
          />
        ))}
    </div>
  );
}
