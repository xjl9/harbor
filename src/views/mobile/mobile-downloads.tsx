import { useMemo, useState } from "react";
import { useAutoDownload } from "@/lib/auto-download";
import { useIsRunning } from "@/lib/auto-download/runner";
import { useDownloads, type DownloadItem } from "@/lib/download/downloads-store";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Poster, usePosterChain } from "@/components/poster";
import { fmtBytes, fmtSpeed } from "@/views/downloads/downloads-format";
import { useActiveTorrents } from "@/views/downloads/use-active-torrents";
import { SetIcon } from "@/views/settings/set-icon";
import { DownloadStateGlyph, MobileDownloadRow } from "./mobile-download-row";
import { MobileAutoDownloadPage } from "./library/auto-download-page";
import {
  buildGroups,
  countFilters,
  matchesFilter,
  type DownloadFilter,
  type DownloadGroup,
} from "./library/downloads-groups";
import { ChipRow } from "./library/grid";
import { PhonePage, usePhonePageClose } from "./library/sheet";
import { StreamingNowSheet } from "./library/streaming-now-sheet";

// Downloads on the phone, 1:1 with src/views/downloads.tsx: All, Active, Saved
// and Issues with counts, episodes grouped under their show, auto-download
// rules, the "Streaming now" cache and a storage summary. The save location is
// fixed to the app's own storage on mobile, so the desktop folder chip becomes
// a read-only line about used space.

export function MobileDownloads({ onClose }: { onClose: () => void }) {
  const t = useT();
  const items = useDownloads();
  const autoList = useAutoDownload();
  const autoRunning = useIsRunning();
  const { closing, requestClose } = usePhonePageClose(onClose);
  const { items: torrents, refresh } = useActiveTorrents(!closing);
  const [filter, setFilter] = useState<DownloadFilter>("all");
  const [autoOpen, setAutoOpen] = useState(false);
  const [streamingOpen, setStreamingOpen] = useState(false);

  const counts = useMemo(() => countFilters(items), [items]);
  const effective: DownloadFilter = filter !== "all" && counts[filter] === 0 ? "all" : filter;
  const groups = useMemo(
    () => buildGroups(items.filter((d) => matchesFilter(d, effective))),
    [items, effective],
  );

  const totalBps = items.reduce((sum, d) => (d.status === "downloading" ? sum + d.bytesPerSec : sum), 0);
  const paused = items.filter((d) => d.status === "paused").length;
  const savedBytes = items.reduce(
    (sum, d) => (d.status === "done" ? sum + (d.totalBytes ?? d.receivedBytes) : sum),
    0,
  );
  const partialBytes = items.reduce(
    (sum, d) => (d.status === "downloading" || d.status === "paused" ? sum + d.receivedBytes : sum),
    0,
  );
  const subtitle =
    items.length === 0
      ? t("Saved movies and episodes for offline use")
      : [
          items.length === 1 ? t("1 item") : t("{count} items", { count: items.length }),
          counts.active - paused > 0 ? t("{count} downloading", { count: counts.active - paused }) : null,
          paused > 0 ? t("{count} paused", { count: paused }) : null,
          totalBps > 0 ? `↓ ${fmtSpeed(totalBps)}` : null,
        ]
          .filter(Boolean)
          .join("  ·  ");

  const filterOptions = (
    [
      { value: "all", label: t("All") },
      { value: "active", label: t("Active") },
      { value: "saved", label: t("Saved") },
      { value: "issues", label: t("Issues") },
    ] as Array<{ value: DownloadFilter; label: string }>
  )
    .filter((o) => o.value === "all" || counts[o.value] > 0)
    .map((o) => ({ ...o, count: counts[o.value] }));

  return (
    <PhonePage closing={closing} onBack={requestClose} z="z-[70]" title={t("Downloads")}>
      {/* -mt-1 exactly cancels the scroll area's pt-1; pulling any further put the
          line above the overflow clip and cropped its top half. */}
      <p className="-mt-1 text-[12.5px] tabular-nums text-ink-subtle">{subtitle}</p>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {torrents.length > 0 && (
          <ToolChip onClick={() => setStreamingOpen(true)} count={torrents.length}>
            <SetIcon name="Radio" size={15} strokeWidth={2.1} className="text-accent" />
            {t("Streaming")}
          </ToolChip>
        )}
        <ToolChip onClick={() => setAutoOpen(true)} count={autoList.length || undefined}>
          <SetIcon
            name={autoRunning ? "RotateCw" : "Rss"}
            size={15}
            strokeWidth={2.1}
            className={autoRunning ? "animate-spin text-accent" : "text-ink-subtle"}
          />
          {t("Auto-download")}
        </ToolChip>
      </div>

      {items.length > 0 && <StorageSummary savedBytes={savedBytes} partialBytes={partialBytes} saved={counts.saved} />}

      {items.length === 0 ? (
        <EmptyState onAuto={() => setAutoOpen(true)} />
      ) : (
        <>
          {filterOptions.length > 1 && (
            <ChipRow
              value={effective}
              onChange={setFilter}
              ariaLabel={t("Filter downloads")}
              options={filterOptions}
            />
          )}
          <div key={effective} className="animate-fade-in flex flex-col gap-2.5">
            {groups.map((g) =>
              g.kind === "movie" ? (
                <ul key={g.item.id} className="contents">
                  <MobileDownloadRow d={g.item} />
                </ul>
              ) : (
                <ShowGroup key={g.metaId} group={g} />
              ),
            )}
          </div>
        </>
      )}

      {autoOpen && <MobileAutoDownloadPage onClose={() => setAutoOpen(false)} />}
      <StreamingNowSheet
        open={streamingOpen}
        onClose={() => setStreamingOpen(false)}
        items={torrents}
        onRun={(p) => void p.then(refresh)}
      />
    </PhonePage>
  );
}

