import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play } from "lucide-react";
import { isMangaReaderRoute } from "@/lib/platform";
import { useView } from "@/lib/view";
import { HarborLoader } from "@/components/harbor-loader";
import { ScrollRootContext } from "@/components/row";
import { MobileBrowse } from "./mobile-browse";
import { MobileProfile } from "./mobile-profile";
import { MobileSearch } from "./mobile-search";
import { MobileLibrary } from "./mobile-library";
import { DpadRemote } from "./dpad-remote";
import { BottomTabBar, type MobileTab } from "./bottom-tab-bar";
import { MobileRemoteProvider, useMobileRemote } from "./mobile-remote";
import { SheetLockProvider, useSheetLock } from "./mobile-sheet-lock";
import { useMobileRemoteStyle } from "./remote-style";
import { ScrollToTop } from "./scroll-to-top";
import { LayerActiveContext, useLayerParked } from "./layer-active";
import { noteScroll, noteTab, restoredTab, restoreScroll } from "./reload-restore";
import { MOBILE_INTENT_EVENT } from "./mobile-intent";
import { installBugReportErrorCapture } from "@/lib/bug-report";
import { MangaNowBar } from "./manga-remote/manga-now-bar";

const RemoteApp = lazy(() => import("@/views/remote-app").then((m) => ({ default: m.RemoteApp })));
const MangaRemote = lazy(() => import("./manga-remote/manga-remote").then((m) => ({ default: m.MangaRemote })));
const MangaLocalReader = lazy(() => import("./manga-read/manga-local-reader").then((m) => ({ default: m.MangaLocalReader })));
const PlayPicker = lazy(() => import("@/views/play-picker").then((m) => ({ default: m.PlayPicker })));
const PlayerView = lazy(() => import("@/views/player").then((m) => ({ default: m.PlayerView })));

export function MobileShell() {
  return (
    <MobileRemoteProvider>
      <SheetLockProvider>
        {isMangaReaderRoute() ? <MangaReaderShell /> : <ShellBody />}
      </SheetLockProvider>
    </MobileRemoteProvider>
  );
}

function MangaReaderShell() {
  const [local, setLocal] = useState(false);
  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-canvas">
      <Suspense fallback={<FullLoader />}>
        {local ? (
          <MangaLocalReader onExit={() => setLocal(false)} />
        ) : (
          <MangaRemote standalone onReadHere={() => setLocal(true)} />
        )}
      </Suspense>
    </div>
  );
}

const TAB_IDS: readonly MobileTab[] = ["remote", "search", "home", "mystuff", "profile"];

