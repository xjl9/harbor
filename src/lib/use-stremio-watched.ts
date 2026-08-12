import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { Meta } from "@/lib/cinemeta";
import { CLOUD_OK, libraryGetOne, type LibraryItem } from "@/lib/stremio";
import { decodeWatchedEpisodes } from "@/lib/stremio-watched";

// Stremio cloud watched bitfield, decoded to "season:episode" keys. Desktop
// detail.tsx still carries an inline copy of this fetch+decode (its library
// item feeds more than watched state); fold it onto this hook when that file
// next opens for edits.
export function useStremioWatched(
  metaId: string,
  detailImdbId: string | null | undefined,
  videos: Meta["videos"],
): Set<string> {
  const { authKey } = useAuth();
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [keys, setKeys] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setItem(null);
    if (!authKey || metaId.startsWith("simkl:")) return;
    const candidates: string[] = [];
    if (metaId.startsWith("tt")) candidates.push(metaId);
    if (detailImdbId?.startsWith("tt") && !candidates.includes(detailImdbId)) {
      candidates.push(detailImdbId);
    }
    if (!metaId.startsWith("tt") && CLOUD_OK.test(metaId)) candidates.push(metaId);
    if (candidates.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const cid of candidates) {
        const found = await libraryGetOne(authKey, cid).catch(() => null);
        if (cancelled) return;
        if (found) {
          setItem(found);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authKey, metaId, detailImdbId]);

  useEffect(() => {
    let cancelled = false;
    decodeWatchedEpisodes(item?.state?.watched, videos)
      .then((k) => {
        if (!cancelled) setKeys(k);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item?.state?.watched, videos]);

  return keys;
}
