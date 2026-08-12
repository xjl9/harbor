import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { HomeRow } from "@/views/home/home-types";
import { buildCinemetaRows, buildTmdbRows, isStreamingServiceRow, mergeRows } from "@/views/home/home-rows";
import { loadAddonRows, type AddonRow } from "@/lib/addons";
import { isAnimeRow } from "@/views/anime/anime-rows";
import { useAuth } from "@/lib/auth";
import { useSettings, type StreamingService } from "@/lib/settings";
import { useHideAnimeMetas, useHideAnimeRows } from "@/lib/anime-hide";
import { usePinnedRows } from "@/views/home/hooks/use-pinned-rows";
import { useMediaFavorites, type MediaEntry } from "@/lib/media-favorites";
import { useLocalWatchlist } from "@/lib/local-watchlist";
import { MobileHero } from "./mobile-hero";
import { MobileCwRow, useMobileCw } from "./mobile-cw-row";
import { MobileRail, MobileRankRail } from "./mobile-rail";
import { MobileStreamingRail } from "./mobile-streaming-rail";
import { MobileServicePage } from "./mobile-service-page";
import { MobileDetail } from "./mobile-detail";

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

export function MobileHome() {
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const [hero, setHero] = useState<Meta[]>([]);
  const [rows, setRows] = useState<HomeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [serviceOpen, setServiceOpen] = useState<StreamingService | null>(null);
  const cw = useMobileCw(14);
  const isClassic = settings.homeMode === "classic";

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
        let heroPool: Meta[] = [];
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
          heroPool = built.hero;
        }
        if (!alive) return;
        setHero(dedupeMetas(heroPool.filter((m) => m.background)).slice(0, 8));
        setRows(mergeRows(builtRows, []));

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
          : addons.filter((a) => !isAnimeRow(a) && !isStreamingServiceRow(a.name));
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
  }, [
    authKey,
    settings.tmdbKey,
    settings.tmdbLanguage,
    settings.region,
    settings.homeMode,
    settings.homeShowAllAddonRows,
    reloadKey,
  ]);

  // Reload rows when the user installs/removes an addon (mirrors desktop home).
  useEffect(() => {
    const onChanged = () => setReloadKey((k) => k + 1);
    window.addEventListener("harbor:addons-changed", onChanged);
    return () => window.removeEventListener("harbor:addons-changed", onChanged);
  }, []);

  const pinnedRows = usePinnedRows();
  const { items: favItems } = useMediaFavorites();
  const { items: localItems } = useLocalWatchlist();
  const personalRows = useMemo<HomeRow[]>(() => {
    const toMetas = (m: Map<string, MediaEntry>): Meta[] =>
      [...m.values()]
        .sort((a, b) => b.addedAt - a.addedAt)
        .map((e) => ({ id: e.id, type: e.type, name: e.name, poster: e.poster }));
    const out: HomeRow[] = [];
    if (favItems.size > 0) {
      out.push({ key: "harbor-favorites", type: "movie", name: "Favorites", metas: toMetas(favItems), page: 1, hasMore: false, noDedup: true });
    }
    if (localItems.size > 0) {
      out.push({ key: "harbor-watchlist", type: "movie", name: "My Watchlist", metas: toMetas(localItems), page: 1, hasMore: false, noDedup: true });
    }
    return out;
  }, [favItems, localItems]);

  const enabledServices = useMemo<StreamingService[]>(
    () =>
      settings.tmdbKey
        ? (Object.keys(settings.streaming) as StreamingService[]).filter((s) => settings.streaming[s])
        : [],
    [settings.tmdbKey, settings.streaming],
  );

  const shownHero = useHideAnimeMetas(hero);
  const shownRows = useHideAnimeRows(rows);
  const shownPinned = useHideAnimeRows(pinnedRows);

  if (loading && rows.length === 0) {
    return <HomeSkeleton />;
  }

  if (failed && rows.length === 0 && cw.length === 0 && shownPinned.length === 0 && personalRows.length === 0) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-8 text-center">
        <h2 className="font-display text-[20px] font-medium text-ink">Couldn't load your home</h2>
        <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
          Harbor couldn't reach the catalog servers. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas transition-transform active:scale-95"
        >
          Try again
        </button>
      </div>
    );
  }

  const personalAndPinned = (
    <>
      {shownPinned.map((r) => (
        <MobileRail key={r.key} title={r.name} metas={dedupeMetas(r.metas).slice(0, 18)} onOpenDetail={setDetailMeta} />
      ))}
      {personalRows.map((r) => (
        <MobileRail key={r.key} title={r.name} metas={r.metas.slice(0, 18)} onOpenDetail={setDetailMeta} />
      ))}
    </>
  );

  return (
    <div className="flex flex-col gap-7 pt-3 motion-safe:[animation:harbor-step-in_420ms_var(--ease-out)_both]">
      {!isClassic && <MobileHero slides={shownHero} onOpenDetail={setDetailMeta} />}
      {cw.length > 0 && <MobileCwRow items={cw} onOpenDetail={setDetailMeta} />}
      {!isClassic && enabledServices.length > 0 && (
        <MobileStreamingRail services={enabledServices} onOpen={setServiceOpen} />
      )}
      {!isClassic && shownRows[0] && shownRows[0].metas.length >= 6 ? (
        <>
          <MobileRankRail title="Top 10 Today" metas={dedupeMetas(shownRows[0].metas)} onOpenDetail={setDetailMeta} />
          {personalAndPinned}
          {shownRows.slice(1).map((r) => (
            <MobileRail key={r.key} title={r.name} metas={dedupeMetas(r.metas).slice(0, 18)} onOpenDetail={setDetailMeta} />
          ))}
        </>
      ) : (
        // Classic mode, or row 0 too small for the ranked treatment: render every
        // row as a normal rail instead of silently dropping row 0.
        <>
          {personalAndPinned}
          {shownRows.map((r) => (
            <MobileRail key={r.key} title={r.name} metas={dedupeMetas(r.metas).slice(0, 18)} onOpenDetail={setDetailMeta} />
          ))}
        </>
      )}
      <div className="h-4" />
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
      {serviceOpen && (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-canvas">
          <MobileServicePage service={serviceOpen} onBack={() => setServiceOpen(null)} />
        </div>
      )}
    </div>
  );
}

