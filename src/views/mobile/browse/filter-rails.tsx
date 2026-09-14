import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { topMovies, topSeries } from "@/lib/cinemeta";
import { type Spotlight } from "@/lib/feed/genre-spotlights";
import { genreEquivalents } from "@/lib/feed/tags";
import { useT } from "@/lib/i18n";
import {
  creditToMeta,
  tmdbDiscover,
  tmdbPerson,
  tmdbPersonIdByName,
  tmdbResolveKeywordIds,
  type PersonCredit,
} from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import type { MetaFilter } from "@/lib/view";
import { railsForFilter, type AnyRail, type SpotlightRail, type StandardRail, type TopicRail } from "@/views/filter/rails-config";
import { MobileCatalogGrid, type CatalogFetch } from "../mobile-catalog-page";
import { MobileRail } from "../mobile-rail";
import { MobileGridSheet } from "./grid-sheet";
import { PersonTile, type PersonRef } from "./person-sheet";

// The desktop filter page's rail engine (views/filter/rails.tsx, rail-section,
// spotlight-section, topic-section) rebuilt on the phone rail kit. Same
// rails-config, same TMDB queries, same spotlight credit logic; the desktop's
// seen-id dedup between rails is kept as one shared set per page so a title that
// opened the trending rail does not reappear three rails down.

const MIN_FILL = 12;
const MAX_INITIAL_PAGES = 3;
const RAIL_CAP = 24;

type SeenApi = {
  claim: (metas: Meta[]) => void;
  dedup: (metas: Meta[]) => Meta[];
};

const SeenContext = createContext<SeenApi>({ claim: () => {}, dedup: (m) => m });

export function FilterRails({
  filter,
  onOpenDetail,
  onOpenPerson,
}: {
  filter: MetaFilter;
  onOpenDetail: (m: Meta) => void;
  onOpenPerson: (p: PersonRef) => void;
}) {
  const { settings } = useSettings();
  const rails = useMemo(() => railsForFilter(filter), [filter]);
  const seenRef = useRef(new Set<string>());
  useEffect(() => {
    seenRef.current = new Set();
  }, [filter]);
  const seen = useMemo<SeenApi>(
    () => ({
      claim: (metas) => {
        for (const m of metas) seenRef.current.add(m.id);
      },
      dedup: (metas) => {
        const out: Meta[] = [];
        for (const m of metas) {
          if (seenRef.current.has(m.id)) continue;
          seenRef.current.add(m.id);
          out.push(m);
        }
        return out;
      },
    }),
    [],
  );
  if (!settings.tmdbKey) return <CinemetaFallback filter={filter} onOpenDetail={onOpenDetail} />;
  return (
    <SeenContext.Provider value={seen}>
      {rails.map((r) => (
        <RailSwitch key={r.id} filter={filter} rail={r} onOpenDetail={onOpenDetail} onOpenPerson={onOpenPerson} />
      ))}
    </SeenContext.Provider>
  );
}

function RailSwitch({
  filter,
  rail,
  onOpenDetail,
  onOpenPerson,
}: {
  filter: MetaFilter;
  rail: AnyRail;
  onOpenDetail: (m: Meta) => void;
  onOpenPerson: (p: PersonRef) => void;
}) {
  if (rail.kind === "spotlight") return <SpotlightRailView rail={rail} onOpenDetail={onOpenDetail} onOpenPerson={onOpenPerson} />;
  if (rail.kind === "topic") return <TopicRailView rail={rail} onOpenDetail={onOpenDetail} />;
  return <StandardRailView filter={filter} rail={rail} onOpenDetail={onOpenDetail} />;
}

