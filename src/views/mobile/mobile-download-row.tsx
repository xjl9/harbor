import { useEffect, useRef, useState } from "react";
import { DownloadCancelIcon, DownloadPauseResumeIcon } from "@/components/download-action-icons";
import { Play } from "@/components/icons/play-filled";
import { Poster, usePosterChain } from "@/components/poster";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";
import { useT } from "@/lib/i18n";
import {
  cancelDownload,
  pauseDownload,
  removeDownload,
  resumeDownload,
  type DownloadItem,
} from "@/lib/download/downloads-store";
import { fmtBytes, fmtEta, fmtSpeed } from "@/views/downloads/downloads-format";
import { SetIcon } from "@/views/settings/set-icon";
import {
  downloadGlyph,
  downloadGlyphSrc,
  localFileUrl,
  type DownloadGlyph,
} from "./library/downloads-groups";

// One saved or active download on the phone. Mirrors the desktop DownloadRow's
// controls (pause, resume, cancel, delete, play) and drops "Show in folder",
// which relies on a desktop-only opener. The saved path is handed to the
// player as a file URL so AVFoundation, which rejects a bare path, can open
// mp4, m4v and mov as well as mpv opens everything else.

// The state glyphs ship as solid white SVGs, so they are drawn as a CSS mask
// over currentColor; that lets each state take the row's accent, danger or
// muted tint instead of always rendering white.
export function DownloadStateGlyph({
  glyph,
  size = 14,
  className = "",
}: {
  glyph: DownloadGlyph;
  size?: number;
  className?: string;
}) {
  const url = `url("${downloadGlyphSrc(glyph)}")`;
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

export function MobileDownloadRow({ d, compact = false }: { d: DownloadItem; compact?: boolean }) {
  const t = useT();
  const { openPlayer } = useView();
  const { settings } = useSettings();
  const poster = usePosterChain(
    settings.rpdbKey,
    d.metaId,
    d.poster ?? undefined,
    d.season != null ? "series" : "movie",
  );
  const isEBook = d.kind === "ebook";
  const pct = Math.round(d.ratio * 100);
  const downloading = d.status === "downloading";
  const active = downloading || d.status === "paused";
  const done = d.status === "done";
  const playable = done && !isEBook;
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const playLocal = () =>
    openPlayer({
      meta: {
        id: d.metaId,
        type: d.season != null ? "series" : "movie",
        name: d.title,
        poster: d.poster ?? undefined,
      },
      url: localFileUrl(d.path),
      title: d.title,
      subtitle: d.subtitle ?? undefined,
      notWebReady: true,
      episode:
        d.season != null && d.episode != null
          ? { season: d.season, episode: d.episode }
          : undefined,
    });

  const heading = compact ? (d.subtitle ?? d.title) : d.title;

  return (
    <li
      className={`flex items-center gap-3 rounded-2xl ${
        compact ? "p-1.5" : "border border-edge-soft/70 bg-elevated/40 p-2.5"
      }`}
    >
      <button
        type="button"
        onClick={playable ? playLocal : undefined}
        disabled={!playable}
        aria-label={playable ? t("Play {title}", { title: heading }) : heading}
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg disabled:cursor-default ${
          compact ? "h-[54px] w-[44px]" : "h-[64px] w-[44px]"
        }`}
      >
        <Poster
          src={isEBook ? (d.poster ?? undefined) : poster.src}
          onError={isEBook ? undefined : poster.onError}
          seed={d.metaId}
          ratio="portrait"
        />
        {playable && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/35">
            <Play size={18} strokeWidth={0} fill="currentColor" className="text-white" />
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="truncate text-[14px] font-semibold text-ink">{heading}</p>
        {!compact && d.subtitle && (
          <p className="-mt-1 truncate text-[11.5px] text-ink-subtle">{d.subtitle}</p>
        )}

        {active ? (
          <>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] tabular-nums text-ink-muted">
              <DownloadStateGlyph
                glyph="downloading"
                size={12}
                className={downloading ? "text-accent motion-safe:animate-pulse" : "text-ink-subtle"}
              />
              <span>{d.status === "paused" ? t("Paused") : `${pct}%`}</span>
              {d.phaseLabel && <span className="text-ink-subtle">· {t(d.phaseLabel)}</span>}
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
          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px]">
            {done && (
              <>
                <DownloadStateGlyph glyph={downloadGlyph(d.status)} size={13} className="text-accent" />
                <span className="truncate text-ink-muted">
                  {d.phaseLabel ? t(d.phaseLabel) : t("Saved")}
                  {d.streamLabel ? ` · ${d.streamLabel}` : ""}
                  {d.totalBytes ? ` · ${fmtBytes(d.totalBytes)}` : ""}
                </span>
              </>
            )}
            {d.status === "error" && (
              <>
                <DownloadStateGlyph glyph="error" size={13} className="text-danger" />
                <span className="truncate text-danger">
                  {t("Failed: {error}", { error: d.error ?? t("download error") })}
                </span>
              </>
            )}
            {d.status === "canceled" && (
              <>
                <DownloadStateGlyph glyph="idle" size={13} className="text-ink-subtle" />
                <span className="text-ink-subtle">{t("Canceled")}</span>
              </>
            )}
            {d.status === "interrupted" && (
              <>
                <DownloadStateGlyph glyph="error" size={13} className="text-amber-300/85" />
                <span className="truncate text-amber-300/85">
                  {t("Interrupted: re-download to finish")}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {active && (
          <>
            {d.canPause !== false && (
              <RowBtn
                label={d.status === "paused" ? t("Resume download") : t("Pause download")}
                onClick={() => {
                  if (d.status === "paused") void resumeDownload(d.id);
                  else pauseDownload(d.id);
                }}
              >
                <DownloadPauseResumeIcon paused={d.status === "paused"} size={17} />
              </RowBtn>
            )}
            <RowBtn label={t("Cancel download")} cancel onClick={() => cancelDownload(d.id)}>
              <DownloadCancelIcon size={17} />
            </RowBtn>
          </>
        )}
        {!active && playable && !compact && (
          <RowBtn label={t("Play")} onClick={playLocal}>
            <Play size={16} strokeWidth={2.2} fill="currentColor" />
          </RowBtn>
        )}
        {/* Deleting removes the file too, and on a phone a stray tap is easy, so
            the first tap arms the button and only the second one deletes. */}
        {!active &&
          (armed ? (
            <button
              type="button"
              onClick={() => {
                window.clearTimeout(armTimer.current);
                setArmed(false);
                removeDownload(d.id);
              }}
              className="flex h-11 items-center gap-1.5 rounded-xl bg-danger/15 px-3 text-[12.5px] font-semibold text-danger active:scale-95"
            >
              <SetIcon name="Trash2" size={15} strokeWidth={2.2} />
              {t("Delete")}
            </button>
          ) : (
            <RowBtn
              label={t("Delete download and file")}
              cancel
              onClick={() => {
                setArmed(true);
                armTimer.current = window.setTimeout(() => setArmed(false), 3200);
              }}
            >
              <SetIcon name="Trash2" size={17} strokeWidth={2} />
            </RowBtn>
          ))}
      </div>
    </li>
  );
}

// Per-episode download trigger for the series episode list. Idle opens the
// download picker; while active or already saved it reflects state and is inert
// (the Downloads screen owns pause, cancel and delete). Kept tiny so it sits
// cleanly beside the episode's play row.
export function EpisodeDownloadButton({
  status,
  onDownload,
}: {
  status?: DownloadItem["status"];
  onDownload: () => void;
}) {
  const t = useT();
  const downloading = status === "downloading";
  const paused = status === "paused";
  const done = status === "done";
  const inFlight = downloading || paused;
  const label = done
    ? t("Saved offline")
    : paused
      ? t("Download paused")
      : downloading
        ? t("Downloading")
        : t("Download episode");
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        if (inFlight || done) return;
        onDownload();
      }}
      className="no-press flex h-11 w-11 items-center justify-center rounded-xl text-ink-subtle transition-[color,background-color,transform] duration-150 active:scale-[0.92] active:bg-ink/10 motion-reduce:transition-none"
    >
      {done ? (
        <DownloadStateGlyph glyph="complete" size={18} className="text-accent" />
      ) : paused ? (
        <SetIcon name="Pause" size={17} strokeWidth={2.4} className="text-accent" />
      ) : downloading ? (
        <DownloadStateGlyph glyph="downloading" size={18} className="text-accent motion-safe:animate-pulse" />
      ) : (
        <DownloadStateGlyph glyph="idle" size={18} />
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
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-[color,background-color,transform] duration-150 active:scale-[0.92] motion-reduce:transition-none ${
        cancel
          ? "text-ink-subtle active:bg-danger/10 active:text-danger"
          : "text-ink-subtle active:bg-ink/10 active:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
