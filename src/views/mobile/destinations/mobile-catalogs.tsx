import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Pin,
  PinOff,
  Puzzle,
} from "lucide-react";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CatalogsIcon } from "@/components/icons/catalogs-icon";
import { AllAddonsIcon } from "@/components/icons/harbor-glyphs";
import { NavGlyph } from "@/components/icons/nav-glyph";
import { PencilOutlineIcon } from "@/components/icons/pencil-outline";
import { ScrollRootContext } from "@/components/row";
import { useHideAnimeMetas } from "@/lib/anime-hide";
import { useAuth } from "@/lib/auth";
import {
  browseFetcher,
  catalogTypeLabelKey,
  listBrowseCatalogs,
  type BrowseCatalog,
} from "@/lib/catalog-browse";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { togglePinnedCatalog, useIsPinned } from "@/lib/pinned-catalogs";
import { useSettings } from "@/lib/settings";
import { useCatalogList, type AddonGroup, type AddonRef } from "@/views/catalogs/use-catalog-list";
import { MAX_PAGE, MobileCatalogGrid, type CatalogFetch } from "../mobile-catalog-page";
import { MobileDetail } from "../mobile-detail";
import { requestMobileIntent } from "../mobile-intent";
import { PosterTile } from "../mobile-rail";
import {
  Chip,
  ChipRow,
  DestinationPage,
  EmptyBlock,
  IconButton,
  PrimaryButton,
  RailSkeleton,
  SearchField,
  SubPage,
} from "./page-shell";

const RAIL_CULL = "[content-visibility:auto] [contain-intrinsic-size:auto_280px]";

