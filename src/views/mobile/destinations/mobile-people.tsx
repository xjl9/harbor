import { ChevronRight, Info, SlidersHorizontal, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AwardDetailModal } from "@/components/award-detail-modal";
import { Poster } from "@/components/poster";
import { mergeBundledPersonAwards } from "@/lib/awards-history";
import type { Meta } from "@/lib/cinemeta";
import {
  fetchRankManifest,
  type HarborRankExplanation,
  type PeopleDept,
  type PersonRankEntry,
  type RankSource,
} from "@/lib/harbor-rank";
import { useT } from "@/lib/i18n";
import { isHarborExplanation, usePeopleRankings } from "@/lib/people-rankings";
import {
  creditToMeta,
  tmdbPerson,
  tmdbPersonCached,
  type PersonCredit,
  type PersonDetail,
} from "@/lib/providers/tmdb";
import { IMG } from "@/lib/providers/tmdb/tmdb-client";
import { tmdbDepartmentLabelKey } from "@/lib/providers/tmdb/tmdb-people";
import { awardSummary, useAwards, type AwardType } from "@/lib/providers/wikidata";
import { useRankings } from "@/lib/rankings";
import { useSettings } from "@/lib/settings";
import { HowHarborRankWorks } from "@/views/people/how-harbor-rank-works";
import { DEPT_LABEL, knownToMeta, profilePhoto, titleToMeta } from "@/views/people/people-utils";
import { EmptyFiltersState, ErrorState, NoKeyState, OfflinePill } from "@/views/people/people-states";
import { AwardLaurelStrip } from "@/views/person/award-laurel-strip";
import { Bio } from "@/views/person/bio";
import { COLLAB_RAIL_MIN, type Collaborator } from "@/views/person/collaborator-rank";
import {
  applyMinRating,
  MIN_VOTES_MOVIE,
  MIN_VOTES_TV,
  rankByRating,
  sortFilmography,
  TOP_PERFORMANCE_COUNT,
  TOP_PERFORMANCE_MIN,
  type FilmographySort,
} from "@/views/person/filmography-rank";
import { BirthdayLink, PlaceLink } from "@/views/person/person-meta-links";
import {
  calcAge,
  dedupe,
  dedupeByMedia,
  DIRECTOR_JOBS,
  fmtDate,
  isCameoOrGuest,
  notableScore,
  PRODUCER_JOBS,
  WRITER_JOBS,
} from "@/views/person/person-utils";
import { useCollaborators } from "@/views/person/use-collaborators";
import { MobileDetail } from "../mobile-detail";
import { requestMobileIntent } from "../mobile-intent";
import {
  BottomSheet,
  Chip,
  ChipRow,
  DestinationPage,
  EmptyBlock,
  IconButton,
  LoadMoreSentinel,
  MetaTile,
  SearchField,
  SectionHead,
  SubPage,
  TileRail,
} from "./page-shell";

type Person = HarborRankExplanation | PersonRankEntry;
type Country = { iso: string; name: string; code?: string | null; file?: boolean };

// Labels match the desktop source switch and department tabs, which translate
// them from the same catalog.
const SOURCES: Array<{ source: RankSource; label: string; provenance: string }> = [
  { source: "harbor", label: "Harbor Rank", provenance: "Our all-time ranking of a body of work, fully explained." },
  {
    source: "trending",
    label: "Trending",
    provenance: "People from the week's hottest titles, weighted by what is being talked about.",
  },
  {
    source: "rising",
    label: "Rising Stars",
    provenance: "Breakout talent from this week's hottest titles, before they are household names.",
  },
  { source: "contenders", label: "Contenders", provenance: "In the running this awards season, from the latest nominations and wins." },
  { source: "tmdb", label: "Top on TMDB", provenance: "Steady popularity across TMDB right now." },
  { source: "imdb", label: "Top on IMDb", provenance: "Built from IMDb's public datasets. Career ratings volume." },
  {
    source: "consensus",
    label: "Consensus",
    provenance: "A blend of the sources above by percentile. Degrades gracefully when one is missing.",
  },
];

