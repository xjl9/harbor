import { useCallback, useMemo, useState } from "react";
import { Film } from "lucide-react";
import { GENRE_PALETTE } from "@/components/genre-tiles";
import type { Meta } from "@/lib/cinemeta";
import { GENRE_MOVIE_TO_TV, MOVIE_GENRES, TV_GENRES } from "@/lib/feed/tags";
import { tmdbDiscover } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import type { MetaFilter } from "@/lib/view";
import { MobileDetail } from "./mobile-detail";
import { MediaToggle, type ServiceMedia } from "./mobile-service-filters";
import { MAX_PAGE, MobileCatalogGrid, TMDB_PAGE_SIZE, type CatalogFetch } from "./mobile-catalog-page";
import { FilterRails } from "./browse/filter-rails";
import { MobilePageShell, portalPage } from "./browse/page-shell";
import { PersonSheet, type PersonRef } from "./browse/person-sheet";

// Genre page, rebuilt on the desktop filter page's rails (views/filter.tsx):
// trending and top rated, director and actor spotlights, the companion TV or
// movie rails, topic sections, decades, hidden gems and the language rails,
// all from the same rails-config. A sort row turns the page into a single
// sorted grid for someone who wants the whole catalogue in one order instead.

type Sort = "curated" | "popular" | "rated" | "newest" | "oldest";

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "curated", label: "Featured" },
  { id: "popular", label: "Popular" },
  { id: "rated", label: "Top rated" },
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

const SWITCH_GENRES = Object.keys(MOVIE_GENRES);

function tvIdFor(name: string): number | undefined {
  const direct = (TV_GENRES as Record<string, number>)[name];
  if (direct != null) return direct;
  const movieId = MOVIE_GENRES[name];
  return movieId != null ? GENRE_MOVIE_TO_TV[movieId] : undefined;
}

function sortParams(sort: Sort, media: ServiceMedia): Record<string, string> {
  const dateKey = media === "movie" ? "primary_release_date" : "first_air_date";
  const today = new Date().toISOString().slice(0, 10);
  if (sort === "rated") return { sort_by: "vote_average.desc", "vote_count.gte": "300" };
  if (sort === "newest") return { sort_by: `${dateKey}.desc`, [`${dateKey}.lte`]: today, "vote_count.gte": "20" };
  if (sort === "oldest") return { sort_by: `${dateKey}.asc`, "vote_count.gte": "20" };
  return { sort_by: "popularity.desc", "vote_count.gte": "50" };
}

