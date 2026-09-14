import { Fragment, useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useHideAnime, useHideAnimeMetas, useHideAnimeRows, useHideAnimeSlides } from "@/lib/anime-hide";
import { metaLooksAnime } from "@/lib/anime-detect";
import { getStore, subscribe as subscribeTaste } from "@/lib/discover/store";
import { fetchCriticsPickList, getPool, selectDailyRows, type FeedItem, type RailDef } from "@/lib/feed";
import { buildFeatured, buildFeaturedFast, rescoreFeatured, type FeaturedResult } from "@/lib/feed/featured";
import { ANCHOR_TRENDING } from "@/lib/feed/daily-rows-anchors";
import { getDownvotedIds, getUpvotedIds, subscribePrefs } from "@/lib/feed/preferences";
import { recentlyPlayed, subscribePlayback, watchTitleKey } from "@/lib/playback-history";
import {
  applyPageRows,
  hasPageRowChanges,
  movePageRow,
  renamePageRow,
  resetPageRows,
  togglePageRowHidden,
  usePageRows,
} from "@/lib/page-rows";
import type { BrandKind } from "@/lib/providers/tmdb/tmdb-brands";
import type { AwardType } from "@/lib/providers/wikidata";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import { buildLetterboxdHomeRows } from "@/lib/stremboxd/home-rails";
import type { HomeRow } from "@/views/home/home-types";
import { MobileRail, MobileRankRail } from "./mobile-rail";
import { MobileDetail } from "./mobile-detail";
import { MobileFeatured } from "./mobile-featured";
import { MobileCollectionsRail } from "./mobile-collections-rail";
import { MobileGenrePage, MobileLanguagePage } from "./mobile-genre-page";
import { MobileAwards } from "./mobile-awards";
import { MobileBrandPage, MobileBrandsList, brandRefOf, type BrandRef } from "./mobile-brand-page";
import { MobileAwardTiles, MobileBrandTiles, MobileGenreTiles, MobileLanguageTiles } from "./browse/tiles";
import {
  CatalogBrowserCard,
  CriticsPickCard,
  DiscoveryQueueCta,
  DiscoveryQueueSheet,
  SurpriseMeCard,
  TopPeopleCta,
  TopPeopleSheet,
} from "./browse/discover-sections";
import { CustomizePill, CustomizeSheet } from "./browse/customize-sheet";
import { MobileGridSheet } from "./browse/grid-sheet";

type RowItem = { key: string; title: string };

const ROW_CAP = 18;
const ROW_COUNT = 14;

// Desktop Discover (views/discover.tsx) interleaves its tile sections between
// the daily rails at these positions; the phone keeps the same order so the two
// pages read as one product.
const SPECIAL_ROWS: Array<RowItem & { after: number }> = [
  { key: "special:genres", title: "Browse by Genre", after: 0 },
  { key: "special:queue", title: "Your Discovery Queue", after: 1 },
  { key: "special:languages", title: "Browse by Language", after: 2 },
  { key: "special:collections", title: "Collections", after: 2 },
  { key: "special:critics", title: "Critics' Pick", after: 3 },
  { key: "special:studios", title: "Top studios", after: 3 },
  { key: "special:awards", title: "Browse by Award", after: 4 },
  { key: "special:networks", title: "Top networks", after: 4 },
  { key: "special:people", title: "Top People", after: -1 },
];

const isSpecialRow = (key: string) => key.startsWith("special:");

type Overlay =
  | { kind: "genre"; name: string }
  | { kind: "language"; iso: string; name: string }
  | { kind: "brand"; brand: BrandRef }
  | { kind: "brands"; brandKind: BrandKind }
  | { kind: "award"; type: AwardType }
  | { kind: "queue" }
  | { kind: "people" }
  | { kind: "grid"; title: string; def: RailDef; initial: Meta[] };

function nameKey(m: Meta): string {
  return m.name ? m.name.toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
}

