import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Dices, Quote } from "lucide-react";
import { excerptReview, upsizeTmdb } from "@/components/critics-pick/utils";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import { useHeroLogos } from "@/components/anime-hero/use-hero-logos";
import { Poster, usePosterChain } from "@/components/poster";
import { useAuth } from "@/lib/auth";
import { browseFetcher, catalogTypeLabelKey, listBrowseCatalogs, type BrowseCatalog } from "@/lib/catalog-browse";
import { narrowMediaType, type Meta } from "@/lib/cinemeta";
import type { FeedItem } from "@/lib/feed";
import { fetchRankList, peekRankSnapshot, type HarborRankExplanation, type PeopleDept } from "@/lib/harbor-rank";
import { useT } from "@/lib/i18n";
import { rpdbPoster } from "@/lib/providers/rpdb";
import { tmdbCriticData, type CriticData } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { MobileDetail } from "../mobile-detail";
import { GridTile } from "../mobile-catalog-page";
import { MobileGridSheet } from "./grid-sheet";
import { MobilePageShell, portalPage } from "./page-shell";
import { PersonSheet, type PersonRef } from "./person-sheet";

// The Discover sections that are not rails: Critics' Pick, Surprise me, the
// catalog browser, the Discovery Queue entry and Top People. Each mirrors the
// desktop component of the same name (components/critics-pick.tsx,
// views/discover/surprise-me.tsx, catalog-browser.tsx, discovery-queue-cta.tsx,
// top-people-cta.tsx) with the layout folded to one column and the desktop nav
// targets (openQueue, openPeople, openGrid) replaced by phone pages.

function SectionHeading({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4">
      <h2 className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
      {note && <span className="shrink-0 text-[10.5px] uppercase tracking-[0.18em] text-ink-subtle">{note}</span>}
    </div>
  );
}

