import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { IMG } from "@/lib/providers/tmdb/tmdb-client";
import { ImdbIcon } from "@/components/icons/imdb-icon";
import { usePortCredits, type PortPerson } from "./port-hover-credits";
import { PORT_CARD_W, placeBeside, type Spot } from "./port-hover-place";

const OPEN_MS = 160;
const CLOSE_MS = 120;
const FACES = 6;

export function usePortHover() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const opener = useRef<number | null>(null);
  const closer = useRef<number | null>(null);
  const live = useRef(false);

  const clear = (slot: { current: number | null }) => {
    if (slot.current != null) {
      window.clearTimeout(slot.current);
      slot.current = null;
    }
  };
  const drop = () => {
    clear(opener);
    clear(closer);
    live.current = false;
    setMeta(null);
    setAnchor(null);
  };
  const leave = () => {
    clear(opener);
    clear(closer);
    closer.current = window.setTimeout(drop, CLOSE_MS);
  };
  const enter = (next: Meta, rect: DOMRect) => {
    clear(closer);
    if (live.current) {
      setMeta(next);
      setAnchor(rect);
      return;
    }
    clear(opener);
    opener.current = window.setTimeout(() => {
      live.current = true;
      setMeta(next);
      setAnchor(rect);
    }, OPEN_MS);
  };

  useEffect(() => {
    if (!meta) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") drop();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", drop, true);
    window.addEventListener("resize", drop);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", drop, true);
      window.removeEventListener("resize", drop);
    };
  }, [meta]);

  useEffect(
    () => () => {
      clear(opener);
      clear(closer);
    },
    [],
  );

  return { meta, anchor, enter, leave, drop };
}

export function PortHoverCard({ meta, anchor }: { meta: Meta; anchor: DOMRect }) {
  const t = useT();
  const { settings } = useSettings();
  const credits = usePortCredits(meta, settings.tmdbKey ?? "");
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Spot | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const panel = document.querySelector("[data-voyage-panel]")?.getBoundingClientRect() ?? null;
    const rtl = document.documentElement.dir === "rtl";
    setSpot(
      placeBeside(anchor, el.offsetHeight, panel, window.innerWidth, window.innerHeight, rtl),
    );
  }, [anchor, meta.id, credits]);

  const facts = [meta.releaseInfo, meta.runtime, ...(meta.genres ?? []).slice(0, 2)].filter(
    (f): f is string => !!f && f.trim().length > 0,
  );
  const faces = credits?.cast.slice(0, FACES) ?? [];
  const extra = Math.max(0, (credits?.cast.length ?? 0) - FACES);
  const names = faces
    .slice(0, 3)
    .map((p) => p.name)
    .join(", ");
  const waiting = credits === undefined;

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{
        left: spot?.left ?? anchor.left,
        top: spot?.top ?? anchor.top,
        width: PORT_CARD_W,
        transformOrigin: spot?.origin ?? "top left",
        visibility: spot ? "visible" : "hidden",
      }}
      className="pointer-events-none fixed z-[230] overflow-hidden rounded-xl border border-edge bg-elevated shadow-[0_18px_40px_-26px_rgba(0,0,0,0.7)] animate-popover-in"
    >
      <div key={meta.id} className="animate-fade-in-soft p-4">
        <div className="text-[15px] font-semibold leading-tight text-ink">{meta.name}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] tabular-nums text-ink-subtle">
          {facts.map((f, i) => (
            <span key={f} className="flex items-center gap-2">
              {i > 0 && (
                <span aria-hidden className="h-[3px] w-[3px] rounded-full bg-ink-subtle/60" />
              )}
              {f}
            </span>
          ))}
          {meta.imdbRating && (
            <span className="flex items-center gap-1 text-ink-muted">
              <ImdbIcon className="h-[11px] w-auto rounded-[2px]" />
              {meta.imdbRating}
            </span>
          )}
        </div>
        {meta.description && (
          <p className="mt-2.5 line-clamp-4 text-[12.5px] leading-relaxed text-ink-muted">
            {meta.description}
          </p>
        )}
        {credits?.director && (
          <div className="mt-2.5 text-[11.5px] text-ink-subtle">
            {t("Directed by {name}", { name: credits.director })}
          </div>
        )}
        {(waiting || faces.length > 0) && (
          <div className="mt-3 flex items-center gap-3">
            <div className="flex shrink-0 -space-x-2">
              {waiting
                ? Array.from({ length: 4 }, (_, i) => (
                    <span key={i} className="h-8 w-8 rounded-full bg-raised ring-2 ring-elevated" />
                  ))
                : faces.map((p) => <Face key={p.id} person={p} />)}
              {!waiting && extra > 0 && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-[10.5px] font-semibold tabular-nums text-ink-muted ring-2 ring-elevated">
                  +{extra}
                </span>
              )}
            </div>
            {!waiting && (
              <span className="min-w-0 truncate text-[11.5px] text-ink-muted">{names}</span>
            )}
          </div>
        )}
      </div>
      <div className="border-t border-edge-soft/60 px-4 py-2 text-[10.5px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
        {t("Click to choose")}
      </div>
    </div>,
    document.body,
  );
}

function Face({ person }: { person: PortPerson }) {
  if (person.profilePath) {
    return (
      <img
        src={`${IMG}/w185${person.profilePath}`}
        alt=""
        draggable={false}
        className="h-8 w-8 rounded-full object-cover object-top ring-2 ring-elevated"
      />
    );
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-[10.5px] font-semibold text-ink-subtle ring-2 ring-elevated">
      {person.name
        .split(/\s+/)
        .map((w) => w[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </span>
  );
}