const DEPTS: Array<{ id: PeopleDept; label: string }> = [
  { id: "Acting", label: "Actors" },
  { id: "Directing", label: "Directors" },
  { id: "Production", label: "Producers" },
  { id: "Writing", label: "Writers" },
];

const GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime", "Documentary", "Drama",
  "Family", "Fantasy", "History", "Horror", "Music", "Mystery", "Romance",
  "Science Fiction", "Thriller", "War", "Western",
];

const BATCH = 40;

function parsePersonId(raw: string | number): number {
  const n = Number(String(raw).replace(/^person:/, ""));
  return Number.isFinite(n) ? n : 0;
}

// Top People: the desktop ranking feed (Harbor Rank and the six live sources)
// as a phone list, with the person page pushed on top.
export function MobileTopPeople({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [source, setSource] = useState<RankSource>("harbor");
  const [dept, setDept] = useState<PeopleDept>("Acting");
  const [country, setCountry] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [sources, setSources] = useState<RankSource[] | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [visible, setVisible] = useState(BATCH);
  const [people, setPeople] = useState<number[]>([]);
  const [detail, setDetail] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRankManifest().then((m) => {
      if (cancelled || !m) return;
      if (m.countries) setCountries(m.countries);
      if (Array.isArray(m.sources) && m.sources.length > 0) setSources(m.sources);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => setVisible(BATCH), [source, dept, country, genre, query]);

  const countryEntry = useMemo(() => (country ? countries.find((c) => c.iso === country) : undefined), [countries, country]);
  const serverCountry = countryEntry?.file && countryEntry.code ? countryEntry.code.toLowerCase() : null;
  const { status, people: ranked } = usePeopleRankings({
    source,
    dept,
    country: source === "harbor" ? serverCountry : null,
    nonce: reloadNonce,
  });

  const filtered = useMemo<Person[]>(() => {
    const q = query.trim().toLowerCase();
    const all = ranked as Person[];
    if (!q && !genre && !country) return all;
    let base = all.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (country && !serverCountry && p.country !== country) return false;
      if (genre) {
        if (p.genreScores) return (p.genreScores[genre] ?? 0) > 0;
        return (p.genres ?? []).includes(genre);
      }
      return true;
    });
    if (genre) base = [...base].sort((a, b) => (b.genreScores?.[genre] ?? 0) - (a.genreScores?.[genre] ?? 0));
    return base.map((p, i) => ({ ...p, rank: i + 1 }));
  }, [ranked, query, genre, country, serverCountry]);

  const body = useMemo(
    () => (source === "harbor" ? filtered.filter((p) => !isHarborExplanation(p) || p.score !== null) : filtered),
    [filtered, source],
  );
  const tabs = sources ? SOURCES.filter((s) => sources.includes(s.source)) : SOURCES;
  const tab = SOURCES.find((s) => s.source === source);
  const filterCount = (genre ? 1 : 0) + (country ? 1 : 0);
  const loadMore = useCallback(() => setVisible((v) => Math.min(v + BATCH, body.length)), [body.length]);

  return (
    <DestinationPage
      kicker={t("Discover")}
      title={t("Top People")}
      icon={<Users size={20} strokeWidth={2} />}
      onBack={onBack}
      actions={
        source === "harbor" ? (
          <IconButton label={t("How Harbor Rank works")} onClick={() => setExplainOpen(true)}>
            <Info size={20} strokeWidth={2} />
          </IconButton>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2.5 pb-4">
        <ChipRow>
          {tabs.map((s) => (
            <Chip key={s.source} label={t(s.label)} active={source === s.source} onClick={() => setSource(s.source)} />
          ))}
        </ChipRow>
        {tab && <p className="text-[12.5px] leading-snug text-ink-subtle">{t(tab.provenance)}</p>}
        <ChipRow>
          {DEPTS.map((d) => (
            <Chip key={d.id} label={t(d.label)} active={dept === d.id} onClick={() => setDept(d.id)} />
          ))}
          <Chip
            label={t("Filters")}
            icon={<SlidersHorizontal size={13} strokeWidth={2.2} />}
            count={filterCount > 0 ? filterCount : undefined}
            active={filterCount > 0}
            onClick={() => setFiltersOpen(true)}
          />
        </ChipRow>
        <SearchField value={query} onChange={setQuery} placeholder={t("Filter by name or title")} />
        {(query.trim() || genre || country) && status === "ready" && (
          <p className="text-[11.5px] tabular-nums text-ink-subtle">
            {t("{n} of {total}", { n: String(filtered.length), total: String(ranked.length) })}
          </p>
        )}
        {status === "offline" && <OfflinePill />}
      </div>

      {status === "loading" ? (
        <ul className="flex flex-col gap-2.5" aria-hidden>
          {Array.from({ length: 7 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl bg-elevated/50 p-3">
              <span className="h-6 w-7 animate-pulse rounded bg-ink/10" />
              <span className="h-[84px] w-14 animate-pulse rounded-lg bg-ink/10" />
              <span className="flex flex-1 flex-col gap-2">
                <span className="h-4 w-2/3 animate-pulse rounded bg-ink/10" />
                <span className="h-3 w-1/3 animate-pulse rounded bg-ink/10" />
              </span>
            </li>
          ))}
        </ul>
      ) : status === "no-key" ? (
        <NoKeyState onOpenSettings={() => requestMobileIntent("debrid")} />
      ) : status === "error" ? (
        <ErrorState onRetry={() => setReloadNonce((n) => n + 1)} />
      ) : ranked.length === 0 || body.length === 0 ? (
        <EmptyFiltersState
          onClear={() => {
            setQuery("");
            setCountry(null);
            setGenre(null);
          }}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {body.slice(0, visible).map((p) => (
              <li key={p.id}>
                <PeopleRow person={p} onOpen={() => setPeople([p.id])} onOpenMeta={setDetail} />
              </li>
            ))}
          </ul>
          {visible < body.length && <LoadMoreSentinel onLoadMore={loadMore} />}
        </>
      )}

      {filtersOpen && (
        <BottomSheet title={t("Filters")} onClose={() => setFiltersOpen(false)} tall>
          <div className="flex flex-col gap-5 px-2">
            <div className="flex flex-col gap-2">
              <p className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">{t("Genres")}</p>
              <div className="flex flex-wrap gap-2">
                <Chip label={t("All genres")} active={genre === null} onClick={() => setGenre(null)} />
                {GENRES.map((g) => (
                  <Chip key={g} label={t(g)} active={genre === g} onClick={() => setGenre(g)} />
                ))}
              </div>
            </div>
            {countries.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="px-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                  {t("Birthplace, not nationality")}
                </p>
                {[{ iso: "", name: t("All countries") }, ...countries].map((c) => {
                  const active = (country ?? "") === c.iso;
                  return (
                    <button
                      key={c.iso || "all"}
                      type="button"
                      onClick={() => setCountry(c.iso || null)}
                      className={`flex min-h-11 items-center justify-between rounded-xl px-3 text-start text-[14.5px] ${
                        active ? "bg-canvas/60 font-semibold text-ink" : "text-ink active:bg-canvas/40"
                      }`}
                    >
                      {c.name}
                      {active && <span className="h-2 w-2 rounded-full bg-accent" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      <HowHarborRankWorks open={explainOpen} onClose={() => setExplainOpen(false)} />

      {people.map((id, i) => (
        <PersonSubPage
          key={`${id}-${i}`}
          personId={id}
          onBack={() => setPeople((cur) => cur.slice(0, i))}
          onOpenMeta={setDetail}
          onOpenPerson={(next) => setPeople((cur) => [...cur.slice(0, i + 1), next])}
        />
      ))}
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}

function PeopleRow({
  person,
  onOpen,
  onOpenMeta,
}: {
  person: Person;
  onOpen: () => void;
  onOpenMeta: (m: Meta) => void;
}) {
  const t = useT();
  const deptKey = DEPT_LABEL[person.department];
  const harbor = isHarborExplanation(person);
  const titles: Meta[] = harbor
    ? person.topTitles.slice(0, 3).map(titleToMeta)
    : (person.knownFor ?? []).slice(0, 3).map(knownToMeta);
  const delta = !harbor ? person.delta : null;
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-elevated/50 p-2.5 ring-1 ring-edge-soft/40">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <span
          className={`w-8 shrink-0 text-center font-display font-medium leading-none tabular-nums ${
            person.rank <= 10 ? "text-[24px] text-ink" : "text-[17px] text-ink-muted"
          }`}
        >
          {person.rank}
        </span>
        <span className="w-14 shrink-0 overflow-hidden rounded-lg">
          <Poster src={profilePhoto(person.profilePath, 185)} seed={String(person.id)} ratio="portrait" lazy />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[15px] font-semibold leading-tight text-ink">{person.name}</span>
          <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
            {deptKey ? t(deptKey) : person.department}
            {delta != null && delta !== 0 && (
              <span className={`font-semibold tabular-nums ${delta > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </span>
        </span>
      </button>
      {titles.length > 0 && (
        <span className="flex shrink-0 gap-1">
          {titles.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpenMeta(m)}
              aria-label={t("View {title}", { title: m.name })}
              className="w-[34px] overflow-hidden rounded-[5px] ring-1 ring-edge-soft/50"
              style={{ minHeight: 51 }}
            >
              <Poster src={m.poster} seed={m.id} ratio="portrait" lazy />
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

function usePerson(personId: number) {
  const { settings } = useSettings();
  const initial = tmdbPersonCached(personId);
  const [person, setPerson] = useState<PersonDetail | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);
  useEffect(() => {
    let cancelled = false;
    const cached = tmdbPersonCached(personId);
    if (cached) {
      setPerson(cached);
      setLoading(false);
      return;
    }
    setPerson(null);
    setLoading(true);
    tmdbPerson(settings.tmdbKey, personId).then((p) => {
      if (cancelled) return;
      setPerson(p);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [personId, settings.tmdbKey]);
  return { person, loading, noKey: !settings.tmdbKey };
}

function PersonSubPage({
  personId,
  onBack,
  onOpenMeta,
  onOpenPerson,
}: {
  personId: number;
  onBack: () => void;
  onOpenMeta: (m: Meta) => void;
  onOpenPerson: (id: number) => void;
}) {
  const t = useT();
  const { person, loading, noKey } = usePerson(personId);
  const deptKey = person?.knownForDepartment ? tmdbDepartmentLabelKey(person.knownForDepartment) : undefined;
  return (
    <SubPage
      kicker={person?.knownForDepartment ? (deptKey ? t(deptKey) : person.knownForDepartment) : t("People")}
      title={person?.name ?? ""}
      onBack={onBack}
    >
      <PersonContent
        personId={personId}
        person={person}
        loading={loading}
        noKey={noKey}
        onOpenMeta={onOpenMeta}
        onOpenPerson={onOpenPerson}
      />
    </SubPage>
  );
}

// Standalone person page for surfaces outside this destination (the detail
// cast rows). It opens on top of a detail page, so it takes a layer above the
// detail's, and while a title it opened is showing it hides itself, which lets
// that detail be the visible screen without unmounting what was loaded here.
export function MobilePersonPage({ personId, onBack }: { personId: string; onBack: () => void }) {
  const t = useT();
  const id = parsePersonId(personId);
  const { person, loading, noKey } = usePerson(id);
  const [detail, setDetail] = useState<Meta | null>(null);
  const [hidden, setHidden] = useState(false);
  const [people, setPeople] = useState<number[]>([]);

  // Hide only once the detail has faded in, so the page does not blink out
  // from under the opening animation.
  useEffect(() => {
    if (!detail) {
      setHidden(false);
      return;
    }
    const timer = window.setTimeout(() => setHidden(true), 360);
    return () => window.clearTimeout(timer);
  }, [detail]);

  const deptKey = person?.knownForDepartment ? tmdbDepartmentLabelKey(person.knownForDepartment) : undefined;
  return (
    <DestinationPage
      layer={55}
      hidden={hidden}
      kicker={person?.knownForDepartment ? (deptKey ? t(deptKey) : person.knownForDepartment) : t("People")}
      title={person?.name ?? ""}
      onBack={onBack}
    >
      <PersonContent
        personId={id}
        person={person}
        loading={loading}
        noKey={noKey}
        onOpenMeta={setDetail}
        onOpenPerson={(next) => setPeople([next])}
      />
      {people.map((pid, i) => (
        <PersonSubPage
          key={`${pid}-${i}`}
          personId={pid}
          onBack={() => setPeople((cur) => cur.slice(0, i))}
          onOpenMeta={setDetail}
          onOpenPerson={(next) => setPeople((cur) => [...cur.slice(0, i + 1), next])}
        />
      ))}
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}

const SORTS: Array<{ id: FilmographySort; label: string }> = [
  { id: "popularity", label: "Popularity" },
  { id: "rating", label: "Rating" },
  { id: "newest", label: "Newest" },
];
const MIN_RATINGS = [6, 7, 8];
const RAIL_CAP = 30;

function PersonContent({
  personId,
  person,
  loading,
  noKey,
  onOpenMeta,
  onOpenPerson,
}: {
  personId: number;
  person: PersonDetail | null;
  loading: boolean;
  noKey: boolean;
  onOpenMeta: (m: Meta) => void;
  onOpenPerson: (id: number) => void;
}) {
  const t = useT();
  const { rank } = useRankings();
  const [sort, setSort] = useState<FilmographySort>("popularity");
  const [minRating, setMinRating] = useState(0);
  const [bioOpen, setBioOpen] = useState(false);
  const [openAward, setOpenAward] = useState<{ type: AwardType; anchor: DOMRect } | null>(null);
  const [grid, setGrid] = useState<{ title: string; credits: PersonCredit[] } | null>(null);

  const liveAwards = useAwards(person?.imdbId ?? undefined);
  const awardEntries = useMemo(() => mergeBundledPersonAwards(liveAwards, person?.name), [liveAwards, person?.name]);
  const awardChips = useMemo(() => awardSummary(awardEntries), [awardEntries]);
  const openAwardEntries = useMemo(
    () => (openAward && awardEntries ? awardEntries.filter((e) => e.type === openAward.type) : []),
    [openAward, awardEntries],
  );
  const personRank = rank(personId, person?.knownForDepartment ?? "Acting");

  const sortedCast = useMemo(() => (person ? dedupe(person.cast).sort((a, b) => b.popularity - a.popularity) : []), [person]);
  const sortedCrew = useMemo(() => (person ? person.crew.slice().sort((a, b) => b.popularity - a.popularity) : []), [person]);
  const knownFor = useMemo(() => {
    if (!person) return [];
    const dept = person.knownForDepartment;
    const pool =
      dept === "Acting" || !dept
        ? sortedCast.filter((c) => !isCameoOrGuest(c))
        : dedupeByMedia(sortedCrew.filter((c) => c.department === dept));
    return pool.slice().sort((a, b) => notableScore(b) - notableScore(a)).slice(0, 12);
  }, [sortedCast, sortedCrew, person]);
  const topPerformances = useMemo(
    () => rankByRating(sortedCast.filter((c) => !isCameoOrGuest(c)), TOP_PERFORMANCE_COUNT),
    [sortedCast],
  );
  const collaborators = useCollaborators(person);

  const film = useMemo(() => {
    const crewIn = (jobs: Set<string>) => dedupe(sortedCrew.filter((c) => jobs.has(c.job ?? "")));
    const otherAll = dedupe(
      sortedCrew.filter(
        (c) => !DIRECTOR_JOBS.has(c.job ?? "") && !WRITER_JOBS.has(c.job ?? "") && !PRODUCER_JOBS.has(c.job ?? ""),
      ),
    );
    const raw = {
      movies: sortedCast.filter((c) => c.mediaType === "movie"),
      shows: sortedCast.filter((c) => c.mediaType === "tv"),
      directing: crewIn(DIRECTOR_JOBS),
      writing: crewIn(WRITER_JOBS),
      producing: crewIn(PRODUCER_JOBS),
      otherCrew: otherAll.length > 4 ? otherAll.slice(0, 24) : [],
    };
    const shape = (list: PersonCredit[]) => sortFilmography(applyMinRating(list, minRating), sort);
    const shown = {
      movies: shape(raw.movies),
      shows: shape(raw.shows),
      directing: shape(raw.directing),
      writing: shape(raw.writing),
      producing: shape(raw.producing),
      otherCrew: shape(raw.otherCrew),
    };
    const count = (lists: PersonCredit[][]) => lists.reduce((n, l) => n + l.length, 0);
    return { ...shown, total: count(Object.values(raw)), shownTotal: count(Object.values(shown)) };
  }, [sortedCast, sortedCrew, sort, minRating]);

  if (noKey && !person) {
    return (
      <EmptyBlock
        icon={<Users size={24} strokeWidth={1.6} />}
        title={t("Add a TMDB key to load rankings")}
        body={t("People pages read TMDB, which needs your own TMDB key.")}
        action={
          <button
            type="button"
            onClick={() => requestMobileIntent("debrid")}
            className="flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas"
          >
            {t("Open settings")}
          </button>
        }
      />
    );
  }

  const photo = person?.profilePath ? `https://image.tmdb.org/t/p/h632${person.profilePath}` : undefined;
  const backdrop = knownFor.find((c) => c.background)?.background;
  const age = person?.birthday ? calcAge(person.birthday, person.deathday) : null;
  const deptKey = person?.knownForDepartment ? tmdbDepartmentLabelKey(person.knownForDepartment) : undefined;
  const deptLabel = person?.knownForDepartment ? (deptKey ? t(deptKey) : person.knownForDepartment) : null;
  const creditMeta = (c: PersonCredit) => creditToMeta(c);
  const caption = (c: PersonCredit, showRole: boolean) =>
    [showRole ? c.character || c.job : null, c.releaseInfo].filter(Boolean).join(" · ");

  const rail = (title: string, credits: PersonCredit[], showRole: boolean) =>
    credits.length > 0 ? (
      <TileRail
        title={title}
        trailing={
          credits.length > 6 ? (
            <IconButton label={t("See all")} onClick={() => setGrid({ title, credits })}>
              <ChevronRight size={20} strokeWidth={2.2} className="dir-icon" />
            </IconButton>
          ) : undefined
        }
      >
        {credits.slice(0, RAIL_CAP).map((c, i) => (
          <div key={`${c.mediaType}-${c.id}-${i}`} className="w-[112px] shrink-0">
            <MetaTile meta={creditMeta(c)} onOpen={onOpenMeta} caption={caption(c, showRole)} />
          </div>
        ))}
      </TileRail>
    ) : null;

  return (
    <div className="relative isolate flex flex-col gap-7">
      {backdrop && (
        <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-4 -z-10 h-[420px] overflow-hidden">
          <div
            className="absolute inset-0 scale-110"
            style={{
              backgroundImage: `url(${backdrop})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(60px) saturate(1.3)",
              opacity: 0.45,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/75 to-canvas" />
        </div>
      )}

      <header className="flex gap-4 pt-2">
        <div className="w-[118px] shrink-0 overflow-hidden rounded-2xl shadow-[0_20px_50px_-15px_rgba(0,0,0,0.7)]">
          <Poster src={photo} seed={String(personId)} ratio="portrait" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-end gap-2 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            {deptLabel && (
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-subtle">{deptLabel}</span>
            )}
            {personRank && (
              <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent">
                {t("Top {n}", { n: personRank })}
              </span>
            )}
          </div>
          <h2 className="line-clamp-3 font-display text-[30px] font-medium leading-[1.02] tracking-tight text-ink">
            {person?.name ?? (loading ? "" : t("Unknown"))}
          </h2>
          <div className="flex flex-col items-start gap-1 text-[13px] text-ink-muted">
            {person?.birthday && <BirthdayLink birthday={person.birthday} age={age} />}
            {person?.deathday && <span>{t("Died {date}", { date: fmtDate(person.deathday) })}</span>}
            {person?.placeOfBirth && <PlaceLink place={person.placeOfBirth} />}
          </div>
        </div>
      </header>

      {awardChips.length > 0 && (
        <AwardLaurelStrip chips={awardChips} onOpen={(type, anchor) => setOpenAward({ type, anchor })} />
      )}

      {person?.biography && (
        <div className="flex flex-col items-start gap-1">
          <div className={`text-[14px] leading-relaxed text-ink-muted ${bioOpen ? "" : "line-clamp-5"}`}>
            <Bio text={person.biography} credits={[...person.cast, ...person.crew]} onOpenCredit={(c) => onOpenMeta(creditToMeta(c))} />
          </div>
          {person.biography.length > 320 && (
            <button type="button" onClick={() => setBioOpen((v) => !v)} className="h-11 text-[13.5px] font-semibold text-ink">
              {bioOpen ? t("Show less") : t("Read more")}
            </button>
          )}
        </div>
      )}

      {loading && <div className="h-[220px] animate-pulse rounded-2xl bg-elevated/30" />}

      {rail(t("Known For"), knownFor, false)}
      {topPerformances.length >= TOP_PERFORMANCE_MIN && rail(t("IMDb Top"), topPerformances, true)}
      {collaborators.length >= COLLAB_RAIL_MIN && (
        <TileRail title={t("Frequent Collaborators")}>
          {collaborators.map((p) => (
            <CollaboratorTile key={p.id} person={p} onOpen={onOpenPerson} />
          ))}
        </TileRail>
      )}

      {film.total > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHead title={t("Filmography")} />
          <ChipRow>
            {SORTS.map((s) => (
              <Chip key={s.id} label={t(s.label)} active={sort === s.id} onClick={() => setSort(s.id)} />
            ))}
            <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-edge-soft" />
            <Chip label={t("Any rating")} active={minRating === 0} onClick={() => setMinRating(0)} />
            {MIN_RATINGS.map((r) => (
              <Chip key={r} label={t("Rated {r}+", { r: String(r) })} active={minRating === r} onClick={() => setMinRating(r)} />
            ))}
          </ChipRow>
          <p className="text-[11px] leading-snug text-ink-subtle">
            <span className="tabular-nums">
              {t("{n} of {total}", { n: String(film.shownTotal), total: String(film.total) })}
            </span>
            {" · "}
            {t("Ratings count from {movie}+ votes, {tv}+ for TV", {
              movie: String(MIN_VOTES_MOVIE),
              tv: String(MIN_VOTES_TV),
            })}
          </p>
          <div className="flex flex-col gap-6 pt-2">
            {rail(t("Movies · {n}", { n: film.movies.length }), film.movies, true)}
            {rail(t("TV Shows · {n}", { n: film.shows.length }), film.shows, true)}
            {rail(t("Directing"), film.directing, true)}
            {rail(t("Writing"), film.writing, true)}
            {rail(t("Producing"), film.producing, true)}
            {rail(t("Other Work"), film.otherCrew, true)}
            {film.shownTotal === 0 && <EmptyBlock title={t("No titles clear that rating.")} />}
          </div>
        </section>
      )}

      {!loading && person && film.total === 0 && knownFor.length === 0 && (
        <EmptyBlock title={t("No filmography on record.")} />
      )}

      {openAward && (
        <AwardDetailModal
          type={openAward.type}
          entries={openAwardEntries}
          anchor={openAward.anchor}
          onClose={() => setOpenAward(null)}
        />
      )}

      {grid && (
        <SubPage title={grid.title} kicker={person?.name} onBack={() => setGrid(null)}>
          <div className="grid grid-cols-3 gap-x-3 gap-y-5">
            {grid.credits.map((c, i) => (
              <MetaTile key={`${c.mediaType}-${c.id}-${i}`} meta={creditMeta(c)} onOpen={onOpenMeta} caption={caption(c, true)} />
            ))}
          </div>
        </SubPage>
      )}
    </div>
  );
}

function CollaboratorTile({ person, onOpen }: { person: Collaborator; onOpen: (id: number) => void }) {
  const t = useT();
  const shared = t("{n} titles together", { n: person.titles });
  return (
    <button type="button" onClick={() => onOpen(person.id)} className="flex w-[104px] shrink-0 flex-col gap-1.5 text-start">
      <Poster
        src={person.profilePath ? `${IMG}/w342${person.profilePath}` : undefined}
        seed={String(person.id)}
        ratio="portrait"
        lazy
        className="rounded-xl"
      />
      <span className="line-clamp-1 text-[12.5px] font-semibold text-ink">{person.name}</span>
      <span className="line-clamp-2 text-[11px] leading-tight text-ink-subtle">
        {person.role ? `${person.role} · ${shared}` : shared}
      </span>
    </button>
  );
}
