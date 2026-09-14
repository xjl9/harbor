import { User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import lotHome from "@/assets/lottie/nav/home.json";
import lotLibrary from "@/assets/lottie/nav/library.json";
import { NavGlyph } from "@/components/icons/nav-glyph";
import { NavLottie } from "@/components/icons/nav-lottie";
import { Search } from "@/components/icons/search-icon";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { SetIcon } from "@/views/settings/set-icon";
import { useMobileRemote } from "./mobile-remote";
import { useSheetLock } from "./mobile-sheet-lock";

export type MobileTab = "remote" | "search" | "home" | "mystuff" | "profile";

const TAB_IDS: readonly MobileTab[] = ["remote", "search", "home", "mystuff", "profile"];

// Literal keys rather than a label table, so the i18n coverage check sees them.
function tabLabel(t: (key: string) => string, id: MobileTab): string {
  switch (id) {
    case "remote":
      return t("Remote");
    case "search":
      return t("Search");
    case "home":
      return t("Home");
    case "mystuff":
      return t("My library");
    case "profile":
      return t("Profile");
  }
}

// The desktop's own nav art: the home and library Lottie icons play once on
// press the way they play on hover in the sidebar (and sit still when the user
// turned nav icon animations off), search is the filled glyph every search bar
// uses, and the remote is the phone-with-radio mark from the settings icon set,
// which is the closest bespoke drawing to a phone driving a screen. Everything
// tints through currentColor, so the active pill's canvas ink applies to the
// animation too.
function TabIcon({ id, playing }: { id: MobileTab; playing: boolean }) {
  switch (id) {
    case "remote":
      return <SetIcon name="SmartphoneNfc" size={22} strokeWidth={2} />;
    case "search":
      return <Search size={22} />;
    case "home":
      return (
        <NavLottie
          data={lotHome}
          hovered={playing}
          fallback={<NavGlyph name="home" className="h-6 w-6 p-[1px]" />}
        />
      );
    case "mystuff":
      return (
        <NavLottie
          data={lotLibrary}
          hovered={playing}
          fallback={<NavGlyph name="library" className="h-6 w-6 p-[1px]" />}
        />
      );
    default:
      return null;
  }
}

// Long enough for either nav animation to finish before the icon settles back
// to its still frame.
const PLAY_MS = 1100;

const TAB_BAR_SLIDE_CSS = `
.harbor-tabbar-slide {
  transition: transform 320ms var(--ease-out);
}
.harbor-tabbar-slide[data-hidden="true"] {
  transform: translateY(calc(100% + 24px));
}
@media (prefers-reduced-motion: reduce) {
  .harbor-tabbar-slide {
    transition: none;
  }
  .harbor-tabbar-slide[data-hidden="true"] {
    transform: none;
    visibility: hidden;
  }
}
`;

export function BottomTabBar({
  active,
  onSelect,
}: {
  active: MobileTab;
  onSelect: (tab: MobileTab) => void;
}) {
  const t = useT();
  const { snapshot } = useMobileRemote();
  const { activeProfile } = useProfiles();
  const { sheetOpen } = useSheetLock();
  const avatar = snapshot.profile?.avatar ?? activeProfile?.avatar ?? null;
  const color = snapshot.profile?.color ?? activeProfile?.color ?? "var(--color-accent)";
  const pname = snapshot.profile?.name ?? activeProfile?.name ?? "";
  const [playing, setPlaying] = useState<MobileTab | null>(null);
  const playTimer = useRef(0);

  const press = (id: MobileTab) => {
    window.clearTimeout(playTimer.current);
    setPlaying(id);
    playTimer.current = window.setTimeout(() => setPlaying(null), PLAY_MS);
  };
  useEffect(() => () => window.clearTimeout(playTimer.current), []);

  return (
    <nav
      data-mobile-chrome
      // Compact in landscape: the same bar that reads as comfortable over a 850px
      // portrait screen eats close to a fifth of a 390px landscape one, floating
      // over the rows it is supposed to sit beneath.
      className="harbor-tabbar-slide pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
      data-hidden={sheetOpen ? "true" : undefined}
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}
    >
      <style>{TAB_BAR_SLIDE_CSS}</style>
      <div
        className="pointer-events-auto flex w-[min(400px,100%)] items-center justify-between rounded-xl border border-edge-soft px-2 py-2 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.55)] [@media(max-height:500px)]:w-[min(340px,100%)] [@media(max-height:500px)]:rounded-[10px] [@media(max-height:500px)]:py-1"
        // Elevated over canvas rather than a fixed dark: a light preset gets a
        // light bar, and a preset whose elevated token is translucent glass
        // (Aurora) still reads as a bar instead of dissolving into the rows.
        style={{
          background:
            "linear-gradient(var(--color-elevated), var(--color-elevated)), var(--color-canvas)",
        }}
      >
        {TAB_IDS.map((id) => {
          const on = id === active;
          const label = tabLabel(t, id);
          return (
            <button
              key={id}
              type="button"
              aria-label={label}
              aria-current={on ? "page" : undefined}
              onPointerDown={() => press(id)}
              onClick={() => onSelect(id)}
              className="no-press flex flex-1 items-center justify-center"
            >
              <span
                className={`flex h-10 w-[52px] items-center justify-center rounded-[13px] transition-[background-color,transform] duration-200 active:scale-95 [@media(max-height:500px)]:h-8 [@media(max-height:500px)]:w-[46px] [@media(max-height:500px)]:rounded-[11px] ${
                  on ? "bg-ink text-canvas" : "bg-transparent text-ink-subtle"
                }`}
              >
                {id === "profile" ? (
                  <span
                    className="flex h-[23px] w-[23px] items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white ring-1 ring-black/10"
                    style={{ background: avatar ? undefined : color }}
                  >
                    {avatar ? (
                      <img src={avatar} alt="" className="h-full w-full object-cover" />
                    ) : pname ? (
                      pname.slice(0, 1).toUpperCase()
                    ) : (
                      <User size={15} strokeWidth={2.1} />
                    )}
                  </span>
                ) : (
                  <TabIcon id={id} playing={playing === id} />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
