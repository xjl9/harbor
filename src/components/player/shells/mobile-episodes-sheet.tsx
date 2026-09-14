import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HarborLoader } from "@/components/harbor-loader";
import { EpisodeRow } from "@/components/player/episode-panel/episode-row";
import { QueueUpNext } from "@/components/player/episode-panel/queue-up-next";
import { StreamsView } from "@/components/player/episode-panel/streams-view";
import { useSeasonBrowser } from "@/components/player/episode-panel/use-season-browser";
import { invalidatePreparedDebridLink } from "@/lib/debrid/playback-preparation";
import { useDebridClients } from "@/lib/debrid/registry";
import { useT } from "@/lib/i18n";
import { playLocalAware } from "@/lib/local-library/playback";
import { localPlayerSrc } from "@/lib/local-library/player-src";
import {
  beginPlaybackTrace,
  finishPlaybackTrace,
  markPlaybackTrace,
} from "@/lib/perf/playback-trace";
import { haptics } from "@/lib/player/haptics";
import { parseKitsuId } from "@/lib/providers/kitsu";
import { useQueue } from "@/lib/queue";
import { useSettings } from "@/lib/settings";
import { spoilerMaskFor } from "@/lib/spoilers";
import { registerStreamProxy, unregisterStreamProxy } from "@/lib/stream-proxy";
import { splitFranchiseDisplaySeason } from "@/lib/streams/anime-identity-core";
import { preflightCheck } from "@/lib/streams/preflight";
import { resolveStream } from "@/lib/streams/resolve";
import type { ScoredStream } from "@/lib/streams/types";
import { useTogether } from "@/lib/together/provider";
import { useView, type PlayEpisode } from "@/lib/view";
import { MobileSheet } from "./mobile-sheet";

const RESOLVE_TIMEOUT_MS = 150_000;

function displayEpLabel(ep: PlayEpisode, metaId?: string): string {
  const part =
    splitFranchiseDisplaySeason(parseKitsuId(ep.kitsuStreamId ?? "")) ??
    splitFranchiseDisplaySeason(parseKitsuId(metaId ?? ""));
  if (part != null) return `S${part} · E${String(ep.episode).padStart(2, "0")}`;
  return `S${ep.imdbSeason ?? ep.season} · E${String(ep.imdbEpisode ?? ep.episode).padStart(2, "0")}`;
}

function sameEpisode(a: PlayEpisode, b: PlayEpisode): boolean {
  if (a.kitsuStreamId && b.kitsuStreamId) return a.kitsuStreamId === b.kitsuStreamId;
  return (
    (a.imdbSeason ?? a.season) === (b.imdbSeason ?? b.season) &&
    (a.imdbEpisode ?? a.episode) === (b.imdbEpisode ?? b.episode)
  );
}

// The episode panel as a phone bottom sheet. The desktop EpisodePanel is a
// 440px side drawer with a hover dropdown for seasons; on a phone that drawer
// covers the whole picture in portrait and the dropdown clips against the bottom
// edge. Same data (useSeasonBrowser, the queue, StreamsView) and the same play
// path (local copy first, instant play or a manual stream pick with the same
// resolve and preflight), with seasons as a thumb-reachable chip row.
export function MobileEpisodesSheet({
  open,
  onClose,
  onRestart,
}: {
  open: boolean;
  onClose: () => void;
  onRestart: () => void;
}) {
  const { player } = useView();
  if (!player || player.meta.type !== "series") return null;
  return (
    <EpisodesSheetBody
      open={open}
      onClose={onClose}
      onRestart={onRestart}
      meta={player.meta}
      currentEpisode={player.episode}
    />
  );
}

