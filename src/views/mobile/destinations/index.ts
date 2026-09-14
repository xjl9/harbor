import { Suspense, createElement, lazy, type ComponentType } from "react";
import type { NavItemId } from "@/chrome/nav-items";

// Contract consumed by the phone navigation: each entry is a desktop nav
// destination the phone did not have. Components are lazy so the phone bundle
// stays small at startup; the label is the desktop nav key so the existing nav
// translations apply, and navId lets the caller pick the desktop icon and honour
// the user's nav customization (order, hidden, renamed) and the parental and
// hide-content keys on the matching desktop NavItem.
export type PhoneDestination = {
  id: string;
  label: string;
  navId: NavItemId;
  Component: ComponentType<{ onBack: () => void }>;
};

// Every export carries its own Suspense boundary. A caller that forgets one
// would otherwise suspend up to the nearest boundary above it, which on the
// phone is the whole shell. The fallback is empty because each page slides in
// over what is already on screen.
function deferred<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const Lazy = lazy(() => load().then((C) => ({ default: C })));
  const Wrapped = (props: P) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
  return Wrapped;
}

// Desktop sidebar order. eBook is not listed: its library lives inside the
// desktop view and has no phone surface yet.
export const PHONE_DESTINATIONS: PhoneDestination[] = [
  {
    id: "catalogs",
    label: "nav.catalogs",
    navId: "catalogs",
    Component: deferred(() => import("./mobile-catalogs").then((m) => m.MobileCatalogs)),
  },
  {
    id: "kids",
    label: "nav.kids",
    navId: "kids",
    Component: deferred(() => import("./mobile-kids").then((m) => m.MobileKids)),
  },
  {
    id: "manga",
    label: "nav.manga",
    navId: "manga",
    Component: deferred(() => import("./mobile-manga").then((m) => m.MobileManga)),
  },
  {
    id: "live",
    label: "nav.live",
    navId: "live",
    Component: deferred(() => import("./mobile-live").then((m) => m.MobileLive)),
  },
  {
    id: "vod",
    label: "nav.playlists",
    navId: "vod",
    Component: deferred(() => import("./mobile-playlists").then((m) => m.MobilePlaylists)),
  },
  {
    id: "calendar",
    label: "nav.calendar",
    navId: "calendar",
    Component: deferred(() => import("./mobile-calendar").then((m) => m.MobileCalendar)),
  },
  {
    id: "collections",
    // The desktop nav item carries this literal rather than a nav.* key.
    label: "Collections",
    navId: "collections",
    Component: deferred(() => import("./mobile-collections").then((m) => m.MobileCollections)),
  },
];

// Person page for the detail cast rows. Accepts a bare TMDB id or "person:<id>".
export const MobilePerson: ComponentType<{ personId: string; onBack: () => void }> | null = deferred(() =>
  import("./mobile-people").then((m) => m.MobilePersonPage),
);

// Destinations with no desktop nav item: Top People (entered from Discover on
// desktop) and the library Stats page.
export const MobileTopPeople: ComponentType<{ onBack: () => void }> = deferred(() =>
  import("./mobile-people").then((m) => m.MobileTopPeople),
);
export const MobileWrapped: ComponentType<{ onBack: () => void }> = deferred(() =>
  import("./mobile-wrapped").then((m) => m.MobileWrapped),
);

// The badge the desktop sidebar shows on Calendar: reminders that fired while
// the calendar was not open. Re-exported so the nav can draw it without
// loading the calendar chunk.
export { useUnseenReminderCount as useCalendarBadgeCount } from "@/lib/reminders";