function ShellBody() {
  const [tab, setTab] = useState<MobileTab>(() => restoredTab(TAB_IDS) ?? "home");
  const [seen, setSeen] = useState<Set<MobileTab>>(
    () => new Set<MobileTab>([restoredTab(TAB_IDS) ?? "home"]),
  );
  const showNowPlaying = tab !== "remote";
  const rootRef = useRef<HTMLDivElement>(null);

  const selectTab = (next: MobileTab) => {
    setTab(next);
    noteTab(next);
    setSeen((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  // Start capturing runtime errors as soon as the phone shell mounts, so a
  // report written later still carries what went wrong earlier in the session.
  // The installer is idempotent, so the report sheet calling it again is a noop.
  useEffect(() => installBugReportErrorCapture(), []);

  // The tab bar and the now playing bar float above the content, so anything
  // anchored to the bottom of a screen has to know how much room they take.
  // In portrait a hero clears them by luck; in landscape the viewport is short
  // enough that the now playing bar sat across the hero's Play button. Publish
  // the measured height so bottom-anchored content can reserve it. Defaults to
  // 0, so if the measurement ever fails the layout is exactly what it was.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const bars = root.querySelectorAll<HTMLElement>("[data-mobile-chrome]");
      let top = window.innerHeight;
      bars.forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.height > 0) top = Math.min(top, r.top);
      });
      const h = Math.max(0, Math.round(window.innerHeight - top));
      root.style.setProperty("--mobile-chrome-h", `${h}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [showNowPlaying, tab]);

  // A surface outside the tab tree asked for a destination that lives in one.
  // Switching here mounts it; the destination consumes the intent on mount.
  useEffect(() => {
    const onIntent = (e: Event) => {
      if ((e as CustomEvent<string>).detail === "addons") selectTab("profile");
    };
    window.addEventListener(MOBILE_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(MOBILE_INTENT_EVENT, onIntent);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rgb = getComputedStyle(el).backgroundColor;
    if (!rgb) return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", rgb);
  }, []);

  return (
    <div ref={rootRef} className="absolute inset-0 z-30 flex flex-col bg-canvas">
      <style>{TAB_TRANSITION_CSS}</style>
      {/* Film grain: a whisper of monochrome noise over the whole shell for cinematic
          depth/texture. Fixed + pointer-events-none + below the picker/player overlays.
          Plain alpha blend on purpose: mix-blend-overlay forces the compositor to
          re-blend the full viewport on every scrolled frame, too costly on phones. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[60] opacity-[0.05] motion-reduce:hidden"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='hg'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23hg)'/%3E%3C/svg%3E\")",
          backgroundSize: "140px 140px",
        }}
      />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <TabLayer active={tab === "home"}>
          {seen.has("home") && <MobileBrowse />}
        </TabLayer>
        <TabLayer active={tab === "search"}>
          {seen.has("search") && (
            <BrowseScroll restoreKey="tab-search">
              <MobileSearch />
            </BrowseScroll>
          )}
        </TabLayer>
        <TabLayer active={tab === "profile"}>
          {seen.has("profile") && (
            <BrowseScroll restoreKey="tab-profile">
              <MobileProfile onOpenRemote={() => selectTab("remote")} />
            </BrowseScroll>
          )}
        </TabLayer>
        <TabLayer active={tab === "mystuff"}>
          {seen.has("mystuff") && (
            <BrowseScroll restoreKey="tab-mystuff">
              <MobileLibrary onConnect={() => selectTab("profile")} />
            </BrowseScroll>
          )}
        </TabLayer>
        <TabLayer active={tab === "remote"}>
          {seen.has("remote") && <RemoteSurface onHome={() => selectTab("home")} />}
        </TabLayer>
      </div>
      {showNowPlaying && <NowPlayingBar onExpand={() => selectTab("remote")} />}
      <BottomTabBar active={tab} onSelect={selectTab} />
      <LocalPlayback />
    </div>
  );
}

/**
 * Standalone playback surfaces. On a native build "Play" opens the local picker
 * (stream resolution on-device) and the picker hands a resolved source to the
 * player — the same engine the desktop uses, rendered as full-screen overlays.
 */
function LocalPlayback() {
  const { picker, player } = useView();
  const playerActive = !!player;
  return (
    <>
      {/* Portaled to body: the mobile detail page is a fixed z-50 sibling of
          the shell, so an overlay inside the shell's z-30 context can never
          cover it no matter its own z-index. */}
      {picker &&
        createPortal(
          <div className="fixed inset-0 z-[80] bg-canvas">
          <Suspense fallback={<FullLoader />}>
            <PlayPicker
              key={`picker-${picker.meta.id}-${picker.episode?.season ?? ""}-${picker.episode?.episode ?? ""}-${picker.attempt ?? 0}`}
              meta={picker.meta}
              episode={picker.episode}
              autoPlay={picker.intent === "download" ? false : picker.autoPlay}
              attempt={picker.attempt}
              intent={picker.intent}
              seasonEpisodes={picker.seasonEpisodes}
              resume={picker.resume}
              playerActive={playerActive}
            />
          </Suspense>
          </div>,
          document.body,
        )}
      {player &&
        createPortal(
          <div className="fixed inset-0 z-[90] bg-black">
          <Suspense fallback={<FullLoader />}>
            <PlayerView
              key={player.meta.id.startsWith("iptv:") ? "player-live" : `player-${player.meta.id}`}
              src={player}
            />
          </Suspense>
          </div>,
          document.body,
        )}
    </>
  );
}

const TAB_TRANSITION_CSS = `
.harbor-tab-layer {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: translate3d(0, 8px, 0);
  pointer-events: none;
  transition: opacity 260ms var(--ease-out), transform 260ms var(--ease-out);
}
.harbor-tab-layer.is-active {
  opacity: 1;
  transform: translate3d(0, 0, 0);
  pointer-events: auto;
}
.harbor-tab-layer.is-parked {
  visibility: hidden;
  content-visibility: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .harbor-tab-layer {
    transition: none;
    transform: none;
  }
}
`;

function TabLayer({ active, children }: { active: boolean; children: React.ReactNode }) {
  const parked = useLayerParked(active);
  return (
    <LayerActiveContext.Provider value={active}>
      <div
        className={`harbor-tab-layer flex flex-col${active ? " is-active" : ""}${parked ? " is-parked" : ""}`}
        aria-hidden={active ? undefined : true}
      >
        {children}
      </div>
    </LayerActiveContext.Provider>
  );
}

function BrowseScroll({ restoreKey, children }: { restoreKey: string; children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTop, setShowTop] = useState(false);
  // Published so descendants (MobileCatalogGrid's VirtualGrid) can virtualize
  // against this scroller; state, not the ref, so consumers render once it exists.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setScrollEl(scrollRef.current);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cancelRestore = restoreScroll(el, restoreKey);
    let raf = 0;
    const update = () => {
      raf = 0;
      const vh = el.clientHeight || 1;
      setShowTop(el.scrollTop > vh);
      noteScroll(restoreKey, el.scrollTop);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelRestore();
      el.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [restoreKey]);

  return (
    <>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)" }}
      >
        <ScrollRootContext.Provider value={scrollEl}>{children}</ScrollRootContext.Provider>
      </div>
      <ScrollToTop scrollRef={scrollRef} visible={showTop} />
    </>
  );
}

const NOW_PLAYING_CSS = `
.harbor-nowplaying-in {
  animation: harbor-nowplaying-in 420ms var(--ease-out) both;
}
.harbor-nowplaying-out {
  animation: harbor-nowplaying-out 200ms var(--ease-out) both;
}
@keyframes harbor-nowplaying-in {
  0% { opacity: 0; transform: translate3d(0, 16px, 0) scale(0.985); }
  55% { opacity: 1; }
  78% { transform: translate3d(0, -2px, 0) scale(1); }
  100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
@keyframes harbor-nowplaying-out {
  0% { opacity: 1; transform: translate3d(0, 0, 0); }
  100% { opacity: 0; transform: translate3d(0, 8px, 0); }
}
.harbor-nowplaying-slide {
  transition: transform 320ms var(--ease-out);
}
.harbor-nowplaying-slide[data-hidden="true"] {
  transform: translateY(calc(100% + env(safe-area-inset-bottom, 0px) + 74px + 24px));
}
@media (prefers-reduced-motion: reduce) {
  .harbor-nowplaying-in, .harbor-nowplaying-out { animation: none; }
  .harbor-nowplaying-slide { transition: none; }
  .harbor-nowplaying-slide[data-hidden="true"] { transform: none; visibility: hidden; }
}
`;

function NowPlayingBar({ onExpand }: { onExpand: () => void }) {
  const { connected, snapshot } = useMobileRemote();
  const { sheetOpen } = useSheetLock();
  const active = connected && !snapshot.idle && !!snapshot.mediaId;
  const [render, setRender] = useState(active);
  const lastActive = useRef(snapshot);
  if (active) lastActive.current = snapshot;

  useEffect(() => {
    if (active) {
      setRender(true);
      return;
    }
    const timer = window.setTimeout(() => setRender(false), 200);
    return () => window.clearTimeout(timer);
  }, [active]);

  const manga = snapshot.manga;
  if (connected && manga?.open) {
    return <MangaNowBar m={manga} hidden={sheetOpen} onExpand={onExpand} />;
  }

  if (!render) return null;
  const snap = active ? snapshot : lastActive.current;
  const ep = snap.episode ? `S${snap.episode.season} · E${snap.episode.episode}` : null;
  return (
    <div
      data-mobile-chrome
      className="harbor-nowplaying-slide pointer-events-none fixed inset-x-0 z-30 flex justify-center px-3"
      data-hidden={sheetOpen ? "true" : undefined}
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 74px)" }}
    >
      <style>{NOW_PLAYING_CSS}</style>
      <div className={`w-[min(440px,100%)] ${active ? "harbor-nowplaying-in" : "harbor-nowplaying-out"}`}>
        <button
          type="button"
          onClick={onExpand}
          className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-edge-soft/60 bg-elevated/80 p-2 pe-4 text-start shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform active:scale-[0.99]"
        >
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-surface">
            {snap.posterUrl && (
              <img src={snap.posterUrl} alt="" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13.5px] font-semibold text-ink">{snap.mediaTitle || "Now playing"}</span>
            <span className="truncate text-[11.5px] text-ink-muted">
              {ep ? `${ep} · on your computer` : "on your computer"}
            </span>
          </span>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-canvas">
            {snap.playing ? (
              <Pause size={16} strokeWidth={0} fill="currentColor" />
            ) : (
              <Play size={16} strokeWidth={0} fill="currentColor" />
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

function RemoteSurface({ onHome }: { onHome: () => void }) {
  const { snapshot } = useMobileRemote();
  const style = useMobileRemoteStyle();
  const content = snapshot.manga?.open ? (
    <Suspense fallback={<FullLoader />}>
      <MangaRemote />
    </Suspense>
  ) : style === "dpad" ? (
    <DpadRemote />
  ) : (
    <Suspense fallback={<FullLoader />}>
      <RemoteApp onExitHome={onHome} />
    </Suspense>
  );
  return <div className="min-h-0 flex-1 overflow-hidden overscroll-none">{content}</div>;
}

function FullLoader() {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-canvas">
      <HarborLoader size="lg" />
    </div>
  );
}