export function MobileGenrePage({
  genre,
  initialMedia = "movie",
  onBack,
}: {
  // label is the display name the caller already translated; genre is the
  // canonical English genre name the rails and TMDB tables key on.
  genre: { label: string; genre: string };
  initialMedia?: ServiceMedia;
  onBack: () => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [name, setName] = useState(genre.genre);
  const [media, setMedia] = useState<ServiceMedia>(initialMedia);
  const [sort, setSort] = useState<Sort>("curated");
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [person, setPerson] = useState<PersonRef | null>(null);

  const key = settings.tmdbKey;
  const movieId = MOVIE_GENRES[name];
  const tvId = tvIdFor(name);
  const effectiveMedia: ServiceMedia = media === "tv" && tvId == null ? "movie" : media;
  const genreId = effectiveMedia === "movie" ? movieId : tvId;
  const palette = GENRE_PALETTE[name] ?? GENRE_PALETTE.Drama;

  const filter = useMemo<MetaFilter | null>(
    () => (genreId != null ? { kind: "genre", mediaType: effectiveMedia, name, id: genreId } : null),
    [genreId, effectiveMedia, name],
  );

  const fetchPage = useCallback<CatalogFetch>(
    (page) =>
      tmdbDiscover(key, effectiveMedia, {
        with_genres: String(genreId),
        include_adult: "false",
        ...sortParams(sort, effectiveMedia),
        page: String(page),
      }).then((metas) => ({ metas, more: metas.length >= TMDB_PAGE_SIZE && page < MAX_PAGE })),
    [key, effectiveMedia, genreId, sort],
  );

  const mediaWord = effectiveMedia === "movie" ? t("Movies") : t("Shows");

  return portalPage(
    <MobilePageShell title={t(name)} kicker={effectiveMedia === "movie" ? t("Genre") : t("TV Genre")} onBack={onBack}>
      <div className="relative flex flex-col gap-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-20 h-64 opacity-60"
          style={{ background: `radial-gradient(120% 80% at 50% 0%, ${palette.from}, transparent 70%)` }}
        />
        <div className="relative flex flex-col gap-2 px-4 pt-1">
          <h2 className="font-display text-[30px] font-medium leading-none tracking-tight text-ink">{t(name)}</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {t(
              "The best {genre} {media}, layered by mood. Browse trending, dive into a director's run, sort by decade, find quiet gems.",
              { genre: t(name).toLowerCase(), media: mediaWord.toLowerCase() },
            )}
          </p>
        </div>
        {tvId != null && (
          <div className="relative px-4">
            <MediaToggle media={effectiveMedia} onChange={setMedia} labels={{ movie: t("Movies"), tv: t("TV Shows") }} />
          </div>
        )}
        <div className="relative flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SWITCH_GENRES.map((g) => (
            <Chip key={g} on={g === name} onClick={() => setName(g)}>
              {t(g)}
            </Chip>
          ))}
        </div>
        {key && (
          <div className="relative flex flex-col gap-2 px-4">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">{t("Sort")}</span>
            <div className="flex flex-wrap gap-2">
              {SORTS.map((s) => (
                <Chip key={s.id} on={sort === s.id} onClick={() => setSort(s.id)}>
                  {t(s.label)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="relative flex flex-col gap-7">
          {!filter ? (
            <GenreEmpty label={t(name)} />
          ) : sort === "curated" || !key ? (
            <FilterRails key={`${name}:${effectiveMedia}`} filter={filter} onOpenDetail={setDetailMeta} onOpenPerson={setPerson} />
          ) : (
            <MobileCatalogGrid
              fetchPage={fetchPage}
              resetKey={`${name}:${effectiveMedia}:${sort}`}
              enabled
              initialPages={2}
              emptyState={<GenreEmpty label={t(name)} />}
              onOpenDetail={setDetailMeta}
            />
          )}
        </div>
      </div>
      {person && <PersonSheet person={person} onClose={() => setPerson(null)} />}
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </MobilePageShell>,
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold ring-1 transition-colors ${
        on ? "bg-ink text-canvas ring-ink" : "bg-surface/80 text-ink-muted ring-edge-soft"
      }`}
    >
      {children}
    </button>
  );
}

// Language page, opened from Discover's language tiles: the desktop language
// filter (railsForFilter "language") with its popular, top rated and new rails
// per media type, a rail per genre and decade, and hidden gems.
export function MobileLanguagePage({ iso, name, onBack }: { iso: string; name: string; onBack: () => void }) {
  const t = useT();
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [person, setPerson] = useState<PersonRef | null>(null);
  const filter = useMemo<MetaFilter>(() => ({ kind: "language", mediaType: "tv", name, iso }), [name, iso]);
  return portalPage(
    <MobilePageShell title={t(name)} kicker={t("Language")} onBack={onBack}>
      <div className="flex flex-col gap-7">
        <div className="flex flex-col gap-2 px-4 pt-1">
          <h2 className="font-display text-[30px] font-medium leading-none tracking-tight text-ink">{t(name)}</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {t("Everything originally in {name}: movies and series across every genre, era, and hidden gems.", { name: t(name) })}
          </p>
        </div>
        <FilterRails filter={filter} onOpenDetail={setDetailMeta} onOpenPerson={setPerson} />
      </div>
      {person && <PersonSheet person={person} onClose={() => setPerson(null)} />}
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </MobilePageShell>,
  );
}

function GenreEmpty({ label }: { label: string }) {
  const t = useT();
  return (
    <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 px-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated/60 text-ink-subtle ring-1 ring-edge-soft/60">
        <Film size={26} strokeWidth={1.8} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[19px] font-medium text-ink">{t("Nothing to show yet")}</h2>
        <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">
          {t("No {genre} titles to show right now. Try switching between Movies and TV Shows.", {
            genre: label.toLowerCase(),
          })}
        </p>
      </div>
    </div>
  );
}
