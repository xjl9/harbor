import { X } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import type { NewEpisode } from "@/lib/new-episodes";

function label(ep: NewEpisode): string {
  return ep.title ? ep.title : `S${ep.season} E${ep.episode}`;
}

// New Episodes on the phone: the desktop NewEpisodesSection's landscape still
// cards, sized like the continue-watching cards they sit beside, with the
// dismiss control grown to the 44pt floor since it has no hover reveal here.
export function MobileNewEpisodesRow({
  episodes,
  onDismissOne,
  onDismissAll,
  onOpen,
}: {
  episodes: NewEpisode[];
  onDismissOne: (key: string) => void;
  onDismissAll: () => void;
  onOpen: (m: Meta) => void;
}) {
  const t = useT();
  if (episodes.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_200px]">
      <div className="flex items-center justify-between gap-3 px-4">
        <h2 className="flex items-center gap-2.5 font-display text-[19px] font-medium tracking-[-0.01em] text-ink">
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 font-sans text-[12px] font-bold tabular-nums text-canvas">
            {episodes.length}
          </span>
          {t("New Episodes")}
        </h2>
        <button
          type="button"
          onClick={onDismissAll}
          className="flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-ink-subtle"
        >
          {t("Dismiss all")}
          <X size={13} strokeWidth={2.2} />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {episodes.map((ep) => {
          const art = ep.still ?? ep.poster;
          return (
            <div key={ep.key} className="relative w-[240px] shrink-0 [@media(min-width:700px)_and_(min-height:600px)]:w-[360px]">
              <button
                type="button"
                onClick={() =>
                  onOpen({ id: ep.seriesId, type: "series", name: ep.seriesName, poster: ep.poster ?? undefined })
                }
                className="relative block aspect-video w-full overflow-hidden rounded-[14px] bg-elevated text-start ring-1 ring-edge-soft/50"
              >
                {art && (
                  <img src={art} alt="" draggable={false} loading="lazy" decoding="async" className="h-full w-full select-none object-cover" />
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
                  <span className="truncate text-[13.5px] font-semibold leading-tight text-white">{ep.seriesName}</span>
                  <span className="truncate text-[12px] leading-tight text-white/70">{label(ep)}</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDismissOne(ep.key)}
                aria-label={t("Dismiss")}
                className="absolute end-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white/90 backdrop-blur-sm"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
