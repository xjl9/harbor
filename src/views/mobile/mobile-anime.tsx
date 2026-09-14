import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Info, Plus, SlidersHorizontal, TrendingUp } from "lucide-react";
import { Play } from "@/components/icons/play-filled";
import type { Meta } from "@/lib/cinemeta";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useHeroLogos } from "@/components/anime-hero/use-hero-logos";
import { HeroSlideBadges } from "@/components/anime-hero/hero-slide-badges";
import { AnimeGenrePicker } from "@/components/anime-genre-picker";
import { MalLogo } from "@/components/icons/mal-logo";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import type { AnimeFilterOpts } from "@/lib/anime-filter";
import { fetchAnilistTrendingAnime } from "@/lib/anilist/browse";
import {
  createAddonCatalogFetcher,
  isCollectionCatalog,
  loadAddonRows,
  normalizeName,
  type AddonRow,
} from "@/lib/addons";
import { isAdultAnime } from "@/lib/addons-store/adult-filter";
import { awardFranchiseKey, uniqueWinnerFranchisesAcrossSources } from "@/lib/anime-awards";
import {
  animeHasCustomization,
  animeMoveRow,
  animeRenameRow,
  animeToggleHidden,
  applyAnimeRowCustomization,
} from "@/lib/anime-customization";
import { useAnilistAnimeRails } from "@/lib/use-anilist-anime-rails";
import { useMalAnimeRails } from "@/lib/use-mal-anime-rails";
import { useAnilistTop, useAnilistTrending } from "@/lib/use-anilist-top";
import { useCrunchyrollAwardMetas } from "@/lib/use-crunchyroll-award-metas";
import { useCollectionRowsForPage } from "@/lib/page-collection-rows";
import { stripFranchiseSuffix } from "@/lib/providers/jikan";
import { isAnimeCwItem } from "@/lib/stremio";
import { SPECS, TOP_PICKS_KEY, EMPTY_ROW, isAnimeRow, type RowState } from "../anime/anime-rows";
import { buildHeroSelection, resolveHeroSlides, type HeroBuilt } from "../anime/hero-build";
import { MobileRail, MobileRankRail } from "./mobile-rail";
import { MobileDetail } from "./mobile-detail";
import { useMobileRemote } from "./mobile-remote";
import { useMobileCw } from "./mobile-cw-row";
import { CustomizePill, CustomizeSheet } from "./browse/customize-sheet";
import { MobileGridSheet, type GridFetcher } from "./browse/grid-sheet";
import { ResumeRow } from "./browse/resume-row";

