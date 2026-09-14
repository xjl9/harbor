import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { topMovies } from "@/lib/cinemeta";
import { recentlyPlayed } from "@/lib/playback-history";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useHideAnimeMetas, useHideAnimeRows } from "@/lib/anime-hide";
import { useCollectionRowsForPage } from "@/lib/page-collection-rows";
import {
  buildMovieHero,
  HERO_POOL_TARGET,
  movieSpecs,
  rotateDaily,
} from "@/views/movies/movie-specs";
import { MobileHero } from "./mobile-hero";
import { MobileDetail } from "./mobile-detail";
import { CatalogPageRows, listPager, type PageRow } from "./browse/catalog-page-rows";

type RowData = { key: string; title: string; metas: Meta[]; fetcher?: (page: number) => Promise<Meta[]> };

const GENRES = [
  "Action",
  "Drama",
  "Comedy",
  "Sci-Fi",
  "Thriller",
  "Horror",
  "Romance",
  "Animation",
  "Adventure",
  "Crime",
  "Mystery",
  "Fantasy",
  "Documentary",
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

export function MobileMovies() {
  const t = useT();
  const { settings } = useSettings();
  const [hero, setHero] = useState<Meta[]>([]);
  const [rows, setRows] = useState<RowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const seen = recentlyPlayed();
        let heroPool: Meta[] = [];
        let rowList: RowData[] = [];
        if (settings.tmdbKey) {
          const key = settings.tmdbKey;
          const built = await buildMovieHero(key, seen).catch(() => [] as Meta[]);
          const specs = movieSpecs(key, settings.region);
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
            topMovies().catch(() => [] as Meta[]),
            ...GENRES.map((g) => topMovies(g).catch(() => [] as Meta[])),
          ]);
          if (!alive) return;
          heroPool = rotateDaily(
            top.filter((m) => m.background),
            HERO_POOL_TARGET,
            seen,
          );
          rowList = [{ key: "cinemeta-top", title: "Top Movies", metas: top, fetcher: listPager(top) }];
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
  }, [settings.tmdbKey, settings.region, reloadKey]);

  const shownRows = useHideAnimeRows(rows);
  const shownHero = useHideAnimeMetas(hero);
  const movieCollections = useCollectionRowsForPage("movies");

  // Same composition as the desktop Movies page: a Top 10 from the trending row,
  // then the user's collections for this page, then the spec rows with titles
  // already shown higher up removed.
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
    const collections: PageRow[] = movieCollections
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        key: `collection-${c.id}`,
        title: c.name,
        translate: false,
        metas: c.items.map((it) => ({ id: it.id, type: it.type, name: it.name, poster: it.poster })),
      }));
    const head: PageRow[] =
      top10.length >= 10
        ? [{ key: "top10", title: "Top 10 Movies Today", metas: top10, fetcher: trending?.fetcher, variant: "rank" }]
        : [];
    return [...head, ...collections, ...rest];
  }, [shownRows, shownHero, movieCollections]);

  if (loading && rows.length === 0) {
    return <MoviesSkeleton />;
  }

  if (failed && rows.length === 0) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <h2 className="font-display text-[20px] font-medium text-ink">
          {t("Couldn't load movies")}
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
      <CatalogPageRows page="movies" rows={catalogRows} customizeTitle={t("Movies")} onOpenDetail={setDetailMeta} />
      <div className="h-4" />
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </div>
  );
}

function MoviesSkeleton() {
  return (
    <div className="harbor-skeleton flex flex-col gap-7 [@media(max-height:500px)]:gap-4 pt-3" aria-hidden>
      <HeroSkeleton />
      <RailSkeleton titleW="w-44" />
      <RailSkeleton titleW="w-28" />
      <RailSkeleton titleW="w-36" />
    </div>
  );
}

export function HeroSkeleton() {
  // Geometry mirrors the full-bleed MobileHero so the load to loaded swap is a
  // cross-fade of identical boxes rather than a reflow.
  return (
    <section
      className="relative -mt-3 mb-1"
      style={{
        marginLeft: "calc(-1 * env(safe-area-inset-left, 0px))",
        marginRight: "calc(-1 * env(safe-area-inset-right, 0px))",
      }}
    >
      <div className="relative h-[62svh] min-h-[min(440px,72svh)] [@media(max-height:500px)]:h-[50svh] [@media(max-height:500px)]:min-h-0 w-full overflow-hidden bg-surface">
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-canvas to-transparent" />
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col gap-3.5"
          style={{
            paddingBottom: "1.75rem",
            paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
          }}
        >
          <div className="h-3.5 w-32 rounded bg-elevated/50" />
          <div className="h-9 w-3/5 rounded-lg bg-elevated/55" />
          <div className="h-3.5 w-2/5 rounded bg-elevated/40" />
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="h-[54px] flex-1 rounded-full bg-elevated/50" />
            <div className="h-[54px] w-[54px] shrink-0 rounded-full bg-elevated/45" />
            <div className="h-[54px] w-[54px] shrink-0 rounded-full bg-elevated/45" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function RailSkeleton({ titleW }: { titleW: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="px-4">
        <div className={`h-[18px] ${titleW} rounded-md bg-elevated/45`} />
      </div>
      <div className="flex gap-3 overflow-hidden px-4 pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[124px] shrink-0">
            <div className="aspect-[2/3] rounded-lg bg-elevated/40" />
            <div className="mt-1.5 h-2.5 w-4/5 rounded bg-elevated/35" />
            <div className="mt-1.5 h-2.5 w-3/5 rounded bg-elevated/30" />
          </div>
        ))}
      </div>
    </section>
  );
}
