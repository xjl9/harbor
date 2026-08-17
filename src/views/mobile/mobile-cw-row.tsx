import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Play, X } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useAuth } from "@/lib/auth";
import { FLIP_ORIGIN_ATTR } from "@/lib/motion";
import { useHideAnime } from "@/lib/anime-hide";
import { useHeroLogos } from "@/components/anime-hero/use-hero-logos";
import { detectAnimeForCw, useDetectedAnimeVersion } from "@/lib/anime-detect";
import { useAnilist } from "@/lib/anilist/provider";
import { loadAnilistWatchedMap } from "@/lib/anilist/watched-map";
import {
  buildCwResurfaceLibrary,
  dismissCwItem,
  mergeContinueWatching,
  useCwCloudLibrary,
  useCwFranchiseRootsVersion,
  useLocalCwLibraryItems,
} from "@/lib/continue-watching";
import { useCwDismissVersion } from "@/lib/cw-dismiss";
import { useMobileRemote } from "./mobile-remote";
import { manualWatchedVersion, subscribeManualWatched } from "@/lib/manual-watched";
import { readSnapshot, useSnapshotVersion } from "@/lib/snapshots";
import { useSettings } from "@/lib/settings";
import { loadSimklStatusMap, loadSimklWatchedMap, type WatchlistStatus } from "@/lib/simkl/list-status";
import { useSimkl } from "@/lib/simkl/provider";
import { fetchWatchedKeySet } from "@/lib/trakt/history";
import { useTrakt } from "@/lib/trakt/provider";
import { episodeFromVideoId, isAnimeCwItem, libraryMetaType, type LibraryItem } from "@/lib/stremio";
import { useCwAdvance } from "@/views/home/hooks/use-cw-advance";
import { useLayerActive } from "./layer-active";

const NO_SIMKL_CW: LibraryItem[] = [];

