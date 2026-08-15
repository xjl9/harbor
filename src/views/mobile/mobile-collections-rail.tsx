import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Layers } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { Poster, usePosterChain } from "@/components/poster";
import { COLLECTIONS_CATALOG } from "@/lib/collections-catalog";
import { collectionNameMatches, tmdbCollection, tmdbSearchCollectionId } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";

const RAIL_CULL = "[content-visibility:auto] [contain-intrinsic-size:auto_170px]";

// Mobile Collections rail: the curated TMDB franchise sets from COLLECTIONS_CATALOG,
// rendered as landscape cards. The desktop home opens a dedicated collection page via
// the nav stack, which the tab-based mobile shell does not render, so tapping a card
// resolves the collection's films inline and hands each one to the shared detail sheet.
export function MobileCollectionsRail({ onOpenDetail }: { onOpenDetail: (m: Meta) => void }) {
  const { settings } = useSettings();
  const t = useT();
  const [active, setActive] = useState<{ id: number; name: string } | null>(null);

  if (!settings.tmdbKey) return null;

  return (
    <section className={`flex flex-col gap-3 ${RAIL_CULL}`}>
      <h2 className="px-4 font-display text-[19px] font-medium tracking-[-0.01em] text-ink">
        {t("Collections")}
      </h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {COLLECTIONS_CATALOG.slice(0, 30).map((c) => (
          <CollectionCardTile
            key={`${c.id}-${c.name}`}
            id={c.id}
            name={c.name}
            onOpen={(id) => setActive({ id, name: c.name })}
          />
        ))}
      </div>
      {active &&
        // Portal out of this section: RAIL_CULL's content-visibility:auto applies
        // contain:layout paint, which would make the section the containing block for
        // the sheet's position:fixed and clip it to the ~170px rail box. document.body
        // keeps the full-screen sheet covering the viewport.
        createPortal(
          <CollectionMembersSheet
            id={active.id}
            name={active.name}
            onClose={() => setActive(null)}
            onOpenDetail={onOpenDetail}
          />,
          document.body,
        )}
    </section>
  );
}

function CollectionCardTile({
  id,
  name,
  onOpen,
}: {
  id: number;
  name: string;
  onOpen: (resolvedId: number) => void;
}) {
  const { settings } = useSettings();
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(false);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [resolvedId, setResolvedId] = useState<number>(id);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: "250px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    void (async () => {
      // Same heal path as the desktop CollectionCard: fall back to a name search
      // when the hardcoded id is missing (id 0) or resolves to the wrong set.
      let c = id > 0 ? await tmdbCollection(settings.tmdbKey, id).catch(() => null) : null;
      if (!c || (id <= 0 && !collectionNameMatches(c.name, name))) {
        const healedId = await tmdbSearchCollectionId(settings.tmdbKey, name).catch(() => null);
        if (healedId != null && healedId !== id) {
          c = await tmdbCollection(settings.tmdbKey, healedId).catch(() => null);
        }
      }
      if (cancelled || !c) return;
      setBackdrop(c.backdrop ?? null);
      setCount(c.parts.length);
      setResolvedId(c.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, id, name, settings.tmdbKey]);

  const hue = ((id || name.length * 37) * 47) % 360;
  const from = `oklch(0.42 0.13 ${hue})`;
  const to = `oklch(0.15 0.06 ${hue})`;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => resolvedId > 0 && onOpen(resolvedId)}
      className="relative aspect-[16/9] w-[240px] shrink-0 overflow-hidden rounded-[16px] text-start ring-1 ring-edge-soft/50"
      style={{ background: `linear-gradient(140deg, ${from}, ${to})` }}
    >
      {backdrop && (
        <img
          src={backdrop.replace("/t/p/original/", "/t/p/w780/")}
          alt=""
          loading="lazy"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 data-[on=true]:opacity-100"
          onLoad={(e) => e.currentTarget.setAttribute("data-on", "true")}
        />
      )}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/30 to-transparent" />
      <span className="absolute start-3 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md">
        <Layers size={10} strokeWidth={2.4} />
        {count != null ? t("{count} films", { count }) : t("Collection")}
      </span>
      <h3 className="absolute inset-x-3.5 bottom-3 font-display text-[18px] font-medium leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">
        {name}
      </h3>
    </button>
  );
}

function CollectionMembersSheet({
  id,
  name,
  onClose,
  onOpenDetail,
}: {
  id: number;
  name: string;
  onClose: () => void;
  onOpenDetail: (m: Meta) => void;
}) {
  const { settings } = useSettings();
  const [members, setMembers] = useState<Meta[] | null>(null);

  // Close before opening detail: this sheet is z-[60] and MobileDetail is z-50, so a
  // still-open sheet would sit on top of the detail it just launched.
  const openDetail = (m: Meta) => {
    onClose();
    onOpenDetail(m);
  };

  useEffect(() => {
    let cancelled = false;
    setMembers(null);
    tmdbCollection(settings.tmdbKey, id)
      .then((c) => {
        if (!cancelled) setMembers(c?.parts ?? []);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id, settings.tmdbKey]);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-canvas px-4 pb-14 pt-4">
      <button
        type="button"
        onClick={onClose}
        className="mb-5 flex items-center gap-1 self-start rounded-full bg-surface py-2 pe-4 ps-2.5 text-[14px] font-semibold text-ink ring-1 ring-edge-soft"
      >
        <ChevronRight size={17} strokeWidth={2.6} className="rotate-180 text-ink-subtle" />
        <span className="line-clamp-1 max-w-[70vw]">{name}</span>
      </button>
      {members === null ? (
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-[12px] bg-elevated/40" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-24 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-ink-subtle ring-1 ring-edge-soft">
            <Layers size={24} strokeWidth={1.9} />
          </span>
          <p className="max-w-[250px] text-[14px] leading-relaxed text-ink-muted">
            This collection has no titles to show yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-3 gap-y-4">
          {members.map((m) => (
            <MemberTile key={m.id} meta={m} onOpenDetail={openDetail} />
          ))}
        </div>
      )}
    </div>
  );
}

function MemberTile({ meta, onOpenDetail }: { meta: Meta; onOpenDetail: (m: Meta) => void }) {
  const { settings } = useSettings();
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(meta)}
      className="text-start"
    >
      <Poster src={src} onError={onError} seed={meta.id} ratio="portrait" lazy className="rounded-[12px] ring-1 ring-white/[0.06]" />
      <p className="mt-1.5 line-clamp-2 min-h-[2.7em] text-[12px] font-medium leading-snug text-ink-muted">
        {meta.name}
      </p>
    </button>
  );
}
