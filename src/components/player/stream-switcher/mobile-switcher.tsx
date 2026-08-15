import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { ScoredStream } from "@/lib/streams/types";
import { matchBadge } from "@/lib/together/source-match";
import { useT } from "@/lib/i18n";
import { haptics } from "@/lib/player/haptics";
import { abbreviateLanguages } from "./lang-utils";
import { QUALITY_LABEL } from "./quality";
import type { SwitcherFilters } from "./filters-menu";
import { streamKey, SwitcherRow } from "./switcher-row";
import { MobileSheet } from "../shells/mobile-sheet";

// Touch-native presentation of the desktop StreamSwitcher. Consumes the SAME
// derived pipeline (list / addonLogos / filters / matchScores / refresh) — this
// file owns zero cache, filter, or resolve logic. It only re-dresses that data as
// a thumb-first bottom sheet: 44pt refresh, a horizontal filter chip row instead
// of the dropdown, and the identical SwitcherRow so badges/metadata/resolving
// spinner match desktop exactly. Position preservation is handled upstream by
// onSwitchStream; tapping a row just fires onPick.
export function MobileStreamSwitcher({
  open,
  list,
  onPick,
  onClose,
  resolvingKey,
  matchCurrent,
  addonLogos,
  refreshing,
  refresh,
  filters,
  matchScores,
  hasCache,
}: {
  open: boolean;
  list: ScoredStream[];
  onPick: (s: ScoredStream) => void;
  onClose: () => void;
  resolvingKey: string | null;
  matchCurrent: (s: ScoredStream) => boolean;
  addonLogos: Map<string, string | null>;
  refreshing: boolean;
  refresh: () => void;
  filters: SwitcherFilters;
  matchScores: Map<ScoredStream, number> | null;
  hasCache: boolean;
}) {
  const t = useT();
  const [showCount, setShowCount] = useState(60);
  useEffect(() => {
    setShowCount(60);
  }, [filters.quality, filters.cachedOnly, filters.filterToPreferred, list.length]);

  const showCached = filters.hasDebrid && filters.uncachedHidden > 0;
  const showLangs = filters.preferredLangs.length > 0 && filters.langHidden > 0;
  const empty = !hasCache || list.length === 0;

  return (
    <MobileSheet open={open} onClose={onClose} heightClass="max-h-[82vh]">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-10 shrink-0 bg-elevated">
          <div className="flex items-center justify-between gap-3 px-5 pb-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold text-ink">{t("Sources")}</span>
              <span className="truncate text-[12.5px] text-ink-muted">
                {refreshing
                  ? t("Refreshing…")
                  : hasCache
                    ? t("{n} sources", { n: list.length })
                    : t("No sources")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                haptics.light();
                refresh();
              }}
              disabled={refreshing}
              aria-label={t("Refresh sources")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted transition-colors active:bg-surface active:text-ink disabled:opacity-60"
            >
              <RefreshCw size={19} strokeWidth={2.2} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {showCached && (
              <Chip active={filters.cachedOnly} onClick={() => filters.setCachedOnly(!filters.cachedOnly)}>
                {t("Cached")}
              </Chip>
            )}
            {showLangs && (
              <Chip
                active={filters.filterToPreferred}
                onClick={() => filters.setFilterToPreferred(!filters.filterToPreferred)}
              >
                {abbreviateLanguages(filters.preferredLangs)}
              </Chip>
            )}
            <Chip active={filters.quality === "all"} onClick={() => filters.setQuality("all")}>
              {t("Any quality")}
            </Chip>
            {filters.qualityOptions.map((o) => (
              <Chip key={o.id} active={filters.quality === o.id} onClick={() => filters.setQuality(o.id)}>
                {QUALITY_LABEL[o.id]}
              </Chip>
            ))}
          </div>
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
            <p className="text-[13.5px] text-ink-muted">
              {refreshing ? t("Looking for sources…") : t("No sources loaded for this title yet.")}
            </p>
            <button
              type="button"
              onClick={() => refresh()}
              disabled={refreshing}
              className="flex h-11 items-center gap-2 rounded-full bg-raised px-5 text-[13px] font-semibold text-ink transition-colors active:bg-surface disabled:opacity-60"
            >
              <RefreshCw size={15} strokeWidth={2.2} className={refreshing ? "animate-spin" : ""} />
              {t("Refresh sources")}
            </button>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            {list.slice(0, showCount).map((s, i) => (
              <SwitcherRow
                key={`${s.addonId}-${s.infoHash ?? s.url ?? i}`}
                stream={s}
                addonLogo={addonLogos.get(s.addonId) ?? null}
                onPick={() => {
                  haptics.select();
                  onPick(s);
                }}
                resolving={resolvingKey === streamKey(s)}
                isCurrent={matchCurrent(s)}
                match={matchBadge(matchScores?.get(s))}
              />
            ))}
            {list.length > showCount && (
              <li className="px-5 pb-3 pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowCount((n) => n + 60)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-raised text-[12.5px] font-semibold text-ink-muted transition-colors active:bg-surface active:text-ink"
                >
                  {t("Load more")}
                  <span className="text-[11px] tabular-nums text-ink-subtle">
                    {t("{n} hidden", { n: list.length - showCount })}
                  </span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </MobileSheet>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[12.5px] font-semibold transition-colors ${
        active ? "bg-ink text-canvas" : "bg-raised text-ink-muted active:bg-surface"
      }`}
    >
      {children}
    </button>
  );
}