const REDUCED =
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function nameKey(name?: string): string {
  return name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

function cleanMeta(m: Meta): Meta {
  const cleaned = stripFranchiseSuffix(m.name);
  return cleaned === m.name ? m : { ...m, name: cleaned };
}

function dedupeMetas(metas: Meta[]): Meta[] {
  const seen = new Set<string>();
  const out: Meta[] = [];
  for (const m of metas) {
    const k = nameKey(m.name);
    if (seen.has(m.id) || (k && seen.has(k))) continue;
    seen.add(m.id);
    if (k) seen.add(k);
    out.push(m);
  }
  return out;
}

function initRows(): Record<string, RowState> {
  const init: Record<string, RowState> = {};
  for (const s of SPECS) init[s.key] = EMPTY_ROW;
  return init;
}

type RowDef = { key: string; name: string; node: ReactNode };

export function MobileAnime() {
  const t = useT();
  const { settings, update } = useSettings();
  const { authKey } = useAuth();
  const [rowsByKey, setRowsByKey] = useState<Record<string, RowState>>(initRows);
  const [anilistTrending, setAnilistTrending] = useState<Meta[]>([]);
  const [hero, setHero] = useState<HeroBuilt>({ metas: [], trending: {} });
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [addonRows, setAddonRows] = useState<AddonRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [grid, setGrid] = useState<{ title: string; fetcher: GridFetcher; initial: Meta[] } | null>(null);
  const heroBuiltRef = useRef(false);
  const seedRef = useRef(Math.floor(Math.random() * 0x7fffffff));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    heroBuiltRef.current = false;
    setRowsByKey(initRows());
    setHero({ metas: [], trending: {} });
    (async () => {
      const BATCH = 6;
      let firstDone = false;
      for (let i = 0; i < SPECS.length; i += BATCH) {
        if (cancelled) return;
        await Promise.all(
          SPECS.slice(i, i + BATCH).map(async (s) => {
            try {
              const metas = await s.fetcher(1);
              if (!cancelled)
                setRowsByKey((p) => ({
                  ...p,
                  [s.key]: { metas, page: 1, hasMore: false, ready: true },
                }));
            } catch {
              if (!cancelled)
                setRowsByKey((p) => ({ ...p, [s.key]: { ...EMPTY_ROW, ready: true } }));
            }
          }),
        );
        if (!firstDone && !cancelled) {
          firstDone = true;
          setLoading(false);
        }
        if (i + BATCH < SPECS.length) await new Promise((r) => setTimeout(r, 350));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    fetchAnilistTrendingAnime(30)
      .then((m) => !cancelled && setAnilistTrending(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Anime catalogs from installed addons, the rows desktop appends after its
  // built-in shelves (views/anime.tsx).
  useEffect(() => {
    if (!authKey) {
      setAddonRows([]);
      return;
    }
    let cancelled = false;
    loadAddonRows(authKey)
      .then((rs) => !cancelled && setAddonRows(rs.filter(isAnimeRow)))
      .catch(() => !cancelled && setAddonRows([]));
    return () => {
      cancelled = true;
    };
  }, [authKey, reloadKey]);

  const filterOpts = useMemo<AnimeFilterOpts>(
    () => ({
      excludeOrigins: settings.animeExcludeOrigins,
      hideWatched: settings.animeHideWatchedPicks,
    }),
    [settings.animeExcludeOrigins, settings.animeHideWatchedPicks],
  );

  useEffect(() => {
    if (heroBuiltRef.current) return;
    const ready = SPECS.filter((s) => rowsByKey[s.key]?.ready).length;
    if (ready < 2 && anilistTrending.length === 0) return;
    const built = buildHeroSelection(rowsByKey, seedRef.current, filterOpts, anilistTrending);
    if (built.metas.length < 3) return;
    heroBuiltRef.current = true;
    setHero(built);
    let cancelled = false;
    void resolveHeroSlides(settings.tmdbKey, built, filterOpts, (r) => {
      if (!cancelled && r.metas.length) setHero(r);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [rowsByKey, anilistTrending, settings.tmdbKey, filterOpts]);

  const cw = useMobileCw(40);
  const animeCw = useMemo(() => cw.filter(isAnimeCwItem).slice(0, 16), [cw]);
  const malRails = useMalAnimeRails();
  const anilistRails = useAnilistAnimeRails();
  const anilistTrendingRow = useAnilistTrending();
  const anilistTop = useAnilistTop();
  const awardEntries = useCrunchyrollAwardMetas();
  const animeCollections = useCollectionRowsForPage("anime");

  // Award winners: franchises that won across the anime award sources, resolved
  // to the root title where the shelves already hold one, newest win first.
  const awardWinners = useMemo(() => {
    const winByKey = uniqueWinnerFranchisesAcrossSources();
    const resolvedByFk = new Map<string, Meta>();
    for (const e of awardEntries) resolvedByFk.set(awardFranchiseKey(e.meta.name), e.meta);
    const seen = new Set<string>();
    const out: Array<{ meta: Meta; year: number; lookupName: string }> = [];
    for (const spec of SPECS) {
      const r = rowsByKey[spec.key];
      if (!r?.ready) continue;
      for (const m of r.metas) {
        const fk = awardFranchiseKey(m.name);
        if (seen.has(fk)) continue;
        const win = winByKey.get(fk);
        if (!win) continue;
        seen.add(fk);
        out.push({ meta: cleanMeta(resolvedByFk.get(fk) ?? m), year: win.year, lookupName: win.title });
      }
    }
    for (const e of awardEntries) {
      const fk = awardFranchiseKey(e.meta.name);
      if (seen.has(fk)) continue;
      seen.add(fk);
      out.push({ meta: cleanMeta(e.meta), year: e.win.year, lookupName: e.win.title });
    }
    out.sort((a, b) => b.year - a.year);
    return out;
  }, [rowsByKey, awardEntries]);
  const awardLookup = useMemo(() => {
    const m: Record<string, string> = {};
    for (const x of awardWinners) m[x.meta.id] = x.lookupName;
    return m;
  }, [awardWinners]);

  const composed = useMemo(() => {
    const top10 = dedupeMetas(rowsByKey[TOP_PICKS_KEY]?.metas ?? []);
    const base = new Set<string>();
    for (const m of hero.metas) base.add(nameKey(m.name));
    for (const m of top10) base.add(nameKey(m.name));
    const pools: Record<string, Set<string>> = {
      general: new Set(base),
      era: new Set(base),
      genre: new Set(base),
    };
    const rows: Array<{ key: string; title: string; metas: Meta[]; rank: boolean; fetcher: GridFetcher }> = [];
    for (const spec of SPECS) {
      if (spec.key === TOP_PICKS_KEY) continue;
      const row = rowsByKey[spec.key];
      if (!row?.ready) continue;
      const pool = pools[spec.pool ?? "general"];
      const metas: Meta[] = [];
      for (const m of dedupeMetas(row.metas)) {
        const k = nameKey(m.name);
        if (k && pool.has(k)) continue;
        if (k) pool.add(k);
        metas.push(cleanMeta(m));
      }
      if (metas.length === 0) continue;
      rows.push({
        key: spec.key,
        title: spec.title,
        metas,
        rank: !!spec.rank && metas.length >= 10,
        fetcher: (p) => spec.fetcher(p).then((ms) => ms.map(cleanMeta)),
      });
    }
    return { top10, rows };
  }, [rowsByKey, hero.metas]);

  const dedupedAddonRows = useMemo(() => {
    const seen = new Set<string>();
    for (const s of SPECS) seen.add(normalizeName(s.title, "anime"));
    const out: AddonRow[] = [];
    for (const r of addonRows) {
      const k = normalizeName(r.name, "anime");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(settings.hideContent.adult ? { ...r, metas: r.metas.filter((m) => !isAdultAnime(m)) } : r);
    }
    return out;
  }, [addonRows, settings.hideContent.adult]);

  const anyRowData = useMemo(
    () => SPECS.some((s) => (rowsByKey[s.key]?.metas.length ?? 0) > 0),
    [rowsByKey],
  );

  const custom = settings.animeRows;
  const nameOf = (key: string, fallback: string) => custom.renamed[key] ?? fallback;

  // The row set desktop Anime builds, in its order, each keyed so the user's
  // anime customization (hide, reorder, rename) applies to the phone as well.
  const rowDefs: RowDef[] = [];
  if (animeCw.length > 0) {
    const nm = nameOf("continueWatching", t("Continue Watching"));
    rowDefs.push({ key: "continueWatching", name: nm, node: <ResumeRow title={nm} items={animeCw} onOpenDetail={setDetailMeta} /> });
  }
  if (malRails.length > 0) {
    rowDefs.push({
      key: "yourMalLists",
      name: nameOf("yourMalLists", t("Your MAL Lists")),
      node: malRails.map((rail) => (
        <MobileRail key={rail.key} title={t("Your MAL: {name}", { name: t(rail.title) })} metas={rail.metas} onOpenDetail={setDetailMeta} />
      )),
    });
  }
  if (anilistRails.length > 0) {
    rowDefs.push({
      key: "yourAnilistLists",
      name: nameOf("yourAnilistLists", t("Your Lists")),
      node: anilistRails.map((rail) => (
        <MobileRail
          key={rail.key}
          title={rail.key === "recommended" ? t("Recommended for you") : t("Your AniList: {name}", { name: rail.title })}
          metas={rail.metas}
          onOpenDetail={setDetailMeta}
        />
      )),
    });
  }
  if (anilistTrendingRow.length > 0) {
    rowDefs.push({
      key: "anilistTrending",
      name: nameOf("anilistTrending", t("Trending")),
      node: <MobileRail title={t("Trending on AniList")} metas={anilistTrendingRow} onOpenDetail={setDetailMeta} />,
    });
  }
  if (anilistTop.length > 0) {
    rowDefs.push({
      key: "anilistTop100",
      name: nameOf("anilistTop100", t("Top 100")),
      node: (
        <MobileRail
          title={t("Top 100 on AniList")}
          metas={anilistTop.slice(0, 20)}
          onSeeAll={() => setGrid({ title: t("Top 100 on AniList"), fetcher: () => Promise.resolve([]), initial: anilistTop })}
          onOpenDetail={setDetailMeta}
        />
      ),
    });
  }
  if (awardWinners.length > 0) {
    const nm = nameOf("awards", t("Award Winning Anime"));
    rowDefs.push({
      key: "awards",
      name: nm,
      node: <MobileRail title={nm} metas={awardWinners.map((x) => x.meta)} awardLookup={awardLookup} onOpenDetail={setDetailMeta} />,
    });
  }
  for (const r of composed.rows) {
    const specName = nameOf(r.key, t(r.title));
    const rankName = t("Top 10 {name}", { name: specName.replace(/^Top\s*/i, "") });
    const seeAll = () => setGrid({ title: t(r.title), fetcher: r.fetcher, initial: r.metas });
    rowDefs.push({
      key: r.key,
      name: r.rank ? rankName : specName,
      node: r.rank ? (
        <MobileRankRail title={rankName} metas={r.metas} onSeeAll={seeAll} onOpenDetail={setDetailMeta} />
      ) : (
        <MobileRail title={specName} metas={r.metas.slice(0, 18)} onSeeAll={seeAll} onOpenDetail={setDetailMeta} />
      ),
    });
  }
  for (const row of dedupedAddonRows) {
    const key = `addon:${row.key}`;
    const nm = nameOf(key, row.name);
    const more = row.more;
    const collection = isCollectionCatalog({ type: row.type, id: more?.id, name: row.name });
    const origin = row.metas[0]?.addonOrigin;
    const map = (m: Meta): Meta => ({
      ...cleanMeta(m),
      ...(origin ? { addonOrigin: origin } : null),
      ...(collection ? { isCollection: true } : null),
    });
    rowDefs.push({
      key,
      name: nm,
      node: (
        <MobileRail
          title={nm}
          metas={row.metas.map(map).slice(0, 18)}
          onSeeAll={
            more && row.metas.length > 0
              ? () =>
                  setGrid({
                    title: row.name,
                    fetcher: createAddonCatalogFetcher(more, { initialPageSize: row.metas.length, mapMeta: map }),
                    initial: row.metas.map(map),
                  })
              : undefined
          }
          onOpenDetail={setDetailMeta}
        />
      ),
    });
  }
  for (const c of animeCollections) {
    if (c.items.length === 0) continue;
    const key = `collection-${c.id}`;
    const nm = nameOf(key, c.name);
    rowDefs.push({
      key,
      name: nm,
      node: (
        <MobileRail
          title={nm}
          metas={c.items.map((it) => ({ id: it.id, type: it.type, name: it.name, poster: it.poster }))}
          onOpenDetail={setDetailMeta}
        />
      ),
    });
  }
  const shownDefs = applyAnimeRowCustomization(rowDefs, custom, false);
  const editDefs = applyAnimeRowCustomization(rowDefs, custom, true);

  if (loading && !anyRowData && hero.metas.length === 0) return <AnimeSkeleton />;
  if (!loading && !anyRowData && anilistTrending.length === 0 && hero.metas.length === 0) {
    return <FailedState onRetry={() => setReloadKey((k) => k + 1)} />;
  }

  const topSpec = SPECS.find((s) => s.key === TOP_PICKS_KEY);
  const favoriteCount = settings.animeFavoriteGenres.length;

  return (
    <div className="flex flex-col gap-7 [@media(max-height:500px)]:gap-4 motion-safe:[animation:harbor-step-in_420ms_var(--ease-out)_both]">
      {hero.metas.length > 0 ? (
        <AnimeHeroMobile
          slides={hero.metas}
          trending={hero.trending}
          onOpenDetail={setDetailMeta}
        />
      ) : (
        <HeroSkeleton />
      )}
      <div className="-mt-3 flex items-center justify-end gap-2 px-4">
        {/* Tune opens the same anime genre picker desktop hangs off the hero's
            edge: favourite genres steer Top Picks and the hero, origins and
            watched titles can be hidden. */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-full bg-elevated/70 pe-3.5 ps-2.5 text-[12.5px] font-medium text-ink-muted ring-1 ring-edge-soft/70 backdrop-blur-md"
        >
          <SlidersHorizontal size={14} strokeWidth={2} className="text-accent" />
          {t("Tune anime")}
          {favoriteCount > 0 && (
            <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent/20 px-1 text-[9px] font-bold text-accent">
              {favoriteCount}
            </span>
          )}
        </button>
        <CustomizePill label={t("Customize anime")} onClick={() => setCustomizeOpen(true)} />
      </div>
      {composed.top10.length >= 6 && (
        <MobileRankRail
          title={t("Top 10 {name}", { name: t(topSpec?.title ?? "Airing").replace(/^Top\s*/i, "") })}
          metas={composed.top10}
          onOpenDetail={setDetailMeta}
        />
      )}
      {shownDefs.map((d) => (
        <div key={d.key} className="flex flex-col gap-7 empty:hidden [@media(max-height:500px)]:gap-4">
          {d.node}
        </div>
      ))}
      <div className="h-4" />
      {pickerOpen && (
        <AnimeGenrePicker
          initial={settings.animeFavoriteGenres}
          onSave={(g) => update({ animeFavoriteGenres: g, animePicksDismissedAt: Date.now() })}
          onClose={() => {
            setPickerOpen(false);
            update({ animePicksDismissedAt: Date.now() });
          }}
        />
      )}
      {customizeOpen && (
        <CustomizeSheet
          title={t("Customize anime")}
          rows={editDefs.map((d) => ({
            key: d.key,
            name: d.name,
            hidden: custom.hidden.includes(d.key),
            renamed: d.key in custom.renamed,
          }))}
          hasChanges={animeHasCustomization(custom)}
          onMove={(k, delta) => update({ animeRows: animeMoveRow(custom, rowDefs, k, delta) })}
          onToggleHidden={(k) => update({ animeRows: animeToggleHidden(custom, k) })}
          onRename={(k, v) => update({ animeRows: animeRenameRow(custom, k, v) })}
          onReset={() => update({ animeRows: { order: [], hidden: [], renamed: {} } })}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
      {grid && (
        <MobileGridSheet
          title={grid.title}
          fetcher={grid.fetcher}
          initial={grid.initial.length > 0 ? grid.initial : undefined}
          pageSize={Math.max(1, grid.initial.length)}
          onClose={() => setGrid(null)}
        />
      )}
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </div>
  );
}

function AnimeHeroMobile({
  slides,
  trending,
  onOpenDetail,
}: {
  slides: Meta[];
  trending: Record<string, string>;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { playOnHost } = useMobileRemote();
  const [active, setActive] = useState(0);
  const pausedUntil = useRef(0);
  const logos = useHeroLogos(slides, settings);
  const shown = useMemo(() => slides.slice(0, 6), [slides]);
  const current = shown[Math.min(active, Math.max(shown.length - 1, 0))];
  const inWl = useInWatchlist(current?.id ?? "", []);

  useEffect(() => {
    if (active >= shown.length && shown.length > 0) setActive(0);
  }, [shown.length, active]);

  useEffect(() => {
    if (REDUCED || shown.length < 2) return;
    const id = window.setInterval(() => {
      if (Date.now() < pausedUntil.current) return;
      setActive((i) => (i + 1) % shown.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [shown.length]);

  if (shown.length === 0 || !current) return null;

  return (
    <section className="flex flex-col gap-3.5">
      <button
        type="button"
        aria-label={t("Open {title}", { title: current.name })}
        onClick={() => onOpenDetail(current)}
        className="relative block aspect-[4/5] w-full overflow-hidden bg-surface text-start [@media(max-height:500px)]:aspect-auto [@media(max-height:500px)]:h-[62svh] [@media(min-width:700px)_and_(min-height:600px)]:aspect-[16/10]"
      >
        {shown.map((m, i) => (
          <div
            key={m.id}
            aria-hidden={i !== active}
            className="absolute inset-0 motion-safe:transition-opacity motion-safe:duration-700 motion-safe:ease-out"
            style={{ opacity: i === active ? 1 : 0 }}
          >
            <HeroArt
              meta={m}
              logo={logos[m.id] ?? m.logo}
              source={trending[m.id]}
              priority={i === 0}
            />
          </div>
        ))}
      </button>
      <div className="flex flex-col gap-3.5 px-4">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => playOnHost(current)}
            className="flex h-[52px] flex-1 items-center justify-center gap-2.5 rounded-full bg-ink text-[16px] font-semibold text-canvas shadow-[0_6px_20px_-6px_rgba(0,0,0,0.4)]"
          >
            <Play size={19} strokeWidth={0} fill="currentColor" />
            {t("Start Watching")}
          </button>
          <button
            type="button"
            aria-label={inWl ? t("In My List") : t("Add to My List")}
            onClick={() =>
              toggleWatchlist({
                id: current.id,
                type: current.type,
                name: current.name,
                poster: current.poster,
                addonOrigin: current.addonOrigin,
                videos: current.videos,
              })
            }
            className="no-press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-edge bg-canvas/55 text-ink transition-transform duration-150 active:scale-[0.94]"
          >
            {inWl ? (
              <Check size={20} strokeWidth={2.6} className="text-accent" />
            ) : (
              <Plus size={21} strokeWidth={2.2} />
            )}
          </button>
          <button
            type="button"
            aria-label={t("More info")}
            onClick={() => onOpenDetail(current)}
            className="no-press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-edge bg-canvas/55 text-ink transition-transform duration-150 active:scale-[0.94]"
          >
            <Info size={21} strokeWidth={2.2} />
          </button>
        </div>
        {/* Award marks for the current slide (Crunchyroll, TAAF, JMAF, r/anime,
            Kobe, and collection badges), the desktop hero's badge strip. */}
        <div className="flex min-h-[32px] items-center justify-between gap-3">
          <HeroSlideBadges meta={current} />
          {shown.length > 1 && (
            <div className="flex items-center gap-1.5">
              {shown.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  aria-label={t("Slide {number}", { number: i + 1 })}
                  onClick={() => {
                    setActive(i);
                    pausedUntil.current = Date.now() + 12000;
                  }}
                  className="flex h-6 items-center"
                >
                  <span className={`block h-1.5 rounded-full transition-all duration-300 ${i === active ? "w-5 bg-accent" : "w-1.5 bg-ink/25"}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function HeroArt({
  meta,
  logo,
  source,
  priority,
}: {
  meta: Meta;
  logo?: string;
  source?: string;
  priority?: boolean;
}) {
  const t = useT();
  const bg = meta.background || meta.poster;
  const year = (meta.releaseInfo ?? "").slice(0, 4);
  return (
    <>
      {bg && (
        <img
          src={bg}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 18%" }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/45 to-transparent"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, var(--color-canvas) 2%, color-mix(in oklch, var(--color-canvas), transparent 45%) 26%, transparent 62%)",
        }}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 px-5 pb-5">
        {source && (
          <span className="inline-flex items-center gap-1.5 self-start rounded-md bg-black/45 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-md">
            <TrendingUp size={12} strokeWidth={2.6} className="text-accent" />
            {t("Trending on {source}", { source })}
          </span>
        )}
        {logo ? (
          <img
            src={logo}
            alt={meta.name}
            className="max-h-[70px] max-w-[80%] object-contain object-left drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]"
          />
        ) : (
          <h2 className="font-display text-[32px] font-medium leading-[1.03] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">
            {meta.name}
          </h2>
        )}
        <div className="flex items-center gap-3 text-[13px] text-white/85">
          {year && <span className="font-medium">{year}</span>}
          {meta.imdbRating && (
            // Anime hero ratings are MAL scores, so the MAL mark labels them the
            // way the desktop anime hero does.
            <span className="flex items-center gap-1.5">
              <MalLogo className="h-[12px] w-auto text-white/80" />
              <span className="font-semibold text-white">{meta.imdbRating}</span>
            </span>
          )}
          {meta.genres?.[0] && <span className="text-white/70">{meta.genres[0]}</span>}
        </div>
      </div>
    </>
  );
}

function HeroSkeleton() {
  return (
    <section className="flex flex-col gap-3.5" aria-hidden>
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-surface [@media(max-height:500px)]:aspect-auto [@media(max-height:500px)]:h-[62svh] [@media(min-width:700px)_and_(min-height:600px)]:aspect-[16/10]">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, var(--color-canvas) 2%, transparent 60%)" }}
        />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 px-5 pb-5">
          <div className="h-5 w-28 rounded-md bg-elevated/50" />
          <div className="h-8 w-2/3 rounded-lg bg-elevated/55" />
          <div className="h-3.5 w-2/5 rounded bg-elevated/40" />
        </div>
      </div>
      <div className="flex items-center gap-2.5 px-4">
        <div className="h-[52px] flex-1 rounded-full bg-elevated/45" />
        <div className="h-[52px] w-[52px] shrink-0 rounded-full bg-elevated/40" />
        <div className="h-[52px] w-[52px] shrink-0 rounded-full bg-elevated/40" />
      </div>
    </section>
  );
}

function RailSkeleton({ titleW }: { titleW: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div className={`mx-4 h-[18px] ${titleW} rounded-md bg-elevated/45`} />
      <div className="flex gap-3 overflow-hidden px-4 pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] w-[124px] shrink-0 rounded-lg bg-elevated/40" />
        ))}
      </div>
    </section>
  );
}

function AnimeSkeleton() {
  return (
    <div className="harbor-skeleton flex flex-col gap-7 [@media(max-height:500px)]:gap-4" aria-hidden>
      <HeroSkeleton />
      <RailSkeleton titleW="w-44" />
      <RailSkeleton titleW="w-32" />
      <RailSkeleton titleW="w-40" />
    </div>
  );
}

function FailedState({ onRetry }: { onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
      <h2 className="font-display text-[20px] font-medium text-ink">{t("Couldn't load anime")}</h2>
      <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
        {t("Harbor couldn't reach MyAnimeList or AniList. Check your connection and try again.")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="no-press flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas transition-transform active:scale-95"
      >
        {t("Try again")}
      </button>
    </div>
  );
}