// Fills a rail to MIN_FILL from a page fetcher, deduping against the page's seen
// set unless the rail opted out, and remembers the raw fetcher for see-all.
function useFilledRail(
  fetchPage: ((page: number) => Promise<Meta[]>) | null,
  noDedup: boolean,
  resetKey: string,
): Meta[] | null {
  const seen = useContext(SeenContext);
  const [items, setItems] = useState<Meta[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    if (!fetchPage) {
      setItems([]);
      return;
    }
    (async () => {
      let collected: Meta[] = [];
      for (let p = 1; p <= MAX_INITIAL_PAGES && collected.length < MIN_FILL; p++) {
        let res: Meta[];
        try {
          res = await fetchPage(p);
        } catch {
          break;
        }
        if (cancelled) return;
        const withArt = res.filter((m) => m.poster);
        if (noDedup) seen.claim(withArt);
        collected = [...collected, ...(noDedup ? withArt : seen.dedup(withArt))];
        if (res.length < 20) break;
      }
      if (!cancelled) setItems(collected.slice(0, RAIL_CAP));
    })();
    return () => {
      cancelled = true;
    };
    // resetKey stands in for the params identity the caller derives it from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, noDedup, seen, !!fetchPage]);
  return items;
}

function StandardRailView({
  filter,
  rail,
  onOpenDetail,
}: {
  filter: MetaFilter;
  rail: StandardRail;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const mediaType = rail.mediaType ?? filter.mediaType;
  const paramsKey = JSON.stringify(rail.params);
  const fetchPage = useCallback(
    (page: number) => tmdbDiscover(settings.tmdbKey, mediaType, { ...rail.params, page: String(page) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings.tmdbKey, mediaType, paramsKey],
  );
  const items = useFilledRail(fetchPage, rail.noDedup === true, `${mediaType}:${rail.id}:${paramsKey}:${settings.tmdbKey}`);
  const [seeAll, setSeeAll] = useState(false);
  if (items === null) return <RailSkeleton />;
  if (items.length === 0) return null;
  return (
    <>
      <MobileRail
        title={t(rail.title)}
        kicker={t(rail.kicker)}
        metas={items}
        onOpenDetail={onOpenDetail}
        onSeeAll={() => setSeeAll(true)}
      />
      {seeAll && (
        <MobileGridSheet title={t(rail.title)} kicker={t(rail.kicker)} fetcher={fetchPage} onClose={() => setSeeAll(false)} />
      )}
    </>
  );
}

function TopicRailView({ rail, onOpenDetail }: { rail: TopicRail; onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [keywordIds, setKeywordIds] = useState<number[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setKeywordIds(null);
    tmdbResolveKeywordIds(settings.tmdbKey, rail.topic.keywords)
      .then((ids) => !cancelled && setKeywordIds(ids))
      .catch(() => !cancelled && setKeywordIds([]));
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, rail.topic.keywords]);
  const params = useMemo(() => {
    const p: Record<string, string> = {
      sort_by: "vote_average.desc",
      "vote_count.gte": String(rail.topic.voteCount ?? 5),
    };
    if (rail.topic.genreIds?.length) p.with_genres = rail.topic.genreIds.join(",");
    if (keywordIds?.length) p.with_keywords = keywordIds.join("|");
    return p;
  }, [rail.topic.genreIds, rail.topic.voteCount, keywordIds]);
  const ready = keywordIds !== null && keywordIds.length > 0;
  const fetchPage = useCallback(
    (page: number) => tmdbDiscover(settings.tmdbKey, rail.mediaType, { ...params, page: String(page) }),
    [settings.tmdbKey, rail.mediaType, params],
  );
  const items = useFilledRail(ready ? fetchPage : null, false, `${rail.mediaType}:${rail.id}:${JSON.stringify(params)}:${ready}`);
  const [seeAll, setSeeAll] = useState(false);
  if (keywordIds === null || items === null) return <RailSkeleton />;
  if (items.length === 0) return null;
  return (
    <>
      <MobileRail
        title={t(rail.topic.title)}
        kicker={t(rail.topic.kicker)}
        metas={items}
        onOpenDetail={onOpenDetail}
        onSeeAll={() => setSeeAll(true)}
      />
      {seeAll && (
        <MobileGridSheet title={t(rail.topic.title)} kicker={t(rail.topic.kicker)} fetcher={fetchPage} onClose={() => setSeeAll(false)} />
      )}
    </>
  );
}

const DIRECTOR_JOBS = new Set(["Director"]);
const WRITER_JOBS = new Set(["Writer", "Screenplay", "Story", "Teleplay"]);

function isCameo(c: PersonCredit): boolean {
  const ch = (c.character ?? "").toLowerCase().trim();
  if (!ch) return false;
  if (ch.includes("(uncredited)") || ch.includes("archive footage") || ch.includes("archival footage")) return true;
  if (ch === "self" || ch === "himself" || ch === "herself" || ch === "themselves") return true;
  return ch.startsWith("self ") || ch.startsWith("himself ") || ch.startsWith("herself ");
}

function jitter(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) / 0xffffffff;
}

function spotlightCredits(person: { cast: PersonCredit[]; crew: PersonCredit[] }, spotlight: Spotlight, genreId: number): PersonCredit[] {
  const jobs = spotlight.dept === "Directing" ? DIRECTOR_JOBS : spotlight.dept === "Writing" ? WRITER_JOBS : null;
  const pool = jobs
    ? person.crew.filter((c) => jobs.has(c.job ?? ""))
    : spotlight.presenter
      ? person.cast
      : person.cast.filter((c) => !isCameo(c));
  const accepted = new Set<number>([...genreEquivalents(genreId), ...(spotlight.relatedGenreIds ?? []).flatMap(genreEquivalents)]);
  const seen = new Set<number>();
  const unique: PersonCredit[] = [];
  for (const c of pool) {
    if (!c.poster || seen.has(c.id)) continue;
    if (!spotlight.presenter && c.mediaType === "tv" && (c.episodeCount ?? 0) < 2) continue;
    if (!(c.genreIds ?? []).some((id) => accepted.has(id))) continue;
    seen.add(c.id);
    unique.push(c);
  }
  const score = (c: PersonCredit) =>
    (c.voteAverage || 0) * Math.log2(2 + (c.voteCount || 0)) * (0.7 + jitter(`${spotlight.name}:${c.id}`) * 0.6);
  unique.sort((a, b) => score(b) - score(a));
  return unique;
}

function SpotlightRailView({
  rail,
  onOpenDetail,
  onOpenPerson,
}: {
  rail: SpotlightRail;
  onOpenDetail: (m: Meta) => void;
  onOpenPerson: (p: PersonRef) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const seen = useContext(SeenContext);
  const [state, setState] = useState<{ items: Meta[]; personId: number | null; profile: string | null } | null>(null);
  const { spotlight, genreId } = rail;
  useEffect(() => {
    let cancelled = false;
    setState(null);
    (async () => {
      const id = await tmdbPersonIdByName(settings.tmdbKey, spotlight.query ?? spotlight.name, spotlight.dept).catch(() => null);
      if (cancelled) return;
      if (id == null) {
        setState({ items: [], personId: null, profile: null });
        return;
      }
      const p = await tmdbPerson(settings.tmdbKey, id).catch(() => null);
      if (cancelled) return;
      if (!p) {
        setState({ items: [], personId: id, profile: null });
        return;
      }
      const metas = spotlightCredits(p, spotlight, genreId).map(creditToMeta);
      seen.claim(metas);
      setState({ items: metas.slice(0, RAIL_CAP), personId: id, profile: p.profilePath });
    })();
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, spotlight, genreId, seen]);
  if (state === null) return <RailSkeleton />;
  if (state.items.length === 0) return null;
  const person: PersonRef = { id: state.personId!, name: spotlight.name, profilePath: state.profile, note: t(spotlight.sub) };
  return (
    <MobileRail
      title={t("{name}'s {sub}", { name: spotlight.name, sub: t(spotlight.sub) })}
      kicker={t("Spotlight")}
      metas={state.items}
      onOpenDetail={onOpenDetail}
      leading={<PersonTile person={person} onOpen={onOpenPerson} width={124} />}
    />
  );
}

export function RailSkeleton() {
  return (
    <section className="harbor-skeleton flex flex-col gap-3" aria-hidden>
      <div className="px-4">
        <div className="h-[18px] w-40 rounded-md bg-elevated/45" />
        <div className="mt-1.5 h-2.5 w-24 rounded bg-elevated/35" />
      </div>
      <div className="flex gap-3 overflow-hidden px-4 pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] w-[124px] shrink-0 rounded-lg bg-elevated/40" />
        ))}
      </div>
    </section>
  );
}

