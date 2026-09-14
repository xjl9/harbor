import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HarborLoader } from "@/components/harbor-loader";
import { ScrollRootContext } from "@/components/row";
import { MobileHome } from "./mobile-home";
import { MobileMovies } from "./mobile-movies";
import { MobileShows } from "./mobile-shows";
import { MobileAnime } from "./mobile-anime";
import { MobileDiscover } from "./mobile-discover";
import { MobileViewSwitcher } from "./mobile-view-switcher";
import { MobileDeviceSwitcher } from "./mobile-device-switcher";
import { ScrollToTop } from "./scroll-to-top";
import { LayerActiveContext, useLayerActive, useLayerParked } from "./layer-active";
import { noteScroll, noteView, restoredView, restoreScroll } from "./reload-restore";
import { MOBILE_CHROME_CLEARANCE, MOBILE_SAFE_X } from "./chrome-metrics";
import { useRegisterSheet, useSheetLock } from "./mobile-sheet-lock";
import { requestMobileIntent } from "./mobile-intent";
import { MobileAddons } from "./mobile-addons";
import { MobileDownloads } from "./mobile-downloads";
import { MobileSettings } from "./mobile-settings";
import type { PhoneDestination } from "./destinations";
import type { PhoneNavTarget, PhoneSheet } from "./nav-config";

export type View = "home" | "movies" | "shows" | "anime" | "discover";

const VIEW_TRANSITION_CSS = `
.harbor-view-layer {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: translate3d(0, 6px, 0);
  pointer-events: none;
  transition: opacity 260ms var(--ease-out), transform 260ms var(--ease-out);
}
.harbor-view-layer.is-active {
  opacity: 1;
  transform: translate3d(0, 0, 0);
  pointer-events: auto;
}
.harbor-view-layer.is-parked {
  visibility: hidden;
  content-visibility: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .harbor-view-layer {
    transition: none;
    transform: none;
  }
}
`;

const VIEW_IDS: readonly View[] = ["home", "movies", "shows", "anime", "discover"];

export function MobileBrowse() {
  const { sheetOpen } = useSheetLock();
  const [view, setView] = useState<View>(() => restoredView(VIEW_IDS) ?? "home");
  const [seen, setSeen] = useState<Set<View>>(
    () => new Set<View>([restoredView(VIEW_IDS) ?? "home"]),
  );

  const selectView = (next: View) => {
    setView(next);
    noteView(next);
    setSeen((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  };

  // A destination is a desktop nav item the phone renders as its own page over
  // the browse stack (Calendar, Live TV, the Catalogs hub). The section menu
  // hands over whatever it picked: views switch in place, the existing sheets
  // (Addons, Downloads, Settings) open over this tab, and intents go to the
  // shell, which routes them to the tab that owns them.
  const [page, setPage] = useState<PhoneDestination | null>(null);
  const [sheet, setSheet] = useState<PhoneSheet | null>(null);
  const closePage = useCallback(() => setPage(null), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const navigate = (target: PhoneNavTarget) => {
    if (target.kind === "view") selectView(target.view);
    else if (target.kind === "destination") setPage(target.destination);
    else if (target.kind === "sheet") setSheet(target.sheet);
    else requestMobileIntent(target.intent);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <style>{VIEW_TRANSITION_CSS}</style>
      <ViewLayer active={view === "home"}>
        {seen.has("home") && (
          <ViewScroll restoreKey="view-home">
            <MobileHome />
          </ViewScroll>
        )}
      </ViewLayer>
      <ViewLayer active={view === "movies"}>
        {seen.has("movies") && (
          <ViewScroll restoreKey="view-movies">
            <MobileMovies />
          </ViewScroll>
        )}
      </ViewLayer>
      <ViewLayer active={view === "shows"}>
        {seen.has("shows") && (
          <ViewScroll restoreKey="view-shows">
            <MobileShows />
          </ViewScroll>
        )}
      </ViewLayer>
      <ViewLayer active={view === "anime"}>
        {seen.has("anime") && (
          <ViewScroll restoreKey="view-anime">
            <MobileAnime />
          </ViewScroll>
        )}
      </ViewLayer>
      <ViewLayer active={view === "discover"}>
        {seen.has("discover") && (
          <ViewScroll restoreKey="view-discover">
            <MobileDiscover />
          </ViewScroll>
        )}
      </ViewLayer>

      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-30 h-36 bg-gradient-to-b from-black/60 via-black/22 to-transparent transition-opacity duration-150 ${sheetOpen ? "opacity-0" : "opacity-100"}`}
      />
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-3 px-3 transition-opacity duration-150 ${sheetOpen ? "opacity-0" : "opacity-100"}`}
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <div className="pointer-events-auto min-w-0">
          <MobileDeviceSwitcher />
        </div>
        <div className="pointer-events-auto">
          <MobileViewSwitcher view={view} onNavigate={navigate} />
        </div>
      </div>

      {page && <DestinationPage key={page.id} destination={page} onBack={closePage} />}
      {sheet === "addons" && <MobileAddons onClose={closeSheet} />}
      {sheet === "downloads" && <MobileDownloads onClose={closeSheet} />}
      {sheet === "settings" && <MobileSettings onClose={closeSheet} />}
    </div>
  );
}

// The same page shape as mobile-settings.tsx: a full-screen sheet that slides in
// from the trailing edge, registers with the sheet lock so the tab bar slides
// away beneath it, and slides back out before unmounting. The destination owns
// its own header and back chevron; this only hosts it and lazy-loads it.
function DestinationPage({
  destination,
  onBack,
}: {
  destination: PhoneDestination;
  onBack: () => void;
}) {
  useRegisterSheet(true);
  const [closing, setClosing] = useState(false);
  const Component = destination.Component;

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onBack, 300);
    return () => window.clearTimeout(timer);
  }, [closing, onBack]);

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <HarborLoader size="lg" />
          </div>
        }
      >
        <Component onBack={() => setClosing(true)} />
      </Suspense>
    </div>
  );
}

function ViewLayer({ active, children }: { active: boolean; children: ReactNode }) {
  const tabActive = useLayerActive();
  const parked = useLayerParked(active);
  return (
    <LayerActiveContext.Provider value={tabActive && active}>
      <div
        className={`harbor-view-layer flex flex-col${active ? " is-active" : ""}${parked ? " is-parked" : ""}`}
        aria-hidden={active ? undefined : true}
      >
        {children}
      </div>
    </LayerActiveContext.Provider>
  );
}

function ViewScroll({ restoreKey, children }: { restoreKey: string; children: ReactNode }) {
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
        style={{
          paddingBottom: MOBILE_CHROME_CLEARANCE,
          // Landscape puts the Dynamic Island over one long edge, where it was
          // cutting into section headings and cards. Full-bleed children bleed
          // back out with a matching negative margin; in portrait both are 0.
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <ScrollRootContext.Provider value={scrollEl}>{children}</ScrollRootContext.Provider>
      </div>
      <ScrollToTop scrollRef={scrollRef} visible={showTop} />
    </>
  );
}