// External watched sources feeding useCwAdvance's episode-watched checks.
// Mirrors the loaders desktop home runs; maps stay empty when a service is
// not connected, matching useCwAdvance's own defaults.
function useCwWatchedSources(cwItems: LibraryItem[]): {
  traktWatched: Set<string>;
  simklWatchedMap: Map<string, Set<string>>;
  simklStatusMap: Map<string, WatchlistStatus>;
  anilistWatchedMap: Map<string, Set<string>>;
} {
  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: simklConnected } = useSimkl();
  const { isConnected: anilistConnected } = useAnilist();
  const [traktWatched, setTraktWatched] = useState<Set<string>>(() => new Set());
  const [simklWatchedMap, setSimklWatchedMap] = useState<Map<string, Set<string>>>(() => new Map());
  const [simklStatusMap, setSimklStatusMap] = useState<Map<string, WatchlistStatus>>(() => new Map());
  const [anilistWatchedMap, setAnilistWatchedMap] = useState<Map<string, Set<string>>>(() => new Map());

  useEffect(() => {
    if (!traktConnected) {
      setTraktWatched((prev) => (prev.size ? new Set() : prev));
      return;
    }
    let cancelled = false;
    fetchWatchedKeySet()
      .then((set) => {
        if (!cancelled) setTraktWatched(set);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [traktConnected]);

  useEffect(() => {
    if (!simklConnected) {
      setSimklWatchedMap((prev) => (prev.size ? new Map() : prev));
      setSimklStatusMap((prev) => (prev.size ? new Map() : prev));
      return;
    }
    let cancelled = false;
    loadSimklWatchedMap()
      .then((map) => {
        if (!cancelled) setSimklWatchedMap(map);
      })
      .catch(() => {});
    loadSimklStatusMap()
      .then((map) => {
        if (!cancelled) setSimklStatusMap(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [simklConnected]);

  useEffect(() => {
    if (!anilistConnected) {
      setAnilistWatchedMap((prev) => (prev.size ? new Map() : prev));
      return;
    }
    let cancelled = false;
    const ids = cwItems.filter((i) => /^(kitsu|mal|anilist):/.test(i._id)).map((i) => i._id);
    loadAnilistWatchedMap(ids)
      .then((m) => {
        if (!cancelled) setAnilistWatchedMap(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [anilistConnected, cwItems]);

  return { traktWatched, simklWatchedMap, simklStatusMap, anilistWatchedMap };
}

export function useMobileCw(limit = 14): LibraryItem[] {
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const hideAnime = useHideAnime();
  const layerActive = useLayerActive();
  const items = useCwCloudLibrary(authKey, layerActive);
  const localItems = useLocalCwLibraryItems();
  const dismissVersion = useCwDismissVersion();
  const manualWatchedVer = useSyncExternalStore(subscribeManualWatched, manualWatchedVersion);
  const animeDetectVer = useDetectedAnimeVersion();
  const rootsVersion = useCwFranchiseRootsVersion(localItems);

  useEffect(() => {
    void detectAnimeForCw(items);
  }, [items]);

  const merged = useMemo(() => {
    void dismissVersion;
    void rootsVersion;
    void animeDetectVer;
    return mergeContinueWatching(items, NO_SIMKL_CW, localItems, {
      cwPerProfile: settings.cwPerProfile,
      hideAnime,
    });
  }, [items, localItems, dismissVersion, rootsVersion, animeDetectVer, hideAnime, settings.cwPerProfile]);

  const resurfaceLibrary = useMemo(() => {
    void manualWatchedVer;
    return buildCwResurfaceLibrary(items, localItems);
  }, [items, localItems, manualWatchedVer]);

  const watched = useCwWatchedSources(merged);
  const advanced = useCwAdvance(
    merged,
    settings.tmdbKey,
    settings.cwAdvanceNext,
    resurfaceLibrary,
    hideAnime ? "exclude" : "all",
    manualWatchedVer,
    watched.traktWatched,
    watched.simklWatchedMap,
    watched.anilistWatchedMap,
    watched.simklStatusMap,
    animeDetectVer,
    settings.episodeHiding,
    // Mobile cards have no air-countdown treatment, so never emit
    // waitingForAir entries regardless of the animeCwEnd setting.
    "hide",
  );

  return useMemo(() => advanced.slice(0, limit), [advanced, limit]);
}

// Same windowing Poster's lazy="release" does, for the card's raw <img>s: mount
// the bitmaps only near the viewport and drop them again after lingering far
// offscreen, so parked cards don't pin decoded snapshots/backdrops in memory.
function useImgRelease(): { ref: React.RefObject<HTMLDivElement | null>; show: boolean } {
  const ref = useRef<HTMLDivElement | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer = 0;
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setShow(true);
      },
      { rootMargin: "600px" },
    );
    const far = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          if (timer) {
            window.clearTimeout(timer);
            timer = 0;
          }
          return;
        }
        if (timer) return;
        timer = window.setTimeout(() => {
          timer = 0;
          setShow(false);
        }, 1500);
      },
      { rootMargin: "2400px" },
    );
    near.observe(el);
    far.observe(el);
    return () => {
      near.disconnect();
      far.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, []);
  return { ref, show };
}

function toMeta(item: LibraryItem): Meta {
  return {
    id: item._id,
    type: libraryMetaType(item.type),
    name: item.name,
    poster: item.poster,
    background: item.background,
  };
}

export function MobileCwRow({
  items,
  onOpenDetail,
}: {
  items: LibraryItem[];
  onOpenDetail: (m: Meta) => void;
}) {
  const { settings } = useSettings();
  const { authKey } = useAuth();
  useSnapshotVersion();
  const metas = useMemo(() => items.map(toMeta), [items]);
  const logos = useHeroLogos(metas, settings);

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_215px]">
      <h2 className="px-4 font-display text-[19px] font-medium tracking-[-0.01em] text-ink">Continue watching</h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <MobileCwCard
            key={item._id}
            item={item}
            logo={logos[item._id]}
            onOpenDetail={onOpenDetail}
            onDismiss={() => dismissCwItem(item, authKey)}
          />
        ))}
      </div>
    </section>
  );
}