function ToolChip({
  onClick,
  count,
  children,
}: {
  onClick: () => void;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-elevated/60 px-4 text-[13px] font-semibold text-ink-muted ring-1 ring-edge-soft/60 transition-transform active:scale-[0.97]"
    >
      {children}
      {count !== undefined && (
        <span className="rounded-full bg-accent/15 px-1.5 py-px text-[11px] font-semibold tabular-nums text-accent">
          {count}
        </span>
      )}
    </button>
  );
}

function StorageSummary({
  savedBytes,
  partialBytes,
  saved,
}: {
  savedBytes: number;
  partialBytes: number;
  saved: number;
}) {
  const t = useT();
  const used = fmtBytes(savedBytes + partialBytes);
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-raised text-ink-muted">
        <SetIcon name="HardDrive" size={19} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          {t("Stored on this device")}
        </span>
        <span className="truncate text-[13px] text-ink-muted">
          {saved === 1 ? t("1 saved") : t("{count} saved", { count: saved })}
          {partialBytes > 0 ? ` · ${t("{size} in progress", { size: fmtBytes(partialBytes) })}` : ""}
        </span>
      </div>
      <span className="shrink-0 text-[17px] font-semibold tabular-nums text-ink">{used || "0 KB"}</span>
    </div>
  );
}

function EmptyState({ onAuto }: { onAuto: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed border-edge-soft/70 bg-elevated/25 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-elevated text-ink-subtle">
        <DownloadStateGlyph glyph="idle" size={26} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] font-semibold text-ink">{t("No downloads yet")}</p>
        <p className="max-w-[300px] text-[13px] leading-relaxed text-ink-muted">
          {t("Open a movie or episode, tap Download, and pick a source. It saves here for offline watching.")}
        </p>
      </div>
      <button
        type="button"
        onClick={onAuto}
        className="flex min-h-11 items-center px-3 text-[13.5px] font-semibold text-accent transition-opacity active:opacity-70"
      >
        {t("Or set a series to auto-download")}
      </button>
    </div>
  );
}

function ShowGroup({ group }: { group: Extract<DownloadGroup, { kind: "show" }> }) {
  const t = useT();
  const { settings } = useSettings();
  const poster = usePosterChain(settings.rpdbKey, group.metaId, group.poster ?? undefined, "series");
  const episodes = useMemo(
    () =>
      [...group.items].sort(
        (a: DownloadItem, b: DownloadItem) =>
          (a.season ?? 0) - (b.season ?? 0) || (a.episode ?? 0) - (b.episode ?? 0),
      ),
    [group.items],
  );
  const totalBytes = episodes.reduce(
    (sum, d) => (d.status === "done" ? sum + (d.totalBytes ?? d.receivedBytes) : sum),
    0,
  );
  return (
    <div className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/25">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="h-[52px] w-[36px] shrink-0 overflow-hidden rounded-md">
          <Poster src={poster.src} onError={poster.onError} seed={group.metaId} ratio="portrait" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14.5px] font-semibold text-ink">{group.title}</span>
          <span className="text-[11.5px] tabular-nums text-ink-subtle">
            {episodes.length === 1 ? t("1 episode") : t("{count} episodes", { count: episodes.length })}
            {totalBytes > 0 ? `  ·  ${fmtBytes(totalBytes)}` : ""}
          </span>
        </div>
      </div>
      <ul className="flex flex-col gap-0.5 border-t border-edge-soft/50 px-1.5 py-1.5">
        {episodes.map((d) => (
          <MobileDownloadRow key={d.id} d={d} compact />
        ))}
      </ul>
    </div>
  );
}
