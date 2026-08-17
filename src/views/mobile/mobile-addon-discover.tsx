import { AlertCircle, Check, Loader2, Plus, Search, Sparkles, Star, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AddonLogo, resolveAddonLogo } from "@/components/addon-logo";
import { openInstallerViewport } from "@/components/installer-viewport";
import { installFromUrl, manifestToConfigureUrl } from "@/lib/addon-store";
import {
  listAddons,
  listRising,
  type SAAddon,
  type SARisingAddon,
} from "@/lib/providers/stremio-addons";

type Tab = "top" | "new" | "trending";

const NEW_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 30;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "top", label: "Top" },
  { id: "new", label: "New" },
  { id: "trending", label: "Trending" },
];

function isConfigurable(a: SAAddon): boolean {
  const bh = (a.manifest as { behaviorHints?: { configurable?: boolean; configurationRequired?: boolean } })
    ?.behaviorHints;
  return bh?.configurable === true || bh?.configurationRequired === true;
}

function isNewlyAdded(createdAt: string | undefined): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return Number.isFinite(t) && Date.now() - t < NEW_WINDOW_MS;
}

/**
 * Community addon browser for the mobile addons sheet. Reads the same
 * stremio-addons.net source desktop uses (listAddons / useRising) and installs
 * through the existing mobile path (installFromUrl -> harbor.installed-addons),
 * routing configurable addons to the shared configure webview.
 */
