import { ArrowRight, Popcorn } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { topMovies, type Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { listPager } from "@/lib/list-pager";
import { recentlyPlayed } from "@/lib/playback-history";
import { useSettings } from "@/lib/settings";
import { dropUnreleased, dropUnsafeCinemetaKids, dropUnsafeGenres } from "@/views/kids/kids-filter";
import { franchiseFetcher, KIDS_FRANCHISES, type Franchise } from "@/views/kids/kids-franchises";
import { buildKidsHero, kidsSpecs } from "@/views/kids/kids-specs";
import { KidsPlayZone } from "@/views/kids/play/play-zone";
import { MAX_PAGE, MobileCatalogGrid, type CatalogFetch } from "../mobile-catalog-page";
import { MobileDetail } from "../mobile-detail";
import { MobileRail } from "../mobile-rail";
import { DestinationPage, EmptyBlock, RailSkeleton, SubPage } from "./page-shell";

type KidsRow = {
  key: string;
  title: string;
  metas: Meta[];
  fetcher: (page: number) => Promise<Meta[]>;
};

type GridTarget = { title: string; fetcher: (page: number) => Promise<Meta[]>; grad?: string; art?: string };

const KIDS_FONT = '"Fredoka", "Baloo 2", system-ui, sans-serif';

// The desktop Watch (kids) page on a phone: the same TMDB kid-safe rows,
// franchise worlds and Play Zone, with every title opening the standard phone
// detail. The row and franchise data, and the release and adult filters, are
// the desktop modules themselves.
export function MobileKids({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [hero, setHero] = useState<Meta[]>([]);
  const [rows, setRows] = useState<KidsRow[] | null>(null);
  const [grid, setGrid] = useState<GridTarget | null>(null);
  const [playOpen, setPlayOpen] = useState(false);
  const [detail, setDetail] = useState<Meta | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    (async () => {
      const seen = recentlyPlayed();
      if (settings.tmdbKey) {
        const heroPool = await buildKidsHero(settings.tmdbKey, seen).catch(() => [] as Meta[]);
        if (cancelled) return;
        setHero(dropUnsafeGenres(dropUnreleased(heroPool)));
        const specs = kidsSpecs(settings.tmdbKey);
        const firstPages = await Promise.all(specs.map((s) => s.fetcher(1).catch(() => [] as Meta[])));
        if (cancelled) return;
        setRows(
          specs
            .map((spec, i) => ({ key: spec.key, title: spec.title, metas: firstPages[i], fetcher: spec.fetcher }))
            .filter((r) => r.metas.length > 0),
        );
      } else {
        const [animation, family] = await Promise.all(
          ["Animation", "Family"].map((genre) =>
            topMovies(genre)
              .then(dropUnreleased)
              .then(dropUnsafeCinemetaKids)
              .catch(() => [] as Meta[]),
          ),
        );
        if (cancelled) return;
        setHero(animation.filter((m) => m.background).slice(0, 5));
        setRows([
          { key: "cinemeta-animation", title: "Animated Movies", metas: animation, fetcher: listPager(animation) },
          { key: "cinemeta-family", title: "Family Movies", metas: family, fetcher: listPager(family) },
        ]);
      }
    })().catch(() => {
      if (!cancelled) setRows([]);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.tmdbKey]);

  // Same de-duplication as desktop: a title shows once, hero first, and a row
  // left with fewer than four titles is dropped rather than shown thin.
  const shownRows = useMemo(() => {
    if (!rows) return null;
    const seen = new Set<string>(hero.map((m) => m.id));
    return rows
      .map((r) => ({
        ...r,
        metas: dropUnsafeGenres(dropUnreleased(r.metas)).filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        }),
      }))
      .filter((r) => r.metas.length >= 4);
  }, [rows, hero]);

  const heroCards = useMemo(() => hero.filter((m) => m.background || m.poster).slice(0, 6), [hero]);

  return (
    <DestinationPage
      kicker={t("Just for kids")}
      title={t("nav.kids")}
      icon={<Popcorn size={22} strokeWidth={2.2} />}
      onBack={onBack}
      padded={false}
    >
      <section className="relative -mt-2 overflow-hidden pb-2">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage: "url(/kids/kidbgsvg.svg)",
            backgroundSize: "cover",
            backgroundPosition: "center top",
            backgroundRepeat: "no-repeat",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-canvas via-canvas/60 to-transparent" />
        <div className="relative flex flex-col gap-4 px-4 pb-4 pt-10">
          <h2 className="text-center text-[30px] font-bold leading-[1.02] tracking-tight text-ink" style={{ fontFamily: KIDS_FONT }}>
            {t("What should we watch?")}
          </h2>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {heroCards.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[112px] w-[200px] shrink-0 animate-pulse rounded-[22px] bg-surface/70 ring-2 ring-white/70" />
                ))
              : heroCards.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDetail(m)}
                    className="relative h-[112px] w-[200px] shrink-0 overflow-hidden rounded-[22px] bg-surface text-start ring-2 ring-white shadow-[0_16px_40px_-14px_rgba(20,40,60,0.45)]"
                  >
                    <img
                      src={(m.background ?? m.poster ?? "").replace("/t/p/original/", "/t/p/w780/")}
                      alt=""
                      draggable={false}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <span className="absolute inset-x-2.5 bottom-2.5 line-clamp-2 text-center font-display text-[15px] font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                      {m.name}
                    </span>
                  </button>
                ))}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-8 pt-2">
        {shownRows === null ? (
          <div className="flex flex-col gap-8 px-4">
            <RailSkeleton />
            <RailSkeleton />
          </div>
        ) : shownRows.length === 0 ? (
          <div className="px-4">
            <EmptyBlock title={t("Nothing to show yet")} />
          </div>
        ) : (
          shownRows.map((row, i) => (
            <div key={row.key} className="flex flex-col gap-8">
              <MobileRail
                title={t(row.title)}
                metas={row.metas}
                onOpenDetail={setDetail}
                onSeeAll={() => setGrid({ title: t(row.title), fetcher: row.fetcher })}
              />
              {i === 1 && settings.tmdbKey && (
                <FranchiseRail
                  onOpen={(f) =>
                    setGrid({
                      title: f.name,
                      fetcher: franchiseFetcher(settings.tmdbKey, f),
                      grad: f.grad,
                      art: `/kids/cta/${f.key}.webp`,
                    })
                  }
                />
              )}
              {(i === 3 || (i === shownRows.length - 1 && shownRows.length < 4)) && (
                <PlayZoneCta onOpen={() => setPlayOpen(true)} />
              )}
            </div>
          ))
        )}
      </div>

      {grid && <KidsGridPage target={grid} onBack={() => setGrid(null)} onOpenDetail={setDetail} />}
      {playOpen && <KidsPlayZone onClose={() => setPlayOpen(false)} />}
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}