function EpisodesSheetBody({
  open,
  onClose,
  onRestart,
  meta,
  currentEpisode,
}: {
  open: boolean;
  onClose: () => void;
  onRestart: () => void;
  meta: NonNullable<ReturnType<typeof useView>["player"]>["meta"];
  currentEpisode: PlayEpisode | undefined;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const { openPicker, replacePlayerSrc } = useView();
  const { snapshot, clientId } = useTogether();
  // A guest follows the host's episode; the list stays readable but inert, the
  // same rule the desktop panel applies.
  const roomGuest =
    snapshot.state === "joined" && !!snapshot.hostClientId && snapshot.hostClientId !== clientId;
  const queue = useQueue();
  const debrids = useDebridClients();
  const { seasons, season, setSeason, episodes, loading, imdbRatings } = useSeasonBrowser(
    meta,
    currentEpisode,
    open,
  );
  const nextSeason = seasons.find((n) => n > season);
  const listRef = useRef<HTMLDivElement>(null);
  const [expandedEp, setExpandedEp] = useState<string | null>(null);
  const [pickingFor, setPickingFor] = useState<PlayEpisode | null>(null);
  const [resolvingFor, setResolvingFor] = useState<PlayEpisode | null>(null);
  const [showEpsOpen, setShowEpsOpen] = useState(false);
  const resolveAcRef = useRef<AbortController | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [season]);
  useEffect(() => {
    if (!resolvingFor) return;
    const id = window.setTimeout(() => {
      resolveAcRef.current?.abort();
      setResolvingFor(null);
    }, RESOLVE_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [resolvingFor]);
  useEffect(() => () => resolveAcRef.current?.abort(), []);
  useEffect(() => {
    if (open) return;
    setExpandedEp(null);
    setPickingFor(null);
    resolveAcRef.current?.abort();
    setResolvingFor(null);
  }, [open]);

  const hasQueue = queue.length > 0;
  const followQueue = settings.queueDrivesNav && hasQueue;
  const manualMode = !settings.instantPlay;

  const handlePlay = (ep: PlayEpisode) => {
    if (roomGuest) return;
    haptics.select();
    const streamFlow = () => {
      if (manualMode) {
        setPickingFor(ep);
      } else {
        onClose();
        openPicker(meta, ep, { autoPlay: true });
      }
    };
    playLocalAware({
      meta,
      episode: ep,
      mode: settings.localPlaybackMode,
      source: "manual",
      playLocal: (e, o) => {
        onClose();
        replacePlayerSrc({ ...localPlayerSrc(e, undefined, ep), startFromZero: o?.fromStart });
      },
      playStream: streamFlow,
      setMode: (m) => update({ localPlaybackMode: m }),
    });
  };

  // The desktop panel's manual pick, step for step: resolve with the episode
  // hint, proxy when the debrid needs headers, preflight unless the resolver
  // already validated the exact URL, and drop a stub so it is not reused.
  const handlePickStream = async (stream: ScoredStream) => {
    if (!pickingFor || roomGuest) return;
    if (!stream.url && stream.externalUrl) return;
    const ep = pickingFor;
    const playbackTraceId = beginPlaybackTrace(
      stream.url ? "direct" : debrids.length > 0 ? "debrid" : "p2p",
    );
    let traceTransferred = false;
    let proxySessionId: string | undefined;
    let proxyTransferred = false;
    markPlaybackTrace(playbackTraceId, "resolve-start");
    resolveAcRef.current?.abort();
    const ac = new AbortController();
    resolveAcRef.current = ac;
    setResolvingFor(ep);
    try {
      const hint = { season: ep.season ?? null, episode: ep.episode ?? null };
      const r = await resolveStream(stream, debrids, ac.signal, true, false, hint);
      if (ac.signal.aborted) return;
      if (!r.ok) {
        setResolvingFor(null);
        return;
      }
      markPlaybackTrace(playbackTraceId, "resolve-ready");
      let playUrl = r.data.url;
      if (r.data.headers && Object.keys(r.data.headers).length > 0) {
        try {
          const proxied = await registerStreamProxy(r.data.url, r.data.headers);
          playUrl = proxied.url;
          proxySessionId = proxied.sessionId;
        } catch {
          setResolvingFor(null);
          return;
        }
      }
      const skipPreflight =
        r.via === "p2p" ||
        r.via === "direct" ||
        r.via === "local-download" ||
        r.readiness?.exactUrlValidated === true;
      if (!skipPreflight) markPlaybackTrace(playbackTraceId, "preflight-start");
      const preflight = skipPreflight
        ? ({ ok: true } as const)
        : await preflightCheck(playUrl).catch(() => ({ ok: true }) as const);
      if (!skipPreflight) markPlaybackTrace(playbackTraceId, "preflight-ready");
      if (!preflight.ok && preflight.reason === "stub") {
        const preparedDebrid = debrids.find((debrid) => debrid.slug === r.via);
        if (preparedDebrid) invalidatePreparedDebridLink(stream, preparedDebrid, hint);
        setResolvingFor(null);
        return;
      }
      replacePlayerSrc({
        meta,
        episode: ep,
        url: playUrl,
        title: stream.parsedTitle ?? stream.title ?? stream.name ?? meta.name,
        notWebReady: !stream.url && !!stream.infoHash,
        playbackTraceId,
        proxySessionId,
        historyUrl: r.data.url,
        subtitles: [],
        streamRef: {
          resolvedFilename:
            r.data.filename ?? stream.behaviorHints?.filename ?? stream.behaviorHints?.fileName ?? null,
          infoHash: stream.infoHash ?? null,
          fileIdx: r.data.fileIdx ?? stream.fileIdx ?? null,
          addonId: stream.addonId ?? null,
          title: stream.title ?? null,
          parsedTitle: stream.parsedTitle ?? null,
          resolution: stream.resolution ?? null,
          source: stream.source ?? null,
          size: stream.size ?? null,
        },
      });
      markPlaybackTrace(playbackTraceId, "player-opened");
      traceTransferred = true;
      proxyTransferred = true;
      onClose();
    } catch {
      setResolvingFor(null);
    } finally {
      if (proxySessionId && !proxyTransferred) {
        void unregisterStreamProxy(proxySessionId).catch(() => {});
      }
      if (!traceTransferred) finishPlaybackTrace(playbackTraceId, "failed");
    }
  };

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title={pickingFor ? undefined : meta.name}
      heightClass="h-[88vh]"
    >
      {resolvingFor && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center backdrop-blur-md">
          <HarborLoader size="md" caption={t("Connecting")} />
          <p className="text-[14px] text-white/80">
            {t("Loading {label}", {
              label: `${displayEpLabel(resolvingFor, meta.id)}${resolvingFor.name ? ` · ${resolvingFor.name}` : ""}`,
            })}
          </p>
          <button
            type="button"
            onClick={() => {
              resolveAcRef.current?.abort();
              setResolvingFor(null);
            }}
            className="h-11 rounded-xl border border-white/20 bg-white/10 px-5 text-[14px] font-semibold text-white active:bg-white/20"
          >
            {t("Cancel")}
          </button>
        </div>
      )}

      {pickingFor ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <StreamsView
            meta={meta}
            episode={pickingFor}
            onBack={() => setPickingFor(null)}
            onClose={onClose}
            onPick={handlePickStream}
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-2.5 px-4 pb-2">
            {currentEpisode && (
              <p className="truncate text-[13px] text-ink-subtle">
                {t("Now playing: {label}", {
                  label: `${displayEpLabel(currentEpisode, meta.id)}${currentEpisode.name ? ` · ${currentEpisode.name}` : ""}`,
                })}
              </p>
            )}
            {hasQueue && (
              <div
                role="group"
                aria-label={t("Next and Previous behavior")}
                className="grid grid-cols-2 gap-1 rounded-full bg-raised p-1"
              >
                {[
                  { on: true, label: t("Queue") },
                  { on: false, label: t("This show") },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    aria-pressed={settings.queueDrivesNav === o.on}
                    onClick={() => update({ queueDrivesNav: o.on })}
                    className={`h-9 rounded-full text-[13.5px] font-semibold transition-colors ${
                      settings.queueDrivesNav === o.on ? "bg-ink text-canvas" : "text-ink-muted"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            {seasons.length > 1 && (!followQueue || showEpsOpen) && (
              <div
                role="tablist"
                className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {seasons.map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="tab"
                    aria-selected={n === season}
                    onClick={() => {
                      haptics.light();
                      setSeason(n);
                    }}
                    className={`flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors ${
                      n === season ? "bg-ink text-canvas" : "bg-raised text-ink-muted"
                    }`}
                  >
                    {n === 0 ? t("Specials") : t("Season {n}", { n })}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
            {hasQueue && followQueue && (
              <QueueUpNext meta={meta} currentEpisode={currentEpisode} roomGuest={roomGuest} onClose={onClose} />
            )}
            {followQueue && (
              <button
                type="button"
                onClick={() => setShowEpsOpen((v) => !v)}
                aria-expanded={showEpsOpen}
                className="mt-4 flex min-h-11 w-full items-center justify-between border-t border-edge-soft/60 px-1 pt-3 text-[11.5px] font-bold uppercase tracking-[0.2em] text-ink-subtle"
              >
                {t("This show")}
                <ChevronRight
                  size={16}
                  strokeWidth={2.4}
                  className={`transition-transform ${showEpsOpen ? "rotate-90" : ""}`}
                />
              </button>
            )}
            {(!followQueue || showEpsOpen) && (
              <div className={followQueue ? "mt-3" : "mt-1"}>
                {loading && episodes.length === 0 && (
                  <div className="flex items-center justify-center py-16">
                    <HarborLoader size="sm" />
                  </div>
                )}
                {!loading && episodes.length === 0 && (
                  <p className="px-2 py-10 text-center text-[14px] text-ink-muted">
                    {t("No episodes found for this season.")}
                  </p>
                )}
                {episodes.length > 0 && (
                  <div className="flex flex-col gap-2.5">
                    {episodes.map((ep) => {
                      const key = `${ep.season}:${ep.episode}`;
                      const isCurrent = !!currentEpisode && sameEpisode(ep, currentEpisode);
                      return (
                        <EpisodeRow
                          key={key}
                          episode={ep}
                          metaId={meta.id}
                          imdbRating={imdbRatings.get(key)}
                          expanded={expandedEp === key}
                          onToggle={() => setExpandedEp((cur) => (cur === key ? null : key))}
                          onPlay={() => {
                            if (isCurrent) {
                              if (roomGuest) return;
                              onRestart();
                              onClose();
                            } else {
                              handlePlay(ep);
                            }
                          }}
                          isCurrent={isCurrent}
                          spoiler={spoilerMaskFor(settings, { watched: isCurrent, isNextUp: false })}
                        />
                      );
                    })}
                  </div>
                )}
                {!loading && nextSeason !== undefined && (
                  <button
                    type="button"
                    onClick={() => setSeason(nextSeason)}
                    className="mt-3 flex min-h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-elevated px-4 text-[14px] font-semibold text-ink ring-1 ring-edge-soft active:bg-raised"
                  >
                    {t("Season {n}", { n: nextSeason })}
                    <ChevronRight size={16} strokeWidth={2.4} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </MobileSheet>
  );
}
