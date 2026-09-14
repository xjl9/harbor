import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { HomeRow } from "@/views/home/home-types";
import {
  buildAnimeHomeRows,
  buildCinemetaRows,
  buildTmdbRows,
  isStreamingServiceRow,
  mergeRows,
} from "@/views/home/home-rows";
import { displayRowTitle } from "@/views/home/customizable-rows";
import { loadAddonRows, type AddonRow } from "@/lib/addons";
import { isAnimeRow } from "@/views/anime/anime-rows";
import { useAuth } from "@/lib/auth";
import { useSettings, type StreamingService } from "@/lib/settings";
import { useT, useUiLanguage } from "@/lib/i18n";
import { useHideAnimeMetas, useHideAnimeRows } from "@/lib/anime-hide";
import { usePinnedRows } from "@/views/home/hooks/use-pinned-rows";
import { useNewEpisodes } from "@/views/home/hooks/use-new-episodes";
import { useMediaFavorites, type MediaEntry } from "@/lib/media-favorites";
import { useLocalWatchlist } from "@/lib/local-watchlist";
import { useTrakt } from "@/lib/trakt/provider";
import { buildTraktHomeRows } from "@/lib/trakt/home-rails";
import { useSimkl } from "@/lib/simkl/provider";
import { buildSimklHomeRows } from "@/lib/simkl/home-rails";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import { buildLetterboxdHomeRows } from "@/lib/stremboxd/home-rails";
import { buildArabicHomeRows } from "@/lib/arabic/home-rows";
import { buildRussianHomeRows } from "@/lib/russian/home-rows";
import { fetchHeroFeed } from "@/lib/feed/hero-pool";
import {
  applyHomeRowCustomization,
  moveRow,
  renameRow,
  resetHomeRows,
  toggleCwTop,
  toggleHeroSource,
  toggleRowHidden,
  toggleRowNumerals,
  type HomeRowCustomization,
} from "@/lib/home-customization";
import { useCustomLists } from "@/lib/custom-lists";
import { useCollectionRowsForPage } from "@/lib/page-collection-rows";
import { setTop10Metas } from "@/lib/top10-set";
import { NavGlyph } from "@/components/icons/nav-glyph";
import { MobileHero } from "./mobile-hero";
import { MobileCwRow, useMobileCw } from "./mobile-cw-row";
import { MobileRail, MobileRankRail } from "./mobile-rail";
import { MobileCollectionsRail } from "./mobile-collections-rail";
import { MobileStreamingRail } from "./mobile-streaming-rail";
import { MobileServicePage } from "./mobile-service-page";
import { MobileDetail } from "./mobile-detail";
import { loadInstalled } from "@/lib/addon-store";
import { requestMobileIntent } from "./mobile-intent";
import { HeroSkeleton, RailSkeleton } from "./mobile-movies";
import { MobileNewEpisodesRow } from "./browse/new-episodes-row";
import { CustomizePill, CustomizeSheet } from "./browse/customize-sheet";
import { MobileGridSheet, type GridFetcher } from "./browse/grid-sheet";

const FIRST_PAGE = 20;

function dedupeMetas(metas: Meta[]): Meta[] {
  const seen = new Set<string>();
  const out: Meta[] = [];
  for (const m of metas) {
    const nameKey = m.name
      ? m.name.toLowerCase().replace(/[^a-z0-9]+/g, "")
      : "";
    if (seen.has(m.id) || (nameKey && seen.has(nameKey))) continue;
    seen.add(m.id);
    if (nameKey) seen.add(nameKey);
    out.push(m);
  }
  return out;
}

