import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { Poster, usePosterChain } from "@/components/poster";
import { ScrollRootContext } from "@/components/row";
import { VirtualGrid } from "@/components/virtual-grid";
import { useSettings } from "@/lib/settings";

export const TMDB_PAGE_SIZE = 20;
export const MAX_PAGE = 12;

export type CatalogPage = { metas: Meta[]; more: boolean };
export type CatalogFetch = (page: number) => Promise<CatalogPage>;

export function mergeUnique(prev: Meta[], next: Meta[]): Meta[] {
  const seen = new Set(prev.map((m) => m.id));
  const out = prev.slice();
  for (const m of next) {
    if (m.poster && !seen.has(m.id)) {
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

export function MobileCatalogGrid({
  fetchPage,
  resetKey,
  enabled,
  emptyState,
  onOpenDetail,
  initialPages = 2,
}: {
  fetchPage: CatalogFetch;
  resetKey: string;
  enabled: boolean;
  emptyState: React.ReactNode;
  onOpenDetail: (m: Meta) => void;
  initialPages?: number;
}) {
  const [items, setItems] = useState<Meta[]>([]);
  const [nextPage, setNextPage] = useState(initialPages + 1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [retry, setRetry] = useState(0);
  const reqRef = useRef(0);
  const loadingRef = useRef(false);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  // Row-virtualize against the hosting scroller (BrowseScroll/ViewScroll) so a
  // fully paged grid (12 pages x 20) keeps ~2 screens of tiles mounted instead
  // of 240. The scroller arrives via ScrollRootContext; without one (unexpected
  // host) the plain grid below still works.
  const scrollEl = useContext(ScrollRootContext);
  const scrollElRef = useRef<HTMLElement | null>(null);
  scrollElRef.current = scrollEl;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [gridMargin, setGridMargin] = useState(0);
  const gridReady = status === "ready" && items.length > 0 && !!scrollEl;
  useEffect(() => {
    if (!gridReady) return;
    const el = wrapRef.current;
    const root = scrollEl;
    if (!el || !root) return;
    const measure = () => {
      const m = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
      setGridMargin(Math.max(0, Math.round(m)));
    };
    measure();
    // Remeasure after the page's 320ms entrance animation settles; the transform
    // skews the first getBoundingClientRect by up to 14px.
    const timer = window.setTimeout(measure, 400);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => {
      ro.disconnect();
      window.clearTimeout(timer);
    };
  }, [gridReady, scrollEl, resetKey]);

  useEffect(() => {
    reqRef.current += 1;
    const my = reqRef.current;
    loadingRef.current = false;
    setItems([]);
    setStatus("loading");
    setExhausted(false);
    setLoadingMore(false);
    setNextPage(initialPages + 1);
    if (!enabled) {
      setStatus("ready");
      return;
    }
    const pages = Array.from({ length: initialPages }, (_, i) => i + 1);
    Promise.all(pages.map((p) => fetchRef.current(p)))
      .then((res) => {
        if (reqRef.current !== my) return;
        setItems(mergeUnique([], res.flatMap((r) => r.metas)));
        setExhausted(!res[res.length - 1]?.more);
        setStatus("ready");
      })
      .catch(() => {
        if (reqRef.current === my) setStatus("error");
      });
  }, [resetKey, enabled, initialPages, retry]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || exhausted || status !== "ready" || !enabled) return;
    const my = reqRef.current;
    loadingRef.current = true;
    setLoadingMore(true);
    fetchRef
      .current(nextPage)
      .then((res) => {
        if (reqRef.current !== my) return;
        setItems((prev) => mergeUnique(prev, res.metas));
        setNextPage((p) => p + 1);
        setExhausted(!res.more);
      })
      .catch(() => {})
      .finally(() => {
        loadingRef.current = false;
        if (reqRef.current === my) setLoadingMore(false);
      });
  }, [exhausted, status, enabled, nextPage]);

  if (status === "loading") return <GridSkeleton />;
  if (status === "error") return <ErrorState onRetry={() => setRetry((r) => r + 1)} />;
  if (items.length === 0) return <>{emptyState}</>;

  return (
    <>
      {scrollEl ? (
        <div ref={wrapRef} className="px-4">
          <VirtualGrid
            items={items}
            scrollRef={scrollElRef}
            scrollMargin={gridMargin}
            estimateRowHeight={208}
            minColumnWidth={102}
            gapX={12}
            gapY={20}
            getKey={(m) => m.id}
            renderItem={(m) => <GridPoster meta={m} onOpen={onOpenDetail} />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(102px,1fr))] gap-x-3 gap-y-5 px-4">
          {items.map((m) => (
            <GridPoster key={m.id} meta={m} onOpen={onOpenDetail} />
          ))}
        </div>
      )}
      {!exhausted && <LoadMoreSentinel onLoadMore={loadMore} />}
      {loadingMore && <MoreSpinner />}
    </>
  );
}

function GridPoster({ meta, onOpen }: { meta: Meta; onOpen: (m: Meta) => void }) {
  const { settings } = useSettings();
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  return (
    <button
      type="button"
      onClick={() => onOpen(meta)}
      className="w-full text-start"
    >
      <Poster src={src} onError={onError} seed={meta.id} ratio="portrait" lazy="release" className="rounded-[14px]">
        {!settings.rpdbKey && meta.imdbRating && (
          <span className="pointer-events-none absolute bottom-1.5 end-1.5 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold text-white backdrop-blur-sm">
            <Star size={9} strokeWidth={0} fill="#f5c518" className="text-[#f5c518]" />
            {meta.imdbRating}
          </span>
        )}
      </Poster>
      <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">
        {meta.name}
      </p>
    </button>
  );
}

function LoadMoreSentinel({ onLoadMore }: { onLoadMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onLoadMore);
  cb.current = onLoadMore;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) cb.current();
      },
      { root: null, rootMargin: "800px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} aria-hidden className="h-1 w-full" />;
}

function MoreSpinner() {
  return (
    <div className="flex justify-center gap-1.5 py-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-ink/30 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 140}ms` }}
        />
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div
      className="grid grid-cols-[repeat(auto-fill,minmax(102px,1fr))] gap-x-3 gap-y-5 px-4"
      aria-hidden
    >
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="harbor-skeleton aspect-[2/3] rounded-[14px] bg-elevated/40"
        />
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[19px] font-medium text-ink">Couldn't load this catalog</h2>
        <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
          Harbor couldn't reach the catalog servers. Check your connection and try again.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="no-press flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas transition-transform active:scale-95"
      >
        Try again
      </button>
    </div>
  );
}
