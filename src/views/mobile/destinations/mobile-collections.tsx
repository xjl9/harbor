import { BookmarkPlus, Check, ChevronRight, Layers, Pencil, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { NavGlyph } from "@/components/icons/nav-glyph";
import { HarborLoader } from "@/components/harbor-loader";
import { posterPlate } from "@/components/poster";
import { ScrollRootContext } from "@/components/row";
import { ResultPoster } from "@/components/search/result-poster";
import { Avatar } from "@/components/together-modal/avatar";
import type { Meta, MetaType } from "@/lib/cinemeta";
import {
  MAX_COLLECTIONS,
  createCollection,
  deleteCollection,
  readCollections,
  saveCommunityCollection,
  useCollection,
  useCollections,
  type Collection,
  type CollectionItem,
  type CollectionItemType,
} from "@/lib/collections";
import { COLLECTION_CATEGORIES, COLLECTIONS_CATALOG } from "@/lib/collections-catalog";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import { searchManga } from "@/lib/manga/api";
import { purgeCollectionFromPages } from "@/lib/page-collection-rows";
import {
  collectionNameMatches,
  tmdbCollection,
  tmdbSearchCollectionId,
  tmdbSearchCollections,
  type CollectionHit,
} from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import {
  COMMUNITY_COLLECTIONS_EVENT,
  fetchCommunityCollections,
  notifyCommunityChanged,
  publishCollections,
  type CommunityCollection,
} from "@/lib/social/collections-sync";
import { useCurrentHandle } from "@/views/collections/community-share-button";
import { CommunityCollectionEditor } from "@/views/collections/community-editor";
import { useCategoryFeed } from "@/views/collections/use-category-feed";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { MobileDetail } from "../mobile-detail";
import { MangaDetailPage, MangaPhoneReader, type MangaReaderState } from "./mobile-manga";
import {
  Chip,
  ChipRow,
  DestinationPage,
  EmptyBlock,
  IconButton,
  LoadMoreSentinel,
  MetaTile,
  PosterGridSkeleton,
  PrimaryButton,
  SearchField,
  SectionHead,
  SubPage,
} from "./page-shell";

const TYPE_DOT: Record<CollectionItemType, string> = {
  movie: "bg-sky-400",
  series: "bg-emerald-400",
  manga: "bg-violet-400",
};

type Screen =
  | { kind: "page"; id: string }
  | { kind: "editor"; id: string }
  | { kind: "community"; collection: CommunityCollection }
  | { kind: "franchises" };

// Manga titles open the phone manga detail and reader on top of this page. A
// caller that owns its own manga navigation can pass an opener instead.
export function MobileCollections({
  onBack,
  onOpenManga,
}: {
  onBack: () => void;
  onOpenManga?: (id: string) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const collections = useCollections();
  const [community, setCommunity] = useState<CommunityCollection[] | null>(null);
  const [communityFailed, setCommunityFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stack, setStack] = useState<Screen[]>([]);
  const [detail, setDetail] = useState<Meta | null>(null);
  const [mangaStack, setMangaStack] = useState<string[]>([]);
  const [reader, setReader] = useState<MangaReaderState | null>(null);

  const push = (s: Screen) => setStack((cur) => [...cur, s]);
  const pop = useCallback(() => setStack((cur) => cur.slice(0, -1)), []);

  const loadCommunity = useCallback((signal?: AbortSignal) => {
    setRefreshing(true);
    return fetchCommunityCollections(signal)
      .then((list) => {
        setCommunity(list);
        setCommunityFailed(false);
      })
      .catch(() => {
        if (signal?.aborted) return;
        setCommunityFailed(true);
        setCommunity((prev) => prev ?? []);
      })
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void loadCommunity(ctrl.signal);
    const onChanged = () => void loadCommunity();
    window.addEventListener(COMMUNITY_COLLECTIONS_EVENT, onChanged);
    return () => {
      ctrl.abort();
      window.removeEventListener(COMMUNITY_COLLECTIONS_EVENT, onChanged);
    };
  }, [loadCommunity]);

  const atMax = collections.length >= MAX_COLLECTIONS;
  const create = () => {
    if (atMax) return;
    const id = createCollection(t("Untitled collection"));
    if (id) push({ kind: "editor", id });
  };

  // Metadata ids (anilist:, mal:) are not readable by the reader pipeline; like
  // the desktop match picker they resolve to the best title match on the
  // user's own sources.
  const openManga = async (item: CollectionItem) => {
    let id = item.id;
    if (id.startsWith("anilist:") || id.startsWith("mal:")) {
      const hits = await searchManga(item.name, 0).catch(() => []);
      const key = item.name.toLowerCase();
      id = (hits.find((h) => h.title.toLowerCase() === key) ?? hits[0])?.id ?? "";
    }
    if (id) setMangaStack((cur) => [...cur, id]);
  };

  const openItem = (item: CollectionItem) => {
    if (item.type === "manga") {
      if (onOpenManga) onOpenManga(item.id);
      else void openManga(item);
      return;
    }
    const type: MetaType = item.type === "series" ? "series" : "movie";
    setDetail({ id: item.id, type, name: item.name, poster: item.poster });
  };

  return (
    <DestinationPage
      kicker={t("Showcase")}
      title={t("Collections")}
      icon={<NavGlyph name="collections" className="h-[26px] w-[26px] p-[2px]" />}
      onBack={onBack}
      actions={
        <IconButton label={t("New collection")} onClick={create} disabled={atMax}>
          <Plus size={22} strokeWidth={2.2} />
        </IconButton>
      }
    >
      <p className="pb-5 text-[13.5px] leading-relaxed text-ink-muted">
        {t(
          "Curated, themed sets you can make beautiful and share by link. A Studio Ghibli shelf, the best heist movies, a marathon for a rainy weekend.",
        )}
      </p>

      {settings.tmdbKey && (
        <button
          type="button"
          onClick={() => push({ kind: "franchises" })}
          className="mb-7 flex w-full items-center gap-3.5 rounded-2xl border border-edge-soft bg-elevated/40 px-4 py-3.5 text-start active:bg-elevated/70"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-canvas/60 text-ink ring-1 ring-edge-soft">
            <Layers size={20} strokeWidth={1.9} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-semibold text-ink">{t("Every collection")}</span>
            <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-muted">
              {t("Every saga in one place. Search anything: if it exists, it's here.")}
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-ink-subtle dir-icon" />
        </button>
      )}

      <section className="flex flex-col gap-3">
        <SectionHead
          title={t("My collections")}
          count={collections.length > 0 ? t("{n} / {max}", { n: collections.length, max: MAX_COLLECTIONS }) : undefined}
        />
        {collections.length === 0 ? (
          <EmptyBlock
            icon={<Layers size={24} strokeWidth={1.6} />}
            title={t("Make your first collection")}
            body={t("Give it a cover, a background, and the titles you want to show off. Then share the link.")}
            action={
              <PrimaryButton tone="accent" onClick={create}>
                <Plus size={17} strokeWidth={2.2} />
                {t("New collection")}
              </PrimaryButton>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {collections.map((c) => (
              <CollectionCardTile key={c.id} collection={c} onOpen={() => push({ kind: "page", id: c.id })} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 flex flex-col gap-3">
        <SectionHead
          title={t("From the community")}
          trailing={
            <IconButton label={t("Refresh")} onClick={() => void loadCommunity()} disabled={refreshing}>
              <RefreshCw size={17} strokeWidth={2.2} className={refreshing ? "animate-spin" : ""} />
            </IconButton>
          }
        />
        {community === null ? (
          <div className="grid grid-cols-2 gap-3" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="aspect-[16/10] animate-pulse rounded-2xl bg-elevated/40" />
            ))}
          </div>
        ) : communityFailed ? (
          <EmptyBlock
            icon={<Users size={24} strokeWidth={1.6} />}
            title={t("Community collections are coming soon")}
            body={t("Shared collections from across Harbor will show up here soon.")}
          />
        ) : community.length === 0 ? (
          <EmptyBlock
            icon={<Users size={24} strokeWidth={1.6} />}
            title={t("No shared collections yet")}
            body={t(
              "When people share a collection it shows up here. Build one you love and share it, that is how it starts.",
            )}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {community.map((c) => (
              <CollectionCardTile
                key={`${c.handle}/${c.id}`}
                collection={c}
                author={c}
                onOpen={() => push({ kind: "community", collection: c })}
              />
            ))}
          </div>
        )}
      </section>

      {stack.map((s, i) => {
        const key = `${s.kind}-${i}`;
        if (s.kind === "page")
          return (
            <OwnCollectionPage
              key={key}
              id={s.id}
              onBack={pop}
              onEdit={() => push({ kind: "editor", id: s.id })}
              onOpenItem={openItem}
              canOpenManga
            />
          );
        if (s.kind === "editor")
          return (
            // The editor is the desktop component: single column below the sm
            // breakpoint, its own back and "view page" controls, and a 96px top
            // pad that already clears the status bar. It only needs a
            // full-screen host with the side insets.
            <div key={key} className="fixed inset-0 z-[73] flex animate-slide-from-right flex-col bg-canvas" style={MOBILE_SAFE_X}>
              <CommunityCollectionEditor
                id={s.id}
                onBack={pop}
                onViewPage={(id) => setStack((cur) => [...cur.slice(0, -1), { kind: "page", id }])}
              />
            </div>
          );
        if (s.kind === "community")
          return (
            <CommunityCollectionPage
              key={key}
              collection={s.collection}
              onBack={pop}
              onOpenItem={openItem}
              canOpenManga
            />
          );
        return <FranchisesPage key={key} onBack={pop} onOpenDetail={setDetail} />;
      })}

      {mangaStack.map((id, i) => (
        <MangaDetailPage
          key={`${id}-${i}`}
          mangaId={id}
          onBack={() => setMangaStack((cur) => cur.slice(0, i))}
          onRead={setReader}
        />
      ))}
      {reader && (
        <MangaPhoneReader
          state={reader}
          onChangeIndex={(index) => setReader((cur) => (cur ? { ...cur, index, startPage: 0 } : cur))}
          onExit={() => setReader(null)}
        />
      )}
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}

function coverFor(c: Collection): string | undefined {
  return c.coverImage || c.items.find((it) => it.poster)?.poster;
}

function CollectionCardTile({
  collection,
  author,
  onOpen,
}: {
  collection: Collection;
  author?: CommunityCollection;
  onOpen: () => void;
}) {
  const t = useT();
  const cover = coverFor(collection);
  const count = collection.items.length;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[16/10] w-full overflow-hidden rounded-2xl border border-edge-soft text-start"
        style={cover ? undefined : { background: posterPlate(collection.id + collection.name) }}
      >
        {cover && (
          <img src={cover} alt="" loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <span className="absolute start-2 top-2 inline-flex items-center rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md">
          {count === 1 ? t("{n} title", { n: count }) : t("{n} titles", { n: count })}
        </span>
        <h3 className="absolute inset-x-2.5 bottom-2 line-clamp-2 font-display text-[15px] font-medium leading-[1.1] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
          {collection.name}
        </h3>
      </button>
      {author && (
        <span className="flex min-w-0 items-center gap-1.5 px-0.5">
          <Avatar name={author.displayName} src={author.avatarUrl} size={18} />
          <span className="truncate text-[11.5px] font-medium text-ink-muted">{author.displayName}</span>
        </span>
      )}
    </div>
  );
}

function CollectionHero({ collection }: { collection: Collection }) {
  const poster = coverFor(collection);
  const backdrop = collection.bgImage || poster;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[46vh] overflow-hidden">
      {backdrop ? (
        <img
          src={backdrop}
          alt=""
          draggable={false}
          className={`h-full w-full object-cover ${collection.bgImage ? "" : "scale-110 blur-2xl"}`}
        />
      ) : (
        <div className="h-full w-full" style={{ background: posterPlate(collection.id + collection.name) }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/85 to-canvas" />
    </div>
  );
}

function ItemsGrid({
  items,
  numbered,
  onOpenItem,
  canOpenManga,
}: {
  items: CollectionItem[];
  numbered: boolean;
  onOpenItem: (item: CollectionItem) => void;
  canOpenManga: boolean;
}) {
  const t = useT();
  const [typeFilter, setTypeFilter] = useState<"all" | CollectionItemType>("all");
  const counts = useMemo(() => {
    const c = { movie: 0, series: 0, manga: 0 };
    for (const it of items) c[it.type]++;
    return c;
  }, [items]);
  const shown = typeFilter === "all" ? items : items.filter((it) => it.type === typeFilter);
  const distinct = [counts.movie, counts.series, counts.manga].filter((n) => n > 0).length;
  const typeLabel = (ty: CollectionItemType) =>
    ty === "movie" ? t("Movie") : ty === "series" ? t("Series") : t("Manga");
  return (
    <div className="flex flex-col gap-4">
      {distinct > 1 && (
        <ChipRow>
          <Chip label={t("All")} count={items.length} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
          {(["movie", "series", "manga"] as const).map((ty) =>
            counts[ty] > 0 ? (
              <Chip
                key={ty}
                label={ty === "movie" ? t("Movies") : ty === "series" ? t("Series") : t("Manga")}
                icon={<span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[ty]}`} />}
                count={counts[ty]}
                active={typeFilter === ty}
                onClick={() => setTypeFilter(ty)}
              />
            ) : null,
          )}
        </ChipRow>
      )}
      <div className="grid grid-cols-3 gap-x-3 gap-y-5">
        {shown.map((item, i) => {
          const tappable = item.type !== "manga" || canOpenManga;
          const inner = (
            <>
              <div className="relative">
                <ResultPoster id={item.id} poster={item.poster} className="rounded-lg ring-1 ring-white/[0.06]" />
                {numbered && typeFilter === "all" && (
                  <span className="pointer-events-none absolute start-1.5 top-1.5 flex min-w-[1.4rem] items-center justify-center rounded-full bg-black/70 px-1.5 py-0.5 text-[11.5px] font-bold tabular-nums text-white backdrop-blur-md">
                    {i + 1}
                  </span>
                )}
                {distinct > 1 && (
                  <span className="pointer-events-none absolute bottom-1.5 start-1.5 inline-flex items-center gap-1 rounded-full bg-black/60 py-0.5 ps-1.5 pe-2 text-[9.5px] font-semibold text-white/90 backdrop-blur-md">
                    <span className={`h-1.5 w-1.5 rounded-full ${TYPE_DOT[item.type]}`} />
                    {typeLabel(item.type)}
                  </span>
                )}
              </div>
              <span className="mt-1.5 line-clamp-2 block text-[12px] font-medium leading-snug text-ink-muted">
                {item.name}
              </span>
            </>
          );
          return tappable ? (
            <button key={item.id} type="button" onClick={() => onOpenItem(item)} className="min-w-0 text-start">
              {inner}
            </button>
          ) : (
            <div key={item.id} className="min-w-0">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OwnCollectionPage({
  id,
  onBack,
  onEdit,
  onOpenItem,
  canOpenManga,
}: {
  id: string;
  onBack: () => void;
  onEdit: () => void;
  onOpenItem: (item: CollectionItem) => void;
  canOpenManga: boolean;
}) {
  const t = useT();
  const collection = useCollection(id);

  const remove = () => {
    if (!collection) return;
    void confirmDialog(t("Delete this collection?")).then((ok) => {
      if (!ok) return;
      deleteCollection(id);
      purgeCollectionFromPages(id);
      void publishCollections(readCollections())
        .then(() => notifyCommunityChanged())
        .catch(() => {});
      onBack();
    });
  };

  if (!collection) {
    return (
      <SubPage title={t("Collections")} onBack={onBack}>
        <EmptyBlock title={t("This collection is no longer here.")} />
      </SubPage>
    );
  }
  const count = collection.items.length;
  return (
    <SubPage
      kicker={t("Collection")}
      title={collection.name}
      onBack={onBack}
      actions={
        <>
          <IconButton label={t("Edit")} onClick={onEdit}>
            <Pencil size={18} strokeWidth={2} />
          </IconButton>
          <IconButton label={t("Delete")} onClick={remove}>
            <Trash2 size={18} strokeWidth={2} />
          </IconButton>
        </>
      }
    >
      <div className="relative isolate">
        <CollectionHero collection={collection} />
        <header className="flex flex-col gap-2 pb-6 pt-24">
          <h2 className="font-display text-[32px] font-medium leading-[1.05] tracking-tight text-ink">
            {collection.name}
          </h2>
          <span className="text-[13px] tabular-nums text-ink-subtle">
            {count === 1 ? t("{n} title", { n: count }) : t("{n} titles", { n: count })}
          </span>
          {collection.description && (
            <p className="text-[14.5px] leading-relaxed text-ink-muted">{collection.description}</p>
          )}
        </header>
        {count === 0 ? (
          <EmptyBlock
            title={t("Nothing here yet")}
            body={t("Open the editor to add the movies, shows, and manga that belong in this collection.")}
            action={
              <PrimaryButton tone="accent" onClick={onEdit}>
                <Pencil size={15} strokeWidth={2.2} />
                {t("Add titles")}
              </PrimaryButton>
            }
          />
        ) : (
          <ItemsGrid
            items={collection.items}
            numbered={!!collection.numbered}
            onOpenItem={onOpenItem}
            canOpenManga={canOpenManga}
          />
        )}
      </div>
    </SubPage>
  );
}

function CommunityCollectionPage({
  collection,
  onBack,
  onOpenItem,
  canOpenManga,
}: {
  collection: CommunityCollection;
  onBack: () => void;
  onOpenItem: (item: CollectionItem) => void;
  canOpenManga: boolean;
}) {
  const t = useT();
  const mine = useCollections();
  const handle = useCurrentHandle();
  const saved = mine.some((c) => c.sourceHandle === collection.handle && c.sourceId === collection.id);
  const isOwn = !!handle && handle.toLowerCase() === collection.handle.toLowerCase();
  const count = collection.items.length;
  return (
    <SubPage
      kicker={t("Collection")}
      title={collection.name}
      onBack={onBack}
      actions={
        isOwn ? undefined : (
          <IconButton
            label={saved ? t("Saved to your collections") : t("Save to my collections")}
            onClick={() => {
              if (!saved) saveCommunityCollection(collection);
            }}
            active={saved}
          >
            {saved ? <Check size={20} strokeWidth={2.4} /> : <BookmarkPlus size={20} strokeWidth={2.2} />}
          </IconButton>
        )
      }
    >
      <div className="relative isolate">
        <CollectionHero collection={collection} />
        <header className="flex flex-col gap-3 pb-6 pt-24">
          <h2 className="font-display text-[32px] font-medium leading-[1.05] tracking-tight text-ink">
            {collection.name}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-edge-soft bg-elevated/60 py-1 ps-1 pe-3 backdrop-blur-md">
              <Avatar name={collection.displayName} src={collection.avatarUrl} size={24} />
              <span className="text-[13px] font-semibold text-ink">@{collection.handle}</span>
            </span>
            <span className="text-[13px] tabular-nums text-ink-subtle">
              {count === 1 ? t("{n} title", { n: count }) : t("{n} titles", { n: count })}
            </span>
          </div>
          {collection.description && (
            <p className="text-[14.5px] leading-relaxed text-ink-muted">{collection.description}</p>
          )}
          {!isOwn && (
            <div className="pt-1">
              <PrimaryButton
                tone={saved ? "ink" : "accent"}
                disabled={saved}
                onClick={() => {
                  if (!saved) saveCommunityCollection(collection);
                }}
              >
                {saved ? <Check size={17} strokeWidth={2.4} /> : <BookmarkPlus size={17} strokeWidth={2.2} />}
                {saved ? t("Saved to your collections") : t("Save to my collections")}
              </PrimaryButton>
            </div>
          )}
        </header>
        {count === 0 ? (
          <EmptyBlock title={t("Nothing here yet")} body={t("This collection does not have any titles in it right now.")} />
        ) : (
          <ItemsGrid items={collection.items} numbered={!!collection.numbered} onOpenItem={onOpenItem} canOpenManga={canOpenManga} />
        )}
      </div>
    </SubPage>
  );
}

const FEED_QUERY = "collection";

function stripSuffix(name: string): string {
  return name.replace(/\s*(?:-|:)?\s*(?:the\s+)?collection$/i, "").trim() || name;
}

// The desktop TMDB collection index: curated franchises by category, a feed of
// more per category, and a search over every collection TMDB has.
function FranchisesPage({ onBack, onOpenDetail }: { onBack: () => void; onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [active, setActive] = useState<{ id: number; name: string } | null>(null);
  const searchActive = query.trim().length >= 2;
  const remoteQuery = searchActive ? query.trim() : category === "All" ? FEED_QUERY : "";

  const [hits, setHits] = useState<CollectionHit[]>([]);
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const epoch = useRef(0);

  const curated = useMemo(
    () => (category === "All" ? COLLECTIONS_CATALOG : COLLECTIONS_CATALOG.filter((c) => c.cats.includes(category))),
    [category],
  );
  const curatedNames = useMemo(() => new Set(COLLECTIONS_CATALOG.map((c) => c.name.toLowerCase())), []);
  const catFeed = useCategoryFeed({
    tmdbKey: settings.tmdbKey,
    category,
    active: !searchActive && category !== "All",
    excludeNames: curatedNames,
    stripSuffix,
  });

  useEffect(() => {
    epoch.current += 1;
    setHits([]);
    setPage(0);
    setDone(!remoteQuery);
    setLoading(false);
    loadingRef.current = false;
  }, [remoteQuery]);

  const loadMore = useCallback(() => {
    if (done || !remoteQuery || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const next = page + 1;
    const my = epoch.current;
    const run = () =>
      tmdbSearchCollections(settings.tmdbKey, remoteQuery, next)
        .then(({ hits: batch, totalPages }) => {
          if (epoch.current !== my) return;
          setPage(next);
          if (batch.length === 0 || next >= totalPages) setDone(true);
          setHits((prev) => {
            const seen = new Set(prev.map((h) => h.id));
            return [
              ...prev,
              ...batch.filter(
                (h) =>
                  !seen.has(h.id) &&
                  !(remoteQuery === FEED_QUERY && curatedNames.has(stripSuffix(h.name).toLowerCase())),
              ),
            ];
          });
        })
        .catch(() => {
          if (epoch.current === my) setDone(true);
        })
        .finally(() => {
          if (epoch.current !== my) return;
          loadingRef.current = false;
          setLoading(false);
        });
    // Typing settles before the first search page goes out.
    if (searchActive && next === 1) window.setTimeout(() => epoch.current === my && void run(), 350);
    else void run();
  }, [done, remoteQuery, page, settings.tmdbKey, searchActive, curatedNames]);

  return (
    <SubPage kicker={t("Showcase")} title={t("Collections")} onBack={onBack}>
      <div className="flex flex-col gap-2.5 pb-5">
        <SearchField value={query} onChange={setQuery} placeholder={t("Search every collection on TMDB...")} />
        {!searchActive && (
          <ChipRow>
            {["All", ...COLLECTION_CATEGORIES].map((c) => (
              <Chip key={c} label={t(c)} active={category === c} onClick={() => setCategory(c)} />
            ))}
          </ChipRow>
        )}
      </div>
      <div className="flex flex-col gap-8">
        {!searchActive && (
          <section className="flex flex-col gap-3">
            <p className="text-[12.5px] text-ink-subtle">
              {curated.length === 1
                ? t("{label} · {n} collection", { label: category === "All" ? t("Featured") : t(category), n: curated.length })
                : t("{label} · {n} collections", { label: category === "All" ? t("Featured") : t(category), n: curated.length })}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {curated.map((c) => (
                <TmdbTile key={`${c.id}-${c.name}`} id={c.id} name={c.name} onOpen={setActive} />
              ))}
            </div>
          </section>
        )}
        {!searchActive && category !== "All" && (
          <section className="flex flex-col gap-3">
            <p className="text-[12.5px] text-ink-subtle">{t("More {category}", { category: t(category) })}</p>
            {catFeed.hits.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {catFeed.hits.map((h) => (
                  <TmdbTile key={h.id} id={h.id} name={h.name} knownBackdrop={h.backdrop} knownCount={h.count} onOpen={setActive} />
                ))}
              </div>
            )}
            {!catFeed.done && <div ref={catFeed.sentinelRef} className="h-2" />}
            {catFeed.loading && (
              <div className="flex justify-center py-4">
                <HarborLoader size="sm" />
              </div>
            )}
            {catFeed.done && (
              <p className="py-3 text-center text-[12.5px] text-ink-subtle">
                {catFeed.hits.length > 0
                  ? t("That's every {category} collection we could find.", { category: t(category) })
                  : t("No more found for this category.")}
              </p>
            )}
          </section>
        )}
        {remoteQuery && (
          <section className="flex flex-col gap-3">
            <p className="text-[12.5px] text-ink-subtle">
              {searchActive
                ? hits.length === 0 && done
                  ? t("Nothing matched. Try the franchise's first film name.")
                  : t('Results for "{query}"', { query: query.trim() })
                : t("Every collection")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {hits.map((h) => (
                <TmdbTile key={h.id} id={h.id} name={stripSuffix(h.name)} knownBackdrop={h.backdrop} onOpen={setActive} />
              ))}
            </div>
            {!done && <LoadMoreSentinel key={`${remoteQuery}:${page}`} onLoadMore={loadMore} />}
            {loading && (
              <div className="flex justify-center py-4">
                <HarborLoader size="sm" />
              </div>
            )}
            {done && hits.length > 0 && (
              <p className="py-3 text-center text-[12.5px] text-ink-subtle">{t("That's every collection TMDB knows about.")}</p>
            )}
          </section>
        )}
      </div>
      {active && <TmdbMembersPage id={active.id} name={active.name} onBack={() => setActive(null)} onOpenDetail={onOpenDetail} />}
    </SubPage>
  );
}

function TmdbTile({
  id,
  name,
  knownBackdrop,
  knownCount,
  onOpen,
}: {
  id: number;
  name: string;
  knownBackdrop?: string | null;
  knownCount?: number | null;
  onOpen: (c: { id: number; name: string }) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const root = useContext(ScrollRootContext);
  const [el, setEl] = useState<HTMLButtonElement | null>(null);
  const [inView, setInView] = useState(false);
  const [backdrop, setBackdrop] = useState<string | null>(knownBackdrop ?? null);
  const [count, setCount] = useState<number | null>(knownCount ?? null);
  const [resolvedId, setResolvedId] = useState(id);

  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { root: root ?? null, rootMargin: "250px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, root]);

  useEffect(() => {
    if (!inView || (knownBackdrop && knownCount != null)) return;
    let cancelled = false;
    void (async () => {
      // Same heal path as the desktop card: fall back to a name search when
      // the hardcoded id is missing or resolves to the wrong set.
      let c = id > 0 ? await tmdbCollection(settings.tmdbKey, id).catch(() => null) : null;
      if (!c || (id <= 0 && !collectionNameMatches(c.name, name))) {
        const healed = await tmdbSearchCollectionId(settings.tmdbKey, name).catch(() => null);
        if (healed != null && healed !== id) c = await tmdbCollection(settings.tmdbKey, healed).catch(() => null);
      }
      if (cancelled || !c) return;
      setBackdrop(c.backdrop ?? null);
      setCount(c.parts.length);
      setResolvedId(c.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, id, name, settings.tmdbKey, knownBackdrop, knownCount]);

  const hue = ((id || name.length * 37) * 47) % 360;
  return (
    <button
      ref={setEl}
      type="button"
      onClick={() => resolvedId > 0 && onOpen({ id: resolvedId, name })}
      className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl text-start ring-1 ring-edge-soft/50"
      style={{ background: `linear-gradient(140deg, oklch(0.42 0.13 ${hue}), oklch(0.15 0.06 ${hue}))` }}
    >
      {backdrop && (
        <img
          src={backdrop.replace("/t/p/original/", "/t/p/w780/")}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/30 to-transparent" />
      <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-white/85 backdrop-blur-md">
        <Layers size={10} strokeWidth={2.4} />
        {count != null ? t("{count} films", { count }) : t("Collection")}
      </span>
      <h3 className="absolute inset-x-2.5 bottom-2 line-clamp-2 font-display text-[15px] font-medium leading-[1.1] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
        {name}
      </h3>
    </button>
  );
}

function TmdbMembersPage({
  id,
  name,
  onBack,
  onOpenDetail,
}: {
  id: number;
  name: string;
  onBack: () => void;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [members, setMembers] = useState<Meta[] | null>(null);
  const [overview, setOverview] = useState("");
  useEffect(() => {
    let cancelled = false;
    setMembers(null);
    tmdbCollection(settings.tmdbKey, id)
      .then((c) => {
        if (cancelled) return;
        setMembers(c?.parts ?? []);
        setOverview(c?.overview ?? "");
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, settings.tmdbKey]);
  return (
    <SubPage kicker={t("Collection")} title={name} onBack={onBack}>
      {overview && <p className="pb-5 text-[14px] leading-relaxed text-ink-muted">{overview}</p>}
      {members === null ? (
        <PosterGridSkeleton count={6} />
      ) : members.length === 0 ? (
        <EmptyBlock icon={<Layers size={24} strokeWidth={1.9} />} title={t("This collection has no titles to show yet.")} />
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-5">
          {members.map((m) => (
            <MetaTile key={m.id} meta={m} onOpen={onOpenDetail} caption={m.releaseInfo} />
          ))}
        </div>
      )}
    </SubPage>
  );
}
