import { ArrowDownUp, BookOpen, ChevronLeft, Settings2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import anilistLogo from "@/assets/anilist.png";
import { CoverImg } from "@/components/cover-img";
import { NavGlyph } from "@/components/icons/nav-glyph";
import { useT } from "@/lib/i18n";
import {
  chapterLanguages,
  chapterPages,
  mangaDetail,
  popularManga,
  resumeChapters,
  searchManga,
  streamChapters,
  type MangaChapter,
  type MangaSummary,
} from "@/lib/manga/api";
import { pageHeadersFor, type MangaPage } from "@/lib/manga/plugins/adapter";
import {
  activeMangaSourceId,
  hasAnyMangaSource,
  initMangaSource,
  mangaSourcesState,
  retryMangaSources,
  setActiveMangaSource,
  subscribeMangaSources,
} from "@/lib/manga/sources";
import {
  listMangaProgress,
  recordMangaProgress,
  useMangaProgressEntry,
  useMangaProgressList,
  type MangaProgressEntry,
} from "@/lib/manga-progress";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useAnilistMangaRails } from "@/lib/use-anilist-manga-rails";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { MangaSourcesView } from "@/views/manga/manga-sources-panel";
import { PageImage } from "@/views/manga/manga-reader/page-image";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { loadLocalMode, saveLocalMode, type LocalMode } from "../manga-read/local-reader-types";
import { ModeSwitcher } from "../manga-read/mode-switcher";
import { ReaderDock } from "../manga-read/reader-dock";
import { useRegisterSheet } from "../mobile-sheet-lock";
import {
  Chip,
  ChipRow,
  DestinationPage,
  EmptyBlock,
  IconButton,
  LoaderBlock,
  LoadMoreSentinel,
  PosterGridSkeleton,
  PrimaryButton,
  SearchField,
  SectionHead,
  SubPage,
  TileRail,
} from "./page-shell";

export type MangaReaderState = ReaderState;

type ReaderState = {
  manga: { id: string; title: string; cover?: string };
  chapters: MangaChapter[];
  index: number;
  startPage: number;
};

const PAGE_SIZE = 48;

