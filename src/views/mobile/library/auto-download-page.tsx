import { useEffect, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import {
  addAutoDownload,
  isAutoDownloaded,
  removeAutoDownload,
  updateAutoDownload,
  useAutoDownload,
  type AutoDlSeries,
} from "@/lib/auto-download";
import {
  runAutoDownloadCheck,
  useIsChecking,
  useIsRunning,
  useNextRunAt,
} from "@/lib/auto-download/runner";
import { useT } from "@/lib/i18n";
import { searchAll, searchCinemeta } from "@/lib/search";
import { useSettings } from "@/lib/settings";
import { Search as SearchIcon } from "@/components/icons/search-icon";
import { Poster, usePosterChain } from "@/components/poster";
import {
  P2P_OPTIONS,
  QUALITY_OPTIONS,
  STOP_OPTIONS,
  airText,
  nextCheckText,
  p2pLabel,
  qualityLabel,
  stopEquals,
  stopLabel,
  useNow,
} from "@/views/downloads/auto-download-controls";
import { SetIcon } from "@/views/settings/set-icon";
import { ActionRow, PhonePage, PhoneSheet, usePhonePageClose } from "./sheet";

// Auto-download rules on the phone. The desktop modal writes each rule as a
// sentence with inline dropdowns; a phone row lists the same three choices
// (quality, sources, stop rule) as tappable rows that open a picker sheet, so
// every control clears 44pt and nothing anchors to a popover.

const MAX_RESULTS = 8;

export function MobileAutoDownloadPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const list = useAutoDownload();
  const running = useIsRunning();
  const { closing, requestClose } = usePhonePageClose(onClose);
  return (
    <PhonePage
      closing={closing}
      onBack={requestClose}
      z="z-[80]"
      eyebrow={t("Downloads")}
      title={t("Auto-download")}
      trailing={
        list.length > 0 ? (
          <button
            type="button"
            onClick={() => void runAutoDownloadCheck(true)}
            disabled={running}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-elevated/60 px-4 text-[12.5px] font-semibold text-ink-muted ring-1 ring-edge-soft/60 transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            <SetIcon name="RotateCw" size={14} strokeWidth={2.2} className={running ? "animate-spin" : ""} />
            {running ? t("Checking...") : t("Check now")}
          </button>
        ) : undefined
      }
    >
      <p className="-mt-2 text-[13px] leading-relaxed text-ink-muted">
        {t("Episodes that air after you add a series grab themselves")}
      </p>
      <AddSeries />
      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-edge-soft bg-canvas/30 px-5 py-8 text-center text-[13px] leading-relaxed text-ink-muted">
          {t("Add a series above and Harbor will grab each new episode as it airs, on your terms.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((s) => (
            <SeriesRow key={s.id} series={s} />
          ))}
        </ul>
      )}
    </PhonePage>
  );
}

