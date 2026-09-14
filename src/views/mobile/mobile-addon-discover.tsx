import { useCallback, useEffect, useRef, useState } from "react";
import stremioAddonsLogo from "@/assets/stremio-addons-net.png";
import { AddonLogo, resolveAddonLogo } from "@/components/addon-logo";
import { openInstallerViewport } from "@/components/installer-viewport";
import { installFromUrl, manifestToConfigureUrl } from "@/lib/addon-store";
import { useT } from "@/lib/i18n";
import {
  listAddons,
  listRising,
  type SAAddon,
  type SARisingAddon,
} from "@/lib/providers/stremio-addons";
import { openUrl } from "@/lib/window";
import { SetIcon } from "@/views/settings/set-icon";
import { CATEGORY_TILES } from "./addons/discover-extras";
import { Chip, Department, EmptyCard, Field, FOCUS, INPUT, Pill, Segments, SkeletonRows } from "./addons/kit";

type Tab = "trending" | "top" | "new";

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 30;
const SITE_NAME = "stremio-addons.net";
const SITE_URL = "https://stremio-addons.net";

function isConfigurable(a: SAAddon): boolean {
  const bh = (a.manifest as { behaviorHints?: { configurable?: boolean; configurationRequired?: boolean } })
    ?.behaviorHints;
  return bh?.configurable === true || bh?.configurationRequired === true;
}

function isNewlyAdded(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const ts = Date.parse(createdAt);
  return Number.isFinite(ts) && Date.now() - ts < NEW_WINDOW_MS;
}

/**
 * Community addon browser for the phone addons page. Reads the same
 * stremio-addons.net source desktop uses (listAddons / listRising) with the
 * desktop community rail's three sorts, honours the category picked in the
 * grid above it the way desktop's browse list does, and installs through
 * installFromUrl, routing configurable addons to the shared configure webview.
 * Tapping a row opens the addon detail sheet.
 */