function normTitle(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

// Reading order: ascending chapter number, falling back to the order the
// source listed them in when a chapter has no number.
function readingOrder(chapters: MangaChapter[]): MangaChapter[] {
  return chapters
    .map((c, i) => ({ c, i, n: c.chapter != null ? Number.parseFloat(c.chapter) : Number.NaN }))
    .sort((a, b) => {
      const an = Number.isFinite(a.n);
      const bn = Number.isFinite(b.n);
      if (an && bn && a.n !== b.n) return a.n - b.n;
      if (an !== bn) return an ? -1 : 1;
      return b.i - a.i;
    })
    .map((x) => x.c);
}

// The desktop manga hub (hero, continue reading, AniList lists, popular, browse)
// with its detail and a phone reader. The reader reuses the phone reader's mode
// switcher and chapter dock, and renders pages through the desktop page image,
// which fetches header-protected pages natively; the phone reader's own image
// falls back to a proxy that only the desktop companion serves.
export function MobileManga({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const [, setSourceTick] = useState(0);
  const [details, setDetails] = useState<string[]>([]);
  const [reader, setReader] = useState<ReaderState | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  useEffect(() => {
    initMangaSource();
  }, []);
  useEffect(() => subscribeMangaSources(() => setSourceTick((n) => n + 1)), []);

  const openDetail = useCallback((id: string) => setDetails((cur) => [...cur, id]), []);

  const resume = useCallback(
    async (entry: MangaProgressEntry) => {
      const target = entry.sourceId || activeMangaSourceId();
      if (target && activeMangaSourceId() !== target) setActiveMangaSource(target);
      try {
        const chs = readingOrder(await resumeChapters(entry.id));
        let i = chs.findIndex((c) => c.id === entry.chapterId);
        if (i < 0 && entry.chapterNumber != null) i = chs.findIndex((c) => c.chapter === entry.chapterNumber);
        if (i >= 0) {
          setReader({
            manga: { id: entry.id, title: entry.title, cover: entry.cover },
            chapters: chs,
            index: i,
            startPage: Math.max(0, entry.page - 1),
          });
          return;
        }
      } catch {
        /* fall through to the detail page */
      }
      openDetail(entry.id);
    },
    [openDetail],
  );

  let body: React.ReactNode;
  if (!settings.mangaEnabled) {
    body = (
      <EmptyBlock
        icon={<BookOpen size={26} strokeWidth={1.8} />}
        title={t("Read manga in Harbor")}
        body={t(
          "Harbor does not host any manga. Add a source plugin from a repository you trust, connect your own server, or open a local folder. You can turn this off anytime in Settings.",
        )}
        action={<PrimaryButton onClick={() => update({ mangaEnabled: true })}>{t("Enable manga sources")}</PrimaryButton>}
      />
    );
  } else if (!hasAnyMangaSource()) {
    const state = mangaSourcesState();
    body =
      state === "loading" ? (
        <LoaderBlock />
      ) : state === "error" ? (
        <EmptyBlock
          tone="danger"
          title={t("Manga sources didn't load")}
          action={<PrimaryButton onClick={() => void retryMangaSources()}>{t("Try again")}</PrimaryButton>}
        />
      ) : (
        <div className="flex flex-col items-center gap-5 pt-6 text-center">
          <img src="/nosources.png" alt="" className="w-full max-w-[240px] object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.5)]" />
          <h2 className="font-display text-[26px] font-medium leading-tight text-ink">{t("Add a manga source")}</h2>
          <p className="text-[14px] leading-relaxed text-ink-muted">
            {t(
              "Harbor does not host any manga or any sources. Connect a self-hosted server you run, install a source plugin from a repository you trust, or open a folder you already have.",
            )}
          </p>
          <PrimaryButton onClick={() => setSourcesOpen(true)}>{t("Set up a source")}</PrimaryButton>
        </div>
      );
  } else {
    body = <MangaHome onOpen={openDetail} onResume={(e) => void resume(e)} />;
  }

  const ready = settings.mangaEnabled && hasAnyMangaSource();

  return (
    <DestinationPage
      kicker={t("Read")}
      title={t("nav.manga")}
      icon={<NavGlyph name="manga" className="h-[26px] w-[26px] p-[2px]" />}
      onBack={onBack}
      actions={
        ready ? (
          <IconButton label={t("Manga sources")} onClick={() => setSourcesOpen(true)}>
            <Settings2 size={20} strokeWidth={2} />
          </IconButton>
        ) : undefined
      }
    >
      {body}

      {details.map((id, i) => (
        <MangaDetailPage
          key={`${id}-${i}`}
          mangaId={id}
          onBack={() => setDetails((cur) => cur.slice(0, i))}
          onRead={setReader}
        />
      ))}

      {sourcesOpen && (
        <div
          className="fixed inset-0 z-[73] animate-slide-from-right overflow-y-auto overscroll-y-contain bg-canvas"
          style={{
            // The gutter and the side inset share the padding, so the larger wins.
            paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
            paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
          }}
        >
          <MangaSourcesView
            onBack={() => setSourcesOpen(false)}
            onOpenManga={(id) => {
              setSourcesOpen(false);
              openDetail(id);
            }}
          />
        </div>
      )}

      {reader && (
        <MangaPhoneReader
          state={reader}
          onChangeIndex={(index) => setReader((cur) => (cur ? { ...cur, index, startPage: 0 } : cur))}
          onExit={() => setReader(null)}
        />
      )}
    </DestinationPage>
  );
}

function MangaHome({ onOpen, onResume }: { onOpen: (id: string) => void; onResume: (e: MangaProgressEntry) => void }) {
  const t = useT();
  const { activeId } = useProfiles();
  const progress = useMangaProgressList();
  const { rails, loading: anilistLoading } = useAnilistMangaRails();
  const [anilistIdx, setAnilistIdx] = useState(0);
  const [popular, setPopular] = useState<MangaSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MangaSummary[] | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const loadingRef = useRef(false);
  const epoch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    popularManga(0)
      .then((list) => !cancelled && setPopular(list))
      .catch(() => !cancelled && setPopular([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // Browse grid: search when there is a query, the popular feed otherwise,
  // paged by offset like the desktop browse.
  useEffect(() => {
    epoch.current += 1;
    const my = epoch.current;
    loadingRef.current = true;
    setResults(null);
    setExhausted(false);
    const q = query.trim();
    const timer = window.setTimeout(
      () => {
        (q ? searchManga(q, 0) : popularManga(0))
          .then((list) => {
            if (epoch.current !== my) return;
            setResults(list);
            setExhausted(list.length < PAGE_SIZE / 2);
          })
          .catch(() => epoch.current === my && setResults([]))
          .finally(() => {
            if (epoch.current === my) loadingRef.current = false;
          });
      },
      q ? 350 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadMore = useCallback(() => {
    if (loadingRef.current || exhausted || !results) return;
    const my = epoch.current;
    loadingRef.current = true;
    const q = query.trim();
    const offset = results.length;
    (q ? searchManga(q, offset) : popularManga(offset))
      .then((list) => {
        if (epoch.current !== my) return;
        const seen = new Set(results.map((m) => m.id));
        const fresh = list.filter((m) => !seen.has(m.id));
        if (fresh.length === 0) setExhausted(true);
        else setResults((cur) => [...(cur ?? []), ...fresh]);
      })
      .catch(() => epoch.current === my && setExhausted(true))
      .finally(() => {
        if (epoch.current === my) loadingRef.current = false;
      });
  }, [exhausted, results, query]);

  // AniList entries are metadata ids, so they open the best title match on
  // the user's own sources, falling back to their reading progress.
  const openByTitle = (item: MangaSummary) => {
    const key = normTitle(item.title);
    const pick = (hits: MangaSummary[]) =>
      hits.find((h) => normTitle(h.title) === key || (h.altTitle != null && normTitle(h.altTitle) === key)) ?? hits[0] ?? null;
    void (async () => {
      try {
        const hit = pick(await searchManga(item.title, 0));
        if (hit) return onOpen(hit.id);
      } catch {
        /* fall through */
      }
      const entry = listMangaProgress(activeId ?? "default").find((e) => normTitle(e.title) === key);
      if (entry) onOpen(entry.id);
    })();
  };

  const featured = (popular ?? []).filter((m) => m.cover).slice(0, 6);
  const rail = rails[Math.min(anilistIdx, Math.max(0, rails.length - 1))];

  return (
    <div className="flex flex-col gap-8">
      {featured.length > 0 && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {featured.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpen(m.id)}
              className="relative flex w-[84%] shrink-0 snap-center gap-3.5 overflow-hidden rounded-3xl bg-elevated p-3 text-start ring-1 ring-edge-soft/60"
            >
              <CoverImg
                src={m.cover}
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full scale-125 object-cover opacity-25 blur-2xl"
              />
              <span className="relative w-[108px] shrink-0 overflow-hidden rounded-xl shadow-[0_12px_30px_-12px_rgba(0,0,0,0.7)]">
                <CoverImg src={m.cover} alt="" className="aspect-[2/3] w-full object-cover" loading="lazy" />
              </span>
              <span className="relative flex min-w-0 flex-1 flex-col justify-end gap-1.5 pb-1">
                <span className="line-clamp-3 font-display text-[20px] font-medium leading-[1.08] text-ink">{m.title}</span>
                {(m.author || m.year) && (
                  <span className="truncate text-[12px] text-ink-subtle">{[m.author, m.year].filter(Boolean).join(" · ")}</span>
                )}
                {m.description && <span className="line-clamp-3 text-[12.5px] leading-snug text-ink-muted">{m.description}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {progress.length > 0 && (
        <TileRail title={t("Continue reading")}>
          {progress.map((e) => (
            <button key={e.id} type="button" onClick={() => onResume(e)} className="flex w-[112px] shrink-0 flex-col gap-1.5 text-start">
              <span className="relative block overflow-hidden rounded-lg bg-elevated ring-1 ring-white/[0.06]">
                <CoverImg src={e.cover} alt="" loading="lazy" className="aspect-[2/3] w-full object-cover" />
                {e.totalPages > 0 && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-canvas/70">
                    <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (e.page / e.totalPages) * 100)}%` }} />
                  </span>
                )}
              </span>
              <span className="line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">{e.title}</span>
              <span className="truncate text-[11px] text-ink-subtle">{e.chapterLabel}</span>
            </button>
          ))}
        </TileRail>
      )}

      {(rails.length > 0 || anilistLoading) && (
        <section className="flex flex-col gap-2">
          <SectionHead
            title={t("Your AniList")}
            leading={<img src={anilistLogo} alt="" className="h-5 w-5 shrink-0 rounded-[4px] object-contain" />}
          />
          {rails.length > 1 && (
            <ChipRow>
              {rails.map((r, i) => (
                <Chip key={r.key} label={r.title} count={r.items.length} active={r === rail} onClick={() => setAnilistIdx(i)} />
              ))}
            </ChipRow>
          )}
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {rail
              ? rail.items.map((m) => (
                  <div key={m.id} className="w-[112px] shrink-0">
                    <CoverTile item={m} onOpen={() => openByTitle(m)} />
                  </div>
                ))
              : [0, 1, 2, 3].map((i) => <div key={i} className="aspect-[2/3] w-[112px] shrink-0 animate-pulse rounded-lg bg-elevated/40" />)}
          </div>
        </section>
      )}

      {popular && popular.length > 0 && (
        <TileRail title={t("Popular Manga")}>
          {popular.slice(0, 24).map((m) => (
            <div key={m.id} className="w-[112px] shrink-0">
              <CoverTile item={m} onOpen={() => onOpen(m.id)} />
            </div>
          ))}
        </TileRail>
      )}

      <section className="flex flex-col gap-3">
        <SectionHead title={t("Browse manga")} />
        <SearchField value={query} onChange={setQuery} placeholder={t("Search manga")} />
        {results === null ? (
          <PosterGridSkeleton />
        ) : results.length === 0 ? (
          <EmptyBlock title={t("Nothing to show yet")} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {results.map((m) => (
                <CoverTile key={m.id} item={m} onOpen={() => onOpen(m.id)} />
              ))}
            </div>
            {!exhausted && <LoadMoreSentinel onLoadMore={loadMore} />}
          </>
        )}
      </section>
    </div>
  );
}

function CoverTile({ item, onOpen }: { item: MangaSummary; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full min-w-0 text-start">
      <span className="block overflow-hidden rounded-lg bg-elevated ring-1 ring-white/[0.06]">
        {item.cover ? (
          <CoverImg src={item.cover} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-full object-cover" />
        ) : (
          <span className="flex aspect-[2/3] w-full items-center justify-center text-ink-subtle">
            <BookOpen size={22} strokeWidth={1.6} />
          </span>
        )}
      </span>
      <span className="mt-1.5 line-clamp-2 block text-[12px] font-medium leading-snug text-ink-muted">{item.title}</span>
    </button>
  );
}

const CHAPTER_BATCH = 60;

export function MangaDetailPage({
  mangaId,
  onBack,
  onRead,
}: {
  mangaId: string;
  onBack: () => void;
  onRead: (state: ReaderState) => void;
}) {
  const t = useT();
  const [detail, setDetail] = useState<MangaSummary | null>(null);
  const [chapters, setChapters] = useState<MangaChapter[]>([]);
  const [detailPending, setDetailPending] = useState(true);
  const [chaptersPending, setChaptersPending] = useState(true);
  const [retry, setRetry] = useState(0);
  const [lang, setLang] = useState("en");
  const langInit = useRef(false);
  const [newestFirst, setNewestFirst] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shown, setShown] = useState(CHAPTER_BATCH);
  const progress = useMangaProgressEntry(mangaId, detail?.title);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setChapters([]);
    setDetailPending(true);
    setChaptersPending(true);
    langInit.current = false;
    mangaDetail(mangaId)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => {})
      .finally(() => !cancelled && setDetailPending(false));
    streamChapters(mangaId, (chunk) => {
      if (cancelled || chunk.length === 0) return;
      setChapters((prev) => [...prev, ...chunk]);
      if (!langInit.current) {
        langInit.current = true;
        const ls = chapterLanguages(chunk);
        setLang(ls.find((l) => l.code === "en")?.code ?? ls[0]?.code ?? "en");
      }
    })
      .catch(() => {})
      .finally(() => !cancelled && setChaptersPending(false));
    return () => {
      cancelled = true;
    };
  }, [mangaId, retry]);

  const langs = useMemo(() => chapterLanguages(chapters), [chapters]);
  const ordered = useMemo(() => readingOrder(chapters.filter((c) => c.language === lang)), [chapters, lang]);
  const listed = newestFirst ? ordered.slice().reverse() : ordered;
  const manga = { id: mangaId, title: detail?.title ?? "", cover: detail?.cover };
  const progressIndex = progress ? ordered.findIndex((c) => c.id === progress.chapterId) : -1;

  const read = (index: number, startPage = 0) => onRead({ manga, chapters: ordered, index, startPage });
  const failed = !detailPending && !detail && !chaptersPending && chapters.length === 0;

  const chapterLabel = (c: MangaChapter) =>
    c.chapter ? t("Chapter {n}", { n: c.chapter }) : c.title || t("Chapter {n}", { n: "?" });

  return (
    <SubPage title={detail?.title ?? ""} kicker={t("nav.manga")} onBack={onBack}>
      {failed ? (
        <EmptyBlock
          title={t("This title would not open")}
          body={t(
            "The source returned a bad response for this manga. It may be temporary, or the title may have moved. Try another source, or head back and pick something else.",
          )}
          action={<PrimaryButton onClick={() => setRetry((n) => n + 1)}>{t("Try again")}</PrimaryButton>}
        />
      ) : (
        <div className="relative isolate flex flex-col gap-6">
          {detail?.cover && (
            <div aria-hidden className="pointer-events-none absolute -inset-x-4 -top-4 -z-10 h-[340px] overflow-hidden">
              <CoverImg src={detail.cover} alt="" className="h-full w-full scale-125 object-cover opacity-35 blur-3xl" />
              <div className="absolute inset-0 bg-gradient-to-b from-canvas/30 via-canvas/75 to-canvas" />
            </div>
          )}
          <header className="flex gap-4 pt-2">
            <div className="w-[118px] shrink-0 overflow-hidden rounded-xl bg-elevated shadow-[0_18px_40px_-14px_rgba(0,0,0,0.7)]">
              {detail?.cover ? (
                <CoverImg src={detail.cover} alt="" className="aspect-[2/3] w-full object-cover" />
              ) : (
                <div className="aspect-[2/3] w-full animate-pulse bg-raised" />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-end gap-1.5 pb-1">
              {detail ? (
                <>
                  <h2 className="line-clamp-4 font-display text-[24px] font-medium leading-[1.08] text-ink">{detail.title}</h2>
                  {detail.author && <p className="truncate text-[13px] text-ink-muted">{detail.author}</p>}
                  <p className="text-[12px] text-ink-subtle">{[detail.status, detail.year].filter(Boolean).join(" · ")}</p>
                </>
              ) : (
                <>
                  <div className="h-7 w-4/5 animate-pulse rounded bg-raised" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-raised" />
                </>
              )}
            </div>
          </header>

          <div className="flex flex-col gap-2">
            {progress && progressIndex >= 0 ? (
              <PrimaryButton onClick={() => read(progressIndex, Math.max(0, progress.page - 1))}>
                <BookOpen size={17} strokeWidth={2.2} />
                {t("Continue reading")}
              </PrimaryButton>
            ) : (
              <PrimaryButton disabled={ordered.length === 0} onClick={() => read(0)}>
                <BookOpen size={17} strokeWidth={2.2} />
                {t("Start reading")}
              </PrimaryButton>
            )}
            {progress && progressIndex >= 0 && (
              <p className="text-center text-[12px] text-ink-subtle">{progress.chapterLabel}</p>
            )}
          </div>

          {detail?.description && (
            <div className="flex flex-col items-start">
              <p className={`text-[14px] leading-relaxed text-ink-muted ${expanded ? "" : "line-clamp-4"}`}>{detail.description}</p>
              {detail.description.length > 220 && (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="h-11 text-[13.5px] font-semibold text-ink">
                  {expanded ? t("Show less") : t("Read more")}
                </button>
              )}
            </div>
          )}

          <section className="flex flex-col gap-2">
            <SectionHead
              title={t("Chapters")}
              count={ordered.length || undefined}
              trailing={
                <IconButton label={t("Sort")} onClick={() => setNewestFirst((v) => !v)} active={newestFirst}>
                  <ArrowDownUp size={18} strokeWidth={2} />
                </IconButton>
              }
            />
            {langs.length > 1 && (
              <ChipRow>
                {langs.map((l) => (
                  <Chip key={l.code} label={l.code.toUpperCase()} count={l.count} active={lang === l.code} onClick={() => setLang(l.code)} />
                ))}
              </ChipRow>
            )}
            {chaptersPending && ordered.length === 0 ? (
              <div className="flex flex-col gap-2" aria-hidden>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-elevated/40" />
                ))}
              </div>
            ) : ordered.length === 0 ? (
              <EmptyBlock title={t("Nothing to show yet")} />
            ) : (
              <>
                <ul className="flex flex-col">
                  {listed.slice(0, shown).map((c) => {
                    const idx = ordered.indexOf(c);
                    const current = progress?.chapterId === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => read(idx, current && progress ? Math.max(0, progress.page - 1) : 0)}
                          className="flex min-h-14 w-full items-center gap-3 border-b border-edge-soft/40 py-2 text-start active:bg-elevated/40"
                        >
                          <span className={`h-2 w-2 shrink-0 rounded-full ${current ? "bg-accent" : c.serverRead ? "bg-ink/20" : "bg-transparent"}`} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className={`truncate text-[14.5px] font-medium ${c.serverRead && !current ? "text-ink-subtle" : "text-ink"}`}>
                              {chapterLabel(c)}
                              {c.chapter && c.title ? ` · ${c.title}` : ""}
                            </span>
                            <span className="truncate text-[11.5px] text-ink-subtle">
                              {[c.group, c.publishAt ? new Date(c.publishAt).toLocaleDateString() : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {shown < listed.length && <LoadMoreSentinel onLoadMore={() => setShown((n) => n + CHAPTER_BATCH)} />}
              </>
            )}
          </section>
        </div>
      )}
    </SubPage>
  );
}

// Providers return either bare URLs or {url, headers}. Headers registered for
// a URL by the plugin adapter are attached so protected pages still load.
function toPages(list: unknown): MangaPage[] {
  if (!Array.isArray(list)) return [];
  const out: MangaPage[] = [];
  for (const p of list) {
    if (typeof p === "string") {
      out.push({ url: p, headers: pageHeadersFor(p) });
    } else if (p && typeof p === "object" && typeof (p as MangaPage).url === "string") {
      const page = p as MangaPage;
      out.push({ url: page.url, headers: page.headers ?? pageHeadersFor(page.url) });
    }
  }
  return out;
}

export function MangaPhoneReader({
  state,
  onChangeIndex,
  onExit,
}: {
  state: ReaderState;
  onChangeIndex: (index: number) => void;
  onExit: () => void;
}) {
  const t = useT();
  const reduce = useReducedMotion();
  const { activeId } = useProfiles();
  useRegisterSheet(true);
  const { manga, chapters, index, startPage } = state;
  const chapter = chapters[index];
  const [mode, setMode] = useState<LocalMode>(() => loadLocalMode("strip"));
  const [pages, setPages] = useState<MangaPage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [page, setPage] = useState(startPage);
  const [chrome, setChrome] = useState(true);
  const stripRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef<Array<HTMLDivElement | null>>([]);
  const didSeek = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPages(null);
    setFailed(false);
    setPage(startPage);
    didSeek.current = false;
    chapterPages(chapter.id)
      .then((list) => {
        if (cancelled) return;
        const next = toPages(list);
        setPages(next);
        if (next.length === 0) setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [chapter.id, startPage, reload]);

  const total = pages?.length ?? 0;
  const double = mode === "double" || mode === "book";
  const step = double ? 2 : 1;
  const anchor = double ? page - (page % 2) : page;

  // Progress is written after the reader settles on a page, like the desktop
  // reader, so a quick flick through a chapter does not rewrite it per page.
  useEffect(() => {
    if (!total) return;
    const timer = window.setTimeout(() => {
      recordMangaProgress(activeId ?? "default", {
        id: manga.id,
        title: manga.title,
        cover: manga.cover,
        sourceId: activeMangaSourceId() ?? undefined,
        chapterId: chapter.id,
        chapterNumber: chapter.chapter,
        chapterLabel: chapter.chapter ? t("Chapter {n}", { n: chapter.chapter }) : chapter.title ?? "",
        page: Math.min(page + 1, total),
        totalPages: total,
        updatedAt: Date.now(),
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [page, total, chapter.id, activeId, manga.id, manga.title, manga.cover, chapter.chapter, chapter.title, t]);

  useEffect(() => {
    if (mode !== "strip" || !pages || pages.length === 0) return;
    const root = stripRef.current;
    if (!root) return;
    if (!didSeek.current) {
      didSeek.current = true;
      const el = pageEls.current[startPage];
      if (el && startPage > 0) el.scrollIntoView({ block: "start" });
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.page);
          if (Number.isFinite(i)) setPage(i);
        }
      },
      { root, rootMargin: "-45% 0px -45% 0px" },
    );
    pageEls.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [mode, pages, startPage]);

  const pickMode = (m: LocalMode) => {
    setMode(m);
    saveLocalMode(m);
    didSeek.current = false;
  };

  const hasPrev = index > 0;
  const hasNext = index < chapters.length - 1;
  const turn = (dir: "next" | "prev") => {
    if (dir === "next") {
      if (anchor + step < total) setPage(anchor + step);
      else if (hasNext) onChangeIndex(index + 1);
    } else if (anchor > 0) setPage(Math.max(0, anchor - step));
    else if (hasPrev) onChangeIndex(index - 1);
  };

  const onPagedTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    if (x < 0.3) turn("prev");
    else if (x > 0.7) turn("next");
    else setChrome((v) => !v);
  };

  const label = chapter.chapter ? t("Chapter {n}", { n: chapter.chapter }) : chapter.title ?? manga.title;
  const pageLabel = total
    ? double && anchor + 1 < total
      ? `${anchor + 1}-${anchor + 2} / ${total}`
      : `${Math.min(page + 1, total)} / ${total}`
    : "";

  const node = (
    <div className="fixed inset-0 z-[85] bg-[#0b0b0d] text-ink" style={MOBILE_SAFE_X}>
      {pages === null && !failed ? (
        <LoaderBlock />
      ) : failed ? (
        <div className="flex h-full items-center justify-center px-6">
          <EmptyBlock
            tone="danger"
            title={t("Page failed to load")}
            action={<PrimaryButton onClick={() => setReload((n) => n + 1)}>{t("Try again")}</PrimaryButton>}
          />
        </div>
      ) : mode === "strip" ? (
        <div ref={stripRef} onClick={() => setChrome((v) => !v)} className="h-full overflow-y-auto overscroll-contain">
          {pages!.map((p, i) => (
            <div
              key={`${p.url}-${i}`}
              data-page={i}
              ref={(el) => {
                pageEls.current[i] = el;
              }}
            >
              <PageImage url={p.url} headers={p.headers} className="block h-auto w-full" />
            </div>
          ))}
          {hasNext && (
            <div className="flex justify-center py-10" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}>
              <PrimaryButton onClick={() => onChangeIndex(index + 1)}>{t("Next chapter")}</PrimaryButton>
            </div>
          )}
        </div>
      ) : (
        <div onClick={onPagedTap} className="flex h-full items-center justify-center gap-0.5 overflow-hidden">
          {(double ? [anchor, anchor + 1].filter((i) => i < total) : [anchor]).map((i) => (
            <div key={`${pages![i].url}-${i}`} className={`flex h-full items-center justify-center ${double ? "w-1/2" : "w-full"}`}>
              <PageImage
                url={pages![i].url}
                headers={pages![i].headers}
                fillHeight
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ))}
        </div>
      )}

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-200 motion-reduce:transition-none ${
          chrome ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`bg-gradient-to-b from-[#0b0b0d]/95 via-[#0b0b0d]/70 to-transparent pb-7 ${chrome ? "pointer-events-auto" : ""}`}
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
        >
          <div className="flex items-center gap-2 px-3">
            <button
              type="button"
              aria-label={t("Back")}
              onClick={onExit}
              className="no-press grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted active:scale-90"
            >
              <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <span className="max-w-full truncate text-[14px] font-semibold text-ink">{label}</span>
              <span className="max-w-full truncate text-[12px] tabular-nums text-ink-subtle">
                {pageLabel ? `${manga.title} · ${pageLabel}` : manga.title}
              </span>
            </div>
            <div className="h-11 w-11 shrink-0" />
          </div>
          <div className="mt-2.5 flex justify-center px-3">
            <ModeSwitcher mode={mode} onPick={pickMode} reduce={reduce} />
          </div>
        </div>
      </div>
      <div
        className={`absolute inset-x-0 bottom-0 transition-opacity duration-200 motion-reduce:transition-none ${
          chrome ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <ReaderDock hasPrev={hasPrev} hasNext={hasNext} onPrev={() => onChangeIndex(index - 1)} onNext={() => onChangeIndex(index + 1)} />
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