export function MobileAddonDiscover({
  installedIds,
  allowAdult,
  onChange,
}: {
  installedIds: Set<string>;
  allowAdult: boolean;
  onChange: () => void;
}) {
  const [tab, setTab] = useState<Tab>("top");
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SAAddon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const seenRef = useRef<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Trending has its own load/error state (unlike useRising, which returns an
  // empty array both while fetching and on failure — indistinguishable from a
  // real empty result, so the tab could hang blank). listRising gives us the
  // promise directly so the trending tab shows skeletons and an error+retry.
  const [rising, setRising] = useState<SARisingAddon[]>([]);
  const [risingLoading, setRisingLoading] = useState(false);
  const [risingError, setRisingError] = useState(false);
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
        if (risingReqRef.current === req) setRisingLoading(false);
      });
  }, []);

  // Fetch trending the first time that tab is opened (and not before, so the
  // default Top tab stays the only request on mount).
  useEffect(() => {
    if (tab === "trending" && !risingLoading && !risingError && rising.length === 0) {
      loadRising();
    }
  }, [tab, risingLoading, risingError, rising.length, loadRising]);

  // Debounce the search field so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const nsfw = allowAdult ? undefined : ("exclude" as const);

  // Reset the list whenever the tab, search, or adult gate changes.
  useEffect(() => {
    seenRef.current = new Set();
    setItems([]);
    setPage(1);
    setExhausted(false);
    setError(false);
  }, [tab, query, allowAdult]);

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
  }, [loading, exhausted, page, tab, query, nsfw]);

  // Trending is served fully client-side by useRising(); no pagination.
  const trending = filterRising(rising, query, allowAdult);

  // Initial / reset load for the paginated tabs.
  useEffect(() => {
    if (tab === "trending") return;
    if (items.length === 0 && !loading && !exhausted) void loadMore();
  }, [tab, items.length, loading, exhausted, loadMore]);

  // Infinite scroll sentinel for the paginated tabs.
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
      try {
        await installFromUrl(a.manifestUrl);
        onChange();
      } catch {
        // Non-fatal: leave the row installable so the user can retry.
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
  const showEmpty = !isLoading && !isError && rows.length === 0;

  return (
    <section className="mt-7 flex flex-col gap-3">
      <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
        Discover
      </h2>

      <div className="flex items-center gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-3.5 py-2">
        <Search size={17} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
        <input
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
          placeholder="Search community addons"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none"
        />
      </div>

      <div className="flex gap-1.5">
        {TABS.map((tt) => {
          const active = tt.id === tab;
          return (
            <button
              key={tt.id}
              type="button"
              onClick={() => setTab(tt.id)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors active:scale-[0.98] ${
                active ? "bg-ink text-canvas" : "bg-elevated/50 text-ink-muted"
              }`}
            >
              {tt.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((a) => (
          <DiscoverRow
            key={a.uuid}
            addon={a}
            installed={!!a.manifest?.id && installedIds.has(a.manifest.id)}
            busy={busy === a.uuid}
            showNew={tab === "new" && isNewlyAdded(a.createdAt)}
            showTrending={tab === "trending"}
            onInstall={install}
          />
        ))}

        {showSkeleton &&
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="harbor-skeleton h-[64px] w-full rounded-2xl border border-edge-soft/60 bg-elevated/30"
            />
          ))}

        {isError && rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-6 py-8 text-center">
            <AlertCircle size={20} strokeWidth={2} className="text-ink-subtle" />
            <p className="text-[13.5px] text-ink-muted">Couldn't load community addons.</p>
            <button
              type="button"
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
              className="no-press rounded-full bg-ink px-4 py-1.5 text-[13px] font-semibold text-canvas transition-transform active:scale-95"
            >
              Try again
            </button>
          </div>
        )}

        {showEmpty && (
          <div className="rounded-2xl border border-edge-soft/70 bg-elevated/40 px-6 py-8 text-center">
            <p className="text-[13.5px] text-ink-muted">
              {query ? `No addons match "${query}".` : "No addons to show yet."}
            </p>
          </div>
        )}

        {tab !== "trending" && <div ref={sentinelRef} className="h-px w-full" aria-hidden />}

        {tab !== "trending" && loading && items.length > 0 && (
          <div className="flex items-center justify-center py-3 text-ink-subtle">
            <Loader2 size={17} className="animate-spin" />
          </div>
        )}
      </div>
    </section>
  );
}

function DiscoverRow({
  addon,
  installed,
  busy,
  showNew,
  showTrending,
  onInstall,
}: {
  addon: SAAddon;
  installed: boolean;
  busy: boolean;
  showNew: boolean;
  showTrending: boolean;
  onInstall: (a: SAAddon) => void;
}) {
  const m = addon.manifest;
  const name = m?.name ?? addon.slug;
  const description = (m?.description ?? "").trim();
  const types = (m?.types ?? []).slice(0, 3).join(" · ");
  const logo = resolveAddonLogo(m?.logo, addon.manifestUrl);
  const recentStars = (addon as { recentStars?: number }).recentStars;

  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-4 py-3">
      <div className="shrink-0 pt-0.5">
        <AddonLogo addonId={m?.id ?? addon.slug} addonName={name} manifestLogo={logo} size="xl" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[15px] font-medium text-ink">{name}</p>
          {addon.stars > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-ink-subtle">
              <Star size={10} strokeWidth={2.4} fill="currentColor" />
              {addon.stars.toLocaleString()}
            </span>
          )}
          {showNew && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-raised px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-ink-muted">
              <Sparkles size={9} strokeWidth={2.6} />
              New
            </span>
          )}
          {showTrending && recentStars != null && recentStars > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-raised px-1.5 py-0.5 text-[9.5px] font-bold text-ink-muted">
              <TrendingUp size={9} strokeWidth={2.6} />+{recentStars}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-muted">{description}</p>
        )}
        {types && <p className="mt-0.5 truncate text-[11.5px] text-ink-subtle">{types}</p>}
      </div>
      <button
        type="button"
        disabled={installed || busy}
        onClick={() => onInstall(addon)}
        className={`mt-0.5 shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-transform active:scale-95 ${
          installed ? "bg-transparent text-success" : "bg-ink text-canvas disabled:opacity-40"
        }`}
      >
        {installed ? (
          <span className="flex items-center gap-1">
            <Check size={14} strokeWidth={2.6} /> Added
          </span>
        ) : busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <span className="flex items-center gap-1">
            <Plus size={14} strokeWidth={2.6} /> Add
          </span>
        )}
      </button>
    </div>
  );
}

function filterRising(list: SAAddon[], query: string, allowAdult: boolean): SAAddon[] {
  const q = query.toLowerCase();
  return list.filter((a) => {
    if (!allowAdult) {
      const bh = (a.manifest as { behaviorHints?: { adult?: boolean } } | undefined)?.behaviorHints;
      if (bh?.adult) return false;
    }
    if (q) {
      const m = a.manifest as { name?: string; description?: string } | undefined;
      const name = (m?.name ?? "").toLowerCase();
      const desc = (m?.description ?? "").toLowerCase();
      if (!name.includes(q) && !desc.includes(q) && !a.slug.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}