function useLetterboxdRows(): HomeRow[] {
  const letterboxd = useLetterboxd();
  const [rows, setRows] = useState<HomeRow[]>([]);
  useEffect(() => {
    const ready =
      letterboxd.isActive &&
      !(letterboxd.mode === "full" && !letterboxd.session) &&
      !(letterboxd.mode === "public" && !letterboxd.configSegment);
    if (!ready) {
      setRows([]);
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
      .then((rs) => !cancelled && setRows(rs))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [
    letterboxd.isActive,
    letterboxd.mode,
    letterboxd.configSegment,
    letterboxd.selectedCatalogs,
    letterboxd.hiddenCatalogs,
    letterboxd.catalogOrder,
    letterboxd.session,
    letterboxd.listRefs,
  ]);
  return rows;
}

export function MobileDiscover() {
  const t = useT();
  const { settings } = useSettings();
  const key = settings.tmdbKey;
  const pageRows = usePageRows("discover");
  const { custom, persist } = pageRows;
  const [feat, setFeat] = useState<FeaturedResult>({ featured: [], reserve: [], pool: [] });
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [criticsList, setCriticsList] = useState<Meta[]>([]);
  const [rails, setRails] = useState<Record<string, Meta[]>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [tasteVersion, setTasteVersion] = useState(0);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const letterboxdRows = useLetterboxdRows();
  const hideAnime = useHideAnime();
  const featured = feat.featured;

  const dailyRows = useMemo(
    () => selectDailyRows(key, getStore().affinity, settings, ROW_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      key,
      settings.region,
      settings.streaming,
      settings.preferredLanguages,
      settings.tmdbLanguage,
      settings.feedLocaleBias,
      settings.uiLanguage,
      tasteVersion,
    ],
  );
  const rowSig = useMemo(() => dailyRows.map((r) => r.id).join("|"), [dailyRows]);

  useEffect(() => {
    let alive = true;
    let full = false;
    setFeat({ featured: [], reserve: [], pool: [] });
    if (key) {
      buildFeaturedFast(key, settings)
        .then((r) => {
          if (alive && !full) setFeat(rescoreFeatured(r.pool));
        })
        .catch(() => {});
    }
    buildFeatured(key, settings)
      .then((r) => {
        if (!alive) return;
        full = true;
        setFeat(rescoreFeatured(r.pool));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.tmdbLanguage, settings.region, settings.feedLocaleBias, settings.preferredLanguages, reloadKey]);

  useEffect(() => {
    let alive = true;
    const hidden = new Set<string>([...getDownvotedIds(), ...getUpvotedIds()]);
    getPool(key)
      .then(async (p) => {
        if (!alive) return;
        const { filterQueuePool } = await import("@/lib/feed/skipped");
        setQueue(filterQueuePool(p).filter((it) => !hidden.has(it.meta.id)));
      })
      .catch(() => {});
    fetchCriticsPickList(key, settings)
      .then((list) => alive && setCriticsList(list.filter((x) => !hidden.has(x.id))))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settings.region, settings.feedLocaleBias, settings.preferredLanguages, settings.tmdbLanguage, tasteVersion, reloadKey]);

  // A vote, a taste change or a finished title rescores Featured at once and
  // reshuffles the daily rails a moment later, the same loop desktop runs.
  useEffect(() => {
    let timer = 0;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTasteVersion((v) => v + 1), 600);
    };
    const rescore = () => setFeat((prev) => (prev.pool.length ? rescoreFeatured(prev.pool) : prev));
    const offTaste = subscribeTaste(() => {
      rescore();
      bump();
    });
    const offPrefs = subscribePrefs(() => {
      rescore();
      const blocked = new Set<string>([...getDownvotedIds(), ...getUpvotedIds()]);
      setQueue((prev) => prev.filter((it) => !blocked.has(it.meta.id)));
      setCriticsList((prev) => prev.filter((m) => !blocked.has(m.id)));
      bump();
    });
    const offPlayback = subscribePlayback(() => {
      rescore();
      const watched = recentlyPlayed();
      const isWatched = (m: Meta) => watched.ids.has(m.id) || watched.titles.has(watchTitleKey(m.name));
      setQueue((prev) => prev.filter((it) => !isWatched(it.meta)));
      setCriticsList((prev) => prev.filter((m) => !isWatched(m)));
      bump();
    });
    return () => {
      window.clearTimeout(timer);
      offTaste();
      offPrefs();
      offPlayback();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    Promise.all(
      dailyRows.map((d) =>
        d
          .fetch(1)
          .then((metas) => {
            if (alive) setRails((prev) => ({ ...prev, [d.id]: metas }));
            return metas.length;
          })
          .catch(() => 0),
      ),
    ).then((counts) => {
      if (!alive) return;
      setLoading(false);
      setFailed(counts.every((c) => c === 0));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowSig, key, settings.region, settings.tmdbLanguage, reloadKey]);

  const featuredIds = useMemo(() => new Set(featured.map((m) => m.id)), [featured]);

  const criticsPick = useMemo(() => {
    const candidates = criticsList.filter((m) => !featuredIds.has(m.id) && m.background && m.description);
    if (candidates.length === 0) return criticsList.find((m) => !featuredIds.has(m.id)) ?? null;
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getUTCFullYear(), 0, 0).getTime()) / 86_400_000);
    return candidates[dayOfYear % candidates.length];
  }, [criticsList, featuredIds]);

  // One dedup pass down the page: a title in Featured or the critics' pick does
  // not come back in a rail, and no title appears in two rails.
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    for (const m of featured) {
      seen.add(m.id);
      const nk = nameKey(m);
      if (nk) seen.add(nk);
    }
    if (criticsPick) seen.add(criticsPick.id);
    const out: Record<string, Meta[]> = {};
    for (const d of dailyRows) {
      const metas: Meta[] = [];
      for (const m of rails[d.id] ?? []) {
        if (metas.length >= ROW_CAP) break;
        const nk = nameKey(m);
        if (seen.has(m.id) || (nk && seen.has(nk))) continue;
        if (hideAnime && metaLooksAnime(m)) continue;
        seen.add(m.id);
        if (nk) seen.add(nk);
        metas.push(m);
      }
      out[d.id] = metas;
    }
    return out;
  }, [dailyRows, rails, featured, criticsPick, hideAnime]);

  const railItems = useMemo(() => {
    const base: RowItem[] = dailyRows.map((r) => ({ key: r.id, title: r.shelf.title }));
    let peopleAfter = -1;
    base.forEach((it, i) => {
      if (it.key.startsWith("keyword:")) peopleAfter = i;
    });
    if (peopleAfter < 0) peopleAfter = base.length - 1;
    const out: RowItem[] = [];
    base.forEach((it, i) => {
      out.push(it);
      for (const s of SPECIAL_ROWS) {
        if (s.after === i || (s.after === -1 && i === peopleAfter)) out.push({ key: s.key, title: s.title });
      }
    });
    return out;
  }, [dailyRows]);
  const railKeys = useMemo(() => railItems.map((r) => r.key), [railItems]);
  const visibleRails = useMemo(() => applyPageRows(railItems, custom, false), [railItems, custom]);
  const editRails = useMemo(
    () =>
      applyPageRows(railItems, custom, true).filter((item) => isSpecialRow(item.key) || (deduped[item.key]?.length ?? 0) > 0),
    [railItems, custom, deduped],
  );

  const surprisePool = useMemo(() => {
    const seen = new Set<string>();
    const out: Meta[] = [];
    for (const m of [...featured, ...criticsList, ...Object.values(rails).flat()]) {
      if (!m.poster || seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
    return out;
  }, [featured, criticsList, rails]);

  const shownFeatured = useHideAnimeMetas(featured);
  const shownQueue = useHideAnimeSlides(queue);
  const shownLetterboxd = useHideAnimeRows(letterboxdRows);
  const shownSurprise = useHideAnimeMetas(surprisePool);

  const hiddenFeatured = custom.hidden.includes("section-featured");
  const hiddenCatalog = custom.hidden.includes("section-catalog");
  const hiddenSurprise = custom.hidden.includes("section-surprise");

  const titleOf = (item: RowItem) => (item.key in custom.renamed ? item.title : t(item.title));
  const renamedTitle = (item: RowItem) => (item.key in custom.renamed ? item.title : undefined);

  const renderRow = (item: RowItem, index: number) => {
    switch (item.key) {
      case "special:genres":
        return <MobileGenreTiles title={renamedTitle(item)} onOpen={(g) => setOverlay({ kind: "genre", name: g.name })} />;
      case "special:queue":
        return shownQueue.length > 0 ? (
          <DiscoveryQueueCta items={shownQueue} title={renamedTitle(item)} onOpen={() => setOverlay({ kind: "queue" })} />
        ) : null;
      case "special:languages":
        return key ? (
          <MobileLanguageTiles title={renamedTitle(item)} onOpen={(l) => setOverlay({ kind: "language", iso: l.iso, name: l.name })} />
        ) : null;
      case "special:collections":
        return key ? <MobileCollectionsRail title={renamedTitle(item)} onOpenDetail={setDetailMeta} /> : null;
      case "special:critics":
        return criticsPick && !(hideAnime && metaLooksAnime(criticsPick)) ? (
          <CriticsPickCard meta={criticsPick} title={renamedTitle(item)} onOpen={setDetailMeta} />
        ) : null;
      case "special:studios":
        return (
          <MobileBrandTiles
            kind="studio"
            title={renamedTitle(item)}
            onOpen={(b) => setOverlay({ kind: "brand", brand: brandRefOf(b) })}
            onSeeAll={() => setOverlay({ kind: "brands", brandKind: "studio" })}
          />
        );
      case "special:awards":
        return <MobileAwardTiles title={renamedTitle(item)} onOpen={(a) => setOverlay({ kind: "award", type: a.type })} />;
      case "special:networks":
        return (
          <MobileBrandTiles
            kind="network"
            title={renamedTitle(item)}
            onOpen={(b) => setOverlay({ kind: "brand", brand: brandRefOf(b) })}
            onSeeAll={() => setOverlay({ kind: "brands", brandKind: "network" })}
          />
        );
      case "special:people":
        return <TopPeopleCta title={renamedTitle(item)} onOpen={() => setOverlay({ kind: "people" })} />;
      default: {
        const def = dailyRows.find((d) => d.id === item.key);
        const metas = deduped[item.key] ?? [];
        if (!def || metas.length === 0) return null;
        const seeAll = () => setOverlay({ kind: "grid", title: titleOf(item), def, initial: rails[item.key] ?? metas });
        return index === 0 && item.key.split(":")[0] === ANCHOR_TRENDING && metas.length >= 6 ? (
          <MobileRankRail title={titleOf(item)} metas={metas} onSeeAll={seeAll} onOpenDetail={setDetailMeta} />
        ) : (
          <MobileRail title={titleOf(item)} metas={metas} onSeeAll={seeAll} onOpenDetail={setDetailMeta} />
        );
      }
    }
  };

  if (loading && Object.keys(rails).length === 0 && featured.length === 0) {
    return <DiscoverSkeleton />;
  }

  if (failed && Object.keys(rails).length === 0 && featured.length === 0) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <h2 className="font-display text-[20px] font-medium text-ink">{t("Couldn't load Discover")}</h2>
        <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
          {t("Harbor couldn't reach the catalog servers. Check your connection and try again.")}
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

  return (
    // Every other browse view opens with a full bleed hero that is MEANT to run
    // under the floating top bar. Discover opens with a section heading instead,
    // so the content clears the bar: its offset is the top inset plus 10px, the
    // pill is about 36px tall, then a gap.
    <div
      className="flex flex-col gap-7 [@media(max-height:500px)]:gap-4 motion-safe:[animation:harbor-step-in_420ms_var(--ease-out)_both]"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 58px)" }}
    >
      {!hiddenFeatured && <MobileFeatured items={shownFeatured} onOpen={setDetailMeta} />}
      <div className={`flex justify-end px-4 ${hiddenFeatured ? "" : "-mt-4"}`}>
        <CustomizePill label={t("Customize page")} onClick={() => setCustomizeOpen(true)} />
      </div>
      {!hiddenCatalog && <CatalogBrowserCard />}
      {!hiddenSurprise && <SurpriseMeCard pool={shownSurprise} onOpen={setDetailMeta} />}
      {shownLetterboxd.map((row) => (
        <MobileRail key={row.key} title={row.name} kicker="Letterboxd" metas={row.metas.slice(0, ROW_CAP)} onOpenDetail={setDetailMeta} />
      ))}
      {visibleRails.map((item, i) => (
        <Fragment key={item.key}>{renderRow(item, i)}</Fragment>
      ))}
      <div className="h-4" />

      {customizeOpen && (
        <CustomizeSheet
          title={t("Discover")}
          sections={[
            { key: "section-featured", name: t("Featured & Recommended"), hidden: hiddenFeatured, onToggle: () => persist(togglePageRowHidden(custom, "section-featured")) },
            { key: "section-catalog", name: t("Browse your catalogs"), hidden: hiddenCatalog, onToggle: () => persist(togglePageRowHidden(custom, "section-catalog")) },
            { key: "section-surprise", name: t("Can't decide?"), hidden: hiddenSurprise, onToggle: () => persist(togglePageRowHidden(custom, "section-surprise")) },
          ]}
          rows={editRails.map((item) => ({
            key: item.key,
            name: titleOf(item),
            hidden: custom.hidden.includes(item.key),
            renamed: item.key in custom.renamed,
          }))}
          hasChanges={hasPageRowChanges(custom)}
          onMove={(k, d) => persist(movePageRow(custom, railKeys, k, d))}
          onToggleHidden={(k) => persist(togglePageRowHidden(custom, k))}
          onRename={(k, v) => persist(renamePageRow(custom, k, v))}
          onReset={() => persist(resetPageRows())}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
      {overlay?.kind === "genre" && (
        <MobileGenrePage genre={{ label: t(overlay.name), genre: overlay.name }} onBack={() => setOverlay(null)} />
      )}
      {overlay?.kind === "language" && (
        <MobileLanguagePage iso={overlay.iso} name={overlay.name} onBack={() => setOverlay(null)} />
      )}
      {overlay?.kind === "brand" && <MobileBrandPage brand={overlay.brand} onBack={() => setOverlay(null)} />}
      {overlay?.kind === "brands" && <MobileBrandsList kind={overlay.brandKind} onBack={() => setOverlay(null)} />}
      {overlay?.kind === "award" && (
        <MobileAwards initialType={overlay.type} onClose={() => setOverlay(null)} onOpenDetail={setDetailMeta} />
      )}
      {overlay?.kind === "queue" && <DiscoveryQueueSheet items={shownQueue} onClose={() => setOverlay(null)} />}
      {overlay?.kind === "people" && <TopPeopleSheet onClose={() => setOverlay(null)} />}
      {overlay?.kind === "grid" && (
        <MobileGridSheet
          title={overlay.title}
          fetcher={(page) => overlay.def.fetch(page)}
          initial={overlay.initial.length >= 18 ? overlay.initial : undefined}
          onClose={() => setOverlay(null)}
        />
      )}
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div
      className="harbor-skeleton flex flex-col gap-7 [@media(max-height:500px)]:gap-4"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 58px)" }}
      aria-hidden
    >
      <section className="flex flex-col gap-4">
        <div className="px-4">
          <div className="h-6 w-56 rounded-md bg-elevated/50" />
        </div>
        <div className="px-4">
          <div className="relative aspect-[4/5] w-[86%] [@media(max-height:500px)]:h-[62svh] [@media(max-height:500px)]:w-auto [@media(min-width:700px)_and_(min-height:600px)]:w-[400px] overflow-hidden rounded-[22px] bg-surface ring-1 ring-edge-soft/50">
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-5">
              <div className="h-7 w-3/5 rounded-lg bg-elevated/55" />
              <div className="h-3.5 w-2/5 rounded bg-elevated/40" />
              <div className="h-3 w-4/5 rounded bg-elevated/35" />
            </div>
          </div>
        </div>
      </section>
      {["w-40", "w-28", "w-36"].map((w) => (
        <section key={w} className="flex flex-col gap-3">
          <div className="px-4">
            <div className={`h-[18px] ${w} rounded-md bg-elevated/45`} />
          </div>
          <div className="flex gap-3 overflow-hidden px-4 pb-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] w-[124px] shrink-0 rounded-lg bg-elevated/40" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
