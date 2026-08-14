import { AlertCircle, Check, Download, Loader2, Pause, Play, Trash2 } from "lucide-react";
import { DownloadCancelIcon, DownloadPauseResumeIcon } from "@/components/download-action-icons";
import { Poster, usePosterChain } from "@/components/poster";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import {
  cancelDownload,
  pauseDownload,
  removeDownload,
  resumeDownload,
  type DownloadItem,
} from "@/lib/download/downloads-store";
import { fmtBytes, fmtEta, fmtSpeed } from "@/views/downloads/downloads-format";

// One saved/active download, styled for the mobile mica system. Mirrors the
// desktop DownloadRow's controls (pause/resume/cancel/remove/play) but drops the
// "show in folder" reveal, which relies on a desktop-only opener with no mobile
// equivalent. Playback of a completed file is wired exactly as desktop does
// (openPlayer with the local path); whether the device player can open a local
// file is verified separately on-device.
export function MobileDownloadRow({ d }: { d: DownloadItem }) {
  const { openPlayer } = useView();
  const { settings } = useSettings();
  const poster = usePosterChain(
    settings.rpdbKey,
    d.metaId,
    d.poster ?? undefined,
    d.season != null ? "series" : "movie",
  );
  const pct = Math.round(d.ratio * 100);
  const downloading = d.status === "downloading";
  const active = downloading || d.status === "paused";
  const done = d.status === "done";

  const playLocal = () =>
    openPlayer({
      meta: {
        id: d.metaId,
        type: d.season != null ? "series" : "movie",
        name: d.title,
        poster: d.poster ?? undefined,
      },
      url: d.path,
      title: d.title,
      subtitle: d.subtitle ?? undefined,
      notWebReady: true,
      episode:
        d.season != null && d.episode != null
          ? { season: d.season, episode: d.episode }
          : undefined,
    });

  return (
    <li className="flex items-center gap-3.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 p-2.5">
      <button
        type="button"
        onClick={done ? playLocal : undefined}
        disabled={!done}
        aria-label={done ? `Play ${d.title}` : d.title}
        className="relative flex h-[64px] w-[44px] shrink-0 items-center justify-center overflow-hidden rounded-lg disabled:cursor-default"
      >
        <Poster src={poster.src} onError={poster.onError} seed={d.metaId} ratio="portrait" />
        {done && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Play size={18} strokeWidth={0} fill="currentColor" className="text-white" />
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate text-[14px] font-semibold text-ink">{d.title}</p>
        {d.subtitle && <p className="truncate text-[11.5px] text-ink-subtle">{d.subtitle}</p>}

        {active ? (
          <>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-ink-muted">
              <span>{d.status === "paused" ? "Paused" : `${pct}%`}</span>
              {d.totalBytes != null && (
                <span className="text-ink-subtle">
                  · {fmtBytes(d.receivedBytes)} / {fmtBytes(d.totalBytes)}
                </span>
              )}
              {fmtSpeed(d.bytesPerSec) && <span>· {fmtSpeed(d.bytesPerSec)}</span>}
              {fmtEta(d) && <span className="text-ink-subtle">· {fmtEta(d)}</span>}
            </div>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-[11.5px]">
            {done && (
              <>
                <Check size={13} className="text-accent" strokeWidth={2.6} />
                <span className="text-ink-muted">
                  Saved{d.streamLabel ? ` · ${d.streamLabel}` : ""}
                  {d.totalBytes ? ` · ${fmtBytes(d.totalBytes)}` : ""}
                </span>
              </>
            )}
            {d.status === "error" && (
              <>
                <AlertCircle size={13} className="text-danger" strokeWidth={2.4} />
                <span className="text-danger">{d.error ?? "Download failed"}</span>
              </>
            )}
            {d.status === "canceled" && <span className="text-ink-subtle">Canceled</span>}
            {d.status === "interrupted" && (
              <span className="text-amber-300/85">Interrupted · re-download to finish</span>
            )}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {active && (
          <>
            <RowBtn
              label={d.status === "paused" ? "Resume download" : "Pause download"}
              onClick={() => {
                if (d.status === "paused") void resumeDownload(d.id);
                else pauseDownload(d.id);
              }}
            >
              <DownloadPauseResumeIcon paused={d.status === "paused"} size={17} />
            </RowBtn>
            <RowBtn label="Cancel download" cancel onClick={() => cancelDownload(d.id)}>
              <DownloadCancelIcon size={17} />
            </RowBtn>
          </>
        )}
        {!active && (
          <RowBtn label="Delete download" cancel onClick={() => removeDownload(d.id)}>
            <Trash2 size={17} strokeWidth={2} />
          </RowBtn>
        )}
      </div>
    </li>
  );
}

// Per-episode download trigger for the series episode list. Idle → opens the
// download picker; while active or already saved it reflects state and is inert
// (the Downloads screen owns pause/cancel/delete). Kept tiny so it sits cleanly
// beside the episode's play row.
export function EpisodeDownloadButton({
  status,
  onDownload,
}: {
  status?: DownloadItem["status"];
  onDownload: () => void;
}) {
  const downloading = status === "downloading";
  const paused = status === "paused";
  const done = status === "done";
  const inFlight = downloading || paused;
  const label = done
    ? "Saved offline"
    : paused
      ? "Download paused"
      : downloading
        ? "Downloading"
        : "Download episode";
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (inFlight || done) return;
        onDownload();
      }}
      className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-subtle transition-[color,background-color,transform] duration-150 active:scale-[0.92] active:bg-ink/10 motion-reduce:transition-none"
    >
      {done ? (
        <Check size={18} strokeWidth={2.6} className="text-accent" />
      ) : paused ? (
        <Pause size={17} strokeWidth={2.4} className="text-accent" />
      ) : downloading ? (
        <Loader2 size={18} className="animate-spin text-accent" />
      ) : (
        <Download size={18} strokeWidth={2} />
      )}
    </button>
  );
}

function RowBtn({
  label,
  onClick,
  cancel = false,
  children,
}: {
  label: string;
  onClick: () => void;
  cancel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded-xl transition-[color,background-color,transform] duration-150 active:scale-[0.92] motion-reduce:transition-none ${
        cancel
          ? "text-ink-subtle active:bg-danger/10 active:text-danger"
          : "text-ink-subtle active:bg-ink/10 active:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
