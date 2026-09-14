import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useBrandRanking } from "@/components/brand-tiles";
import type { Meta } from "@/lib/cinemeta";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/feed/tags";
import { useT, useUiLanguage } from "@/lib/i18n";
import { useCinemetaRating } from "@/lib/providers/cinemeta-rating";
import { tmdbDiscover } from "@/lib/providers/tmdb";
import {
  tmdbBrandDetails,
  tmdbBrandStats,
  type BrandDetails,
  type BrandKind,
  type BrandPerson,
  type BrandStats,
  type BrandSummary,
  type BrandTitle,
} from "@/lib/providers/tmdb/tmdb-brands";
import { useSettings } from "@/lib/settings";
import type { MetaFilter } from "@/lib/view";
import { openUrl } from "@/lib/window";
import { useBrandArt } from "@/views/filter/brand-hero";
import { MobileDetail } from "./mobile-detail";
import { MAX_PAGE, MobileCatalogGrid, TMDB_PAGE_SIZE, type CatalogFetch } from "./mobile-catalog-page";
import { CollectionCardTile, CollectionMembersSheet } from "./mobile-collections-rail";
import { Chip, MobileGenrePage } from "./mobile-genre-page";
import { PosterTile, RailHeader } from "./mobile-rail";
import { MediaToggle } from "./mobile-service-filters";
import { FilterRails, RailSkeleton } from "./browse/filter-rails";
import { MobilePageShell, PageBackButton, portalPage } from "./browse/page-shell";
import { PersonSheet, PersonTile, type PersonRef } from "./browse/person-sheet";
import { MobileBrandTile } from "./browse/tiles";

// Studio and network pages for the phone, the counterpart of the desktop
// branded filter page (views/filter.tsx BrandedBody plus filter/brand-*.tsx):
// backdrop hero with the brand's logo, the fact cards and chips, the standard
// brand rails, box office and franchise and marathon rails, the faces and makers
// behind the brand, a decade picker, and the full filterable catalogue. The
// desktop pieces are laid out for a 1400px canvas, so each is rebuilt here on
// the phone rail kit while reading the same tmdb-brands data.

export type BrandRef = { kind: BrandKind; id: number; name: string; mediaType: "movie" | "tv" };

type Branded = MetaFilter & { kind: "studio" | "network"; id: number; name: string };

export function brandRefOf(b: BrandSummary): BrandRef {
  return { kind: b.kind, id: b.id, name: b.name, mediaType: b.media };
}

function useRegionName(): (code: string) => string {
  const uiLang = useUiLanguage();
  return useMemo(() => {
    try {
      const names = new Intl.DisplayNames([uiLang], { type: "region" });
      return (code: string) => {
        try {
          return names.of(code) ?? code;
        } catch {
          return code;
        }
      };
    } catch {
      return (code: string) => code;
    }
  }, [uiLang]);
}