const CINEMETA_PAGE = 100;
const CINEMETA_MAX_PAGE = 6;

function CinemetaFallback({ filter, onOpenDetail }: { filter: MetaFilter; onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const genre = filter.kind === "genre" ? filter.name : null;
  const fetchPage = useCallback<CatalogFetch>(
    (page) => {
      const skip = (page - 1) * CINEMETA_PAGE;
      const req = filter.mediaType === "tv" ? topSeries(genre ?? undefined, skip) : topMovies(genre ?? undefined, skip);
      return req.then((metas) => ({ metas, more: metas.length >= CINEMETA_PAGE && page < CINEMETA_MAX_PAGE }));
    },
    [filter.mediaType, genre],
  );
  if (!genre) {
    return (
      <div className="mx-4 rounded-2xl border border-dashed border-edge bg-canvas/30 p-6 text-center">
        <p className="text-[14px] font-semibold text-ink">{t("Add a TMDB key to browse by this filter.")}</p>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          {t("Year, runtime, language, and country filters need TMDB. Genre browsing falls back to Cinemeta automatically.")}
        </p>
      </div>
    );
  }
  return (
    <MobileCatalogGrid
      fetchPage={fetchPage}
      resetKey={`cinemeta:${filter.mediaType}:${genre}`}
      enabled
      initialPages={1}
      emptyState={
        <p className="mx-4 rounded-xl border border-dashed border-edge bg-canvas/30 px-5 py-6 text-center text-[12.5px] text-ink-subtle">
          {t("Cinemeta didn't return anything for {genre}. Try a different genre or add a TMDB key.", { genre })}
        </p>
      }
      onOpenDetail={onOpenDetail}
    />
  );
}