export function MobileAddonDiscover({
  index,
  installedIds,
  allowAdult,
  category,
  onClearCategory,
  onOpen,
  onChange,
}: {
  index: number;
  installedIds: Set<string>;
  allowAdult: boolean;
  category: string | null;
  onClearCategory: () => void;
  onOpen: (a: SAAddon) => void;
  onChange: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("trending");
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SAAddon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // A failed install used to leave the row looking untouched, so the only
  // signal was that nothing happened. Remember which row failed and say so.
  const [failed, setFailed] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const seenRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Trending has its own load/error state (unlike useRising, which returns an
  // empty array both while fetching and on failure, indistinguishable from a
  // real empty result, so the tab could hang blank).
  const [rising, setRising] = useState<SARisingAddon[]>([]);
  const [risingLoading, setRisingLoading] = useState(false);
  const [risingError, setRisingError] = useState(false);
  const [risingLoaded, setRisingLoaded] = useState(false);
  const risingReqRef = useRef(0);

  const loadRising = useCallback(() => {
    const req = ++risingReqRef.current;
    setRisingLoading(true);
    setRisingError(false);
    listRising()
      .then((list) => {
        if (risingReqRef.current === req) setRising(list);
      })
      .catch(() => {
        if (risingReqRef.current === req) setRisingError(true);
      })
      .finally(() => {
        if (risingReqRef.current === req) {
          setRisingLoading(false);
          setRisingLoaded(true);
        }
      });
  }, []);

  useEffect(() => {
    if (tab === "trending" && !risingLoading && !risingError && !risingLoaded) loadRising();
  }, [tab, risingLoading, risingError, risingLoaded, loadRising]);

  // Debounce the search field so we don't refetch on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => clearTimeout(id);
  }, [rawQuery]);

  // Same adult rule as desktop's browse list: excluded unless allowed, or
  // unless the reader deliberately picked the adult category.
  const nsfw = allowAdult || category === "nsfw" ? undefined : ("exclude" as const);

  // Reset the list whenever the tab, search, category or adult gate changes.
  useEffect(() => {
    seenRef.current = new Set();
    setItems([]);
    setPage(1);
    setExhausted(false);
    setError(false);
  }, [tab, query, allowAdult, category]);

  const loadMore = useCallback(async () => {
    if (loading || exhausted) return;
    setLoading(true);
    try {
      const res = await listAddons({
        page,
        limit: PAGE_LIMIT,
        sort_by: tab === "new" ? "createdAt" : "stars",
        order: "desc",
        ...(nsfw ? { nsfw } : {}),
        ...(category ? { category } : {}),
        ...(query ? { search: query } : {}),
      });
      const fresh = res.addons.filter((a) => {
        if (seenRef.current.has(a.uuid)) return false;
        seenRef.current.add(a.uuid);
        return true;
      });
      setItems((prev) => [...prev, ...fresh]);
      if (res.pagination.hasNextPage) setPage((p) => p + 1);
      else setExhausted(true);
    } catch {
      setError(true);
      setExhausted(true);
    } finally {
      setLoading(false);
    }
  }, [loading, exhausted, page, tab, query, nsfw, category]);

  const trending = filterRising(rising, query, allowAdult, category);

  useEffect(() => {
    if (tab === "trending") return;
    if (items.length === 0 && !loading && !exhausted) void loadMore();
  }, [tab, items.length, loading, exhausted, loadMore]);

  useEffect(() => {
    if (tab === "trending" || exhausted) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [tab, loadMore, exhausted, items.length]);

  const install = useCallback(
    async (a: SAAddon) => {
      const id = a.manifest?.id;
      if (!id || busy) return;
      const name = a.manifest?.name ?? a.slug;
      const logo = resolveAddonLogo(a.manifest?.logo, a.manifestUrl);
      if (isConfigurable(a)) {
        // Debrid/config addons need their own /configure page to be usable.
        openInstallerViewport(manifestToConfigureUrl(a.manifestUrl), name, logo);
        return;
      }
      setBusy(a.uuid);
      setFailed(null);
      try {
        await installFromUrl(a.manifestUrl);
        onChange();
      } catch {
        setFailed(a.uuid);
      } finally {
        setBusy(null);
      }
    },
    [busy, onChange],
  );

  const isTrending = tab === "trending";
  const rows = isTrending ? trending : items;
  const isLoading = isTrending ? risingLoading : loading;
  const isError = isTrending ? risingError : error;
  const showSkeleton = rows.length === 0 && isLoading && !isError;
  const showEmpty = !isLoading && !isError && rows.length === 0 && (!isTrending || risingLoaded);
  const categoryTitle = category ? CATEGORY_TILES.find((c) => c.cat === category)?.title ?? category : null;

  return (
    <Department
      index={index}
      kicker={t("Community index")}
      folio={String(index + 1).padStart(2, "0")}
      title={t("From {site}", { site: SITE_NAME })}
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openUrl(SITE_URL)}
            aria-label={t("Open {site}", { site: SITE_NAME })}
            className={`no-press h-11 w-11 shrink-0 ${FOCUS}`}
          >
            <img src={stremioAddonsLogo} alt="" draggable={false} className="h-full w-full object-contain" />
          </button>
          <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-ink-muted">
            {t("Ranked by the {site} community from their public index.", { site: SITE_NAME })}
          </p>
        </div>

        <Field icon={<SetIcon name="Search" size={17} strokeWidth={2.2} />} focused={focused}>
          <input
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t("Search community addons")}
            aria-label={t("Search community addons")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className={INPUT}
          />
        </Field>

        <Segments
          value={tab}
          onChange={setTab}
          items={[
            { id: "trending", label: t("Trending") },
            { id: "top", label: t("Top rated") },
            { id: "new", label: t("Just added") },
          ]}
        />

        {categoryTitle && (
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-ink-subtle">{t("Filtered to")}</span>
            <button
              type="button"
              onClick={onClearCategory}
              aria-label={t("Clear filter")}
              className={`no-press flex h-9 items-center gap-1.5 rounded-full bg-ink ps-3.5 pe-2.5 text-[13px] font-semibold text-canvas ${FOCUS}`}
            >
              {t(categoryTitle)}
              <SetIcon name="X" size={13} strokeWidth={2.6} />
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {rows.map((a) => (
            <DiscoverRow
              key={a.uuid}
              addon={a}
              installed={!!a.manifest?.id && installedIds.has(a.manifest.id)}
              busy={busy === a.uuid}
              failed={failed === a.uuid}
              showNew={tab === "new" && isNewlyAdded(a.createdAt)}
              showTrending={tab === "trending"}
              onInstall={install}
              onOpen={onOpen}
            />
          ))}

          {showSkeleton && <SkeletonRows n={5} h={72} />}

          {isError && rows.length === 0 && (
            <EmptyCard
              icon={<SetIcon name="AlertCircle" size={22} strokeWidth={2} />}
              title={t("Couldn't load community addons.")}
              action={
                <Pill
                  variant="primary"
                  small
                  onClick={() => {
                    if (isTrending) {
                      loadRising();
                      return;
                    }
                    seenRef.current = new Set();
                    setItems([]);
                    setPage(1);
                    setExhausted(false);
                    setError(false);
                  }}
                >
                  {t("Try again")}
                </Pill>
              }
            />
          )}

          {showEmpty && (
            <EmptyCard title={query ? t("No addons match \"{query}\".", { query }) : t("No addons to show yet.")} />
          )}

          {tab !== "trending" && <div ref={sentinelRef} className="h-px w-full" aria-hidden />}

          {tab !== "trending" && loading && items.length > 0 && (
            <div className="flex items-center justify-center py-3 text-ink-subtle">
              <SetIcon name="Loader2" size={17} className="animate-spin" />
            </div>
          )}
        </div>
      </div>
    </Department>
  );
}

function DiscoverRow({
  addon,
  installed,
  busy,
  failed,
  showNew,
  showTrending,
  onInstall,
  onOpen,
}: {
  addon: SAAddon;
  installed: boolean;
  busy: boolean;
  failed: boolean;
  showNew: boolean;
  showTrending: boolean;
  onInstall: (a: SAAddon) => void;
  onOpen: (a: SAAddon) => void;
}) {
  const t = useT();
  const m = addon.manifest;
  const name = m?.name ?? addon.slug;
  const description = (m?.description ?? "").trim();
  const types = (m?.types ?? []).slice(0, 3).join(" · ");
  const logo = resolveAddonLogo(m?.logo, addon.manifestUrl);
  const recentStars = (addon as { recentStars?: number }).recentStars;

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 py-2 ps-3.5 pe-2">
      <button
        type="button"
        onClick={() => onOpen(addon)}
        className={`no-press flex min-h-[52px] min-w-0 flex-1 items-start gap-3 py-1 text-start ${FOCUS}`}
      >
        <span className="shrink-0 pt-0.5">
          <AddonLogo addonId={m?.id ?? addon.slug} addonName={name} manifestLogo={logo} size="xl" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-medium text-ink">{name}</span>
            {addon.stars > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-ink-subtle">
                <SetIcon name="Star" size={10} strokeWidth={2.4} fill="currentColor" />
                {addon.stars.toLocaleString()}
              </span>
            )}
            {showNew && <Chip>{t("New")}</Chip>}
            {showTrending && recentStars != null && recentStars > 0 && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">
                <SetIcon name="TrendingUp" size={10} strokeWidth={2.6} />+{recentStars}
              </span>
            )}
          </span>
          {description && <span className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-muted">{description}</span>}
          {types && <span className="mt-0.5 truncate text-[11.5px] text-ink-subtle">{types}</span>}
          {failed && (
            <span className="mt-1 text-[11.5px] font-medium text-danger">
              {t("Could not add this addon. Tap Add to retry.")}
            </span>
          )}
        </span>
      </button>
      {installed ? (
        <Pill small variant="success" icon={<SetIcon name="Check" size={13} strokeWidth={2.6} />}>
          {t("Added")}
        </Pill>
      ) : (
        <Pill
          small
          variant="primary"
          disabled={busy}
          onClick={() => onInstall(addon)}
          ariaLabel={t("Add {name}", { name })}
          icon={busy ? undefined : <SetIcon name="Plus" size={13} strokeWidth={2.6} />}
        >
          {busy ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : failed ? t("Retry") : t("Add")}
        </Pill>
      )}
    </div>
  );
}

function filterRising(list: SAAddon[], query: string, allowAdult: boolean, category: string | null): SAAddon[] {
  const q = query.toLowerCase();
  return list.filter((a) => {
    if (!allowAdult && category !== "nsfw") {
      const bh = (a.manifest as { behaviorHints?: { adult?: boolean } } | undefined)?.behaviorHints;
      if (bh?.adult) return false;
    }
    if (category && !(a.categories ?? []).some((c) => c.slug === category)) return false;
    if (q) {
      const m = a.manifest as { name?: string; description?: string } | undefined;
      const name = (m?.name ?? "").toLowerCase();
      const desc = (m?.description ?? "").toLowerCase();
      if (!name.includes(q) && !desc.includes(q) && !a.slug.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}
