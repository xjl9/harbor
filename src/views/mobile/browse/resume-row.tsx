import { X } from "lucide-react";
import { Play } from "@/components/icons/play-filled";
import type { Meta } from "@/lib/cinemeta";
import { useAuth } from "@/lib/auth";
import { dismissCwItem } from "@/lib/continue-watching";
import { useT } from "@/lib/i18n";
import { readSnapshot, useSnapshotVersion } from "@/lib/snapshots";
import { episodeFromVideoId, isAnimeCwItem, libraryMetaType, type LibraryItem } from "@/lib/stremio";
import { useMobileRemote } from "../mobile-remote";
import { RailHeader } from "../mobile-rail";

function toMeta(item: LibraryItem): Meta {
  return { id: item._id, type: libraryMetaType(item.type), name: item.name, poster: item.poster, background: item.background };
}

function episodeInfo(i: LibraryItem): { season: number; episode: number } | null {
  if (i.type === "movie") return null;
  if (i.state?.season && i.state?.episode) return { season: i.state.season, episode: i.state.episode };
  const parsed = episodeFromVideoId(i.state?.video_id ?? "");
  return parsed && parsed.episode > 0 ? parsed : null;
}

function downscale(url?: string): string | undefined {
  return url ? url.replace(/\/t\/p\/(original|w1280|w780)\//, "/t/p/w500/") : url;
}

// Shows' "Pick up where you left off": the series slice of continue watching,
// titled the way the desktop Shows page titles it. The home tab keeps the full
// continue-watching row; this one is narrower by design, one tap back into the
// next episode of a show.
export function ResumeRow({
  title,
  items,
  onOpenDetail,
}: {
  title: string;
  items: LibraryItem[];
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const { authKey } = useAuth();
  const { playOnHost } = useMobileRemote();
  useSnapshotVersion();
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_205px]">
      <RailHeader title={title} />
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const meta = toMeta(item);
          const ep = episodeInfo(item);
          const dur = item.state?.duration ?? 0;
          const off = item.state?.timeOffset ?? 0;
          const progress = dur > 0 ? Math.min(1, off / dur) : 0;
          const bg = downscale(readSnapshot(item._id) ?? item.background ?? item.poster);
          const sub = ep
            ? isAnimeCwItem(item)
              ? t("Ep {episode}", { episode: ep.episode })
              : t("S{season} · E{episode}", { season: ep.season, episode: ep.episode })
            : t("Resume");
          return (
            <div key={item._id} className="w-[250px] shrink-0 [@media(min-width:700px)_and_(min-height:600px)]:w-[380px]">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => playOnHost(meta, ep ? { season: ep.season, episode: ep.episode } : undefined)}
                  aria-label={t("Play {title}", { title: item.name })}
                  className="relative block aspect-video w-full overflow-hidden rounded-[16px] bg-surface text-start ring-1 ring-edge-soft/50"
                >
                  {bg && <img src={bg} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover brightness-90" />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/15" />
                  <span className="absolute bottom-2.5 start-2.5 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                    <Play size={11} strokeWidth={0} fill="currentColor" />
                    {sub}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                    <div className="h-full bg-accent" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => dismissCwItem(item, authKey)}
                  aria-label={t("Remove from Continue watching")}
                  className="absolute end-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm"
                >
                  <X size={17} strokeWidth={2.4} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onOpenDetail(meta)}
                aria-label={t("View {title}", { title: item.name })}
                className="mt-1.5 line-clamp-1 min-h-[24px] w-full text-start text-[13px] font-medium text-ink-muted"
              >
                {item.name}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
