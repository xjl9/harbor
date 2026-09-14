import { useEffect, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { sizeImageUrl } from "@/lib/img-size";
import { useT } from "@/lib/i18n";

// Phone counterpart of the desktop LibraryHero carousel: a snapping rail of
// wide cards drawn from whatever the open tab reports. Library metas rarely
// carry logos or descriptions (they come from Stremio's library payload), so
// the card leans on backdrop, title and year rather than the home hero's
// richer treatment.

const GUTTER = 20;

function yearOf(m: Meta): string {
  return (m.releaseInfo ?? m.releaseDate ?? "").slice(0, 4);
}

export function FeaturedRail({ items, onOpen }: { items: Meta[]; onOpen: (m: Meta) => void }) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const left = el.getBoundingClientRect().left;
        const center = el.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < el.children.length; i++) {
          const r = (el.children[i] as HTMLElement).getBoundingClientRect();
          const d = Math.abs(r.left - left + r.width / 2 - center);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        }
        setActive(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div
        ref={scrollRef}
        style={{ scrollPaddingInlineStart: GUTTER }}
        className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((m) => {
          const bg = sizeImageUrl(m.background ?? m.poster ?? "", 780);
          const year = yearOf(m);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m)}
              aria-label={t("Open {name}", { name: m.name })}
              className="relative block aspect-[16/10] w-[84%] shrink-0 snap-start overflow-hidden rounded-[20px] bg-surface text-start ring-1 ring-edge-soft/50 [@media(min-width:700px)]:w-[360px]"
            >
              {bg && (
                <img
                  src={bg}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={`absolute inset-0 h-full w-full object-cover ${m.background ? "" : "scale-110 blur-sm"}`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/5" />
              <span className="absolute start-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-accent backdrop-blur-md">
                {t("Featured")}
              </span>
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-4">
                <h3 className="line-clamp-2 font-display text-[22px] font-medium leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">
                  {m.name}
                </h3>
                <div className="flex items-center gap-2 text-[12px] text-white/75">
                  {year && <span className="font-medium">{year}</span>}
                  <span>{m.type === "series" ? t("Series") : t("Movie")}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {items.map((m, i) => (
            <span
              key={m.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === active ? "w-5 bg-accent" : "w-1.5 bg-ink/20"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
