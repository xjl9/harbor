import { useEffect, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { tmdbCollection } from "@/lib/providers/tmdb";
import { useActiveKid } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { dropUnreleased, dropUnsafeGenres } from "@/views/kids/kids-filter";
import { LetterboxdPanel } from "@/views/detail/letterboxd-panel";
import { RecRail } from "./recommendations";

/**
 * Desktop's collection row (the other films in a TMDB collection, kids-safe
 * for a kid profile) as a phone rail. A tapped part opens in the detail stack
 * like any other related title.
 */
export function PhoneCollectionRow({
  collection,
  currentId,
  onOpen,
}: {
  collection: { id: number; name: string };
  currentId: string;
  onOpen: (m: Meta) => void;
}) {
  const { settings } = useSettings();
  const kid = useActiveKid();
  const [parts, setParts] = useState<Meta[]>([]);

  useEffect(() => {
    if (!settings.tmdbKey) return;
    let cancelled = false;
    setParts([]);
    tmdbCollection(settings.tmdbKey, collection.id)
      .then((c) => {
        if (cancelled || !c) return;
        const rest = c.parts.filter((p) => p.id !== currentId);
        setParts(kid ? dropUnsafeGenres(dropUnreleased(rest)) : rest);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey, collection.id, currentId, kid]);

  if (parts.length === 0) return null;
  return <RecRail title={collection.name} items={parts} onOpen={onOpen} />;
}

/**
 * The desktop Letterboxd panel already wraps and flows at phone width; its
 * buttons are desktop height, so the wrapper lifts every one to the 44pt floor.
 */
export function PhoneLetterboxdPanel({ meta, imdbId }: { meta: Meta; imdbId: string | null }) {
  return (
    <div className="[&_button]:min-h-11">
      <LetterboxdPanel meta={meta} imdbId={imdbId} />
    </div>
  );
}
