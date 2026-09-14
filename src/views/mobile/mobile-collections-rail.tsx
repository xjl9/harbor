import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { NavGlyph } from "@/components/icons/nav-glyph";
import { COLLECTIONS_CATALOG } from "@/lib/collections-catalog";
import {
  collectionNameMatches,
  tmdbCollection,
  tmdbSearchCollectionId,
} from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { GridTile } from "./mobile-catalog-page";
import { RailHeader } from "./mobile-rail";

const RAIL_CULL =
  "[content-visibility:auto] [contain-intrinsic-size:auto_170px]";

// Mobile Collections rail: the curated TMDB franchise sets from COLLECTIONS_CATALOG,
// rendered as landscape cards. The desktop home opens a dedicated collection page via
// the nav stack, which the tab-based mobile shell does not render, so tapping a card
// resolves the collection's films inline and hands each one to the shared detail sheet.
// The card mark is the desktop collections nav glyph rather than a generic stack icon.
export function MobileCollectionsRail({
  title,
  onOpenDetail,
}: {
  title?: string;
  onOpenDetail: (m: Meta) => void;
}) {
  const { settings } = useSettings();
  const t = useT();
  const [active, setActive] = useState<{ id: number; name: string } | null>(
    null,
  );

  if (!settings.tmdbKey) return null;

  return (
    <section className={`flex flex-col gap-3 ${RAIL_CULL}`}>
      <RailHeader title={title ?? t("Collections")} />
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
      {active && (
        // Portal out of this section: RAIL_CULL's content-visibility:auto applies
        // contain:layout paint, which would make the section the containing block for
        // the sheet's position:fixed and clip it to the ~170px rail box. document.body
        // keeps the full-screen sheet covering the viewport.
        <CollectionMembersSheet
          id={active.id}
          name={active.name}
          onClose={() => setActive(null)}
          onOpenDetail={onOpenDetail}
        />
      )}
    </section>
  );
}

export function CollectionCardTile({
  id,
  name,
  knownBackdrop,
  onOpen,
}: {
  id: number;
  name: string;
  // Brand franchises already carry their backdrop; skip the lookup for them.
  knownBackdrop?: string | null;
  onOpen: (resolvedId: number) => void;
}) {
  const { settings } = useSettings();
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const [inView, setInView] = useState(false);
  const [backdrop, setBackdrop] = useState<string | null>(knownBackdrop ?? null);
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
      let c =
        id > 0
          ? await tmdbCollection(settings.tmdbKey, id).catch(() => null)
          : null;
      if (!c || (id <= 0 && !collectionNameMatches(c.name, name))) {
        const healedId = await tmdbSearchCollectionId(
          settings.tmdbKey,
          name,
        ).catch(() => null);
        if (healedId != null && healedId !== id) {
          c = await tmdbCollection(settings.tmdbKey, healedId).catch(
            () => null,
          );
        }
      }
      if (cancelled || !c) return;
      if (!knownBackdrop) setBackdrop(c.backdrop ?? null);
      setCount(c.parts.length);
      setResolvedId(c.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, id, name, settings.tmdbKey, knownBackdrop]);

  const hue = ((id || name.length * 37) * 47) % 360;
  const from = `oklch(0.42 0.13 ${hue})`;
  const to = `oklch(0.15 0.06 ${hue})`;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => resolvedId > 0 && onOpen(resolvedId)}
      className="relative aspect-[16/9] w-[240px] [@media(min-width:700px)_and_(min-height:600px)]:w-[400px] shrink-0 overflow-hidden rounded-[16px] text-start ring-1 ring-edge-soft/50"
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
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/30 to-transparent"
      />
      <span className="absolute start-3 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/85 backdrop-blur-md">
        <NavGlyph name="collections" className="h-3 w-3" />
        {count != null ? t("{count} films", { count }) : t("Collection")}
      </span>
      <h3 className="absolute inset-x-3.5 bottom-3 line-clamp-2 font-display text-[18px] font-medium leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.7)]">
        {name}
      </h3>
    </button>
  );
}

export function CollectionMembersSheet({
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
  const t = useT();
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

  const node = (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-canvas animate-slide-from-right"
      style={{
        paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
        paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        // Portaled to the body, so this page inherits none of the shell's insets
        // and covers the tab bar rather than sitting under it. Both paddings follow
        // the insets so the back button clears the status bar and the last poster
        // row clears the home indicator.
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 1rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
      }}
    >
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Back")}
          className="no-press -ms-1.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-ink ring-1 ring-edge-soft transition-transform active:scale-90"
        >
          <ChevronLeft size={22} strokeWidth={2.4} className="dir-icon" />
        </button>
        <span className="flex min-w-0 flex-col">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
            {t("Collection")}
          </span>
          <span className="line-clamp-1 font-display text-[19px] font-medium leading-tight text-ink">{name}</span>
        </span>
      </div>
      {members === null ? (
        <div className="grid grid-cols-3 [@media(max-height:500px)]:grid-cols-6 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5 [@media(min-width:1000px)_and_(min-height:600px)]:grid-cols-6 gap-x-3 gap-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="harbor-skeleton aspect-[2/3] rounded-[12px] bg-elevated/40"
            />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="flex flex-col items-center gap-3 pt-24 text-center [@media(max-height:500px)]:pt-6">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-ink-subtle ring-1 ring-edge-soft">
            <NavGlyph name="collections" className="h-6 w-6" />
          </span>
          <p className="max-w-[250px] text-[14px] leading-relaxed text-ink-muted">
            {t("This collection has no titles to show yet.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 [@media(max-height:500px)]:grid-cols-6 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5 [@media(min-width:1000px)_and_(min-height:600px)]:grid-cols-6 gap-x-3 gap-y-4">
          {members.map((m) => (
            <GridTile key={m.id} meta={m} onOpen={openDetail} />
          ))}
        </div>
      )}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
