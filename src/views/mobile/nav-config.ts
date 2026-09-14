import { useMemo } from "react";
import { NAV_ITEMS, applyNavCustomization, type NavItem, type NavItemId } from "@/chrome/nav-items";
import { useParental } from "@/lib/parental";
import { isMobileNative } from "@/lib/platform";
import { useActiveKid } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { usePreviewNavCustomization } from "@/lib/theme-preview";
import { PHONE_DESTINATIONS, type PhoneDestination } from "./destinations";
import type { View } from "./mobile-browse";
import type { MobileIntent } from "./mobile-intent";

// The phone's navigation is the desktop sidebar's list, filtered through the same
// customization (order, hidden, renames) and the same gates (content filters,
// parental controls, kid profiles), then pointed at whatever the phone has for
// each item. Four kinds of place exist on the phone today: a view inside the
// home tab's browse stack, one of the existing full-screen sheets (Addons,
// Downloads, Settings) opened in place, an intent the shell routes to another
// tab, and a destination page built for the phone. An item with none of these
// is dropped rather than shown dead.
export type PhoneSheet = "addons" | "downloads" | "settings";

export type PhoneNavTarget =
  | { kind: "view"; view: View }
  | { kind: "sheet"; sheet: PhoneSheet }
  | { kind: "intent"; intent: MobileIntent }
  | { kind: "destination"; destination: PhoneDestination };

export type PhoneNavItem = {
  id: NavItemId;
  // A translation key (nav.movies) or the user's own rename; both go through t().
  label: string;
  render: NavItem["render"];
  target: PhoneNavTarget;
  // Settings is pinGated on the desktop: shown, but a tap asks for the PIN while
  // parental controls are locked.
  gated: boolean;
  // The desktop sidebar splits its list into a primary block and a second block
  // after a gap; the phone menu keeps that grouping with a hairline.
  primary: boolean;
};

const VIEW_TARGETS: Partial<Record<NavItemId, View>> = {
  home: "home",
  movies: "movies",
  shows: "shows",
  anime: "anime",
  discover: "discover",
};

// These open over the browse stack the way the desktop opens them from the
// sidebar, so Back returns the user to the section they were browsing instead
// of stranding them on the profile tab.
const SHEET_TARGETS: Partial<Record<NavItemId, PhoneSheet>> = {
  addons: "addons",
  downloads: "downloads",
  settings: "settings",
};

// Library is the My Stuff tab, which the shell switches to.
const INTENT_TARGETS: Partial<Record<NavItemId, MobileIntent>> = {
  library: "library",
};

// Mirrors PRIMARY_IDS in src/chrome/sidebar.tsx.
const PRIMARY_IDS = new Set<NavItemId>([
  "home",
  "discover",
  "catalogs",
  "movies",
  "shows",
  "kids",
  "anime",
  "live",
  "vod",
]);

export function phoneNavTarget(
  id: NavItemId,
  destinations: readonly PhoneDestination[] = PHONE_DESTINATIONS,
): PhoneNavTarget | null {
  // A page built for the phone wins over the older view or sheet, so the
  // destinations module can take over items one at a time without this map
  // changing underneath it.
  const destination = destinations.find((d) => d.navId === id);
  if (destination) return { kind: "destination", destination };
  const view = VIEW_TARGETS[id];
  if (view) return { kind: "view", view };
  const sheet = SHEET_TARGETS[id];
  if (sheet) {
    // The downloads sheet only exists on a native build; the web shell has no
    // download engine, so the profile tab does not offer it there either.
    if (sheet === "downloads" && !isMobileNative()) return null;
    return { kind: "sheet", sheet };
  }
  const intent = INTENT_TARGETS[id];
  return intent ? { kind: "intent", intent } : null;
}

export function usePhoneNavItems(): PhoneNavItem[] {
  const { settings } = useSettings();
  const kid = useActiveKid();
  const { locked, hiddenTabs } = useParental();
  const customization = usePreviewNavCustomization(settings.navCustomization);
  const { hideContent, showPlaylistsTab } = settings;

  return useMemo(() => {
    const items = applyNavCustomization(NAV_ITEMS, customization);
    // Same predicate as ScrollableNav in src/chrome/sidebar.tsx, so a tab the
    // desktop hides for this profile is hidden here too.
    const isVisible = (item: NavItem) => {
      if (kid) return item.view === "kids";
      if (item.view === "kids") return false;
      if (item.view === "vod" && !showPlaylistsTab) return false;
      if (item.hideKey && hideContent[item.hideKey]) return false;
      if (locked && item.parentalKey && hiddenTabs[item.parentalKey]) return false;
      return true;
    };
    const out: PhoneNavItem[] = [];
    for (const item of items) {
      if (!isVisible(item)) continue;
      const target = phoneNavTarget(item.id);
      if (!target) continue;
      out.push({
        id: item.id,
        label: item.label,
        render: item.render,
        target,
        gated: !!item.pinGated && locked,
        primary: PRIMARY_IDS.has(item.id),
      });
    }
    // A kid profile sees only the Kids hub on the desktop. Until the phone has
    // that page the list would be empty, and an empty menu is a dead end, so
    // Home stands in. The same floor covers a customization that hid everything.
    if (out.length === 0) {
      const home = NAV_ITEMS.find((it) => it.id === "home");
      if (home) {
        out.push({
          id: home.id,
          label: home.label,
          render: home.render,
          target: { kind: "view", view: "home" },
          gated: false,
          primary: true,
        });
      }
    }
    return out;
  }, [customization, kid, locked, hiddenTabs, hideContent, showPlaylistsTab]);
}

// The item whose target is the given browse view, so the section pill can show
// the user's own name for it (a renamed "Movies" reads "Films" everywhere).
export function phoneNavItemForView(items: readonly PhoneNavItem[], view: View): PhoneNavItem | null {
  return items.find((it) => it.target.kind === "view" && it.target.view === view) ?? null;
}
