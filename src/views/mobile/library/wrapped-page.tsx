import { useEffect, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { useTrakt } from "@/lib/trakt/provider";
import { aggregateWrapped } from "@/lib/wrapped/aggregate";
import { collectWatchEvents } from "@/lib/wrapped/collect";
import { enrichTopTitles } from "@/lib/wrapped/enrich";
import type { TopTitle, WrappedStats } from "@/lib/wrapped/types";
import {
  ActorsCard,
  GenresCard,
  HeatmapCard,
  HeroCard,
  HighlightsCard,
  SplitCard,
  TopTitlesCard,
  WrappedEmpty,
} from "@/views/wrapped/cards";
import { MobileDetail } from "../mobile-detail";
import { PhonePage, usePhonePageClose } from "./sheet";

// The desktop Stats view (src/views/wrapped.tsx) as a phone page. The card set
// and the collect/aggregate/enrich pipeline are shared; only the frame differs,
// because the desktop view navigates through the view stack and the phone
// library has no such stack to return to.

export function MobileWrappedPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const { closing, requestClose } = usePhonePageClose(onClose);
  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const { events, source } = await collectWatchEvents({ traktConnected });
        const year = new Date().getFullYear();
        const yearStats = aggregateWrapped(events, source, year);
        const resolved =
          yearStats.totalPlays === 0 && events.length > 0
            ? aggregateWrapped(events, source, null)
            : yearStats;
        if (cancelled) return;
        setStats(resolved);
        if (resolved.source !== "empty" && resolved.topTitles.length > 0) {
          void enrichTopTitles(resolved.topTitles, settings.tmdbKey).then(
            ({ genres, posters, actors }) => {
              if (cancelled) return;
              setStats((prev) =>
                prev
                  ? {
                      ...prev,
                      topGenres: genres.length > 0 ? genres : prev.topGenres,
                      topActors: actors,
                      posters,
                    }
                  : prev,
              );
            },
          );
        }
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [traktConnected, settings.tmdbKey]);

  const openTitle = (tt: TopTitle) =>
    setDetailMeta({ id: tt.id, type: tt.type, name: tt.title, poster: stats?.posters[tt.id] });

  return (
    <>
      <PhonePage closing={closing} onBack={requestClose} eyebrow={t("My library")} title={t("Stats")}>
        {loading ? (
          <div className="flex flex-col gap-4" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-3xl bg-elevated/40" />
            ))}
          </div>
        ) : !stats || stats.source === "empty" ? (
          <WrappedEmpty />
        ) : (
          <>
            <HeroCard stats={stats} />
            <HighlightsCard stats={stats} />
            <SplitCard stats={stats} />
            <TopTitlesCard stats={stats} onOpen={openTitle} />
            <ActorsCard stats={stats} />
            <GenresCard stats={stats} />
            <HeatmapCard stats={stats} />
          </>
        )}
      </PhonePage>
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </>
  );
}
