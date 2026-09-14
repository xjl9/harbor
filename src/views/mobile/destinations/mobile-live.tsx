import { LayoutGrid, Star, Tv } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LiveTvIcon } from "@/components/icons/live-tv-icon";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { isHydratableChannel } from "@/lib/iptv/channel-hydration";
import { computeTvgIdCounts, epgProgramsForChannel } from "@/lib/iptv/epg-resolver";
import { FAVORITES_GROUP_KEY, useFavorites } from "@/lib/iptv/favorites";
import { usePlaylists } from "@/lib/iptv/playlists-store";
import { clearPlaylistCache, getCachedPlaylist } from "@/lib/iptv/store";
import type { EpgIndex, EpgProgram, IptvChannel, IptvPlaylistSource } from "@/lib/iptv/types";
import { findCurrent } from "@/lib/iptv/xmltv";
import { useSettings } from "@/lib/settings";
import { useAllPlaylists } from "@/views/live/hooks/use-all-playlists";
import { useChannelHydration } from "@/views/live/hooks/use-channel-hydration";
import { useChannelPipeline } from "@/views/live/hooks/use-channel-pipeline";
import { useEpg, useNowTick } from "@/views/live/hooks/use-epg";
import { useIptvPlaylist } from "@/views/live/hooks/use-iptv-playlist";
import { useLazyVisible } from "@/views/live/hooks/use-lazy-visible";
import { useLiveActions } from "@/views/live/hooks/use-live-actions";
import { usePlaylistMutations } from "@/views/live/hooks/use-playlist-mutations";
import { useXtreamEpgFallback } from "@/views/live/hooks/use-xtream-epg-fallback";
import { MobileDetail } from "../mobile-detail";
import {
  BottomSheet,
  Chip,
  ChipRow,
  DestinationPage,
  EmptyBlock,
  PosterGridSkeleton,
  PrimaryButton,
  SearchField,
} from "./page-shell";
import { ConnectIntro, SourceButton, SourceSheet } from "./playlist-connect";

const ACTIVE_KEY = "harbor.iptv.active";
const EMPTY_CHANNELS: IptvChannel[] = [];
const CHIP_GROUPS = 14;

function readActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

function writeActiveId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