export function MobileCatalogs({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { authKey } = useAuth();
  const { settings, update } = useSettings();
  const [catalogs, setCatalogs] = useState<BrowseCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [addonFilter, setAddonFilter] = useState("all");
  const [customize, setCustomize] = useState(false);
  const [grid, setGrid] = useState<BrowseCatalog | null>(null);
  const [detail, setDetail] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listBrowseCatalogs(authKey).then((list) => {
      if (cancelled) return;
      setCatalogs(list);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  const pinned = settings.catalogsPinned ?? [];
  const hidden = settings.catalogsHidden ?? [];
  const { types, addons, filtered, pinnedCats, pinnedSet, hiddenSet, groups } = useCatalogList(
    catalogs,
    { query, typeFilter, addonFilter },
    pinned,
    hidden,
  );

  const togglePin = (key: string) =>
    update({
      catalogsPinned: pinned.includes(key) ? pinned.filter((k) => k !== key) : [...pinned, key],
    });
  const toggleHide = (key: string) =>
    update({
      catalogsHidden: hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key],
    });
  const movePin = (key: string, dir: -1 | 1) => {
    const arr = [...pinned];
    const i = arr.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update({ catalogsPinned: arr });
  };

  const hiddenCount = useMemo(
    () => (customize ? 0 : catalogs.filter((c) => hiddenSet.has(c.key)).length),
    [customize, catalogs, hiddenSet],
  );

  const hasCatalogs = !loading && catalogs.length > 0;

  return (
    <DestinationPage
      kicker={t("Browse")}
      title={t("Catalogs")}
      icon={<CatalogsIcon />}
      onBack={onBack}
      actions={
        hasCatalogs ? (
          <button
            type="button"
            onClick={() => setCustomize((v) => !v)}
            aria-pressed={customize}
            className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ${
              customize ? "bg-ink text-canvas" : "bg-elevated text-ink-muted ring-1 ring-edge-soft/70"
            }`}
          >
            {customize ? <Check size={15} strokeWidth={2.4} /> : <PencilOutlineIcon size={13} />}
            {customize ? t("Done") : t("Customize")}
          </button>
        ) : undefined
      }
    >
      <p className="pb-4 text-[13.5px] leading-relaxed text-ink-muted">
        {customize
          ? t("Choose what shows, what stays hidden, and what sits up top.")
          : t("Everything your addons offer, shown as posters. Scroll, search, or filter to what you want.")}
      </p>

      {hasCatalogs && (
        <div className="flex flex-col gap-2.5 pb-5">
          <SearchField value={query} onChange={setQuery} placeholder={t("Search catalogs")} />
          <ChipRow>
            <Chip label={t("All")} active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
            {types.map((ty) => {
              const labelKey = catalogTypeLabelKey(ty);
              return (
                <Chip
                  key={ty}
                  label={labelKey ? t(labelKey) : ty}
                  active={typeFilter === ty}
                  onClick={() => setTypeFilter(ty)}
                />
              );
            })}
          </ChipRow>
          {addons.length > 1 && (
            <ChipRow>
              <Chip
                label={t("All addons")}
                icon={<AllAddonsIcon size={14} className="text-current" />}
                active={addonFilter === "all"}
                onClick={() => setAddonFilter("all")}
              />
              {addons.map((a) => (
                <Chip
                  key={a.name}
                  label={a.name}
                  icon={<AddonMark addon={a} size={16} />}
                  count={a.count}
                  active={addonFilter === a.name}
                  onClick={() => setAddonFilter(a.name)}
                />
              ))}
            </ChipRow>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-8">
          <RailSkeleton />
          <RailSkeleton />
          <RailSkeleton />
        </div>
      ) : catalogs.length === 0 ? (
        <EmptyBlock
          icon={<Puzzle size={26} strokeWidth={1.6} />}
          title={t("No catalogs yet")}
          body={t("Install a Stremio addon and its catalogs show up here as poster rails, ready to browse.")}
          action={
            <PrimaryButton onClick={() => requestMobileIntent("addons")}>{t("Browse addons")}</PrimaryButton>
          }
        />
      ) : customize ? (
        filtered.length === 0 ? (
          <NoMatch />
        ) : (
          <ManageList
            filtered={filtered}
            pinnedCats={pinnedCats}
            pinnedSet={pinnedSet}
            hiddenSet={hiddenSet}
            onTogglePin={togglePin}
            onToggleHide={toggleHide}
            onMovePin={movePin}
          />
        )
      ) : pinnedCats.length === 0 && groups.length === 0 ? (
        hiddenCount > 0 ? (
          <EmptyBlock
            title={
              hiddenCount === 1
                ? t("You've hidden the one catalog that matched.")
                : t("You've hidden every catalog that matched.")
            }
            action={<PrimaryButton onClick={() => setCustomize(true)}>{t("Customize")}</PrimaryButton>}
          />
        ) : (
          <NoMatch />
        )
      ) : (
        <div className="flex flex-col gap-8">
          {pinnedCats.length > 0 && (
            <section className="flex flex-col gap-5">
              <GroupHead
                title={t("Pinned")}
                count={pinnedCats.length}
                mark={<Pin size={15} className="text-accent" />}
              />
              {pinnedCats.map((c) => (
                <CatalogRail key={c.key} catalog={c} onOpenAll={setGrid} onOpenDetail={setDetail} />
              ))}
            </section>
          )}
          {groups.map((g) => (
            <section key={g.name} className="flex flex-col gap-5">
              <GroupHead title={g.name} count={g.cats.length} mark={<GroupMark group={g} />} />
              {g.cats.map((c) => (
                <CatalogRail key={c.key} catalog={c} onOpenAll={setGrid} onOpenDetail={setDetail} />
              ))}
            </section>
          ))}
        </div>
      )}

      {grid && <CatalogGridPage catalog={grid} onBack={() => setGrid(null)} onOpenDetail={setDetail} />}
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}

function NoMatch() {
  const t = useT();
  return <EmptyBlock title={t("No catalogs match your search.")} />;
}

function GroupHead({ title, count, mark }: { title: string; count: number; mark: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {mark}
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {title}
      </h2>
      <span className="text-[12px] tabular-nums text-ink-subtle">{count}</span>
    </div>
  );
}

function GroupMark({ group }: { group: AddonGroup }) {
  return group.logo ? (
    <img src={group.logo} alt="" draggable={false} className="h-5 w-5 rounded-sm object-contain" />
  ) : (
    <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-elevated text-[10px] font-bold text-ink-subtle ring-1 ring-edge-soft">
      {group.name.charAt(0).toUpperCase()}
    </span>
  );
}

function AddonMark({ addon, size = 20 }: { addon: AddonRef; size?: number }) {
  if (addon.logo)
    return (
      <img
        src={addon.logo}
        alt=""
        draggable={false}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-[4px] object-contain"
      />
    );
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[4px] bg-canvas text-[9px] font-bold text-ink-subtle ring-1 ring-edge-soft"
    >
      {addon.name.charAt(0).toUpperCase()}
    </span>
  );
}

// Loads its first page when it scrolls near, like the desktop shelf, so a hub
// with forty catalogs does not fire forty requests on open.
function CatalogRail({
  catalog,
  onOpenAll,
  onOpenDetail,
}: {
  catalog: BrowseCatalog;
  onOpenAll: (c: BrowseCatalog) => void;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const root = useContext(ScrollRootContext);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [items, setItems] = useState<Meta[] | null>(null);
  const started = useRef(false);
  const typeLabelKey = catalogTypeLabelKey(catalog.type);

  useEffect(() => {
    setItems(null);
    started.current = false;
  }, [catalog.key]);

  useEffect(() => {
    if (!el) return;
    const load = () => {
      if (started.current) return;
      started.current = true;
      void browseFetcher(catalog, null)(1)
        .then((list) => setItems(list))
        .catch(() => setItems([]));
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) load();
      },
      { root: root ?? null, rootMargin: "700px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, root, catalog.key]);

  const shown = useHideAnimeMetas(items ?? []);
  if (items !== null && shown.length === 0) return null;

  return (
    <div ref={setEl} className={`flex flex-col gap-3 ${RAIL_CULL}`}>
      <button
        type="button"
        onClick={() => onOpenAll(catalog)}
        className="flex min-h-11 items-center gap-1 text-start"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
            {typeLabelKey ? t(typeLabelKey) : catalog.type}
          </span>
          <span className="truncate font-display text-[19px] font-medium tracking-[-0.01em] text-ink">
            {catalog.name}
          </span>
        </span>
        <ChevronRight size={19} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
      </button>
      {items === null ? (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="aspect-[2/3] w-[124px] shrink-0 animate-pulse rounded-lg bg-elevated/40" />
          ))}
        </div>
      ) : (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shown.slice(0, 20).map((m) => (
            <PosterTile key={m.id} meta={m} onOpenDetail={onOpenDetail} />
          ))}
          <button
            type="button"
            onClick={() => onOpenAll(catalog)}
            className="flex w-[96px] shrink-0 flex-col items-center justify-center gap-2 self-stretch rounded-lg border border-dashed border-edge-soft text-ink-muted"
            style={{ minHeight: 186 }}
          >
            <ChevronRight size={20} strokeWidth={2.2} />
            <span className="text-[12px] font-semibold">{t("See all")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Full catalog as a paged grid, with the addon's own genre options as chips
// when the catalog declares them.
export function CatalogGridPage({
  catalog,
  onBack,
  onOpenDetail,
}: {
  catalog: BrowseCatalog;
  onBack: () => void;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const [genre, setGenre] = useState<string | null>(null);
  const typeLabelKey = catalogTypeLabelKey(catalog.type);
  const fetchPage = useCallback<CatalogFetch>(
    (page) =>
      browseFetcher(catalog, genre)(page).then((metas) => ({
        metas,
        more: metas.length > 0 && page < MAX_PAGE,
      })),
    [catalog, genre],
  );
  return (
    <SubPage
      kicker={`${catalog.addonName} · ${typeLabelKey ? t(typeLabelKey) : catalog.type}`}
      title={catalog.name}
      onBack={onBack}
      padded={false}
    >
      {catalog.genres.length > 0 && (
        <div className="px-4 pb-4">
          <ChipRow>
            <Chip label={t("All")} active={genre === null} onClick={() => setGenre(null)} />
            {catalog.genres.map((g) => (
              <Chip key={g} label={g} active={genre === g} onClick={() => setGenre(g)} />
            ))}
          </ChipRow>
        </div>
      )}
      <MobileCatalogGrid
        fetchPage={fetchPage}
        resetKey={`${catalog.key}:${genre ?? ""}`}
        enabled
        initialPages={1}
        emptyState={
          <div className="px-4">
            <EmptyBlock title={t("Nothing to show yet")} body={t("This catalog returned no titles.")} />
          </div>
        }
        onOpenDetail={onOpenDetail}
      />
    </SubPage>
  );
}

function ManageList({
  filtered,
  pinnedCats,
  pinnedSet,
  hiddenSet,
  onTogglePin,
  onToggleHide,
  onMovePin,
}: {
  filtered: BrowseCatalog[];
  pinnedCats: BrowseCatalog[];
  pinnedSet: Set<string>;
  hiddenSet: Set<string>;
  onTogglePin: (key: string) => void;
  onToggleHide: (key: string) => void;
  onMovePin: (key: string, dir: -1 | 1) => void;
}) {
  const t = useT();
  const rest = useMemo<AddonGroup[]>(() => {
    const m = new Map<string, AddonGroup>();
    for (const c of filtered) {
      if (pinnedSet.has(c.key)) continue;
      let g = m.get(c.addonName);
      if (!g) {
        g = { name: c.addonName, logo: c.addonLogo, cats: [] };
        m.set(c.addonName, g);
      }
      g.cats.push(c);
    }
    return [...m.values()];
  }, [filtered, pinnedSet]);

  return (
    <div className="flex flex-col gap-7">
      <p className="rounded-2xl border border-edge-soft bg-elevated/25 px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
        {t("Pin the catalogs you want up top, hide the ones you never open, and reorder your pinned rails. Your browse view updates instantly.")}
      </p>
      {pinnedCats.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <GroupHead title={t("Pinned to top")} count={pinnedCats.length} mark={<Pin size={14} className="text-accent" />} />
          <div className="flex flex-col gap-1.5">
            {pinnedCats.map((c, i) => (
              <ManageRow
                key={c.key}
                catalog={c}
                pinned
                hidden={hiddenSet.has(c.key)}
                onTogglePin={() => onTogglePin(c.key)}
                onToggleHide={() => onToggleHide(c.key)}
                moveUp={i > 0 ? () => onMovePin(c.key, -1) : undefined}
                moveDown={i < pinnedCats.length - 1 ? () => onMovePin(c.key, 1) : undefined}
              />
            ))}
          </div>
        </section>
      )}
      {rest.map((g) => (
        <section key={g.name} className="flex flex-col gap-2.5">
          <GroupHead title={g.name} count={g.cats.length} mark={<GroupMark group={g} />} />
          <div className="flex flex-col gap-1.5">
            {g.cats.map((c) => (
              <ManageRow
                key={c.key}
                catalog={c}
                pinned={false}
                hidden={hiddenSet.has(c.key)}
                onTogglePin={() => onTogglePin(c.key)}
                onToggleHide={() => onToggleHide(c.key)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ManageRow({
  catalog,
  pinned,
  hidden,
  onTogglePin,
  onToggleHide,
  moveUp,
  moveDown,
}: {
  catalog: BrowseCatalog;
  pinned: boolean;
  hidden: boolean;
  onTogglePin: () => void;
  onToggleHide: () => void;
  moveUp?: () => void;
  moveDown?: () => void;
}) {
  const t = useT();
  const pinnedHome = useIsPinned(catalog.key);
  const typeLabelKey = catalogTypeLabelKey(catalog.type);
  const toggleHome = () =>
    togglePinnedCatalog({
      id: catalog.key,
      source: "catalog",
      name: catalog.name,
      params: { base: catalog.base, type: catalog.type, id: catalog.id },
    });
  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border border-edge-soft bg-elevated/25 p-2.5 transition-opacity ${
        hidden ? "opacity-45" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {catalog.addonLogo ? (
          <img src={catalog.addonLogo} alt="" draggable={false} className="h-7 w-7 shrink-0 rounded-sm object-contain" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-canvas text-[11px] font-bold text-ink-subtle ring-1 ring-edge-soft">
            {catalog.addonName.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-medium text-ink">{catalog.name}</div>
          <div className="truncate text-[12px] text-ink-subtle">
            {catalog.addonName} · {typeLabelKey ? t(typeLabelKey) : catalog.type}
          </div>
        </div>
      </div>
      <div className="-mb-1 flex items-center justify-end">
        {pinned && (
          <>
            <IconButton label={t("Move up")} onClick={moveUp} disabled={!moveUp}>
              <ChevronUp size={18} />
            </IconButton>
            <IconButton label={t("Move down")} onClick={moveDown} disabled={!moveDown}>
              <ChevronDown size={18} />
            </IconButton>
          </>
        )}
        <IconButton
          label={pinnedHome ? t("Remove from Home") : t("Add to Home Screen")}
          onClick={toggleHome}
          active={pinnedHome}
        >
          <NavGlyph name="home" className="h-[18px] w-[18px]" />
        </IconButton>
        <IconButton
          label={hidden ? t("Show this catalog") : t("Hide this catalog")}
          onClick={onToggleHide}
          active={hidden}
        >
          {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
        </IconButton>
        <IconButton label={pinned ? t("Unpin") : t("Pin to top")} onClick={onTogglePin} active={pinned}>
          {pinned ? <PinOff size={18} /> : <Pin size={18} />}
        </IconButton>
      </div>
    </div>
  );
}