export function CriticsPickCard({ meta, title, onOpen }: { meta: Meta; title?: string; onOpen: (m: Meta) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [data, setData] = useState<CriticData | null>(null);
  const logos = useHeroLogos(useMemo(() => [meta], [meta]), settings);
  const logo = logos[meta.id] ?? meta.logo;
  const backdrop = rpdbPoster(settings.rpdbKey, meta.id, upsizeTmdb(meta.background ?? meta.poster));
  useEffect(() => {
    setData(null);
    if (!settings.tmdbKey) return;
    let cancelled = false;
    tmdbCriticData(settings.tmdbKey, meta.id, narrowMediaType(meta.type)).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [meta.id, meta.type, settings.tmdbKey]);
  const review = data?.reviews?.[0] ?? null;
  const overview = data?.overview ?? meta.description ?? "";
  const quote = review
    ? excerptReview(review.content)
    : data?.tagline?.trim() || (overview ? overview.split(/(?<=[.!?])\s+/)[0] : t("A standout this week."));
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={title ?? t("Critics' Pick")} note={t("Loved by reviewers today")} />
      <div className="px-4">
        <button
          type="button"
          onClick={() => onOpen({ ...meta, logo: logo ?? meta.logo })}
          aria-label={t("Open {name}", { name: meta.name })}
          className="relative block w-full overflow-hidden rounded-[22px] bg-surface text-start ring-1 ring-edge-soft/50"
        >
          <div className="relative aspect-[4/3] w-full">
            {backdrop ? (
              <img src={backdrop} alt="" decoding="async" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Poster src={undefined} seed={meta.id} ratio="landscape" className="absolute inset-0 h-full w-full rounded-none" />
            )}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/5" />
            <div className="absolute inset-x-5 bottom-5 flex flex-col gap-2">
              {logo ? (
                <img src={logo} alt={meta.name} className="max-h-[64px] max-w-[70%] object-contain object-left drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]" />
              ) : (
                <h3 className="font-display text-[26px] font-medium leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">
                  {meta.name}
                </h3>
              )}
              <div className="flex items-center gap-2.5 text-[12.5px] text-white/80">
                {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
                {meta.imdbRating && (
                  <span className="inline-flex items-center gap-1.5">
                    <ImdbIcon className="h-[12px] w-auto rounded-[2px]" />
                    <span className="font-semibold text-white">{meta.imdbRating}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-5 py-4">
            <Quote size={18} className="text-accent" />
            <p className="line-clamp-4 font-display text-[14.5px] italic leading-[1.5] text-ink/90">{quote}</p>
            {review && (
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
                <span className="text-ink-muted">{review.author}</span>
                {typeof review.rating === "number" && review.rating > 0 && <span>· {review.rating}/10</span>}
              </span>
            )}
          </div>
        </button>
      </div>
    </section>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function SurpriseMeCard({ pool, onOpen }: { pool: Meta[]; onOpen: (m: Meta) => void }) {
  const t = useT();
  const lastRef = useRef<string | null>(null);
  const [tiles, setTiles] = useState<Meta[]>([]);
  useEffect(() => {
    if (tiles.length === 0 && pool.length > 0) setTiles(shuffle(pool).slice(0, 9));
  }, [pool, tiles.length]);
  if (pool.length === 0) return null;
  const surprise = () => {
    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1) while (pick.id === lastRef.current) pick = pool[Math.floor(Math.random() * pool.length)];
    lastRef.current = pick.id;
    setTiles(shuffle(pool).slice(0, 9));
    onOpen(pick);
  };
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={t("Can't decide?")} />
      <div className="px-4">
        <button
          type="button"
          onClick={surprise}
          className="group relative flex h-[64px] w-full items-center overflow-hidden rounded-2xl ring-1 ring-edge-soft/50"
        >
          <div className="absolute inset-0 flex">
            {tiles.map((m, i) => (
              <SurpriseTile key={`${m.id}-${i}`} meta={m} />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/30" />
          <div className="relative flex items-center gap-3 px-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-canvas shadow-[0_6px_18px_-6px_rgba(0,0,0,0.6)] transition-transform group-active:rotate-[18deg]">
              <Dices size={18} strokeWidth={2.2} />
            </span>
            <span className="flex flex-col text-start leading-tight">
              <span className="text-[14.5px] font-semibold text-ink">{t("Surprise me")}</span>
              <span className="text-[11.5px] text-ink-muted">{t("Pick a random title")}</span>
            </span>
          </div>
        </button>
      </div>
    </section>
  );
}

function SurpriseTile({ meta }: { meta: Meta }) {
  const { settings } = useSettings();
  const poster = usePosterChain(settings.rpdbKey, meta.id, meta.poster, meta.type === "series" ? "series" : "movie");
  return <img src={poster.src} alt="" draggable={false} loading="lazy" onError={poster.onError} className="h-full min-w-0 flex-1 object-cover" />;
}

// Catalog browser: type, catalog and genre pickers, then Browse. The desktop
// draws custom popovers; the phone uses native selects so the picker is the
// system wheel, with the same pill styling around them.
export function CatalogBrowserCard() {
  const t = useT();
  const { authKey } = useAuth();
  const [catalogs, setCatalogs] = useState<BrowseCatalog[]>([]);
  const [type, setType] = useState("");
  const [catKey, setCatKey] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [grid, setGrid] = useState<{ title: string; fetcher: (page: number) => Promise<Meta[]> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listBrowseCatalogs(authKey).then((list) => !cancelled && setCatalogs(list));
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  const types = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of catalogs) if (!seen.has(c.type)) {
      seen.add(c.type);
      out.push(c.type);
    }
    return out;
  }, [catalogs]);
  useEffect(() => {
    if (!type && types.length) setType(types[0]);
  }, [types, type]);
  const ofType = useMemo(() => catalogs.filter((c) => c.type === type), [catalogs, type]);
  useEffect(() => {
    if (ofType.length && !ofType.some((c) => c.key === catKey)) {
      setCatKey(ofType[0].key);
      setGenre(null);
    }
  }, [ofType, catKey]);
  const selected = useMemo(() => catalogs.find((c) => c.key === catKey) ?? null, [catalogs, catKey]);
  if (catalogs.length === 0 || types.length === 0) return null;

  const typeLabel = (ty: string) => {
    const key = catalogTypeLabelKey(ty);
    return key ? t(key) : ty;
  };
  const browse = () => {
    if (!selected) return;
    const f = browseFetcher(selected, genre);
    setGrid({ title: genre ? `${selected.name} · ${genre}` : selected.name, fetcher: (page) => f(page) });
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={t("Browse your catalogs")} />
      <div className="mx-4 flex flex-col gap-2 rounded-2xl bg-elevated/30 p-2 ring-1 ring-edge-soft/50">
        <div className="grid grid-cols-2 gap-2">
          <PillSelect label={t("Type")} value={type} onChange={setType} options={types.map((ty) => ({ value: ty, label: typeLabel(ty) }))} />
          <PillSelect
            label={t("Catalog")}
            value={catKey}
            onChange={(v) => {
              setCatKey(v);
              setGenre(null);
            }}
            options={ofType.map((c) => ({ value: c.key, label: c.addonName ? `${c.name} · ${c.addonName}` : c.name }))}
          />
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          {selected && selected.genres.length > 0 ? (
            <PillSelect
              label={t("Genre")}
              value={genre ?? ""}
              onChange={(v) => setGenre(v || null)}
              options={[{ value: "", label: t("All genres") }, ...selected.genres.map((g) => ({ value: g, label: g }))]}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={browse}
            className="flex h-12 items-center justify-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas"
          >
            {t("Browse")}
          </button>
        </div>
      </div>
      {grid && <MobileGridSheet title={grid.title} fetcher={grid.fetcher} onClose={() => setGrid(null)} />}
    </section>
  );
}

function PillSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
}) {
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <label className="relative flex h-12 min-w-0 flex-col justify-center rounded-full border border-edge-soft bg-canvas/50 ps-4 pe-9">
      <span className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{label}</span>
      <span className="truncate text-[13px] font-medium text-ink">{current}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span aria-hidden className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-ink-subtle">
        ⌄
      </span>
    </label>
  );
}

const QUEUE_DEPTH = [12, 21, 9, 23, 14, 17];

export function DiscoveryQueueCta({ items, title, onOpen }: { items: FeedItem[]; title?: string; onOpen: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const peek = items.slice(0, 6);
  if (peek.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={title ?? t("Your Discovery Queue")} note={t("{count} picks ready", { count: items.length })} />
      <div className="px-4">
        <button
          type="button"
          onClick={onOpen}
          className="group relative block h-[132px] w-full overflow-hidden rounded-[22px] ring-1 ring-edge-soft/50"
        >
          <div className="absolute inset-0 flex scale-[1.08]">
            {peek.map((item, i) => (
              <div key={item.meta.id} className="relative h-full min-w-0 flex-1 overflow-hidden" style={{ transform: `translate3d(0, ${(i % 2) * QUEUE_DEPTH[i] * 0.2}px, 0)` }}>
                <img
                  src={rpdbPoster(settings.rpdbKey, item.meta.id, item.meta.background ?? item.meta.poster)}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  onError={(e) => {
                    if (item.meta.poster && e.currentTarget.src !== item.meta.poster) e.currentTarget.src = item.meta.poster;
                  }}
                  className="absolute inset-0 h-full w-full object-cover brightness-[0.7]"
                />
              </div>
            ))}
          </div>
          <div aria-hidden className="absolute inset-0" style={{ background: "color-mix(in oklch, var(--color-canvas), transparent 56%)" }} />
          <div aria-hidden className="absolute inset-0" style={{ background: "radial-gradient(58% 104% at 50% 50%, color-mix(in oklch, var(--color-canvas), transparent 26%) 0%, transparent 72%)" }} />
          <div className="relative flex h-full items-center justify-center gap-3">
            <span className="font-display text-[34px] font-medium leading-none tracking-tight text-ink [text-shadow:0_4px_30px_rgba(0,0,0,0.7)]">
              {t("Explore")}
            </span>
            <ArrowRight size={30} strokeWidth={2} className="dir-icon shrink-0 text-ink [filter:drop-shadow(0_4px_18px_rgba(0,0,0,0.6))]" />
          </div>
        </button>
      </div>
    </section>
  );
}

// The queue page: the desktop deck lets you swipe through picks one at a time;
// the phone lays the same picks out as a grid with their feed tag so a thumb
// can skim thirty picks in one scroll.
export function DiscoveryQueueSheet({ items, onClose }: { items: FeedItem[]; onClose: () => void }) {
  const t = useT();
  const [meta, setMeta] = useState<Meta | null>(null);
  return portalPage(
    <MobilePageShell title={t("Discovery Queue")} kicker={t("{count} picks ready", { count: items.length })} onBack={onClose}>
      <div className="grid grid-cols-3 gap-x-3 gap-y-5 px-4 pt-2 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5">
        {items.map((it) => (
          <div key={it.meta.id} className="flex flex-col">
            <GridTile meta={it.meta} onOpen={setMeta} />
            <span className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">{t(it.tag)}</span>
          </div>
        ))}
      </div>
      {meta && <MobileDetail meta={meta} onClose={() => setMeta(null)} />}
    </MobilePageShell>,
  );
}

function useTopPeople(dept: PeopleDept, limit: number): HarborRankExplanation[] {
  const [people, setPeople] = useState<HarborRankExplanation[]>([]);
  useEffect(() => {
    let cancelled = false;
    const snap = peekRankSnapshot("harbor", dept, null);
    if (snap && snap.source === "harbor") setPeople(snap.list.filter((p) => p.profilePath).slice(0, limit));
    fetchRankList("harbor", dept, null).then((r) => {
      if (cancelled || !r || r.source !== "harbor") return;
      setPeople(r.list.filter((p) => p.profilePath).slice(0, limit));
    });
    return () => {
      cancelled = true;
    };
  }, [dept, limit]);
  return people;
}

export function TopPeopleCta({ title, onOpen }: { title?: string; onOpen: () => void }) {
  const t = useT();
  const top = useTopPeople("Acting", 6);
  return (
    <section className="flex flex-col gap-3">
      <button type="button" onClick={onOpen} className="group block w-full text-start">
        <div className="mb-3 flex items-baseline justify-between gap-3 px-4">
          <h2 className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink">{title ?? t("Top People")}</h2>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-ink-muted">
            {t("The all-time greats")}
            <ArrowRight size={14} className="dir-icon" />
          </span>
        </div>
        <div className="px-4">
          {top.length > 0 ? (
            <ol className="grid grid-cols-3 gap-2.5 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-6">
              {top.map((p, i) => (
                <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-elevated/60 ring-1 ring-edge-soft">
                  <img src={`https://image.tmdb.org/t/p/w342${p.profilePath}`} alt={p.name} loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover object-top brightness-[0.85]" />
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: "linear-gradient(to top, var(--color-canvas) 6%, color-mix(in oklch, var(--color-canvas), transparent 40%) 42%, transparent)" }} />
                  <span className="absolute start-1.5 top-0.5 font-display text-[26px] font-semibold leading-none text-white/95 [text-shadow:0_2px_10px_rgba(0,0,0,0.85)]">{i + 1}</span>
                  <span className="absolute inset-x-1.5 bottom-1.5 truncate text-[11.5px] font-semibold text-ink [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">{p.name}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="flex h-[96px] items-center justify-center rounded-xl border border-edge-soft bg-canvas px-4 text-center text-[13.5px] text-ink-muted">
              {t("Explore the all-time greatest actors, directors and more")}
            </div>
          )}
        </div>
      </button>
    </section>
  );
}

const DEPTS: Array<{ id: PeopleDept; label: string }> = [
  { id: "Acting", label: "Actors" },
  { id: "Directing", label: "Directors" },
  { id: "Writing", label: "Writers" },
  { id: "Production", label: "Producers" },
];

export function TopPeopleSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [dept, setDept] = useState<PeopleDept>("Acting");
  const people = useTopPeople(dept, 60);
  const [person, setPerson] = useState<PersonRef | null>(null);
  return portalPage(
    <MobilePageShell title={t("Top People")} kicker={t("The all-time greats")} onBack={onClose}>
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {DEPTS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDept(d.id)}
              aria-pressed={dept === d.id}
              className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold ring-1 ${
                dept === d.id ? "bg-ink text-canvas ring-ink" : "bg-surface text-ink-muted ring-edge-soft"
              }`}
            >
              {t(d.label)}
            </button>
          ))}
        </div>
        {people.length === 0 ? (
          <div className="grid grid-cols-3 gap-3 px-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="harbor-skeleton aspect-[3/4] rounded-xl bg-elevated/40" />
            ))}
          </div>
        ) : (
          <ol className="grid grid-cols-3 gap-x-3 gap-y-4 px-4 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPerson({ id: p.id, name: p.name, profilePath: p.profilePath, note: t(dept) })}
                  className="w-full text-start"
                >
                  <span className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-elevated ring-1 ring-edge-soft/60">
                    <img src={`https://image.tmdb.org/t/p/w342${p.profilePath}`} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover object-top" />
                    <span className="absolute start-1.5 top-1 font-display text-[22px] font-semibold leading-none text-white/95 [text-shadow:0_2px_10px_rgba(0,0,0,0.85)]">
                      {p.rank}
                    </span>
                  </span>
                  <span className="mt-1.5 line-clamp-1 text-[12.5px] font-medium text-ink">{p.name}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      {person && <PersonSheet person={person} onClose={() => setPerson(null)} />}
    </MobilePageShell>,
  );
}