// The desktop Live view minus its desktop-only modes (multi-view, the EPG
// timeline). Same playlist store, same channel pipeline, same iptv: player
// path; the guide is folded into each channel tile as now/next.
export function MobileLive({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const sources = usePlaylists();

  const [activeId, setActiveId] = useState<string | null>(() => readActiveId());
  useEffect(() => {
    if (sources.length === 0) {
      if (activeId !== null) {
        setActiveId(null);
        writeActiveId(null);
      }
      return;
    }
    if (!activeId || !sources.find((s) => s.id === activeId)) {
      const fallback = sources[0]?.id ?? null;
      setActiveId(fallback);
      writeActiveId(fallback);
    }
  }, [sources, activeId]);

  const activeSource: IptvPlaylistSource | null = useMemo(() => {
    if (!activeId) return null;
    const found = sources.find((s) => s.id === activeId);
    return found
      ? { id: found.id, name: found.name, url: found.url, epgUrl: found.epgUrl, kind: found.kind, xtream: found.xtream }
      : null;
  }, [activeId, sources]);

  const { state, refresh } = useIptvPlaylist(activeSource);
  const cachedForActive = getCachedPlaylist(activeSource?.id ?? "");
  const playlist =
    state.kind === "ready"
      ? state.playlist
      : cachedForActive && cachedForActive.id === activeId
        ? cachedForActive
        : null;
  const epgOnlyUrls = useMemo(
    () => sources.filter((s) => s.kind === "epg").map((s) => s.epgUrl || s.url),
    [sources],
  );
  const { index: baseEpg } = useEpg(activeSource, epgOnlyUrls);
  const epg = useXtreamEpgFallback(activeSource, playlist?.channels ?? EMPTY_CHANNELS, baseEpg);
  const nowMs = useNowTick(30_000);

  const favorites = useFavorites();
  const favoritesCountRef = useRef(favorites.count);
  favoritesCountRef.current = favorites.count;
  const [group, setGroup] = useState<string | null>(() =>
    favoritesCountRef.current > 0 ? FAVORITES_GROUP_KEY : null,
  );
  const [query, setQuery] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [detail, setDetail] = useState<Meta | null>(null);

  useEffect(() => {
    setGroup(favoritesCountRef.current > 0 ? FAVORITES_GROUP_KEY : null);
    setQuery("");
  }, [activeId]);

  const region = settings.region || "US";
  const preferredLanguages = settings.preferredLanguages.length > 0 ? settings.preferredLanguages : ["English"];
  const inFavorites = group === FAVORITES_GROUP_KEY;
  const allSources = useMemo<IptvPlaylistSource[]>(
    () =>
      sources
        .filter((p) => (p.kind ?? "m3u") !== "epg")
        .map((p) => ({ id: p.id, name: p.name, url: p.url, epgUrl: p.epgUrl, kind: p.kind, xtream: p.xtream })),
    [sources],
  );
  const managedSources = useMemo<IptvPlaylistSource[]>(
    () => sources.map((p) => ({ id: p.id, name: p.name, url: p.url, epgUrl: p.epgUrl, kind: p.kind, xtream: p.xtream })),
    [sources],
  );
  const stubSources = useMemo(() => {
    const ids = new Set<string>();
    for (const f of favorites.items.values()) if (!f.url) ids.add(f.sourceId);
    return allSources.filter((s) => ids.has(s.id));
  }, [favorites.items, allSources]);
  const allPlaylists = useAllPlaylists(stubSources, inFavorites && stubSources.length > 0);

  const { sortedGroups, visible, counts, groupLogos } = useChannelPipeline({
    playlist,
    region,
    preferredLanguages,
    mode: "grid",
    group,
    query,
    favorites,
    allPlaylists,
    allSources,
  });

  const selectActive = useCallback((id: string | null) => {
    setActiveId(id);
    writeActiveId(id);
  }, []);
  const { addPlaylist, removePlaylist, editPlaylist } = usePlaylistMutations({
    activeId,
    setActiveId: selectActive,
    refresh,
  });
  const { handlePlay } = useLiveActions({ epg, activeId, playlist });
  const hardRefresh = () => {
    if (activeId) clearPlaylistCache(activeId);
    refresh();
  };

  const sheet = sourcesOpen && (
    <SourceSheet
      sources={managedSources}
      activeId={activeId}
      fetchedAt={playlist?.fetchedAt ?? null}
      loading={state.kind === "loading"}
      onClose={() => setSourcesOpen(false)}
      onSelect={selectActive}
      onAdd={addPlaylist}
      onEdit={editPlaylist}
      onRemove={removePlaylist}
      onRefresh={hardRefresh}
    />
  );

  if (sources.length === 0) {
    return (
      <DestinationPage kicker={t("Live TV")} title={t("Live")} icon={<LiveTvIcon />} onBack={onBack}>
        <ConnectIntro kicker={t("Live TV")} onSave={(entry) => addPlaylist(entry)} />
      </DestinationPage>
    );
  }

  const chipGroups = sortedGroups.slice(0, CHIP_GROUPS);
  const activeOffChip = group !== null && !inFavorites && !chipGroups.includes(group);

  return (
    <DestinationPage
      kicker={t("Live TV")}
      title={t("Live")}
      icon={<LiveTvIcon />}
      onBack={onBack}
      actions={
        <SourceButton
          source={activeSource}
          count={playlist?.channels.length ?? null}
          onClick={() => setSourcesOpen(true)}
        />
      }
    >
      <div className="flex flex-col gap-2.5 pb-4">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={
            playlist ? t("Search {n} channels", { n: playlist.channels.length }) : t("Search channels")
          }
        />
        {playlist && sortedGroups.length > 0 && state.kind !== "error" && (
          <ChipRow>
            {favorites.count > 0 && (
              <Chip
                label={t("Favorites")}
                icon={<Star size={12} strokeWidth={0} fill="currentColor" />}
                count={favorites.count}
                active={inFavorites}
                onClick={() => setGroup(FAVORITES_GROUP_KEY)}
              />
            )}
            <Chip label={t("All channels")} active={group === null} onClick={() => setGroup(null)} />
            {activeOffChip && group && (
              <Chip label={group} count={counts.get(group)} active onClick={() => setCategoriesOpen(true)} />
            )}
            {chipGroups.map((g) => (
              <Chip key={g} label={g} count={counts.get(g)} active={group === g} onClick={() => setGroup(g)} />
            ))}
            {sortedGroups.length > CHIP_GROUPS && (
              <Chip
                label={t("All categories")}
                icon={<LayoutGrid size={12} strokeWidth={2.2} />}
                active={false}
                onClick={() => setCategoriesOpen(true)}
              />
            )}
          </ChipRow>
        )}
      </div>

      {state.kind === "error" ? (
        <EmptyBlock
          title={t("Couldn't load this playlist")}
          body={state.message}
          tone="danger"
          action={<PrimaryButton onClick={hardRefresh}>{t("Try again")}</PrimaryButton>}
        />
      ) : state.kind === "loading" && !playlist ? (
        <PosterGridSkeleton count={8} />
      ) : playlist && visible.length === 0 ? (
        <EmptyBlock
          icon={<Tv size={24} strokeWidth={1.6} />}
          title={t("No channels match")}
          body={t("Try a different category or clear your filters.")}
          action={
            <PrimaryButton
              onClick={() => {
                setQuery("");
                setGroup(null);
              }}
            >
              {t("Reset filters")}
            </PrimaryButton>
          }
        />
      ) : (
        <ChannelTiles
          channels={visible}
          epg={epg}
          nowMs={nowMs}
          onPlay={handlePlay}
          onInfo={setDetail}
          resetKey={`${activeId}|${group ?? ""}|${query}`}
        />
      )}

      {categoriesOpen && (
        <BottomSheet title={t("Categories")} subtitle={t("{n} categories", { n: sortedGroups.length })} onClose={() => setCategoriesOpen(false)} tall>
          <div className="flex flex-col">
            {sortedGroups.map((g) => {
              const logo = groupLogos.get(g);
              const active = group === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => {
                    setGroup(g);
                    setCategoriesOpen(false);
                  }}
                  className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-start ${active ? "bg-canvas/50" : "active:bg-canvas/40"}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-canvas/60">
                    {logo ? (
                      <img src={logo} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
                    ) : (
                      <Tv size={14} strokeWidth={1.8} className="text-ink-subtle" />
                    )}
                  </span>
                  <span dir="auto" className={`min-w-0 flex-1 truncate text-[14.5px] ${active ? "font-semibold text-ink" : "text-ink"}`}>
                    {g}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">{counts.get(g) ?? 0}</span>
                </button>
              );
            })}
          </div>
        </BottomSheet>
      )}

      {sheet}
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}

