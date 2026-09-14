import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  CalendarClock,
  Check,
  Monitor,
  MonitorPlay,
  MoreHorizontal,
  Plus,
  RotateCw,
  Share,
  X,
} from "lucide-react";
import anilistLogo from "@/assets/anilist.png";
import malLogo from "@/assets/mal.png";
import simklLogo from "@/assets/simkl.png";
import { Play } from "@/components/icons/play-filled";
import { UiIcon } from "@/components/ui-icon";
import { RatingModal } from "@/components/ratings/rating-modal";
import { emitListToast } from "@/components/lists/list-toast";
import type { Meta } from "@/lib/cinemeta";
import { daysFromTodayLocal, formatAirDate } from "@/lib/dates";
import { readResumeMs } from "@/lib/resume";
import type { TmdbDetail } from "@/lib/providers/tmdb";
import type { RemoteLibraryAction } from "@/lib/remote/protocol";
import { resolveTrailerId } from "@/lib/trailer";
import { isMobileNative, isRemoteRoute } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import { useOnboarding } from "@/lib/onboarding";
import { cancelDownload, useDownloads } from "@/lib/download/downloads-store";
import type { ListItemInput } from "@/lib/custom-lists";
import { useReminder } from "@/lib/reminders";
import { useRating } from "@/lib/ratings/store";
import { ratingTarget } from "@/lib/ratings/types";
import { useTogether } from "@/lib/together/provider";
import { useAnilist } from "@/lib/anilist/provider";
import {
  deleteListEntry as anilistDelete,
  fetchListEntry as anilistFetch,
  saveListEntry as anilistSave,
} from "@/lib/anilist/mutations";
import { resolveAnilistMediaId } from "@/lib/anilist/sync";
import type { MediaListStatus } from "@/lib/anilist/types";
import { useMal } from "@/lib/mal/provider";
import {
  deleteListEntry as malDelete,
  fetchListEntry as malFetch,
  resolveMalMediaId,
  saveListEntry as malSave,
} from "@/lib/mal/mutations";
import type { MalListStatus } from "@/lib/mal/types";
import { useSimkl } from "@/lib/simkl/provider";
import { resolveSimklTarget } from "@/lib/simkl/ids";
import {
  clearSimklStatus,
  loadSimklStatusMap,
  MOVIE_STATUS_ORDER,
  setSimklStatus,
  SHOW_STATUS_ORDER,
  SIMKL_STATUS_LABELS,
  statusForId,
  type WatchlistStatus,
} from "@/lib/simkl/list-status";
import type { SimklTarget } from "@/lib/simkl/types";
import { useMobileRemote } from "../mobile-remote";
import { requestMobileIntent } from "../mobile-intent";
import { HIDE_SCROLL, useReducedMotion, useSheetExit } from "./data";
import { MobileTrailerOverlay } from "./trailer";
import { Group, SheetRow } from "./sheet-ui";
import { TrackGroup } from "./track-group";
import { useLibraryToggles, type LibraryToggles } from "./library-actions";
import {
  ListPickerSheet,
  ReminderSheet,
  SimklRatingRow,
  TogetherSheet,
  TrackerSheet,
  type ReminderSeed,
  type TrackerOption,
} from "./action-sheets";

type OpenSheet = "more" | "list" | "reminder" | "together" | "rate" | null;

