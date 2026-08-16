import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, Check, Download, Eye, Film, Monitor, MonitorPlay, MoreHorizontal, Play } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import type { TmdbDetail } from "@/lib/providers/tmdb";
import type { RemoteLibraryAction, RemoteTrackers } from "@/lib/remote/protocol";
import { resolveTrailerId } from "@/lib/trailer";
import { isMobileNative, isRemoteRoute } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { useDownloads } from "@/lib/download/downloads-store";
import { useMobileRemote } from "../mobile-remote";
import { HIDE_SCROLL, useReducedMotion, useSheetExit } from "./data";
import { MobileTrailerOverlay } from "./trailer";
import { Group, SheetRow } from "./sheet-ui";
import { TrackGroup } from "./track-group";
import { useLibraryToggles } from "./library-actions";

export function DetailActions({
  meta,
  detail,
  title,
  trailerId,
  onPlay,
}: {
  meta: Meta;
  detail: TmdbDetail | null;
  title: string;
  trailerId: string | null;
  onPlay: () => void;
}) {
  const { settings } = useSettings();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [trailer, setTrailer] = useState<string | null>(trailerId);

  useEffect(() => {
    setTrailer(trailerId);
    if (trailerId || !settings.tmdbKey) return;
    let alive = true;
    resolveTrailerId(meta, settings.tmdbKey)
      .then((id) => {
        if (alive && id) setTrailer(id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [trailerId, meta.id, settings.tmdbKey]);

  return (
    <>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onPlay}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[15.5px] font-semibold text-canvas shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]"
        >
          <Play size={18} strokeWidth={0} fill="currentColor" />
          Play
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="More actions"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-surface text-ink"
        >
          <MoreHorizontal size={20} strokeWidth={2} />
        </button>
      </div>
      {sheetOpen && (
        <ActionsSheet
          meta={meta}
          detail={detail}
          title={title}
          trailerId={trailer}
          // The trailer opens on the tap, not after the sheet has finished
          // leaving; the sheet dismisses itself underneath the overlay that is
          // already covering it, so neither one is waiting on the other.
          onPlayTrailer={() => setTrailerOpen(true)}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {trailerOpen && trailer && (
        <MobileTrailerOverlay id={trailer} title={title} onClose={() => setTrailerOpen(false)} />
      )}
    </>
  );
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function syncHint(trackers: RemoteTrackers | undefined): string | undefined {
  if (!trackers) return undefined;
  const names: string[] = [];
  if (trackers.trakt) names.push("Trakt");
  if (trackers.simkl) names.push("Simkl");
  return names.length ? `Syncs to your ${joinAnd(names)}` : undefined;
}

function ActionsSheet({
  meta,
  detail,
  title,
  trailerId,
  onPlayTrailer,
  onClose,
}: {
  meta: Meta;
  detail: TmdbDetail | null;
  title: string;
  trailerId: string | null;
  onPlayTrailer: () => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const { leaving, close } = useSheetExit(onClose);
  const { sendToHost, castPlay, sendCommand, connected, snapshot } = useMobileRemote();
  const { openPicker } = useView();
  const downloads = useDownloads();
  const poster = meta.poster ?? detail?.poster;
  const imdbId = detail?.imdbId;
  const library = snapshot.library;
  const trackers = snapshot.trackers;

  const online = connected && (!snapshot.idle || !!library || !!trackers);
  const isAnime = /^(kitsu|mal|anilist|anidb):/.test(meta.id);
  const isSeriesLike = meta.type === "series" || detail?.kind === "tv";
  // Offline downloads run through the same on-device engine the desktop uses;
  // it needs the native filesystem, so the affordance is native-only. Series
  // download per episode (in the episode list), so the sheet-level row is for
  // single-file titles (movies) only.
  const canDownload = isMobileNative() && !isSeriesLike && !isAnime;
  const movieDownload = canDownload
    ? downloads.find((d) => d.metaId === meta.id && d.season == null)
    : undefined;

  const send = (op: RemoteLibraryAction) =>
    sendCommand({
      action: "libraryAction",
      metaId: meta.id,
      metaType: meta.type,
      name: title || meta.name,
      poster,
      imdbId,
      op,
    });

  // The browser remote page exists to drive a computer and keeps no library of
  // its own; every other phone surface owns the on-device stores the library
  // tab reads, so it can write them with nothing connected.
  const rows = useLibraryToggles({
    meta,
    title,
    poster,
    imdbId,
    remote: online,
    library,
    canWriteLocal: !isRemoteRoute(),
    send,
  });

  const sync = online ? syncHint(trackers) : undefined;

  const dlStatus = movieDownload?.status;
  const dlActive = dlStatus === "downloading" || dlStatus === "paused";
  const dlDone = dlStatus === "done";
  const dlFailed = dlStatus === "error" || dlStatus === "interrupted";
  const dlLabel = dlDone
    ? "Saved offline"
    : dlStatus === "paused"
      ? "Download paused"
      : dlStatus === "downloading"
        ? "Downloading…"
        : "Download";
  const dlSub = dlDone
    ? "Available without internet"
    : dlStatus === "paused"
      ? "Resume it from Downloads"
      : dlStatus === "downloading"
        ? `${Math.round((movieDownload?.ratio ?? 0) * 100)}%`
        : dlFailed
          ? "Didn't finish · tap to try again"
          : "Save this movie to watch offline";
  const onDownload = () => {
    if (dlActive || dlDone) {
      close();
      return;
    }
    openPicker(meta, undefined, { intent: "download" });
    close();
  };

  const sheet = (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className={`absolute inset-0 bg-black/50 ${
          reduced ? "" : leaving ? "md-sheet-fade-out" : "md-sheet-fade"
        }`}
      />
      <div
        className={`relative max-h-[82vh] overflow-y-auto rounded-t-3xl bg-canvas ${HIDE_SCROLL} ${
          reduced ? "" : leaving ? "md-sheet-out" : "md-sheet-in"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
      >
        <div className="sticky top-0 z-10 flex flex-col items-center gap-2 bg-canvas pb-2 pt-3">
          <span className="h-1 w-9 rounded-full bg-edge" />
          <p className="max-w-[80%] truncate px-4 text-[13.5px] font-semibold text-ink">{title}</p>
        </div>

        <div className="flex flex-col px-3 pb-1">
          {trailerId && (
            <SheetRow
              icon={<Film size={20} strokeWidth={2} />}
              label="Play trailer"
              onClick={() => {
                onPlayTrailer();
                close();
              }}
            />
          )}
          {canDownload && (
            <SheetRow
              icon={<Download size={20} strokeWidth={2} />}
              label={dlLabel}
              sublabel={dlSub}
              active={dlDone}
              trailing={
                dlDone ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined
              }
              onClick={onDownload}
            />
          )}
          {connected && (
            // Only offer cross-device actions when a computer is actually
            // connected — otherwise a row promises a send that can't happen.
            <>
              <SheetRow
                icon={<MonitorPlay size={20} strokeWidth={2} />}
                label="Play on computer"
                sublabel="Start this title on your connected Harbor app"
                onClick={() => {
                  castPlay(meta);
                  close();
                }}
              />
              <SheetRow
                icon={<Monitor size={20} strokeWidth={2} />}
                label="Open on computer"
                sublabel="Send this title to your Harbor app"
                onClick={() => {
                  sendToHost(meta);
                  close();
                }}
              />
            </>
          )}
        </div>

        <Group label="Your library">
          <SheetRow
            icon={<HeartIcon filled={rows.favorite.on} />}
            label="Favorites"
            sublabel={rows.favorite.on ? "Saved to your favorites" : "Save to your favorites"}
            active={rows.favorite.on}
            disabled={rows.favorite.disabled}
            trailing={
              rows.favorite.on ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined
            }
            onClick={rows.favorite.toggle}
          />
          <SheetRow
            icon={<Bookmark size={20} strokeWidth={2} fill={rows.watchlist.on ? "currentColor" : "none"} />}
            label="Watchlist"
            sublabel={rows.watchlist.on ? "In your watchlist" : "Add to your watchlist"}
            hint={sync}
            active={rows.watchlist.on}
            disabled={rows.watchlist.disabled}
            trailing={
              rows.watchlist.on ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined
            }
            onClick={rows.watchlist.toggle}
          />
          <SheetRow
            icon={<Eye size={20} strokeWidth={2} />}
            label="Watched"
            sublabel={rows.watched.on ? "Marked as watched" : "Mark as watched"}
            hint={sync}
            active={rows.watched.on}
            disabled={rows.watched.disabled}
            trailing={
              rows.watched.on ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined
            }
            onClick={rows.watched.toggle}
          />
          {rows.needsComputer && (
            <div className="flex items-center justify-center gap-2 px-6 pb-1 pt-1.5 text-center text-[12px] leading-relaxed text-ink-subtle">
              <Monitor size={14} strokeWidth={2} className="shrink-0" />
              <span>Connect to your computer to manage your library.</span>
            </div>
          )}
        </Group>

        {online && trackers && (
          <TrackGroup
            trackers={trackers}
            isAnime={isAnime}
            isSeriesLike={isSeriesLike}
            reduced={reduced}
            send={send}
          />
        )}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(sheet, document.body) : sheet;
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}