function ChannelTiles({
  channels,
  epg,
  nowMs,
  onPlay,
  onInfo,
  resetKey,
}: {
  channels: IptvChannel[];
  epg: EpgIndex | null;
  nowMs: number;
  onPlay: (ch: IptvChannel) => void;
  onInfo: (meta: Meta) => void;
  resetKey: string;
}) {
  const t = useT();
  const { visible, sentinelRef, hasMore } = useLazyVisible(channels, resetKey);
  const visibleNames = useMemo(() => visible.filter(isHydratableChannel).map((c) => c.name), [visible]);
  const hydrations = useChannelHydration(visibleNames);
  const tvgIdCounts = useMemo(() => computeTvgIdCounts(channels), [channels]);
  const nowMinute = Math.floor(nowMs / 60_000);
  const nowByChannel = useMemo(() => {
    const m = new Map<string, { current: EpgProgram | null; next: EpgProgram | null }>();
    for (const ch of visible) m.set(ch.id, findCurrent(epgProgramsForChannel(ch, epg, tvgIdCounts), nowMs));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, epg, tvgIdCounts, nowMinute]);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {visible.map((ch) => {
          const { current, next } = nowByChannel.get(ch.id) ?? { current: null, next: null };
          return (
            <ChannelTile
              key={ch.id}
              channel={ch}
              current={current}
              next={next}
              now={nowMs}
              hydrated={hydrations.get(ch.name) ?? null}
              onPlay={onPlay}
              onInfo={onInfo}
            />
          );
        })}
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className="flex h-12 items-center justify-center text-[12.5px] text-ink-subtle">
          {t("Loading more channels ({shown} of {total})", {
            shown: visible.length.toLocaleString(),
            total: channels.length.toLocaleString(),
          })}
        </div>
      ) : channels.length > visible.length ? (
        <p className="rounded-xl border border-edge-soft/55 bg-elevated/60 px-4 py-2.5 text-center text-[12px] text-ink-subtle">
          {t("Showing first {shown} of {total} channels. Use search or a category to narrow down.", {
            shown: visible.length.toLocaleString(),
            total: channels.length.toLocaleString(),
          })}
        </p>
      ) : null}
    </div>
  );
}