function compactMoney(n: number, lang: string): string {
  try {
    return new Intl.NumberFormat(lang, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch {
    return `$${Math.round(n / 1e6)}M`;
  }
}

function useBrandData(brand: BrandRef): { details: BrandDetails | null; stats: BrandStats | null } {
  const { settings } = useSettings();
  const [details, setDetails] = useState<BrandDetails | null>(null);
  const [stats, setStats] = useState<BrandStats | null>(null);
  useEffect(() => {
    setDetails(null);
    setStats(null);
    if (!settings.tmdbKey) return;
    let alive = true;
    void tmdbBrandDetails(settings.tmdbKey, brand.kind, brand.id).then((d) => alive && setDetails(d));
    void tmdbBrandStats(settings.tmdbKey, brand.kind, brand.id, brand.mediaType).then((s) => alive && setStats(s));
    return () => {
      alive = false;
    };
  }, [settings.tmdbKey, brand.kind, brand.id, brand.mediaType]);
  return { details, stats };
}

export function MobileBrandPage({ brand, onBack }: { brand: BrandRef; onBack: () => void }) {
  const t = useT();
  const lang = useUiLanguage();
  const { settings } = useSettings();
  const region = useRegionName();
  const [current, setCurrent] = useState<BrandRef>(brand);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [person, setPerson] = useState<PersonRef | null>(null);
  const [franchise, setFranchise] = useState<{ id: number; name: string } | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const art = useBrandArt(current.id, current.mediaType, current.kind);
  const { details, stats } = useBrandData(current);
  const filter = useMemo<Branded>(
    () => ({ kind: current.kind, mediaType: current.mediaType, name: current.name, id: current.id }) as Branded,
    [current],
  );
  const tv = current.mediaType === "tv";
  const mediaWord = tv ? t("Shows") : t("Movies");
  const subtitle =
    current.kind === "studio"
      ? t("{media} produced by {name}, ranked from biggest hits to overlooked gems.", { media: mediaWord, name: current.name })
      : t("Series from {name}: current hits, classics, and the deep cuts.", { name: current.name });
  const facts = [art.count > 0 ? t("{n} titles", { n: art.count.toLocaleString() }) : "", art.span].filter(Boolean);

  return portalPage(
    <MobilePageShell
      title={current.name}
      onBack={onBack}
      header={(close) => (
        <BrandHero
          backdrop={art.backdrop}
          logo={art.logo}
          kicker={current.kind === "studio" ? t("Studio") : t("Network")}
          title={current.name}
          facts={facts.join(" · ")}
          subtitle={subtitle}
          onBack={close}
        >
          <MediaToggle
            media={current.mediaType}
            onChange={(m) => setCurrent((c) => ({ ...c, mediaType: m }))}
            labels={{ movie: t("Movies"), tv: t("Shows") }}
          />
        </BrandHero>
      )}
    >
      <div key={`${current.kind}:${current.id}:${current.mediaType}`} className="flex flex-col gap-7 pt-2">
        {!settings.tmdbKey && (
          <p className="mx-4 rounded-2xl bg-elevated/50 px-4 py-3 text-[13px] text-ink-muted ring-1 ring-edge-soft/60">
            {t("Add a TMDB key to browse by this filter.")}
          </p>
        )}
        <BrandFacts
          tv={tv}
          stats={stats}
          details={details}
          region={region}
          lang={lang}
          onOpenTitle={(x) => setDetailMeta(x.meta)}
          onOpenParent={(p) => setCurrent({ kind: "studio", id: p.id, name: p.name, mediaType: current.mediaType })}
          onOpenGenre={setGenre}
        />
        <FilterRails filter={filter} onOpenDetail={setDetailMeta} onOpenPerson={setPerson} />
        {stats && !tv && stats.grossing.length >= 3 && (
          <CaptionRail
            title={t("Top grossing")}
            kicker={t("Box office champions")}
            items={stats.grossing}
            caption={(x, i) => `#${i + 1} · ${compactMoney(x.revenue, lang)}`}
            onOpenDetail={setDetailMeta}
          />
        )}
        {stats && stats.franchises.length >= 2 && (
          <section className="flex flex-col gap-3">
            <RailHeader title={t("Franchises")} kicker={t("The universes {name} built", { name: current.name })} />
            <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {stats.franchises.map((f) => (
                <CollectionCardTile key={f.id} id={f.id} name={f.name} knownBackdrop={f.backdrop} onOpen={(id) => setFranchise({ id, name: f.name })} />
              ))}
            </div>
          </section>
        )}
        {stats && tv && stats.longest.length >= 3 && (
          <CaptionRail
            title={t("Marathon material")}
            kicker={t("The longest-running shows on {name}", { name: current.name })}
            items={stats.longest}
            caption={(x) => `${t("{n} episodes", { n: x.episodes })} · ${t("{n} seasons", { n: x.seasons })}`}
            onOpenDetail={setDetailMeta}
          />
        )}
        {stats && (
          <>
            <PeopleRail
              title={t("Faces of {name}", { name: current.name })}
              kicker={t("The actors who appear most across {name} titles", { name: current.name })}
              people={stats.faces}
              note={(p) => t("{n} titles", { n: p.titles })}
              onOpen={setPerson}
            />
            <PeopleRail
              title={t("Behind the camera")}
              kicker={t("The directors and creators {name} works with most", { name: current.name })}
              people={stats.makers}
              note={(p) => `${p.character} · ${t("{n} titles", { n: p.titles })}`}
              onOpen={setPerson}
            />
            <DecadesSection brand={current} stats={stats} onOpenDetail={setDetailMeta} />
          </>
        )}
        {settings.tmdbKey && <BrandBrowse brand={current} onOpenDetail={setDetailMeta} />}
      </div>
      {franchise && (
        <CollectionMembersSheet id={franchise.id} name={franchise.name} onClose={() => setFranchise(null)} onOpenDetail={setDetailMeta} />
      )}
      {genre && (
        <MobileGenrePage genre={{ label: t(genre), genre }} initialMedia={current.mediaType} onBack={() => setGenre(null)} />
      )}
      {person && <PersonSheet person={person} onClose={() => setPerson(null)} />}
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </MobilePageShell>,
  );
}

function BrandHero({
  backdrop,
  logo,
  kicker,
  title,
  facts,
  subtitle,
  onBack,
  children,
}: {
  backdrop: string | null;
  logo: string | null;
  kicker: string;
  title: string;
  facts: string;
  subtitle: string;
  onBack: () => void;
  children?: React.ReactNode;
}) {
  const [lit, setLit] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  useEffect(() => {
    setLit(false);
    setLogoBroken(false);
  }, [backdrop, logo]);
  return (
    <div
      className="relative overflow-hidden"
      style={{
        marginLeft: "calc(-1 * env(safe-area-inset-left, 0px))",
        marginRight: "calc(-1 * env(safe-area-inset-right, 0px))",
      }}
    >
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          decoding="async"
          onLoad={() => setLit(true)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
          style={{ opacity: lit ? 0.72 : 0 }}
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/75 to-black/35" />
      <div
        className="absolute z-10"
        style={{
          top: "calc(env(safe-area-inset-top, 0px) + 8px)",
          insetInlineStart: "max(0.75rem, env(safe-area-inset-left, 0px))",
        }}
      >
        <PageBackButton light onBack={onBack} />
      </div>
      <div
        className="relative flex flex-col items-start gap-2.5 pb-5"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 96px)",
          paddingLeft: "max(1.25rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1.25rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">{kicker}</span>
        {logo && !logoBroken ? (
          <span className="inline-flex max-w-[72%] items-center rounded-2xl bg-white/[0.94] px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
            <img src={logo} alt={title} onError={() => setLogoBroken(true)} className="max-h-[46px] max-w-full object-contain" />
          </span>
        ) : (
          <h1 className="font-display text-[34px] font-medium leading-[1.02] tracking-tight text-ink">{title}</h1>
        )}
        {facts && <span className="text-[12.5px] font-medium text-ink-muted">{facts}</span>}
        <p className="text-[13.5px] leading-relaxed text-ink-muted">{subtitle}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

type Fact = { key: string; value: string; label: string; title?: BrandTitle; sub?: string };

function BrandFacts({
  tv,
  stats,
  details,
  region,
  lang,
  onOpenTitle,
  onOpenParent,
  onOpenGenre,
}: {
  tv: boolean;
  stats: BrandStats | null;
  details: BrandDetails | null;
  region: (code: string) => string;
  lang: string;
  onOpenTitle: (x: BrandTitle) => void;
  onOpenParent: (p: { id: number; name: string }) => void;
  onOpenGenre: (name: string) => void;
}) {
  const t = useT();
  const acclaimedImdb = useCinemetaRating(stats?.mostAcclaimed?.imdbId ?? undefined);
  const genreTable: Record<string, number> = tv ? TV_GENRES : MOVIE_GENRES;
  const facts: Fact[] = [];
  if (stats) {
    if (stats.first?.year) {
      facts.push({ key: "first", value: String(stats.first.year), label: tv ? t("First aired") : t("First release"), title: stats.first });
    }
    if (!tv && stats.totalGross > 0) {
      facts.push({
        key: "gross",
        value: compactMoney(stats.totalGross, lang),
        label: t("Combined box office"),
        sub: t("Top {n} titles", { n: stats.grossing.length }),
      });
    }
    if (!tv && stats.grossing[0]) {
      facts.push({ key: "top", value: compactMoney(stats.grossing[0].revenue, lang), label: t("Highest-grossing"), title: stats.grossing[0] });
    }
    if (tv && stats.longest[0]) {
      facts.push({ key: "longest", value: t("{n} episodes", { n: stats.longest[0].episodes }), label: t("Longest-running"), title: stats.longest[0] });
    }
    if (tv && stats.titles.length > 0) {
      facts.push({ key: "onair", value: String(stats.onAir), label: t("Still on air"), sub: t("of {n} top shows", { n: stats.titles.length }) });
    }
    if (stats.mostAcclaimed) {
      const score = acclaimedImdb ?? (stats.mostAcclaimed.rating ?? 0).toFixed(1);
      facts.push({
        key: "acclaimed",
        value: `★ ${score}`,
        label: acclaimedImdb ? t("Highest rated on IMDb") : t("Most acclaimed"),
        title: stats.mostAcclaimed,
      });
    }
  }
  const genres = (stats?.genres ?? []).filter((name) => typeof genreTable[name] === "number");
  const chips: Array<{ key: string; label: string; onClick?: () => void }> = [];
  if (details?.country) chips.push({ key: "country", label: region(details.country) });
  if (details?.headquarters) chips.push({ key: "hq", label: t("Based in {city}", { city: details.headquarters }) });
  if (details?.parent) {
    const parent = details.parent;
    chips.push({ key: "parent", label: t("Part of {parent}", { parent: parent.name }), onClick: () => onOpenParent(parent) });
  }
  if (details?.homepage) {
    const url = details.homepage;
    chips.push({ key: "site", label: t("Website"), onClick: () => openUrl(url) });
  }
  if (facts.length === 0 && chips.length === 0 && genres.length === 0) {
    return stats === null ? (
      <div className="grid grid-cols-2 gap-3 px-4" aria-hidden>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="harbor-skeleton h-[92px] rounded-2xl bg-elevated/40" />
        ))}
      </div>
    ) : null;
  }
  return (
    <section className="flex flex-col gap-4">
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 px-4">
          {facts.map((f) => (
            <div key={f.key} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-edge-soft bg-elevated/40 px-3.5 py-3">
              <span className="truncate font-display text-[22px] font-medium leading-none tracking-tight text-ink tabular-nums">{f.value}</span>
              <span className="text-[10px] font-semibold uppercase leading-snug tracking-[0.14em] text-ink-subtle">{f.label}</span>
              {f.title ? (
                <button type="button" onClick={() => onOpenTitle(f.title!)} className="min-h-[24px] truncate text-start text-[12.5px] text-ink-muted">
                  {f.title.meta.name}
                </button>
              ) : (
                f.sub && <span className="truncate text-[12.5px] text-ink-muted">{f.sub}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4">
          {chips.map((c) =>
            c.onClick ? (
              <Chip key={c.key} on={false} onClick={c.onClick}>
                {c.label}
              </Chip>
            ) : (
              <span key={c.key} className="flex h-10 items-center rounded-full bg-surface/60 px-4 text-[13px] font-medium text-ink-muted ring-1 ring-edge-soft/60">
                {c.label}
              </span>
            ),
          )}
        </div>
      )}
      {genres.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="px-4 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">{t("Signature genres")}</span>
          <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {genres.map((g) => (
              <Chip key={g} on={false} onClick={() => onOpenGenre(g)}>
                {t(g)}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CaptionRail({
  title,
  kicker,
  items,
  caption,
  onOpenDetail,
}: {
  title: string;
  kicker: string;
  items: BrandTitle[];
  caption: (x: BrandTitle, i: number) => string;
  onOpenDetail: (m: Meta) => void;
}) {
  return (
    <section className="flex flex-col gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_280px]">
      <RailHeader title={title} kicker={kicker} />
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((x, i) => (
          <div key={x.tmdbId} className="flex w-[124px] shrink-0 flex-col">
            <PosterTile meta={x.meta} onOpenDetail={onOpenDetail} />
            <span className="-mt-1 truncate text-[11.5px] font-semibold tabular-nums text-accent">{caption(x, i)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PeopleRail({
  title,
  kicker,
  people,
  note,
  onOpen,
}: {
  title: string;
  kicker: string;
  people: BrandPerson[];
  note: (p: BrandPerson) => string;
  onOpen: (p: PersonRef) => void;
}) {
  if (people.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_230px]">
      <RailHeader title={title} kicker={kicker} />
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {people.map((p) => (
          <PersonTile key={p.id} person={{ id: p.id, name: p.name, profilePath: p.profilePath, note: note(p) }} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function DecadesSection({ brand, stats, onOpenDetail }: { brand: BrandRef; stats: BrandStats; onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const firstYear = stats.first?.year ?? null;
  const decades = useMemo(() => {
    if (!firstYear) return [];
    const out: number[] = [];
    for (let d = Math.floor(firstYear / 10) * 10; d <= Math.floor(new Date().getFullYear() / 10) * 10; d += 10) out.push(d);
    return out;
  }, [firstYear]);
  const [picked, setPicked] = useState<number | null>(null);
  const active = picked ?? decades[0] ?? null;
  const [items, setItems] = useState<Meta[] | null>(null);
  useEffect(() => {
    if (active === null || !settings.tmdbKey) return;
    let alive = true;
    setItems(null);
    const dateKey = brand.mediaType === "movie" ? "primary_release_date" : "first_air_date";
    tmdbDiscover(settings.tmdbKey, brand.mediaType, {
      [brand.kind === "network" ? "with_networks" : "with_companies"]: String(brand.id),
      [`${dateKey}.gte`]: `${active}-01-01`,
      [`${dateKey}.lte`]: `${active + 9}-12-31`,
      sort_by: "popularity.desc",
      "vote_count.gte": "20",
    })
      .then((list) => alive && setItems(list.filter((m) => m.poster)))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [active, brand.kind, brand.id, brand.mediaType, settings.tmdbKey]);
  if (decades.length < 2 || active === null) return null;
  return (
    <section className="flex flex-col gap-3">
      <RailHeader title={t("Through the decades")} />
      <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {decades.map((d) => (
          <Chip key={d} on={d === active} onClick={() => setPicked(d)}>
            {`${d}s`}
          </Chip>
        ))}
      </div>
      {items === null ? (
        <RailSkeleton />
      ) : items.length === 0 ? (
        <p className="px-4 text-[13px] text-ink-subtle">{t("Nothing matches those filters yet.")}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((m) => (
            <PosterTile key={m.id} meta={m} onOpenDetail={onOpenDetail} />
          ))}
        </div>
      )}
    </section>
  );
}

type BrowseSort = "popular" | "rated" | "newest" | "oldest";

const BROWSE_SORTS: Array<{ id: BrowseSort; label: string; floor: string }> = [
  { id: "popular", label: "Popular", floor: "20" },
  { id: "rated", label: "Top rated", floor: "200" },
  { id: "newest", label: "Newest", floor: "5" },
  { id: "oldest", label: "Oldest", floor: "5" },
];

const BROWSE_DECADES = [2020, 2010, 2000, 1990, 1980, 1970];

function BrandBrowse({ brand, onOpenDetail }: { brand: BrandRef; onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [sort, setSort] = useState<BrowseSort>("popular");
  const [genre, setGenre] = useState<number | null>(null);
  const [decade, setDecade] = useState<number | null>(null);
  const genres = brand.mediaType === "movie" ? MOVIE_GENRES : TV_GENRES;
  const params = useMemo(() => {
    const spec = BROWSE_SORTS.find((s) => s.id === sort) ?? BROWSE_SORTS[0];
    const dateKey = brand.mediaType === "movie" ? "primary_release_date" : "first_air_date";
    const by =
      sort === "newest" ? `${dateKey}.desc` : sort === "oldest" ? `${dateKey}.asc` : sort === "rated" ? "vote_average.desc" : "popularity.desc";
    const p: Record<string, string> = {
      [brand.kind === "network" ? "with_networks" : "with_companies"]: String(brand.id),
      sort_by: by,
      "vote_count.gte": spec.floor,
    };
    if (genre !== null) p.with_genres = String(genre);
    if (decade !== null) {
      p[`${dateKey}.gte`] = `${decade}-01-01`;
      p[`${dateKey}.lte`] = `${decade + 9}-12-31`;
    }
    return p;
  }, [brand.kind, brand.id, brand.mediaType, sort, genre, decade]);
  const fetchPage = useCallback<CatalogFetch>(
    (page) =>
      tmdbDiscover(settings.tmdbKey, brand.mediaType, { ...params, page: String(page) }).then((metas) => ({
        metas,
        more: metas.length >= TMDB_PAGE_SIZE && page < MAX_PAGE,
      })),
    [settings.tmdbKey, brand.mediaType, params],
  );
  return (
    <section className="flex flex-col gap-4">
      <RailHeader title={t("Everything from {name}", { name: brand.name })} kicker={t("Filter, sort and search the full catalogue")} />
      <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BROWSE_SORTS.map((s) => (
          <Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}>
            {t(s.label)}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BROWSE_DECADES.map((d) => (
          <Chip key={d} on={decade === d} onClick={() => setDecade(decade === d ? null : d)}>
            {`${d}s`}
          </Chip>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {Object.entries(genres)
          .slice(0, 12)
          .map(([name, id]) => (
            <Chip key={name} on={genre === id} onClick={() => setGenre(genre === id ? null : id)}>
              {t(name)}
            </Chip>
          ))}
      </div>
      <MobileCatalogGrid
        fetchPage={fetchPage}
        resetKey={JSON.stringify(params)}
        enabled
        initialPages={1}
        emptyState={<p className="px-4 text-[14px] text-ink-muted">{t("Nothing matches those filters yet.")}</p>}
        onOpenDetail={onOpenDetail}
      />
    </section>
  );
}

type ListSort = "popular" | "titles" | "rated" | "alpha";

const LIST_SORTS: Array<{ id: ListSort; label: string }> = [
  { id: "popular", label: "Most popular" },
  { id: "titles", label: "Most titles" },
  { id: "rated", label: "Highest rated" },
  { id: "alpha", label: "A to Z" },
];

const PAGE = 24;

// The "See all" page behind Top studios and Top networks: the desktop
// BrandsView (views/brands.tsx) with its search, sort and country filters, as a
// two-column grid of brand tiles.
export function MobileBrandsList({ kind, onBack }: { kind: BrandKind; onBack: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const region = useRegionName();
  const [current, setCurrent] = useState<BrandKind>(kind);
  const { brands, loading } = useBrandRanking(current, "all");
  const [sort, setSort] = useState<ListSort>("popular");
  const [country, setCountry] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<BrandRef | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const countries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of brands) if (b.country) counts.set(b.country, (counts.get(b.country) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  }, [brands]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = brands.filter((b) => (!country || b.country === country) && (!q || b.name.toLowerCase().includes(q)));
    if (sort === "titles") list.sort((a, b) => b.count - a.count);
    else if (sort === "rated") list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || b.score - a.score);
    else if (sort === "alpha") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [brands, country, query, sort]);

  useEffect(() => setLimit(PAGE), [current, sort, country, query]);
  const hasMore = limit < shown.length;
  useEffect(() => {
    const el = sentinel.current;
    if (!hasMore || !el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);

  return portalPage(
    <MobilePageShell title={current === "studio" ? t("All studios") : t("All networks")} kicker={t("Discover")} onBack={onBack}>
      <div className="flex flex-col gap-4 pt-1">
        <p className="px-4 text-[13.5px] leading-relaxed text-ink-muted">
          {t("The studios and networks behind what you watch, ranked by what people are watching now.")}
        </p>
        <div className="flex gap-2 px-4">
          {(["studio", "network"] as const).map((k) => (
            <Chip key={k} on={current === k} onClick={() => setCurrent(k)}>
              {k === "studio" ? t("Studios") : t("Networks")}
            </Chip>
          ))}
        </div>
        <label className="mx-4 flex h-12 items-center gap-2.5 rounded-full bg-surface px-4 ring-1 ring-edge-soft">
          <Search size={17} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={current === "studio" ? t("Search studios") : t("Search networks")}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {LIST_SORTS.map((s) => (
            <Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}>
              {t(s.label)}
            </Chip>
          ))}
        </div>
        {countries.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip on={country === null} onClick={() => setCountry(null)}>
              {t("Any country")}
            </Chip>
            {countries.map((c) => (
              <Chip key={c} on={country === c} onClick={() => setCountry(country === c ? null : c)}>
                {region(c)}
              </Chip>
            ))}
          </div>
        )}
        {!settings.tmdbKey && <p className="px-4 text-[14px] text-ink-muted">{t("Add a TMDB key to browse by this filter.")}</p>}
        {settings.tmdbKey && !loading && shown.length === 0 && (
          <p className="px-4 text-[14px] text-ink-muted">{t("Nothing matches those filters yet.")}</p>
        )}
        <div className="grid grid-cols-2 gap-3 px-4 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-4">
          {shown.slice(0, limit).map((b) => (
            <MobileBrandTile
              key={b.id}
              brand={b}
              fill
              facts={[b.country ? region(b.country) : "", b.count > 0 ? t("{n} titles", { n: b.count.toLocaleString() }) : ""]
                .filter(Boolean)
                .join(" · ")}
              onOpen={(x) => setOpen(brandRefOf(x))}
            />
          ))}
          {loading &&
            Array.from({ length: 8 }).map((_, i) => <div key={`s-${i}`} className="harbor-skeleton aspect-[5/4] rounded-2xl bg-elevated/40" />)}
        </div>
        {hasMore && <div ref={sentinel} className="h-px" />}
      </div>
      {open && <MobileBrandPage brand={open} onBack={() => setOpen(null)} />}
    </MobilePageShell>,
  );
}
