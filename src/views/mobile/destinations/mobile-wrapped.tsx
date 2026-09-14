import { useEffect, useState } from "react";
import { LibraryIcon } from "@/components/icons/library-icon";
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
import { DestinationPage } from "./page-shell";

// The desktop Stats page. Its cards are single-column below the sm breakpoint
// and the year heatmap scrolls inside its own card, so they are used as they
// are; only the page chrome and the detail hand-off are phone specific.
export function MobileWrapped({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const [stats, setStats] = useState<WrappedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { events, source } = await collectWatchEvents({ traktConnected });
        const year = new Date().getFullYear();
        const yearStats = aggregateWrapped(events, source, year);
        const resolved =
          yearStats.totalPlays === 0 && events.length > 0 ? aggregateWrapped(events, source, null) : yearStats;
        if (cancelled) return;
        setStats(resolved);
        if (resolved.source !== "empty" && resolved.topTitles.length > 0) {
          void enrichTopTitles(resolved.topTitles, settings.tmdbKey).then(({ genres, posters, actors }) => {
            if (cancelled) return;
            setStats((prev) =>
              prev
                ? { ...prev, topGenres: genres.length > 0 ? genres : prev.topGenres, topActors: actors, posters }
                : prev,
            );
          });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traktConnected]);

  const openTitle = (tt: TopTitle) =>
    setDetail({ id: tt.id, type: tt.type, name: tt.title, poster: stats?.posters[tt.id] });

  return (
    <DestinationPage kicker={t("My library")} title={t("Stats")} icon={<LibraryIcon />} onBack={onBack} tint>
      <div className="flex flex-col gap-4 pt-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-elevated/40" />
          ))
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
      </div>
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}