export function DetailActions({
  meta,
  detail,
  title,
  logo,
  trailerId,
  onPlay,
  playLabel,
  upcoming,
  isAnime,
  isSeries,
  trackerId,
}: {
  meta: Meta;
  detail: TmdbDetail | null;
  title: string;
  logo?: string;
  trailerId: string | null;
  onPlay: () => void;
  playLabel: string;
  upcoming: boolean;
  isAnime: boolean;
  isSeries: boolean;
  // The id trackers key on: the canonical kitsu id for anime, else the meta id.
  trackerId: string;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { sendCommand, connected, snapshot } = useMobileRemote();
  const [open, setOpen] = useState<OpenSheet>(null);
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

  const poster = meta.poster ?? detail?.poster;
  const imdbId = detail?.imdbId;
  const library = snapshot.library;
  const trackers = snapshot.trackers;
  const online = connected && (!snapshot.idle || !!library || !!trackers);

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

  const listSeed: ListItemInput = useMemo(
    () => ({ id: meta.id, type: meta.type, name: title || meta.name, poster }),
    [meta.id, meta.type, title, meta.name, poster],
  );
  const reminderSeed: ReminderSeed = useMemo(
    () => ({ id: meta.id, type: "series", name: title || meta.name, poster }),
    [meta.id, title, meta.name, poster],
  );
  const reminderOn = !!useReminder(meta.id);
  const { snapshot: room } = useTogether();
  const inSession = room.state === "joined";
  const target = useMemo(
    () =>
      ratingTarget(
        { id: meta.id, name: title || meta.name, poster },
        isAnime ? "anime" : isSeries ? "series" : "movie",
      ),
    [meta.id, title, meta.name, poster, isAnime, isSeries],
  );
  const myRating = useRating(target.itemKey)?.score ?? 0;

  // Offline downloads run through the same on-device engine the desktop uses;
  // it needs the native filesystem, so the affordance is native-only. Series
  // download per episode (in the episode list), so the title-level control is
  // for single-file titles (movies) only.
  const canDownload = isMobileNative() && !isSeries && !isAnime;
  const showWatched = settings.showWatchedButton && meta.type === "movie";
  const showReminder = isSeries || isAnime;
  const trackerType: "movie" | "series" = isSeries || isAnime ? "series" : "movie";
  // The system share sheet, where the webview exposes one. The link is the
  // public page for the title (IMDb first, TMDB otherwise) so it opens anywhere.
  const shareId = detail?.imdbId ?? (meta.id.startsWith("tt") ? meta.id : null);
  const shareUrl =
    typeof navigator !== "undefined" && typeof navigator.share === "function"
      ? shareId
        ? `https://www.imdb.com/title/${shareId}/`
        : detail
          ? `https://www.themoviedb.org/${detail.kind}/${detail.id}`
          : null
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        {upcoming ? (
          <UpcomingButton detail={detail} onTry={onPlay} />
        ) : (
          <button
            type="button"
            onClick={onPlay}
            className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[15.5px] font-semibold text-canvas shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]"
          >
            <Play size={18} strokeWidth={0} fill="currentColor" className="shrink-0" />
            <span className="truncate">{playLabel}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen("more")}
          aria-label={t("More actions")}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-edge-soft bg-surface text-ink"
        >
          <MoreHorizontal size={20} strokeWidth={2} />
          {rows.favorite.on && (
            <span className="absolute end-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-accent" />
          )}
        </button>
      </div>

      {!upcoming && <PlayModeNote />}

      {/* Same actions as the desktop hero row, one labeled 44pt circle each,
          scrolling sideways when a title carries more than the width holds. */}
      <div className={`-mx-5 flex gap-0.5 overflow-x-auto px-4 pb-1 ${HIDE_SCROLL}`}>
        <ActionChip
          label={rows.watchlist.on ? t("In Watchlist") : t("Watchlist")}
          active={rows.watchlist.on}
          disabled={rows.watchlist.disabled}
          onClick={rows.watchlist.toggle}
        >
          {rows.watchlist.on ? (
            <Check size={20} strokeWidth={2.4} />
          ) : (
            <Plus size={20} strokeWidth={2.2} />
          )}
        </ActionChip>
        {isAnime && <AnilistChip harborId={trackerId} />}
        {isAnime && <MalChip harborId={trackerId} />}
        <SimklChip harborId={trackerId} type={trackerType} />
        <ActionChip
          label={myRating ? t("Your rating {n}/10", { n: myRating }) : t("Rate this")}
          active={myRating > 0}
          onClick={() => setOpen("rate")}
        >
          {myRating ? (
            <span className="text-[16px] font-bold leading-none tabular-nums">{myRating}</span>
          ) : (
            <UiIcon name="rate" className="h-5 w-5" />
          )}
        </ActionChip>
        <ActionChip
          label={rows.favorite.on ? t("Favorited") : t("Favorite")}
          active={rows.favorite.on}
          disabled={rows.favorite.disabled}
          onClick={rows.favorite.toggle}
        >
          <UiIcon name={rows.favorite.on ? "unfavorite" : "favorite"} className="h-5 w-5" />
        </ActionChip>
        <ActionChip label={t("Add to list")} onClick={() => setOpen("list")}>
          <UiIcon name="list" className="h-5 w-5" />
        </ActionChip>
        {showWatched && (
          <ActionChip
            label={rows.watched.on ? t("Marked watched") : t("Mark watched")}
            active={rows.watched.on}
            disabled={rows.watched.disabled}
            onClick={rows.watched.toggle}
          >
            <UiIcon name={rows.watched.on ? "mark-unwatched" : "mark-watched"} className="h-5 w-5" />
          </ActionChip>
        )}
        {trailer && (
          <ActionChip label={t("Watch trailer")} onClick={() => setTrailerOpen(true)}>
            <UiIcon name="trailer" className="h-5 w-5" />
          </ActionChip>
        )}
        {canDownload && <DownloadChip meta={meta} />}
        {showReminder && (
          <ActionChip
            label={reminderOn ? t("Reminder on") : t("Remind me")}
            active={reminderOn}
            onClick={() => setOpen("reminder")}
          >
            <UiIcon name="remindme" className="h-5 w-5" />
          </ActionChip>
        )}
        <ActionChip
          label={t("Watch together")}
          active={inSession}
          onClick={() => setOpen("together")}
        >
          <UiIcon name="watch-together" className="h-5 w-5" />
        </ActionChip>
      </div>

      {open === "more" && (
        <ActionsSheet
          meta={meta}
          title={title}
          trailerId={trailer}
          rows={rows}
          online={online}
          isAnime={isAnime}
          isSeriesLike={isSeries || isAnime}
          canDownload={canDownload}
          showWatched={showWatched}
          showReminder={showReminder}
          reminderOn={reminderOn}
          shareUrl={shareUrl}
          send={send}
          // The trailer opens on the tap, not after the sheet has finished
          // leaving; the sheet dismisses itself underneath the overlay that is
          // already covering it, so neither one is waiting on the other.
          onPlayTrailer={() => setTrailerOpen(true)}
          onOpen={(next) => setOpen(next)}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "list" && <ListPickerSheet item={listSeed} onClose={() => setOpen(null)} />}
      {open === "reminder" && <ReminderSheet seed={reminderSeed} onClose={() => setOpen(null)} />}
      {open === "together" && <TogetherSheet onClose={() => setOpen(null)} />}
      {open === "rate" && <RatingModal target={target} onClose={() => setOpen(null)} />}
      {trailerOpen && trailer && (
        <MobileTrailerOverlay
          id={trailer}
          title={title}
          logo={logo}
          onClose={() => setTrailerOpen(false)}
        />
      )}
    </div>
  );
}

export function ActionChip({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex min-w-[68px] shrink-0 flex-col items-center gap-1.5 px-1 py-1 text-center ${
        disabled ? "opacity-45" : ""
      }`}
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full ring-1 transition-colors motion-reduce:transition-none ${
          active
            ? "bg-accent/15 text-accent ring-accent/30"
            : "bg-surface text-ink ring-edge-soft/70"
        }`}
      >
        {children}
      </span>
      <span
        className={`whitespace-nowrap text-[10.5px] font-medium leading-none ${
          active ? "text-accent" : "text-ink-muted"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

function UpcomingButton({ detail, onTry }: { detail: TmdbDetail | null; onTry: () => void }) {
  const t = useT();
  const date = detail?.kind === "movie" ? detail?.releaseDate : detail?.firstAirDate;
  const d = daysFromTodayLocal(date);
  const friendly =
    d == null || d <= 0
      ? null
      : d === 1
        ? t("tomorrow")
        : d < 7
          ? t("in {d} days", { d })
          : d < 14
            ? t("next week")
            : d < 60
              ? t("in {n}wks", { n: Math.round(d / 7) })
              : date
                ? formatAirDate(date)
                : null;
  return (
    <button
      type="button"
      onClick={onTry}
      title={t("Not officially released yet. Click to search anyway in case of an early release.")}
      className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-surface px-4 text-[15px] font-semibold text-ink-muted ring-1 ring-edge-soft/70"
    >
      <CalendarClock size={18} strokeWidth={2} className="shrink-0" />
      <span className="truncate">
        {t("Upcoming")}
        {friendly && <span className="font-medium text-ink-subtle"> · {friendly}</span>}
      </span>
    </button>
  );
}

/**
 * Desktop anchors this as a popover above Play. A popover has nowhere to sit
 * on a phone, so the same one-time nudge reads inline beneath the row and
 * dismisses on its own X or on the first Play.
 */
function PlayModeNote() {
  const t = useT();
  const { settings } = useSettings();
  const { isDismissed, dismiss } = useOnboarding();
  if (!settings.instantPlay || isDismissed("play-mode-hint")) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface/70 px-4 py-3 ring-1 ring-edge-soft/60">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-semibold text-ink">{t("Auto-loading the best stream")}</p>
        <p className="text-[12px] leading-snug text-ink-subtle">
          {t("Switch to Manual in settings if you'd rather pick the source yourself.")}
        </p>
        <button
          type="button"
          onClick={() => {
            dismiss("play-mode-hint");
            requestMobileIntent("settings");
          }}
          className="flex h-11 items-center self-start text-[13px] font-semibold text-accent"
        >
          {t("Open settings")}
        </button>
      </div>
      <button
        type="button"
        onClick={() => dismiss("play-mode-hint")}
        aria-label={t("Dismiss")}
        className="-me-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle"
      >
        <X size={16} strokeWidth={2.2} />
      </button>
    </div>
  );
}

function DownloadChip({ meta }: { meta: Meta }) {
  const t = useT();
  const { openPicker } = useView();
  const downloads = useDownloads();
  const dl = downloads.find((d) => d.metaId === meta.id && d.season == null);
  const status = dl?.status;
  const downloading = status === "downloading";
  const paused = status === "paused";
  const done = status === "done";
  const failed = status === "error" || status === "interrupted";
  const ratio = dl?.ratio ?? 0;
  const pct = Math.round(ratio * 100);
  const label = done
    ? t("Saved offline")
    : downloading
      ? t("Downloading {pct}%", { pct })
      : paused
        ? t("Download paused")
        : failed
          ? t("Retry download")
          : t("Download");
  const dim = 48;
  const r = (dim - 7) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <ActionChip
      label={label}
      active={done}
      onClick={() => {
        if (downloading && dl) cancelDownload(dl.id);
        else if (!done && !paused) openPicker(meta, undefined, { intent: "download" });
      }}
    >
      {downloading ? (
        <span className="relative flex h-12 w-12 items-center justify-center">
          <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="absolute inset-0 -rotate-90">
            <circle cx={dim / 2} cy={dim / 2} r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={2.5} />
            <circle
              cx={dim / 2}
              cy={dim / 2}
              r={r}
              fill="none"
              className="text-accent"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - Math.min(1, Math.max(0.03, ratio)))}
            />
          </svg>
          <X size={16} strokeWidth={2.4} />
        </span>
      ) : done ? (
        <Check size={20} strokeWidth={2.6} />
      ) : failed ? (
        <RotateCw size={19} strokeWidth={2.2} />
      ) : (
        <ArrowDownToLine size={20} strokeWidth={2} />
      )}
    </ActionChip>
  );
}

// ---------------------------------------------------------------------------
// Tracker chips. Each resolves the title on its service, adds it with one tap
// when it is not listed yet, and opens the status sheet once it is (the
// desktop button behaves the same way).

const ANILIST_LABELS: Record<MediaListStatus, string> = {
  CURRENT: "Watching",
  PLANNING: "Plan to Watch",
  COMPLETED: "Completed",
  REPEATING: "Rewatching",
  PAUSED: "On Hold",
  DROPPED: "Dropped",
};
const ANILIST_ORDER: MediaListStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "REPEATING",
  "PAUSED",
  "DROPPED",
];

function AnilistChip({ harborId }: { harborId: string }) {
  const t = useT();
  const { isConnected } = useAnilist();
  const [mediaId, setMediaId] = useState<number | null>(null);
  const [entryId, setEntryId] = useState<number | null>(null);
  const [status, setStatus] = useState<MediaListStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMediaId(null);
    setStatus(null);
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      const id = await resolveAnilistMediaId(harborId).catch(() => null);
      if (cancelled || id == null) return;
      setMediaId(id);
      const info = await anilistFetch(id).catch(() => null);
      if (cancelled) return;
      setEntryId(info?.entry?.id ?? null);
      setStatus(info?.entry?.status ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [harborId, isConnected]);

  if (!isConnected || mediaId == null) return null;

  const setTo = async (next: MediaListStatus) => {
    setBusy(true);
    const prev = status;
    setStatus(next);
    try {
      const saved = await anilistSave({ mediaId, status: next });
      setEntryId(saved.id);
      setStatus(saved.status);
    } catch {
      setStatus(prev);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (entryId == null) return;
    setBusy(true);
    const prevStatus = status;
    const prevEntry = entryId;
    setStatus(null);
    setEntryId(null);
    try {
      await anilistDelete(prevEntry);
    } catch {
      setStatus(prevStatus);
      setEntryId(prevEntry);
    } finally {
      setBusy(false);
    }
  };
  const options: TrackerOption<MediaListStatus>[] = ANILIST_ORDER.map((s) => ({
    value: s,
    label: t(ANILIST_LABELS[s]),
  }));

  return (
    <>
      <ActionChip
        label={status ? t(ANILIST_LABELS[status]) : t("Add to AniList")}
        active={!!status}
        disabled={busy}
        onClick={() => (status ? setOpen(true) : void setTo("PLANNING"))}
      >
        <img src={anilistLogo} alt="" className="h-5 w-5 rounded-[4px] object-contain" />
      </ActionChip>
      {open && (
        <TrackerSheet
          title="AniList"
          logo={anilistLogo}
          status={status}
          options={options}
          busy={busy}
          onSet={(s) => void setTo(s)}
          onRemove={() => void remove()}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const MAL_LABELS: Record<MalListStatus, string> = {
  watching: "Watching",
  plan_to_watch: "Plan to Watch",
  completed: "Completed",
  on_hold: "On Hold",
  dropped: "Dropped",
};
const MAL_ORDER: MalListStatus[] = ["watching", "plan_to_watch", "completed", "on_hold", "dropped"];

function MalChip({ harborId }: { harborId: string }) {
  const t = useT();
  const { isConnected } = useMal();
  const [malId, setMalId] = useState<number | null>(null);
  const [status, setStatus] = useState<MalListStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setMalId(null);
    setStatus(null);
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      const id = await resolveMalMediaId(harborId).catch(() => null);
      if (cancelled || id == null) return;
      setMalId(id);
      const info = await malFetch(id).catch(() => null);
      if (cancelled) return;
      setStatus(info?.entry?.status ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [harborId, isConnected]);

  if (!isConnected || malId == null) return null;

  const setTo = async (next: MalListStatus) => {
    setBusy(true);
    const prev = status;
    setStatus(next);
    try {
      const saved = await malSave({ malId, status: next });
      setStatus(saved.status);
    } catch {
      setStatus(prev);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    const prev = status;
    setStatus(null);
    try {
      await malDelete(malId);
    } catch {
      setStatus(prev);
    } finally {
      setBusy(false);
    }
  };
  const options: TrackerOption<MalListStatus>[] = MAL_ORDER.map((s) => ({
    value: s,
    label: t(MAL_LABELS[s]),
  }));

  return (
    <>
      <ActionChip
        label={status ? t(MAL_LABELS[status]) : t("Add to MyAnimeList")}
        active={!!status}
        disabled={busy}
        onClick={() => (status ? setOpen(true) : void setTo("plan_to_watch"))}
      >
        <img src={malLogo} alt="" className="h-5 w-5 rounded-[4px] object-contain" />
      </ActionChip>
      {open && (
        <TrackerSheet
          title="MyAnimeList"
          logo={malLogo}
          status={status}
          options={options}
          busy={busy}
          onSet={(s) => void setTo(s)}
          onRemove={() => void remove()}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function SimklChip({ harborId, type }: { harborId: string; type: "movie" | "series" }) {
  const t = useT();
  const { isConnected } = useSimkl();
  const [target, setTarget] = useState<SimklTarget | null>(null);
  const [status, setStatus] = useState<WatchlistStatus | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTarget(null);
    setReady(false);
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      const tgt = await resolveSimklTarget(harborId, type).catch(() => null);
      if (cancelled || !tgt) return;
      setTarget(tgt);
      const malKey =
        (tgt.kind === "movie" || tgt.kind === "show" || tgt.kind === "anime") && tgt.ids.mal != null
          ? `mal:${tgt.ids.mal}`
          : null;
      try {
        const map = await loadSimklStatusMap();
        if (cancelled) return;
        setStatus(statusForId(map, harborId) ?? (malKey ? statusForId(map, malKey) : null));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [harborId, isConnected, type]);

  if (!isConnected || !target || !ready) return null;

  const order = target.kind === "movie" ? MOVIE_STATUS_ORDER : SHOW_STATUS_ORDER;
  const setTo = async (next: WatchlistStatus) => {
    setBusy(true);
    const prev = status;
    setStatus(next);
    try {
      setStatus(await setSimklStatus(target, next));
    } catch {
      setStatus(prev);
      emitListToast(t("Couldn't reach Simkl"));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    const prev = status;
    setStatus(null);
    try {
      await clearSimklStatus(target);
    } catch {
      setStatus(prev);
      emitListToast(t("Couldn't reach Simkl"));
    } finally {
      setBusy(false);
    }
  };
  const options: TrackerOption<WatchlistStatus>[] = order.map((s) => ({
    value: s,
    label: t(SIMKL_STATUS_LABELS[s]),
  }));

  return (
    <>
      <ActionChip
        label={status ? t(SIMKL_STATUS_LABELS[status]) : t("Add to Simkl")}
        active={!!status}
        disabled={busy}
        onClick={() => (status ? setOpen(true) : void setTo("plantowatch"))}
      >
        <img src={simklLogo} alt="" className="h-5 w-5 rounded-[4px] object-contain" />
      </ActionChip>
      {open && (
        <TrackerSheet
          title="Simkl"
          logo={simklLogo}
          status={status}
          options={options}
          busy={busy}
          onSet={(s) => void setTo(s)}
          onRemove={() => void remove()}
          extra={<SimklRatingRow harborId={harborId} type={type} />}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The "More" sheet: every action with a label, plus the connected-computer
// sends and the remote tracker groups the browser remote relies on.

function ActionsSheet({
  meta,
  title,
  trailerId,
  rows,
  online,
  isAnime,
  isSeriesLike,
  canDownload,
  showWatched,
  showReminder,
  reminderOn,
  shareUrl,
  send,
  onPlayTrailer,
  onOpen,
  onClose,
}: {
  meta: Meta;
  title: string;
  trailerId: string | null;
  rows: LibraryToggles;
  online: boolean;
  isAnime: boolean;
  isSeriesLike: boolean;
  canDownload: boolean;
  showWatched: boolean;
  showReminder: boolean;
  reminderOn: boolean;
  shareUrl: string | null;
  send: (op: RemoteLibraryAction) => boolean;
  onPlayTrailer: () => void;
  onOpen: (next: OpenSheet) => void;
  onClose: () => void;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const { leaving, close } = useSheetExit(onClose);
  const { sendToHost, castPlay, connected, snapshot } = useMobileRemote();
  const { openPicker } = useView();
  const downloads = useDownloads();
  const trackers = snapshot.trackers;
  const movieDownload = canDownload
    ? downloads.find((d) => d.metaId === meta.id && d.season == null)
    : undefined;

  const syncServices = [trackers?.trakt ? "Trakt" : null, trackers?.simkl ? "Simkl" : null].filter(
    (name): name is string => name !== null,
  );
  const syncList =
    syncServices.length === 2
      ? t("{first} and {second}", { first: syncServices[0], second: syncServices[1] })
      : syncServices[0];
  const sync =
    online && syncList ? t("Syncs to your {services}", { services: syncList }) : undefined;

  const dlStatus = movieDownload?.status;
  const dlActive = dlStatus === "downloading" || dlStatus === "paused";
  const dlDone = dlStatus === "done";
  const dlFailed = dlStatus === "error" || dlStatus === "interrupted";
  const dlLabel = dlDone
    ? t("Saved offline")
    : dlStatus === "paused"
      ? t("Download paused")
      : dlStatus === "downloading"
        ? t("Downloading...")
        : t("Download");
  const dlSub = dlDone
    ? t("Available without internet")
    : dlStatus === "paused"
      ? t("Resume it from Downloads")
      : dlStatus === "downloading"
        ? `${Math.round((movieDownload?.ratio ?? 0) * 100)}%`
        : dlFailed
          ? t("Didn't finish, tap to try again")
          : t("Save this movie to watch offline");
  const onDownload = () => {
    if (dlActive || dlDone) {
      close();
      return;
    }
    openPicker(meta, undefined, { intent: "download" });
    close();
  };
  const hop = (next: OpenSheet) => {
    // The next sheet mounts as this one leaves; both are timer driven so the
    // handoff cannot strand the user between them.
    onOpen(next);
  };

  const sheet = (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t("Close")}
        onClick={close}
        className={`absolute inset-0 bg-black/50 ${
          reduced ? "" : leaving ? "md-sheet-fade-out" : "md-sheet-fade"
        }`}
      />
      <div
        className={`relative max-h-[86vh] overflow-y-auto rounded-t-3xl bg-canvas ${HIDE_SCROLL} ${
          reduced ? "" : leaving ? "md-sheet-out" : "md-sheet-in"
        }`}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
          // A bottom sheet still spans the full width, so on a landscape phone the
          // island sat over the row icons and clipped the section heading.
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div className="sticky top-0 z-10 flex flex-col items-center gap-2 bg-canvas pb-2 pt-3">
          <span className="h-1 w-9 rounded-full bg-edge" />
          <p className="max-w-[80%] truncate px-4 text-[13.5px] font-semibold text-ink">{title}</p>
        </div>

        <div className="flex flex-col px-3 pb-1">
          {trailerId && (
            <SheetRow
              icon={<UiIcon name="trailer" className="h-5 w-5" />}
              label={t("Watch trailer")}
              onClick={() => {
                onPlayTrailer();
                close();
              }}
            />
          )}
          {canDownload && (
            <SheetRow
              icon={<ArrowDownToLine size={20} strokeWidth={2} />}
              label={dlLabel}
              sublabel={dlSub}
              active={dlDone}
              trailing={
                dlDone ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined
              }
              onClick={onDownload}
            />
          )}
          <SheetRow
            icon={<UiIcon name="watch-together" className="h-5 w-5" />}
            label={t("Watch together")}
            sublabel={t("Start a room and watch in sync with friends")}
            onClick={() => hop("together")}
          />
          {shareUrl && (
            <SheetRow
              icon={<Share size={20} strokeWidth={2} />}
              label={t("Share")}
              onClick={() => {
                void navigator.share({ title, url: shareUrl }).catch(() => {});
                close();
              }}
            />
          )}
          {connected && (
            // Only offer cross-device actions when a computer is actually
            // connected; otherwise a row promises a send that cannot happen.
            <>
              <SheetRow
                icon={<MonitorPlay size={20} strokeWidth={2} />}
                label={t("Play on computer")}
                sublabel={t("Start this title on your connected Harbor app")}
                onClick={() => {
                  castPlay(meta);
                  close();
                }}
              />
              <SheetRow
                icon={<Monitor size={20} strokeWidth={2} />}
                label={t("Open on computer")}
                sublabel={t("Send this title to your Harbor app")}
                onClick={() => {
                  sendToHost(meta);
                  close();
                }}
              />
            </>
          )}
        </div>

        <Group label={t("Your library")}>
          <SheetRow
            icon={<UiIcon name={rows.favorite.on ? "unfavorite" : "favorite"} className="h-5 w-5" />}
            label={t("Favorites")}
            sublabel={rows.favorite.on ? t("Saved to your favorites") : t("Save to your favorites")}
            active={rows.favorite.on}
            disabled={rows.favorite.disabled}
            trailing={
              rows.favorite.on ? (
                <Check size={18} strokeWidth={2.6} className="text-accent" />
              ) : undefined
            }
            onClick={rows.favorite.toggle}
          />
          <SheetRow
            icon={
              rows.watchlist.on ? (
                <Check size={20} strokeWidth={2.4} />
              ) : (
                <Plus size={20} strokeWidth={2.2} />
              )
            }
            label={t("Watchlist")}
            sublabel={rows.watchlist.on ? t("In your watchlist") : t("Add to your watchlist")}
            hint={sync}
            active={rows.watchlist.on}
            disabled={rows.watchlist.disabled}
            trailing={
              rows.watchlist.on ? (
                <Check size={18} strokeWidth={2.6} className="text-accent" />
              ) : undefined
            }
            onClick={rows.watchlist.toggle}
          />
          <SheetRow
            icon={<UiIcon name="list" className="h-5 w-5" />}
            label={t("Add to list")}
            sublabel={t("Your own lists and your showcase")}
            onClick={() => hop("list")}
          />
          {showWatched && (
            <SheetRow
              icon={<UiIcon name={rows.watched.on ? "mark-unwatched" : "mark-watched"} className="h-5 w-5" />}
              label={t("Watched")}
              sublabel={rows.watched.on ? t("Marked as watched") : t("Mark as watched")}
              hint={sync}
              active={rows.watched.on}
              disabled={rows.watched.disabled}
              trailing={
                rows.watched.on ? (
                  <Check size={18} strokeWidth={2.6} className="text-accent" />
                ) : undefined
              }
              onClick={rows.watched.toggle}
            />
          )}
          {showReminder && (
            <SheetRow
              icon={<UiIcon name="remindme" className="h-5 w-5" />}
              label={reminderOn ? t("Reminder on") : t("Remind me")}
              sublabel={t("New episodes and seasons")}
              active={reminderOn}
              onClick={() => hop("reminder")}
            />
          )}
          {rows.needsComputer && (
            <div className="flex items-center justify-center gap-2 px-6 pb-1 pt-1.5 text-center text-[12px] leading-relaxed text-ink-subtle">
              <Monitor size={14} strokeWidth={2} className="shrink-0" />
              <span>{t("Connect to your computer to manage your library.")}</span>
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

// Kept exported for the movie resume label the detail body computes.
export function isResumingMovie(meta: Meta): boolean {
  return meta.type === "movie" && readResumeMs(meta.id) > 5000;
}
