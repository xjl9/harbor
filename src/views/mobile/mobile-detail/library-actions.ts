import { useCallback, useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { RemoteLibrary, RemoteLibraryAction, RemoteLibraryItem } from "@/lib/remote/protocol";
import { useIsFavorite, useMediaFavorites } from "@/lib/media-favorites";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import { markMetaWatched, unmarkMetaWatched } from "@/lib/mark-watched";
import { useMetaWatched } from "@/lib/watched-flag";

export type LibraryToggle = { on: boolean; disabled: boolean; toggle: () => void };

export type LibraryToggles = {
  favorite: LibraryToggle;
  watchlist: LibraryToggle;
  watched: LibraryToggle;
  // True when nothing can be written from this surface: the browser remote page
  // with no computer on the other end. That page has no library of its own.
  needsComputer: boolean;
};

function inList(list: RemoteLibraryItem[] | undefined, id: string, imdbId?: string | null): boolean {
  if (!list) return false;
  return list.some((it) => it.id === id || (!!imdbId && it.id === imdbId));
}

// A connected computer stays authoritative for the desktop library and the
// Trakt/Simkl/AniList sessions this sheet advertises, so every write is still
// sent there. But this surface also owns the on-device stores the library tab
// reads unconditionally, so when it can write locally it writes to both and a
// row counts as saved if either source holds it. Sending only to the desktop is
// what let the two drift: a title saved offline read as unsaved once a computer
// appeared, and clearing it with one connected orphaned the phone's copy.
// The /remote page owns no stores, so there it remains send-only.
export function useLibraryToggles({
  meta,
  title,
  poster,
  imdbId,
  remote,
  library,
  canWriteLocal,
  send,
}: {
  meta: Meta;
  title: string;
  poster?: string;
  imdbId?: string | null;
  remote: boolean;
  library: RemoteLibrary | undefined;
  canWriteLocal: boolean;
  send: (op: RemoteLibraryAction) => void;
}): LibraryToggles {
  const altIds = useMemo(() => [imdbId], [imdbId]);
  const name = title || meta.name;

  const favorites = useMediaFavorites();
  const favLocal = useIsFavorite(meta.id, altIds);
  const watchlistLocal = useInWatchlist(meta.id, altIds);
  const watchedLocal = useMetaWatched(meta.id, meta.type, imdbId);

  const favRemote = inList(library?.favorites, meta.id, imdbId);
  const watchlistRemote = inList(library?.watchlist, meta.id, imdbId);
  const watchedRemote = inList(library?.history, meta.id, imdbId);

  // The remote leg has no store to read back from, so each row holds the value
  // it just sent until the host pushes a fresh snapshot. Local writes need no
  // such guess: the store is the truth and updates on the same tick.
  const [favSent, setFavSent] = useState<boolean | null>(null);
  const [watchlistSent, setWatchlistSent] = useState<boolean | null>(null);
  const [watchedSent, setWatchedSent] = useState<boolean | null>(null);
  useEffect(() => setFavSent(null), [favRemote]);
  useEffect(() => setWatchlistSent(null), [watchlistRemote]);
  useEffect(() => setWatchedSent(null), [watchedRemote]);

  // A connected computer stays authoritative for its own library, but this
  // surface owns stores the library tab reads unconditionally, so a remote write
  // must not skip the local one. Writing only over the socket let the two drift:
  // a title favourited offline read as unsaved once a desktop appeared, and
  // clearing it with a desktop connected left the phone's copy behind forever.
  const toggleFavorite = useCallback(() => {
    const next = !(favLocal || (remote ? (favSent ?? favRemote) : false));
    if (remote) {
      setFavSent(next);
      send({ kind: "favorite", on: next });
    }
    if (!canWriteLocal) return;
    // Remove under whichever id the entry was stored with so an imdb-keyed row
    // clears instead of gaining a duplicate.
    const stored = favorites.items.has(meta.id)
      ? meta.id
      : imdbId && favorites.items.has(imdbId)
        ? imdbId
        : meta.id;
    if (favLocal !== next) favorites.toggle({ id: stored, type: meta.type, name, poster });
  }, [remote, canWriteLocal, favLocal, favSent, favRemote, send, favorites, meta.id, meta.type, imdbId, name, poster]);

  const toggleWatchlistRow = useCallback(() => {
    const next = !(watchlistLocal || (remote ? (watchlistSent ?? watchlistRemote) : false));
    if (remote) {
      setWatchlistSent(next);
      send({ kind: "watchlist", on: next });
    }
    if (!canWriteLocal) return;
    if (watchlistLocal !== next) {
      toggleWatchlist({ id: meta.id, type: meta.type, name, poster, imdbId });
    }
  }, [remote, canWriteLocal, watchlistLocal, watchlistSent, watchlistRemote, send, meta.id, meta.type, name, poster, imdbId]);

  const toggleWatched = useCallback(() => {
    const next = !(watchedLocal || (remote ? (watchedSent ?? watchedRemote) : false));
    if (remote) {
      setWatchedSent(next);
      send({ kind: "watched", on: next });
    }
    if (!canWriteLocal || watchedLocal === next) return;
    const target: Meta = { ...meta, name, poster: poster ?? meta.poster };
    // Both calls set the local watched flag synchronously and the row reads
    // that flag, so it never shows a state the store does not hold. The awaited
    // half is the optional Trakt/Simkl/Stremio push, which is allowed to fail.
    const run = next ? markMetaWatched(target, imdbId) : unmarkMetaWatched(target, imdbId);
    run.catch(() => {});
  }, [remote, canWriteLocal, watchedSent, watchedRemote, send, watchedLocal, meta, name, poster, imdbId]);

  const needsComputer = !remote && !canWriteLocal;
  const disabled = needsComputer;

  return {
    // Either source counts as saved. The library tab merges both additively, so
    // showing a row as off while that tab still lists the title is the drift
    // this union exists to prevent.
    favorite: {
      on: favLocal || (remote ? (favSent ?? favRemote) : false),
      disabled,
      toggle: toggleFavorite,
    },
    watchlist: {
      on: watchlistLocal || (remote ? (watchlistSent ?? watchlistRemote) : false),
      disabled,
      toggle: toggleWatchlistRow,
    },
    watched: {
      on: watchedLocal || (remote ? (watchedSent ?? watchedRemote) : false),
      disabled,
      toggle: toggleWatched,
    },
    needsComputer,
  };
}