function Shimmer() {
  return (
    <span className="animate-shimmer pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-ink/[0.07] to-transparent motion-reduce:hidden" />
  );
}

function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-7 pt-3" aria-hidden>
      <HeroSkeleton />
      <RailSkeleton titleW="w-40" />
      <RailSkeleton titleW="w-28" />
      <RailSkeleton titleW="w-36" />
    </div>
  );
}

function HeroSkeleton() {
  // Geometry mirrors the real full-bleed MobileHero so the load->loaded swap is a
  // cross-fade of identical boxes, not a reflow (was an inset rounded card -> jump).
  return (
    <section className="relative -mt-3 mb-1">
      <div className="relative h-[62svh] min-h-[440px] w-full overflow-hidden bg-surface">
        <Shimmer />
        <div className="absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-canvas to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3.5 px-5 pb-7">
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

function RailSkeleton({ titleW }: { titleW: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="px-4">
        <div className={`h-[18px] ${titleW} rounded-md bg-elevated/45`} />
      </div>
      <div className="flex gap-3 overflow-hidden px-4 pb-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[124px] shrink-0">
            <div className="relative aspect-[2/3] overflow-hidden rounded-[14px] bg-elevated/40">
              <Shimmer />
            </div>
            <div className="mt-1.5 h-2.5 w-4/5 rounded bg-elevated/35" />
            <div className="mt-1.5 h-2.5 w-3/5 rounded bg-elevated/30" />
          </div>
        ))}
      </div>
    </section>
  );
}
