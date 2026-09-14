import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { topSeries } from "@/lib/cinemeta";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useHideAnimeMetas, useHideAnimeRows } from "@/lib/anime-hide";
import { useCollectionRowsForPage } from "@/lib/page-collection-rows";
import { isAnimeCwItem } from "@/lib/stremio";
import { buildShowHero } from "@/views/shows/hero-curation";
import { showSpecs } from "@/views/shows/show-specs";
import { MobileHero } from "./mobile-hero";
import { MobileDetail } from "./mobile-detail";
import { useMobileCw } from "./mobile-cw-row";
import { HeroSkeleton, RailSkeleton } from "./mobile-movies";
import { CatalogPageRows, listPager, type PageRow } from "./browse/catalog-page-rows";
import { ResumeRow } from "./browse/resume-row";

type RowData = { key: string; title: string; metas: Meta[]; fetcher?: (page: number) => Promise<Meta[]> };

const GENRES = [
  "Drama",
  "Comedy",
  "Crime",
  "Sci-Fi",
  "Thriller",
  "Mystery",
  "Action",
  "Animation",
  "Adventure",
  "Fantasy",
  "Documentary",
  "Romance",
  "Horror",
];

function dedupeMetas(metas: Meta[]): Meta[] {
  const seen = new Set<string>();
  const out: Meta[] = [];
  for (const m of metas) {
    const nameKey = m.name ? m.name.toLowerCase().replace(/[^a-z0-9]+/g, "") : "";
    if (seen.has(m.id) || (nameKey && seen.has(nameKey))) continue;
    seen.add(m.id);
    if (nameKey) seen.add(nameKey);
    out.push(m);
  }
  return out;
}

export function MobileShows() {
  const t = useT();
  const { settings } = useSettings();
  const [hero, setHero] = useState<Meta[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  // Desktop Shows keeps its own resume row of series, anime excluded, above the
  // catalog rows. The shared continue-watching merge already honours dismissals,
  // per-profile CW and next-episode advance; this only narrows it to shows.
  const cw = useMobileCw(40);
  const showCw = useMemo(() => cw.filter((i) => i.type === "series" && !isAnimeCwItem(i)).slice(0, 16), [cw]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        let heroPool: Meta[] = [];
        let rowList: RowData[] = [];
        if (settings.tmdbKey) {
          const key = settings.tmdbKey;
          const built = await buildShowHero(key).catch(() => [] as Meta[]);
          const specs = showSpecs(key);
          const pages = await Promise.all(specs.map((s) => s.fetcher(1).catch(() => [] as Meta[])));
          if (!alive) return;
          const tmdbRows = specs
            .map((spec, i) => ({
              key: spec.key,
              title: spec.title,
              metas: pages[i],
              fetcher: spec.noPaginate ? listPager(pages[i]) : spec.fetcher,
            }))
            .filter((r) => r.metas.length > 0);
          if (tmdbRows.length > 0) {
            heroPool = built;
            rowList = tmdbRows;
          }
        }
        if (rowList.length === 0) {
          const [top, ...byGenre] = await Promise.all([
            topSeries().catch(() => [] as Meta[]),
            ...GENRES.map((g) => topSeries(g).catch(() => [] as Meta[])),
          ]);
          if (!alive) return;
          heroPool = top;
          rowList = [{ key: "cinemeta-top", title: "Top Series", metas: top, fetcher: listPager(top) }];
          for (let i = 0; i < GENRES.length; i++) {
            const list = byGenre[i] ?? [];
            if (list.length === 0) continue;
            rowList.push({
              key: `cinemeta-genre-${GENRES[i].toLowerCase().replace(/[^a-z]/g, "")}`,
              title: `Top ${GENRES[i]}`,
              metas: list,
              fetcher: listPager(list),
            });
          }
        }
        setHero(dedupeMetas(heroPool.filter((m) => m.background)).slice(0, 8));
        setRows(rowList);
        setFailed(rowList.length === 0);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [settings.tmdbKey, reloadKey]);

  const shownRows = useHideAnimeRows(rows);
  const shownHero = useHideAnimeMetas(hero);
  const showCollections = useCollectionRowsForPage("shows");

  const catalogRows = useMemo<PageRow[]>(() => {
    const trending = shownRows.find((r) => r.key === "trending");
    const top10 = dedupeMetas(trending?.metas ?? []).slice(0, 10);
    const seen = new Set<string>(shownHero.map((m) => m.id));
    if (top10.length >= 10) for (const m of top10) seen.add(m.id);
    const rest: PageRow[] = shownRows
      .filter((r) => r.key !== "trending" || top10.length < 10)
      .map((r) => ({
        key: r.key,
        title: r.title,
        fetcher: r.fetcher,
        metas: dedupeMetas(r.metas).filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        }),
      }))
      .filter((r) => r.metas.length >= 4);
    const collections: PageRow[] = showCollections
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        key: `collection-${c.id}`,
        title: c.name,
        translate: false,
        metas: c.items.map((it) => ({ id: it.id, type: it.type, name: it.name, poster: it.poster })),
      }));
    const head: PageRow[] =
      top10.length >= 10
        ? [{ key: "top10", title: "Top 10 Series Today", metas: top10, fetcher: trending?.fetcher, variant: "rank" }]
        : [];
    return [...head, ...collections, ...rest];
  }, [shownRows, shownHero, showCollections]);

  if (loading && rows.length === 0) {
    return <ShowsSkeleton />;
  }

  if (failed && rows.length === 0) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <h2 className="font-display text-[20px] font-medium text-ink">
          {t("Couldn't load shows")}
        </h2>
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
    <div className="flex flex-col gap-7 [@media(max-height:500px)]:gap-4 pt-3 motion-safe:[animation:harbor-step-in_420ms_var(--ease-out)_both]">
      <MobileHero slides={shownHero} onOpenDetail={setDetailMeta} />
      <CatalogPageRows
        page="shows"
        rows={catalogRows}
        customizeTitle={t("Shows")}
        onOpenDetail={setDetailMeta}
        before={<ResumeRow title={t("Pick up where you left off")} items={showCw} onOpenDetail={setDetailMeta} />}
      />
      <div className="h-4" />
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </div>
  );
}

function ShowsSkeleton() {
  return (
    <div className="harbor-skeleton flex flex-col gap-7 [@media(max-height:500px)]:gap-4 pt-3" aria-hidden>
      <HeroSkeleton />
      <RailSkeleton titleW="w-44" />
      <RailSkeleton titleW="w-28" />
      <RailSkeleton titleW="w-36" />
    </div>
  );
}