function MobileCwCard({
  item,
  logo,
  onOpenDetail,
  onDismiss,
}: {
  item: LibraryItem;
  logo?: string;
  onOpenDetail: (m: Meta) => void;
  onDismiss: () => void;
}) {
  const meta = toMeta(item);
  const { ref, show } = useImgRelease();
  const dur = item.state?.duration ?? 0;
  const off = item.state?.timeOffset ?? 0;
  const progress = dur > 0 ? Math.min(1, off / dur) : 0;
  const external = item.external === "simkl";
  // Up-next entries carry the previous episode's duration with a reset
  // offset, so a remaining-time label would be wrong for them.
  const remaining = dur > 0 && !external && !item.upNext ? formatRemaining(dur - off) : "";
  const ep = episodeInfo(item);
  const { playOnHost } = useMobileRemote();
  const sub =
    item.type !== "movie" && ep
      ? isAnimeCwItem(item)
        ? `Ep ${ep.episode}`
        : `S${ep.season} · E${ep.episode}`
      : "";
  const bg = downscaleTmdb(readSnapshot(item._id) ?? item.background ?? item.poster);

  return (
    <div ref={ref} className="w-[260px] shrink-0 [content-visibility:auto] [contain-intrinsic-size:auto_172px]">
      <div className="relative">
        {/* The artwork is the resume button: this row exists to get you back into
            something you already started, so it plays rather than routing through a
            page you have already read. The title underneath still opens it. */}
        <button
          type="button"
          onClick={() => playOnHost(meta, ep ? { season: ep.season, episode: ep.episode } : undefined)}
          {...{ [FLIP_ORIGIN_ATTR]: "" }}
          className="relative block aspect-[16/9] w-full overflow-hidden rounded-[16px] bg-surface text-start ring-1 ring-edge-soft/50"
        >
          {bg && show && (
            <img
              src={bg}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover brightness-90"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/15" />
          {logo && show && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-5 pb-7">
              <img
                src={logo}
                alt=""
                loading="lazy"
                decoding="async"
                className="max-h-[50%] w-auto max-w-[76%] object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
              />
            </div>
          )}
          <span className="absolute bottom-2.5 start-2.5 flex max-w-[calc(100%-20px)] items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
            <Play size={11} strokeWidth={0} fill="currentColor" className="shrink-0" />
            {sub ? (
              <>
                <span className="shrink-0">{sub}</span>
                {remaining && (
                  <>
                    <span className="text-white/45">{"·"}</span>
                    <span className="shrink-0 text-white/80">{remaining}</span>
                  </>
                )}
              </>
            ) : (
              <span className="shrink-0">{remaining || "Resume"}</span>
            )}
          </span>
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
            <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          aria-label="Remove from Continue watching"
          className="absolute end-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm"
        >
          <X size={17} strokeWidth={2.4} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onOpenDetail(meta)}
        className="mt-1.5 line-clamp-1 w-full text-start text-[13px] font-medium text-ink-muted"
      >
        {item.name}
      </button>
    </div>
  );
}

function episodeInfo(i: LibraryItem): { season: number; episode: number } | null {
  if (i.type === "movie") return null;
  const s = i.state?.season;
  const e = i.state?.episode;
  if (s && e) return { season: s, episode: e };
  const vid = i.state?.video_id ?? "";
  if (/^(kitsu|mal|anilist|anidb):/.test(i._id) && vid.split(":").length === 3) {
    const num = Number(vid.split(":")[2]);
    return Number.isFinite(num) && num > 0 ? { season: 1, episode: num } : null;
  }
  const parsed = episodeFromVideoId(vid);
  return parsed && parsed.episode > 0 ? parsed : null;
}

function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h left` : `${h}h ${m}m left`;
}

function downscaleTmdb(url?: string): string | undefined {
  if (!url) return url;
  return url.replace(/\/t\/p\/(original|w1280|w780|w500)\//, "/t/p/w500/");
}