function FranchiseRail({ onOpen }: { onOpen: (f: Franchise) => void }) {
  const t = useT();
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-4 font-display text-[19px] font-medium tracking-[-0.01em] text-ink">{t("Pick a World")}</h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {KIDS_FRANCHISES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onOpen(f)}
            className="relative aspect-[16/10] w-[220px] shrink-0 overflow-hidden rounded-3xl text-start ring-2 ring-white shadow-[0_14px_34px_-16px_rgba(20,40,60,0.5)]"
          >
            <span aria-hidden className={`absolute inset-0 bg-gradient-to-br ${f.grad}`} />
            <img
              src={`/kids/cta/${f.key}.webp`}
              alt=""
              draggable={false}
              loading="lazy"
              style={f.drop != null ? { bottom: `-${f.drop}%` } : undefined}
              className="pointer-events-none absolute bottom-0 end-0 h-[122%] w-[80%] object-contain object-bottom drop-shadow-[0_10px_18px_rgba(0,0,0,0.3)]"
            />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
            <span className="absolute inset-x-3 bottom-2.5 flex max-w-[56%] flex-col">
              <span className="font-display text-[17px] font-semibold leading-[1.05] tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
                {f.name}
              </span>
              <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-white/90">
                {t("Explore")}
                <ArrowRight size={12} strokeWidth={2.6} className="dir-icon" />
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PlayZoneCta({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  return (
    <div className="px-4">
      <button
        type="button"
        onClick={onOpen}
        className="relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border-4 border-white/40 px-4 py-4 text-start shadow-[0_24px_60px_-24px_rgba(6,44,71,0.55)] active:scale-[0.99]"
        style={{ background: "linear-gradient(115deg, #1a7d9e 0%, #10618a 55%, #0a4062 100%)" }}
      >
        <img
          src="/kids/doodles/lilbluewhale.png"
          alt=""
          draggable={false}
          className="h-14 w-auto shrink-0"
          style={{ animation: "curfew-sail 4.5s ease-in-out infinite" }}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display text-[22px] font-medium leading-tight text-white drop-shadow-[0_2px_10px_rgba(0,20,40,0.45)]">
            {t("Play Zone")}
          </span>
          <span className="text-[13px] font-semibold leading-snug text-white/80">
            {t("Games, coloring and ocean wonders")}
          </span>
        </span>
        <span className="flex h-11 shrink-0 items-center rounded-full bg-[#ffd166] px-4 text-[14px] font-bold text-[#4a3200]">
          {t("Let's play!")}
        </span>
      </button>
    </div>
  );
}

function KidsGridPage({
  target,
  onBack,
  onOpenDetail,
}: {
  target: GridTarget;
  onBack: () => void;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const fetchPage = useCallback<CatalogFetch>(
    (page) =>
      target.fetcher(page).then((metas) => ({
        metas: dropUnsafeGenres(dropUnreleased(metas)),
        more: metas.length > 0 && page < MAX_PAGE,
      })),
    [target],
  );
  return (
    <SubPage
      title={target.title}
      kicker={t("Just for kids")}
      onBack={onBack}
      padded={false}
      hero={
        target.grad && target.art ? (
          <div className={`relative mx-4 mb-5 h-[140px] overflow-hidden rounded-3xl bg-gradient-to-br ring-2 ring-white ${target.grad}`}>
            <img
              src={target.art}
              alt=""
              draggable={false}
              className="pointer-events-none absolute bottom-0 end-0 h-[120%] w-[70%] object-contain object-bottom"
            />
          </div>
        ) : undefined
      }
    >
      <MobileCatalogGrid
        fetchPage={fetchPage}
        resetKey={target.title}
        enabled
        initialPages={1}
        emptyState={
          <div className="px-4">
            <EmptyBlock title={t("Nothing to show yet")} />
          </div>
        }
        onOpenDetail={onOpenDetail}
      />
    </SubPage>
  );
}
