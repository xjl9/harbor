import { useEffect, useMemo, useState } from "react";
import { Poster } from "@/components/poster";
import { AwardLogo, laurelColorFor } from "@/components/icons/award-logo";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { mergeBundledPersonAwards } from "@/lib/awards-history";
import {
  creditToMeta,
  tmdbPerson,
  tmdbPersonCached,
  type PersonCredit,
  type PersonDetail,
} from "@/lib/providers/tmdb";
import { tmdbDepartmentLabelKey } from "@/lib/providers/tmdb/tmdb-people";
import { awardSummary, useAwards } from "@/lib/providers/wikidata";
import { useSettings } from "@/lib/settings";
import { profilePhoto } from "@/views/people/people-utils";
import { useCollaborators } from "@/views/person/use-collaborators";
import { COLLAB_RAIL_MIN } from "@/views/person/collaborator-rank";
import { useCreditImdbRatings } from "@/views/person/use-credit-imdb-ratings";
import {
  applyMinRating,
  rankByRating,
  sortFilmography,
  TOP_PERFORMANCE_COUNT,
  TOP_PERFORMANCE_MIN,
  type FilmographySort,
} from "@/views/person/filmography-rank";
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
import { AWARD_TITLE } from "./awards";
import { HIDE_SCROLL } from "./data";
import { PhonePage } from "./sheets";
import { Line, Overview, SectionTitle } from "./ui";

const SORTS: Array<{ id: FilmographySort; label: string }> = [
  { id: "popularity", label: "Popularity" },
  { id: "rating", label: "Rating" },
  { id: "newest", label: "Newest" },
];
const MIN_RATINGS = [0, 6, 7, 8];

/**
 * A person's filmography as a pushed phone page, built from the same data hooks
 * and ranking helpers as the desktop person view. Collaborators open in place
 * (the page keeps its own small stack); a title closes the page and opens in
 * the detail stack underneath.
 */
export function PersonPage({
  personId,
  onBack,
  onOpenMeta,
}: {
  personId: number;
  onBack: () => void;
  onOpenMeta: (m: Meta) => void;
}) {
  const [stack, setStack] = useState<number[]>([personId]);
  useEffect(() => setStack([personId]), [personId]);
  const current = stack[stack.length - 1] ?? personId;
  return (
    <PersonBody
      key={current}
      personId={current}
      onBack={() => (stack.length > 1 ? setStack((s) => s.slice(0, -1)) : onBack())}
      onPerson={(id) => setStack((s) => (s[s.length - 1] === id ? s : [...s, id]))}
      onOpenMeta={onOpenMeta}
    />
  );
}