function formatRemaining(t: ReturnType<typeof useT>, ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m ? t("{h}h {m}m left", { h, m }) : t("{h}h left", { h });
  }
  return t("{m}m left", { m: Math.max(1, totalMin) });
}

function ChannelTile({
  channel,
  current,
  next,
  now,
  hydrated,
  onPlay,
  onInfo,
}: {
  channel: IptvChannel;
  current: EpgProgram | null;
  next: EpgProgram | null;
  now: number;
  hydrated: Meta | null;
  onPlay: (ch: IptvChannel) => void;
  onInfo: (meta: Meta) => void;
}) {
  const t = useT();
  const favorites = useFavorites();
  const isFav = favorites.has(channel.id);
  const [errored, setErrored] = useState(false);
  const posterUrl = hydrated?.poster && !errored ? hydrated.poster : null;
  const logoUrl = !posterUrl && channel.logo && !errored ? channel.logo : null;
  const displayName = hydrated?.name?.trim() || channel.name;
  const progress =
    current && current.endMs > current.startMs
      ? Math.max(0, Math.min(1, (now - current.startMs) / (current.endMs - current.startMs)))
      : null;
  const timeLeft = current && current.endMs > now ? formatRemaining(t, current.endMs - now) : null;
  // A long press on the artwork opens the hydrated detail when the channel
  // matched a title; a tap plays. The star is always visible on touch.
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const startPress = () => {
    if (!hydrated) return;
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      onInfo(hydrated);
    }, 480);
  };
  const endPress = () => {
    if (pressTimer.current != null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  return (
    <div
      className="relative flex flex-col overflow-hidden rounded-2xl border border-edge-soft/55 bg-elevated"
      style={{ contentVisibility: "auto", containIntrinsicSize: posterUrl ? "180px 230px" : "180px 170px" }}
    >
      <button
        type="button"
        onClick={() => {
          if (longPressed.current) {
            longPressed.current = false;
            return;
          }
          onPlay(channel);
        }}
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerCancel={endPress}
        onPointerLeave={endPress}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={t("Play {name}", { name: displayName })}
        className="flex w-full flex-col items-stretch text-start"
      >
        <div className={`relative flex items-center justify-center ${posterUrl ? "h-[132px] bg-canvas" : "h-[84px] bg-surface/70 p-3"}`}>
          {posterUrl ? (
            <>
              <img
                src={posterUrl}
                alt=""
                draggable={false}
                loading="lazy"
                onError={() => setErrored(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-canvas/85 via-canvas/0 to-transparent" />
            </>
          ) : logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              draggable={false}
              loading="lazy"
              onError={() => setErrored(true)}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg bg-canvas/40 text-ink-subtle">
              <Tv size={20} strokeWidth={1.7} />
            </div>
          )}
          <span className="absolute start-2 top-2 flex h-5 items-center gap-1 rounded-full bg-canvas/90 px-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-danger">
            <span className="h-1.5 w-1.5 rounded-full bg-danger" />
            {t("Live")}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-1 px-3 pb-2.5 pt-2">
          <div dir="auto" className="truncate text-[13.5px] font-semibold leading-tight text-ink">
            {displayName}
          </div>
          {current ? (
            <>
              <div dir="auto" className="truncate text-[12px] leading-tight text-ink-muted">
                {current.title}
              </div>
              {progress != null && (
                <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-canvas/55">
                  <div className="h-full rounded-full bg-danger" style={{ width: `${progress * 100}%` }} />
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-ink-subtle">
                <span className="min-w-0 truncate">
                  {next ? (
                    <>
                      <span className="font-medium text-ink-subtle/80">{t("Next:")} </span>
                      {next.title}
                    </>
                  ) : null}
                </span>
                {timeLeft && <span className="shrink-0 font-medium">{timeLeft}</span>}
              </div>
            </>
          ) : (
            <div dir="auto" className="truncate text-[12px] text-ink-subtle">
              {channel.group ?? t("No program info")}
            </div>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          favorites.toggle(channel);
        }}
        aria-label={isFav ? t("Remove from favorites") : t("Add to favorites")}
        aria-pressed={isFav}
        className={`absolute end-0 top-0 flex h-11 w-11 items-center justify-center ${
          isFav ? "text-accent" : "text-white/80"
        }`}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas/60 backdrop-blur-md">
          <Star size={14} strokeWidth={isFav ? 0 : 1.9} fill={isFav ? "currentColor" : "none"} />
        </span>
      </button>
    </div>
  );
}