function AddSeries() {
  const t = useT();
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Meta[]>([]);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      reqRef.current++;
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++reqRef.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const [tmdb, cine] = await Promise.all([
          settings.tmdbKey
            ? searchAll(settings.tmdbKey, trimmed)
                .then((r) => r.series)
                .catch(() => [])
            : Promise.resolve<Meta[]>([]),
          searchCinemeta(trimmed)
            .then((r) => r.series)
            .catch(() => []),
        ]);
        if (id !== reqRef.current) return;
        // Interleave the two providers so neither monopolises the short list,
        // and drop the same title arriving under two ids.
        const seen = new Set<string>();
        const merged: Meta[] = [];
        const rounds = Math.max(tmdb.length, cine.length);
        for (let i = 0; i < rounds && merged.length < MAX_RESULTS; i++) {
          for (const m of [tmdb[i], cine[i]]) {
            if (!m || merged.length >= MAX_RESULTS) continue;
            const title = `${m.name.trim().toLowerCase()}|${(m.releaseInfo ?? "").slice(0, 4)}`;
            if (seen.has(m.id) || seen.has(title)) continue;
            seen.add(m.id);
            seen.add(title);
            merged.push(m);
          }
        }
        setResults(merged);
        setLoading(false);
      })();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, settings.tmdbKey]);

  const pick = (m: Meta) => {
    addAutoDownload(m);
    setQuery("");
    setResults([]);
  };

  const showPanel = query.trim().length >= 2;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon
          size={17}
          className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-subtle"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Add a series to auto-download")}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 w-full rounded-full bg-elevated/50 pe-12 ps-11 text-[16px] text-ink outline-none ring-1 ring-edge-soft/60 transition-shadow placeholder:text-ink-subtle focus:ring-accent"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("Clear")}
            className="absolute end-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-subtle active:bg-raised/60"
          >
            <SetIcon name="X" size={16} strokeWidth={2.3} />
          </button>
        )}
      </div>
      {showPanel && (
        <div className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-surface">
          {loading && results.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-muted">{t("Searching...")}</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-ink-muted">{t("No series found")}</p>
          ) : (
            <ul className="max-h-[320px] overflow-y-auto py-1">
              {results.map((m) => (
                <AddResult key={m.id} meta={m} rpdbKey={settings.rpdbKey} onPick={pick} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AddResult({
  meta,
  rpdbKey,
  onPick,
}: {
  meta: Meta;
  rpdbKey: string;
  onPick: (m: Meta) => void;
}) {
  const t = useT();
  const poster = usePosterChain(rpdbKey, meta.id, meta.poster ?? undefined, "series");
  const already = isAutoDownloaded(meta.id);
  return (
    <li>
      <button
        type="button"
        disabled={already}
        onClick={() => onPick(meta)}
        className="flex min-h-[56px] w-full items-center gap-3 px-3 py-1.5 text-start transition-colors active:bg-raised/60 disabled:opacity-55"
      >
        <span className="w-9 shrink-0 overflow-hidden rounded-md">
          <Poster src={poster.src} onError={poster.onError} seed={meta.id} ratio="portrait" className="!rounded-md" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14px] font-medium text-ink">{meta.name}</span>
          {meta.releaseInfo && (
            <span className="text-[11.5px] text-ink-subtle">{meta.releaseInfo}</span>
          )}
        </span>
        {already ? (
          <span className="shrink-0 text-[11.5px] font-medium text-accent">{t("Added")}</span>
        ) : (
          <SetIcon name="Plus" size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
        )}
      </button>
    </li>
  );
}

type Picker = "quality" | "sources" | "stop" | null;

function SeriesRow({ series }: { series: AutoDlSeries }) {
  const t = useT();
  const { settings } = useSettings();
  const now = useNow();
  const checking = useIsChecking(series.id);
  const nextRunAt = useNextRunAt();
  const poster = usePosterChain(settings.rpdbKey, series.id, series.poster ?? undefined, "series");
  const [picker, setPicker] = useState<Picker>(null);
  const grabbed = series.grabbedCount > 0;
  const limitReached =
    series.stop.kind === "count" &&
    series.grabbedCount - (series.stop.from ?? series.grabbedCount) >= series.stop.value;
  const statusText = grabbed
    ? t("{count} grabbed", { count: series.grabbedCount })
    : series.lastError
      ? series.lastError
      : series.lastCheckedAt == null
        ? t("first check pending")
        : t("up to date");
  const air = limitReached ? null : airText(series.nextAirDate, now);
  const tailText = limitReached ? t("limit reached") : nextCheckText(nextRunAt, now);

  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 p-3">
      <div className="flex items-start gap-3">
        <div className="h-[64px] w-[44px] shrink-0 overflow-hidden rounded-lg">
          <Poster src={poster.src} onError={poster.onError} seed={series.id} ratio="portrait" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
          <span className="truncate text-[14.5px] font-semibold text-ink">{series.title}</span>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] tabular-nums">
            <span className={grabbed ? "font-medium text-accent" : "text-ink-subtle"}>{statusText}</span>
            {grabbed && series.lastGrabbed && (
              <span className="text-ink-muted">· {t("last {episode}", { episode: series.lastGrabbed })}</span>
            )}
            {grabbed && series.lastError && <span className="text-ink-muted">· {series.lastError}</span>}
            {air && <span className="text-ink-muted">· {air}</span>}
            {checking ? (
              <span className="inline-flex items-center gap-1 font-medium text-accent">
                <span className="text-ink-subtle">·</span>
                <SetIcon name="RotateCw" size={11} strokeWidth={2.2} className="animate-spin" />
                {t("checking now")}
              </span>
            ) : (
              <span className="text-ink-subtle">· {tailText}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => removeAutoDownload(series.id)}
          aria-label={t("Stop auto-downloading {title}", { title: series.title })}
          className="-me-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-subtle transition-colors active:bg-danger/10 active:text-danger"
        >
          <SetIcon name="X" size={17} strokeWidth={2.2} />
        </button>
      </div>
      <div className="flex flex-col rounded-xl bg-canvas/50 ring-1 ring-edge-soft/50">
        <ChoiceRow label={t("Grab")} value={qualityLabel(series.maxHeight)} onClick={() => setPicker("quality")} />
        <span className="mx-3 block h-px bg-edge-soft/50" />
        <ChoiceRow label={t("Sources")} value={p2pLabel(series.allowP2p)} onClick={() => setPicker("sources")} />
        <span className="mx-3 block h-px bg-edge-soft/50" />
        <ChoiceRow label={t("Keep going")} value={stopLabel(series.stop)} onClick={() => setPicker("stop")} />
      </div>

      <PhoneSheet open={picker === "quality"} onClose={() => setPicker(null)} z="z-[90]" title={t("Grab")}>
        {QUALITY_OPTIONS.map((o) => (
          <ActionRow
            key={String(o.value)}
            label={t(o.label)}
            selected={o.value === series.maxHeight}
            onClick={() => {
              updateAutoDownload(series.id, { maxHeight: o.value });
              setPicker(null);
            }}
          />
        ))}
      </PhoneSheet>
      <PhoneSheet open={picker === "sources"} onClose={() => setPicker(null)} z="z-[90]" title={t("Sources")}>
        {P2P_OPTIONS.map((o) => (
          <ActionRow
            key={String(o.value)}
            label={t(o.label)}
            selected={o.value === series.allowP2p}
            onClick={() => {
              updateAutoDownload(series.id, { allowP2p: o.value });
              setPicker(null);
            }}
          />
        ))}
      </PhoneSheet>
      <PhoneSheet open={picker === "stop"} onClose={() => setPicker(null)} z="z-[90]" title={t("Keep going")}>
        {STOP_OPTIONS.map((o, i) => (
          <ActionRow
            key={i}
            label={t(o.label)}
            selected={stopEquals(o.value, series.stop)}
            onClick={() => {
              updateAutoDownload(series.id, { stop: o.value });
              setPicker(null);
            }}
          />
        ))}
      </PhoneSheet>
    </li>
  );
}

function ChoiceRow({ label, value, onClick }: { label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] w-full items-center gap-3 px-3 text-start transition-colors active:bg-raised/60"
    >
      <span className="shrink-0 text-[13px] font-medium text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-end text-[13.5px] font-medium text-ink">{value}</span>
      <SetIcon name="ChevronDown" size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
    </button>
  );
}