function PersonBody({
  personId,
  onBack,
  onPerson,
  onOpenMeta,
}: {
  personId: number;
  onBack: () => void;
  onPerson: (id: number) => void;
  onOpenMeta: (m: Meta) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const cached = tmdbPersonCached(personId);
  const [person, setPerson] = useState<PersonDetail | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const [sort, setSort] = useState<FilmographySort>("popularity");
  const [minRating, setMinRating] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const hit = tmdbPersonCached(personId);
    if (hit) {
      setPerson(hit);
      setLoading(false);
      return;
    }
    setLoading(true);
    tmdbPerson(settings.tmdbKey, personId)
      .then((p) => {
        if (!cancelled) setPerson(p);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, settings.tmdbKey]);

  const liveAwards = useAwards(person?.imdbId ?? undefined);
  const awardChips = useMemo(
    () => awardSummary(mergeBundledPersonAwards(liveAwards, person?.name)),
    [liveAwards, person?.name],
  );

  const sortedCast = useMemo(
    () => (person ? dedupe(person.cast).sort((a, b) => b.popularity - a.popularity) : []),
    [person],
  );
  const sortedCrew = useMemo(
    () => (person ? person.crew.slice().sort((a, b) => b.popularity - a.popularity) : []),
    [person],
  );
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
  const topRatings = useCreditImdbRatings(topPerformances);
  const collaborators = useCollaborators(person);

  const film = useMemo(() => {
    const crewIn = (jobs: Set<string>) => dedupe(sortedCrew.filter((c) => jobs.has(c.job ?? "")));
    const other = dedupe(
      sortedCrew.filter(
        (c) =>
          !DIRECTOR_JOBS.has(c.job ?? "") && !WRITER_JOBS.has(c.job ?? "") && !PRODUCER_JOBS.has(c.job ?? ""),
      ),
    );
    const raw = {
      movies: sortedCast.filter((c) => c.mediaType === "movie"),
      shows: sortedCast.filter((c) => c.mediaType === "tv"),
      directing: crewIn(DIRECTOR_JOBS),
      writing: crewIn(WRITER_JOBS),
      producing: crewIn(PRODUCER_JOBS),
      otherCrew: other.length > 4 ? other.slice(0, 24) : [],
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

  const departmentKey = person?.knownForDepartment
    ? tmdbDepartmentLabelKey(person.knownForDepartment)
    : undefined;
  const department = person?.knownForDepartment
    ? departmentKey
      ? t(departmentKey)
      : person.knownForDepartment
    : null;
  const age = person?.birthday ? calcAge(person.birthday, person.deathday) : null;
  const open = (c: PersonCredit) => onOpenMeta(creditToMeta(c));

  return (
    <PhonePage title={person?.name} eyebrow={department ?? undefined} label={person?.name} onBack={onBack}>
      <div className="flex flex-col gap-7 px-5 pt-2">
        <div className="flex items-end gap-4">
          <div className="w-[112px] shrink-0 overflow-hidden rounded-2xl shadow-[0_16px_40px_-18px_rgba(0,0,0,0.7)] ring-1 ring-edge-soft/60">
            <Poster src={profilePhoto(person?.profilePath ?? null, 342)} seed={String(personId)} ratio="portrait" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1">
            {person ? (
              <h1 className="font-display text-[28px] font-medium leading-[1.04] tracking-tight text-ink">
                {person.name}
              </h1>
            ) : loading ? (
              <Line className="w-3/4" />
            ) : null}
            {person?.birthday && (
              <p className="text-[13px] text-ink-muted">
                {t("Born {date}", { date: fmtDate(person.birthday) })}
                {age != null && !person.deathday ? ` · ${age}` : ""}
              </p>
            )}
            {person?.deathday && (
              <p className="text-[13px] text-ink-muted">{t("Died {date}", { date: fmtDate(person.deathday) })}</p>
            )}
            {person?.placeOfBirth && <p className="text-[12.5px] text-ink-subtle">{person.placeOfBirth}</p>}
          </div>
        </div>

        {awardChips.length > 0 && (
          <div className={`-mx-5 flex gap-2.5 overflow-x-auto px-5 ${HIDE_SCROLL}`}>
            {awardChips.map((a) => (
              <div
                key={a.type}
                className="flex shrink-0 items-center gap-2.5 rounded-2xl bg-surface/60 py-2 pe-3.5 ps-2.5 ring-1 ring-edge-soft/60"
              >
                <span className="flex h-9 w-9 items-center justify-center" style={{ color: laurelColorFor(a.type) }}>
                  <AwardLogo type={a.type} size={24} />
                </span>
                <span className="flex flex-col">
                  <span className="whitespace-nowrap text-[12.5px] font-semibold text-ink">
                    {t(AWARD_TITLE[a.type])}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-ink-subtle">
                    {a.wins > 0 && (
                      <>
                        <span className="text-accent">{a.wins}</span> {a.wins === 1 ? t("Win") : t("Wins")}
                      </>
                    )}
                    {a.wins > 0 && a.nominations > 0 && " · "}
                    {a.nominations > 0 &&
                      `${a.nominations} ${a.nominations === 1 ? t("Nomination") : t("Nominations")}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {person?.biography && <Overview text={person.biography} />}

        {loading && !person && <div className="harbor-skeleton h-[200px] rounded-2xl bg-elevated/60" />}

        {knownFor.length > 0 && <CreditRail title={t("Known For")} credits={knownFor} onOpen={open} />}
        {topPerformances.length >= TOP_PERFORMANCE_MIN && (
          <CreditRail title={t("IMDb Top")} credits={topPerformances} onOpen={open} showRole ratings={topRatings} />
        )}

        {collaborators.length >= COLLAB_RAIL_MIN && (
          <section className="flex flex-col gap-3.5">
            <SectionTitle>{t("Frequent Collaborators")}</SectionTitle>
            <div className={`-mx-5 flex snap-x snap-proximity gap-3.5 overflow-x-auto px-5 ${HIDE_SCROLL}`}>
              {collaborators.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPerson(p.id)}
                  className="flex w-[96px] shrink-0 snap-start flex-col gap-2 text-start"
                >
                  <Poster
                    src={profilePhoto(p.profilePath, 185)}
                    seed={String(p.id)}
                    ratio="portrait"
                    lazy
                    className="rounded-xl"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="line-clamp-1 text-[12.5px] font-medium text-ink">{p.name}</span>
                    <span className="line-clamp-2 text-[11px] leading-tight text-ink-subtle">
                      {t("{n} titles together", { n: p.titles })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {film.total > 0 && (
          <section className="flex flex-col gap-4">
            <SectionTitle>{t("Filmography")}</SectionTitle>
            <div className={`-mx-5 flex gap-1.5 overflow-x-auto px-5 ${HIDE_SCROLL}`}>
              {SORTS.map((s) => (
                <FilterChip key={s.id} active={sort === s.id} onClick={() => setSort(s.id)}>
                  {t(s.label)}
                </FilterChip>
              ))}
              <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-edge-soft" />
              {MIN_RATINGS.map((r) => (
                <FilterChip key={r} active={minRating === r} onClick={() => setMinRating(r)}>
                  {r === 0 ? t("Any rating") : t("Rated {r}+", { r })}
                </FilterChip>
              ))}
            </div>
            {film.movies.length > 0 && (
              <CreditRail title={t("Movies · {n}", { n: film.movies.length })} credits={film.movies} onOpen={open} showRole />
            )}
            {film.shows.length > 0 && (
              <CreditRail title={t("TV Shows · {n}", { n: film.shows.length })} credits={film.shows} onOpen={open} showRole />
            )}
            {film.directing.length > 0 && (
              <CreditRail title={t("Directing")} credits={film.directing} onOpen={open} showRole />
            )}
            {film.writing.length > 0 && (
              <CreditRail title={t("Writing")} credits={film.writing} onOpen={open} showRole />
            )}
            {film.producing.length > 0 && (
              <CreditRail title={t("Producing")} credits={film.producing} onOpen={open} showRole />
            )}
            {film.otherCrew.length > 0 && (
              <CreditRail title={t("Other Work")} credits={film.otherCrew} onOpen={open} showRole />
            )}
            {film.shownTotal === 0 && (
              <p className="rounded-2xl border border-dashed border-edge px-5 py-8 text-center text-[13.5px] text-ink-muted">
                {t("No titles clear that rating.")}
              </p>
            )}
          </section>
        )}

        {!loading && (!person || (film.total === 0 && knownFor.length === 0)) && (
          <p className="rounded-2xl border border-dashed border-edge px-5 py-8 text-center text-[13.5px] text-ink-muted">
            {t("No filmography on record.")}
          </p>
        )}
      </div>
    </PhonePage>
  );
}

function FilterChip({
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
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition-colors motion-reduce:transition-none ${
        active ? "bg-ink text-canvas" : "bg-surface text-ink-muted ring-1 ring-edge-soft/70"
      }`}
    >
      {children}
    </button>
  );
}

function CreditRail({
  title,
  credits,
  onOpen,
  showRole = false,
  ratings,
}: {
  title: string;
  credits: PersonCredit[];
  onOpen: (c: PersonCredit) => void;
  showRole?: boolean;
  ratings?: Map<string, string>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
      <div className={`-mx-5 flex snap-x snap-proximity gap-3 overflow-x-auto px-5 ${HIDE_SCROLL}`}>
        {credits.map((c, i) => {
          const meta = creditToMeta(c);
          const role = c.character || c.job;
          const imdb = ratings?.get(meta.id);
          const year = (c.releaseDate ?? c.releaseInfo ?? "").slice(0, 4);
          return (
            <button
              key={`${c.mediaType}-${c.id}-${i}`}
              type="button"
              onClick={() => onOpen(c)}
              className="flex w-[104px] shrink-0 snap-start flex-col gap-2 text-start"
            >
              <Poster
                src={meta.poster}
                seed={meta.id}
                ratio="portrait"
                lazy
                className="rounded-xl ring-1 ring-edge-soft/60"
              />
              <span className="flex flex-col gap-0.5">
                <span className="line-clamp-2 text-[12px] font-medium leading-tight text-ink">{c.title}</span>
                {showRole && role && (
                  <span className="line-clamp-1 text-[11px] leading-tight text-ink-subtle">{role}</span>
                )}
                {imdb ? (
                  <span className="flex items-center gap-1 text-[11px] font-medium tabular-nums text-ink">
                    <ImdbIcon className="h-[10px] w-auto rounded-[2px]" />
                    {imdb}
                  </span>
                ) : year ? (
                  <span className="text-[11px] tabular-nums text-ink-subtle">{year}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
