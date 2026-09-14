import { useMemo } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useCharacterFavorites } from "@/lib/character-favorites";
import { useT } from "@/lib/i18n";
import { sortEntries, type SortState } from "@/lib/library/sort";
import { useMangaFavorites } from "@/lib/manga-favorites";
import { useMediaFavorites, type MediaEntry } from "@/lib/media-favorites";
import { Poster } from "@/components/poster";
import { useReportFeatured } from "@/views/library/featured-context";
import { SetIcon } from "@/views/settings/set-icon";
import { EmptyState, GridTile, PhoneGrid, SectionHeading, SkeletonGrid } from "./grid";

// Favorites on the phone, sectioned like src/views/library/favorites-tab.tsx:
// characters, anime, manga, movies, shows. A linked desktop's favorites are
// merged into the movie and show sections so nothing it holds goes missing.

const ANIME_ID = /^(kitsu|mal|anilist|anidb|simkl):/;

type Entry = { meta: Meta; date: number };

function mediaToEntry(e: MediaEntry): Entry {
  return {
    meta: {
      id: e.id,
      type: e.type,
      name: e.name || e.id,
      poster: e.poster,
      addonOrigin: e.addonOrigin,
      videos: e.videos,
    },
    date: e.addedAt || 0,
  };
}

export function MobileFavoritesTab({
  sort,
  remote,
  remoteLoading,
  onOpenDetail,
}: {
  sort: SortState;
  remote: Entry[];
  remoteLoading: boolean;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const { items: mediaItems } = useMediaFavorites();
  const { items: charItems, toggle } = useCharacterFavorites();
  const { items: mangaItems } = useMangaFavorites();

  const { anime, movies, shows } = useMemo(() => {
    const local = [...mediaItems.values()].map(mediaToEntry);
    const seen = new Set(local.map((e) => e.meta.id));
    const all = [...local, ...remote.filter((e) => !seen.has(e.meta.id))];
    return {
      anime: sortEntries(all.filter((e) => ANIME_ID.test(e.meta.id)), sort),
      movies: sortEntries(
        all.filter((e) => !ANIME_ID.test(e.meta.id) && e.meta.type === "movie"),
        sort,
      ),
      shows: sortEntries(
        all.filter((e) => !ANIME_ID.test(e.meta.id) && e.meta.type === "series"),
        sort,
      ),
    };
  }, [mediaItems, remote, sort]);

  const characters = useMemo(
    () => [...charItems.values()].sort((a, b) => b.addedAt - a.addedAt),
    [charItems],
  );
  const manga = useMemo(
    () => [...mangaItems.values()].sort((a, b) => b.addedAt - a.addedAt),
    [mangaItems],
  );

  useReportFeatured(
    useMemo(() => [...anime, ...movies, ...shows].map((e) => e.meta), [anime, movies, shows]),
  );

  const total = characters.length + anime.length + manga.length + movies.length + shows.length;
  if (total === 0 && remoteLoading) return <SkeletonGrid />;
  if (total === 0) {
    return (
      <EmptyState
        art={<SetIcon name="Heart" size={26} strokeWidth={1.8} />}
        title={t("No favorites yet")}
        body={t("Tap the heart on any movie, show, manga, or character to save it here.")}
      />
    );
  }

  const mediaSection = (title: string, entries: Entry[]) =>
    entries.length > 0 && (
      <div className="flex flex-col gap-3">
        <SectionHeading title={title} count={entries.length} />
        <PhoneGrid>
          {entries.map((e) => (
            <GridTile key={e.meta.id} meta={e.meta} onOpen={onOpenDetail} />
          ))}
        </PhoneGrid>
      </div>
    );

  return (
    <div className="flex flex-col gap-7">
      {characters.length > 0 && (
        <div className="flex flex-col gap-3">
          <SectionHeading title={t("Favorite Characters")} count={characters.length} />
          <PhoneGrid>
            {characters.map((c) => (
              <div key={c.id} className="flex flex-col">
                <div className="relative">
                  <Poster src={c.image} seed={c.id} ratio="portrait" lazy className="rounded-[12px]" />
                  <button
                    type="button"
                    onClick={() => toggle({ id: c.id, name: c.name, image: c.image })}
                    aria-label={t("Remove from favorites")}
                    className="absolute end-0 top-0 flex h-11 w-11 items-center justify-center"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas/70 text-rose-400 backdrop-blur-md">
                      <SetIcon name="Heart" size={14} strokeWidth={2} fill="currentColor" />
                    </span>
                  </button>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">
                  {c.name}
                </p>
              </div>
            ))}
          </PhoneGrid>
        </div>
      )}
      {mediaSection(t("Favorite Anime"), anime)}
      {manga.length > 0 && (
        <div className="flex flex-col gap-3">
          {/* The phone has no manga reader of its own yet, so these tiles are a
              record of what is saved rather than a way in; they carry no button
              affordance to avoid a tap that goes nowhere. */}
          <SectionHeading title={t("Favorite Manga")} count={manga.length} />
          <PhoneGrid>
            {manga.map((m) => (
              <div key={m.id} className="flex flex-col">
                <Poster src={m.cover} seed={m.id} ratio="portrait" lazy className="rounded-[12px]" />
                <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">
                  {m.title}
                </p>
              </div>
            ))}
          </PhoneGrid>
        </div>
      )}
      {mediaSection(t("Favorite Movies"), movies)}
      {mediaSection(t("Favorite Shows"), shows)}
    </div>
  );
}