export function MobileHome() {
  const t = useT();
  const uiLang = useUiLanguage();
  const { settings, update } = useSettings();
  const { authKey } = useAuth();
  const [heroPool, setHeroPool] = useState<Meta[]>([]);
  const [rows, setRows] = useState<HomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [serviceOpen, setServiceOpen] = useState<StreamingService | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [grid, setGrid] = useState<{ title: string; fetcher: GridFetcher; initial: Meta[] } | null>(null);
  const cwAll = useMobileCw(40);
  const cw = useMemo(() => cwAll.slice(0, 14), [cwAll]);
  const isClassic = settings.homeMode === "classic";
  const custom = settings.homeRows as HomeRowCustomization;
  const mutate = (next: HomeRowCustomization) => update({ homeRows: next });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    (async () => {
      // Only a genuine fetch throw is a "failure"; an empty-but-healthy result
      // (e.g. classic mode with no addons installed) must not read as a network
      // error. Inline catches swallow into empty arrays, so track the throw here.
      let sawError = false;
      try {
        // Harbor mode = curated built-in specs, then deduped addon rows appended.
        // Classic mode = installed-addon catalogs only, in install order, no built-ins.
        let builtRows: HomeRow[] = [];
        let pool: Meta[] = [];
        if (!isClassic) {
          const onErr = () => {
            sawError = true;
            return { rows: [] as HomeRow[], hero: [] as Meta[] };
          };
          let built = settings.tmdbKey
            ? await buildTmdbRows(settings).catch(onErr)
            : await buildCinemetaRows().catch(onErr);
          if (built.rows.length === 0) {
            built = await buildCinemetaRows().catch(onErr);
          }
          builtRows = built.rows;
          pool = built.hero;
        }
        if (!alive) return;
        setHeroPool(pool);
        setRows(mergeRows(builtRows, []));
        // The hero feed setting (Trending now, Trakt, Simkl) swaps the built pool
        // for Harbor's hosted hero list, the same source desktop home reads.
        if (!isClassic && settings.heroFeed && settings.heroFeed !== "classic") {
          fetchHeroFeed(settings.heroFeed)
            .then((feed) => {
              if (alive && feed.length >= 4) setHeroPool(feed);
            })
            .catch(() => {});
        }

        // homeShowAllAddonRows is the orthogonal dedup toggle; classic never dedups.
        const dedup = isClassic ? false : !settings.homeShowAllAddonRows;
        const addons = await loadAddonRows(authKey, { dedup }).catch(() => {
          sawError = true;
          return [] as AddonRow[];
        });
        if (!alive) return;
        // Harbor filters out anime + streaming-service-named addon rows (they have
        // their own surfaces); classic keeps every catalog in install order.
        const filtered = isClassic
          ? addons
          : addons.filter(
              (a) => !isAnimeRow(a) && !isStreamingServiceRow(a.name),
            );
        const merged = mergeRows(builtRows, filtered, { dedup });
        setRows(merged);
        setFailed(merged.length === 0 && sawError);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authKey,
    settings.tmdbKey,
    settings.tmdbLanguage,
    settings.tmdbImageLangs,
    settings.translateTitles,
    settings.translateDescriptions,
    settings.region,
    settings.homeMode,
    settings.homeShowAllAddonRows,
    settings.heroFeed,
    reloadKey,
  ]);

  // Reload rows when the user installs/removes an addon (mirrors desktop home).
  useEffect(() => {
    const onChanged = () => setReloadKey((k) => k + 1);
    window.addEventListener("harbor:addons-changed", onChanged);
    return () => window.removeEventListener("harbor:addons-changed", onChanged);
  }, []);

  // Anime rows, plus the Arabic and Russian home rows desktop adds when the UI
  // speaks that language. Harbor mode only, like desktop.
  const [animeRows, setAnimeRows] = useState<HomeRow[]>([]);
  const [arabicRows, setArabicRows] = useState<HomeRow[]>([]);
  const [russianRows, setRussianRows] = useState<HomeRow[]>([]);
  useEffect(() => {
    if (settings.hideContent.anime || isClassic) {
      setAnimeRows([]);
      return;
    }
    let cancelled = false;
    buildAnimeHomeRows()
      .then((rs) => !cancelled && setAnimeRows(rs))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.hideContent.anime, isClassic]);
  useEffect(() => {
    if (uiLang !== "ar" || isClassic || !settings.tmdbKey) {
      setArabicRows([]);
      return;
    }
    let cancelled = false;
    buildArabicHomeRows(settings.tmdbKey)
      .then((rs) => !cancelled && setArabicRows(rs))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uiLang, isClassic, settings.tmdbKey, settings.tmdbLanguage]);
  useEffect(() => {
    if (uiLang !== "ru" || isClassic || !settings.tmdbKey) {
      setRussianRows([]);
      return;
    }
    let cancelled = false;
    buildRussianHomeRows(settings.tmdbKey)
      .then((rs) => !cancelled && setRussianRows(rs))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uiLang, isClassic, settings.tmdbKey, settings.tmdbLanguage]);

  // Personal service rails (Trakt / Simkl / Letterboxd) built from the same
  // platform-agnostic builders desktop home uses. Providers are mounted app-wide,
  // so the hooks are safe here. Harbor mode only; classic stays addon-only.
  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: simklConnected } = useSimkl();
  const letterboxd = useLetterboxd();
  const [traktRows, setTraktRows] = useState<HomeRow[]>([]);
  const [simklRows, setSimklRows] = useState<HomeRow[]>([]);
  const [letterboxdRows, setLetterboxdRows] = useState<HomeRow[]>([]);

  useEffect(() => {
    if (isClassic || !traktConnected) {
      setTraktRows([]);
      return;
    }
    let cancelled = false;
    buildTraktHomeRows(settings.tmdbKey)
      .then((rs) => {
        if (!cancelled) setTraktRows(rs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isClassic, traktConnected, settings.tmdbKey]);

  useEffect(() => {
    if (isClassic || !simklConnected) {
      setSimklRows([]);
      return;
    }
    let cancelled = false;
    buildSimklHomeRows(settings)
      .then((rs) => {
        if (!cancelled) setSimklRows(rs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Same gate set desktop watches; the builder honors these settings internally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isClassic,
    simklConnected,
    settings.tmdbKey,
    settings.simklHomeRailsEnabled,
    settings.simklUpNextRailEnabled,
    settings.simklTrendingRailEnabled,
    settings.simklGranularFilters,
  ]);

  useEffect(() => {
    if (isClassic || !letterboxd.isActive) {
      setLetterboxdRows([]);
      return;
    }
    if (letterboxd.mode === "full" && !letterboxd.session) {
      setLetterboxdRows([]);
      return;
    }
    if (letterboxd.mode === "public" && !letterboxd.configSegment) {
      setLetterboxdRows([]);
      return;
    }
    let cancelled = false;
    buildLetterboxdHomeRows({
      configSegment: letterboxd.configSegment,
      selectedCatalogs: letterboxd.selectedCatalogs,
      hiddenCatalogs: letterboxd.hiddenCatalogs,
      catalogOrder: letterboxd.catalogOrder,
      session: letterboxd.session,
      listRefs: letterboxd.listRefs,
    })
      .then((rs) => {
        if (!cancelled) setLetterboxdRows(rs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    isClassic,
    letterboxd.isActive,
    letterboxd.mode,
    letterboxd.configSegment,
    letterboxd.selectedCatalogs,
    letterboxd.hiddenCatalogs,
    letterboxd.catalogOrder,
    letterboxd.session,
    letterboxd.listRefs,
  ]);

  const pinnedRows = usePinnedRows();
  const { items: favItems } = useMediaFavorites();
  const { items: localItems } = useLocalWatchlist();
  const personalRows = useMemo<HomeRow[]>(() => {
    const toMetas = (m: Map<string, MediaEntry>): Meta[] =>
      [...m.values()]
        .sort((a, b) => b.addedAt - a.addedAt)
        .map((e) => ({
          id: e.id,
          type: e.type,
          name: e.name,
          poster: e.poster,
          addonOrigin: e.addonOrigin,
          videos: e.videos,
        }));
    const out: HomeRow[] = [];
    if (favItems.size > 0) {
      out.push({
        key: "harbor-favorites",
        type: "movie",
        name: "Favorites",
        metas: toMetas(favItems),
        page: 1,
        hasMore: false,
        noDedup: true,
      });
    }
    if (localItems.size > 0) {
      out.push({
        key: "harbor-watchlist",
        type: "movie",
        name: "My Watchlist",
        metas: toMetas(localItems),
        page: 1,
        hasMore: false,
        noDedup: true,
      });
    }
    return out;
  }, [favItems, localItems]);

  // List rows the user added from My Lists, and the collections pinned to home:
  // both are part of the desktop customizable row set.
  const customLists = useCustomLists();
  const listRows = useMemo<HomeRow[]>(() => {
    const ids = custom.listRows ?? [];
    if (ids.length === 0) return [];
    const byId = new Map(customLists.map((l) => [l.id, l]));
    const out: HomeRow[] = [];
    for (const id of ids) {
      const l = byId.get(id);
      if (!l || l.items.length === 0) continue;
      out.push({
        key: `list-${l.id}`,
        type: "movie",
        name: l.name,
        metas: l.items.map((it) => ({ id: it.id, type: it.type, name: it.name, poster: it.poster })),
        page: 1,
        hasMore: false,
        noDedup: true,
      });
    }
    return out;
  }, [customLists, custom.listRows]);
  const homeCollections = useCollectionRowsForPage("home");
  const collectionRows = useMemo<HomeRow[]>(
    () =>
      homeCollections
        .filter((c) => c.items.length > 0)
        .map((c) => ({
          key: `collection-${c.id}`,
          type: "movie" as const,
          name: c.name,
          metas: c.items.map((it) => ({ id: it.id, type: it.type, name: it.name, poster: it.poster })),
          page: 1,
          hasMore: false,
          noDedup: true,
        })),
    [homeCollections],
  );

  const enabledServices = useMemo<StreamingService[]>(
    () =>
      settings.tmdbKey
        ? (Object.keys(settings.streaming) as StreamingService[]).filter(
            (s) => settings.streaming[s],
          )
        : [],
    [settings.tmdbKey, settings.streaming],
  );

  const shownRows = useHideAnimeRows(rows);

  // The hero follows the row the user chose as its source, when there is one.
  const heroSourceRow = useMemo<HomeRow | null>(() => {
    const k = custom.heroSource;
    if (!k) return null;
    const hit = [...personalRows, ...traktRows, ...simklRows, ...letterboxdRows, ...rows, ...animeRows].find((r) => r.key === k);
    return hit && hit.metas.some((m) => m.background || m.poster) ? hit : null;
  }, [custom.heroSource, personalRows, traktRows, simklRows, letterboxdRows, rows, animeRows]);
  const heroMetas = useMemo(() => {
    const pool = heroSourceRow
      ? [...heroSourceRow.metas.filter((m) => m.background), ...heroSourceRow.metas.filter((m) => !m.background && m.poster)]
      : heroPool.filter((m) => m.background);
    return dedupeMetas(pool).slice(0, 8);
  }, [heroSourceRow, heroPool]);
  const shownHero = useHideAnimeMetas(heroMetas);

  // Same split desktop home makes: a Top 10 from the head of the first row that
  // skips hero titles, then every later row with already-shown titles removed
  // from its first page (rows that fall under four are dropped unless noDedup).
  const displayed = useMemo(() => {
    if (isClassic) return { top10: [] as Meta[], rest: shownRows };
    const seen = new Set<string>(shownHero.map((m) => m.id));
    const first = shownRows[0];
    const top10 = dedupeMetas((first?.metas ?? []).slice(0, FIRST_PAGE))
      .filter((m) => !seen.has(m.id))
      .slice(0, 10);
    for (const m of top10) seen.add(m.id);
    const rest: HomeRow[] = [];
    for (const row of shownRows.slice(1)) {
      const head = row.metas.slice(0, FIRST_PAGE);
      const tail = row.metas.slice(FIRST_PAGE);
      const filteredHead = row.noDedup ? head : head.filter((m) => !seen.has(m.id));
      if (!row.noDedup && filteredHead.length < 4) continue;
      for (const m of filteredHead) seen.add(m.id);
      rest.push({ ...row, metas: [...filteredHead, ...tail] });
    }
    return { top10, rest };
  }, [shownRows, shownHero, isClassic]);
  const top10 = displayed.top10;
  // Publishing the Top 10 lets the Top-10 ribbon mark those titles on every card.
  useEffect(() => {
    setTop10Metas(top10);
  }, [top10]);

  const filterableRows = useMemo(
    () => [
      ...listRows,
      ...collectionRows,
      ...pinnedRows,
      ...arabicRows,
      ...russianRows,
      ...personalRows,
      ...traktRows,
      ...simklRows,
      ...letterboxdRows,
      ...displayed.rest,
      ...animeRows,
    ],
    [listRows, collectionRows, pinnedRows, arabicRows, russianRows, personalRows, traktRows, simklRows, letterboxdRows, displayed.rest, animeRows],
  );
  const shownFilterable = useHideAnimeRows(filterableRows);
  const visibleRows = useMemo(() => applyHomeRowCustomization(shownFilterable, custom, false), [shownFilterable, custom]);
  const editRows = useMemo(() => applyHomeRowCustomization(shownFilterable, custom, true), [shownFilterable, custom]);

  const cwHidden = custom.hidden.includes("cw");
  const newEpisodesHidden = custom.hidden.includes("new-episodes");
  const heroHidden = custom.hidden.includes("hero");
  const top10Hidden = custom.hidden.includes("top10");
  const collectionsHidden = custom.hidden.includes("collections");
  const cwTop = !!custom.cwTop;
  const newEpisodes = useNewEpisodes(cwAll, settings.homeNewEpisodes && !newEpisodesHidden);

  const nothing =
    rows.length === 0 &&
    cw.length === 0 &&
    pinnedRows.length === 0 &&
    personalRows.length === 0 &&
    listRows.length === 0;

  if (loading && rows.length === 0) {
    return <HomeSkeleton />;
  }

  if (failed && nothing) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <h2 className="font-display text-[20px] font-medium text-ink">
          {t("Couldn't load your home")}
        </h2>
        <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
          {t(
            "Harbor couldn't reach the catalog servers. Check your connection and try again.",
          )}
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="no-press flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas transition-transform active:scale-95"
        >
          {t("Try again")}
        </button>
      </div>
    );
  }

  // Healthy but empty, which only classic can reach: classic skips the built-in
  // rows, the hero and collections, so with no addons installed every source of
  // content is empty and nothing threw. Distinct from the failure state above:
  // there is nothing to retry, the user needs a catalog.
  if (isClassic && !failed && nothing) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-elevated/60 text-ink-muted">
          <NavGlyph name="addons" className="h-6 w-6" />
        </span>
        <h2 className="font-display text-[20px] font-medium text-ink">
          {t("No catalogs yet")}
        </h2>
        {/* Stream addons like Torrentio provide no catalogs, so someone can have
            addons installed and still land here. Say which kind is missing. */}
        <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
          {loadInstalled().length === 0
            ? t("Classic home shows the catalogs your addons provide, and you have none installed. Add one and your rows show up here.")
            : t("Your addons provide streams but no catalogs. Add a catalog addon like Cinemeta to fill these rows.")}
        </p>
        <button
          type="button"
          onClick={() => requestMobileIntent("addons")}
          className="no-press flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas transition-transform active:scale-95"
        >
          {t("Add an addon")}
        </button>
      </div>
    );
  }

  const firstRow = shownRows[0];
  const top10Title = firstRow
    ? firstRow.name.toLowerCase().includes("top")
      ? t(firstRow.name)
      : t("Top 10 {name}", { name: t(firstRow.name) })
    : t("Top 10 Today");

  const cwBlock = (
    <>
      {!cwHidden && cw.length > 0 && <MobileCwRow items={cw} onOpenDetail={setDetailMeta} />}
      {settings.homeNewEpisodes && !newEpisodesHidden && (
        <MobileNewEpisodesRow
          episodes={newEpisodes.episodes}
          onDismissOne={newEpisodes.dismissOne}
          onDismissAll={newEpisodes.dismissAll}
          onOpen={setDetailMeta}
        />
      )}
    </>
  );

  const openGrid = (title: string, row: HomeRow) =>
    row.fetcher ? () => setGrid({ title, fetcher: row.fetcher!, initial: row.metas }) : undefined;

  return (
    <div className="flex flex-col gap-7 [@media(max-height:500px)]:gap-4 pt-3 motion-safe:[animation:harbor-step-in_420ms_var(--ease-out)_both]">
      {cwTop && <div className="flex flex-col gap-7" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)" }}>{cwBlock}</div>}
      {!isClassic && !heroHidden && !cwTop && <MobileHero slides={shownHero} onOpenDetail={setDetailMeta} />}
      <div
        className={`flex justify-end px-4 ${!isClassic && !heroHidden && !cwTop ? "-mt-4" : ""}`}
        style={isClassic || heroHidden ? { paddingTop: "calc(env(safe-area-inset-top, 0px) + 48px)" } : undefined}
      >
        <CustomizePill label={t("Customize home")} onClick={() => setCustomizeOpen(true)} />
      </div>
      {!isClassic && !heroHidden && cwTop && <MobileHero slides={shownHero} onOpenDetail={setDetailMeta} />}
      {!cwTop && cwBlock}
      {!isClassic && enabledServices.length > 0 && (
        <MobileStreamingRail
          services={enabledServices}
          onOpen={setServiceOpen}
        />
      )}
      {!isClassic && !top10Hidden && top10.length >= 6 && firstRow && (
        <MobileRankRail
          title={top10Title}
          metas={top10}
          onSeeAll={openGrid(top10Title, firstRow)}
          onOpenDetail={setDetailMeta}
        />
      )}
      {!isClassic && !collectionsHidden && <MobileCollectionsRail onOpenDetail={setDetailMeta} />}
      {visibleRows.map((r) => {
        const title = displayRowTitle(r, r.key in custom.renamed, t);
        const metas = dedupeMetas(r.metas);
        return (custom.numerals ?? []).includes(r.key) && metas.length >= 10 ? (
          <MobileRankRail key={r.key} title={title} metas={metas} onSeeAll={openGrid(title, r)} onOpenDetail={setDetailMeta} />
        ) : (
          <MobileRail key={r.key} title={title} metas={metas.slice(0, 18)} onSeeAll={openGrid(title, r)} onOpenDetail={setDetailMeta} />
        );
      })}
      <div className="h-4" />

      {customizeOpen && (
        <CustomizeSheet
          title={t("Customize home")}
          sections={[
            ...(!isClassic ? [{ key: "hero", name: t("Featured hero"), hidden: heroHidden, onToggle: () => mutate(toggleRowHidden(custom, "hero")) }] : []),
            { key: "cw", name: t("Continue Watching"), hidden: cwHidden, onToggle: () => mutate(toggleRowHidden(custom, "cw")) },
            { key: "cw-top", name: t("Continue Watching at top"), hidden: !cwTop, onToggle: () => mutate(toggleCwTop(custom)) },
            ...(settings.homeNewEpisodes
              ? [{ key: "new-episodes", name: t("New Episodes"), hidden: newEpisodesHidden, onToggle: () => mutate(toggleRowHidden(custom, "new-episodes")) }]
              : []),
            ...(!isClassic
              ? [
                  { key: "top10", name: t("Top 10 Trending This Week"), hidden: top10Hidden, onToggle: () => mutate(toggleRowHidden(custom, "top10")) },
                  ...(settings.tmdbKey
                    ? [{ key: "collections", name: t("Collections"), hidden: collectionsHidden, onToggle: () => mutate(toggleRowHidden(custom, "collections")) }]
                    : []),
                ]
              : []),
          ]}
          rows={editRows.map((r) => ({
            key: r.key,
            name: displayRowTitle(r, r.key in custom.renamed, t),
            hidden: custom.hidden.includes(r.key),
            renamed: r.key in custom.renamed,
            extras: [
              ...(r.metas.length >= 10
                ? [{ id: "numerals", label: t("Show as a Top 10 with big numerals"), on: (custom.numerals ?? []).includes(r.key), onToggle: () => mutate(toggleRowNumerals(custom, r.key)) }]
                : []),
              ...(!isClassic && r.metas.some((m) => m.background)
                ? [{ id: "hero", label: t("Feature this catalog in the hero carousel"), on: custom.heroSource === r.key, onToggle: () => mutate(toggleHeroSource(custom, r.key)) }]
                : []),
            ],
          }))}
          hasChanges={
            custom.order.length > 0 ||
            custom.hidden.length > 0 ||
            Object.keys(custom.renamed).length > 0 ||
            (custom.numerals ?? []).length > 0 ||
            !!custom.heroSource ||
            !!custom.cwTop
          }
          onMove={(k, d) => mutate(moveRow(custom, editRows, k, d))}
          onToggleHidden={(k) => mutate(toggleRowHidden(custom, k))}
          onRename={(k, v) => mutate(renameRow(custom, k, v))}
          onReset={() =>
            mutate({ ...resetHomeRows(), customSources: custom.customSources ?? [], listRows: custom.listRows ?? [] })
          }
          onClose={() => setCustomizeOpen(false)}
        />
      )}
      {grid && (
        <MobileGridSheet
          title={grid.title}
          fetcher={grid.fetcher}
          initial={grid.initial.length >= 20 ? grid.initial.slice(0, 20) : undefined}
          onClose={() => setGrid(null)}
        />
      )}
      {detailMeta && (
        <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />
      )}
      {serviceOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-canvas">
          <MobileServicePage
            service={serviceOpen}
            onBack={() => setServiceOpen(null)}
          />
        </div>
      )}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="harbor-skeleton flex flex-col gap-7 [@media(max-height:500px)]:gap-4 pt-3" aria-hidden>
      <HeroSkeleton />
      <RailSkeleton titleW="w-40" />
      <RailSkeleton titleW="w-28" />
      <RailSkeleton titleW="w-36" />
    </div>
  );
}
