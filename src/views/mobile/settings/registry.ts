import type { SectionId } from "@/views/settings/shared";

// The phone's departments mirror desktop's sidebar bands (settings-sidebar.tsx
// BAND_LABELS / BAND_ICONS) minus the ones that only make sense with a
// keyboard, a window, or mpv: Plugins is agent D's surface, Controls & devices,
// Updates and the desktop-only System rows are omitted rather than stubbed.
export type DeptId =
  | "account"
  | "playback"
  | "languages"
  | "sources"
  | "library"
  | "appearance"
  | "advanced";

export type Dept = {
  id: DeptId;
  // Desktop source strings; every one already exists in the locales.
  label: string;
  sub: string;
  icon: string;
};

export const DEPARTMENTS: Dept[] = [
  {
    id: "account",
    label: "Account & setup",
    sub: "Your sign-in, the services that track what you watch, and your relay.",
    icon: "AccountSetup",
  },
  {
    id: "playback",
    label: "Playback",
    sub: "How video plays, how it looks, and what happens between episodes.",
    icon: "Play",
  },
  {
    id: "languages",
    label: "Languages",
    sub: "What language Harbor speaks, and how subtitles behave.",
    icon: "Languages",
  },
  {
    id: "sources",
    label: "Sources & library",
    sub: "Where streams come from, how they are filtered, and the metadata behind them.",
    icon: "Waypoints",
  },
  {
    id: "library",
    label: "Library & metadata",
    sub: "Optional keys that unlock TMDB rails, baked-in poster ratings, fanart, and TVDB episode data.",
    icon: "Library",
  },
  {
    id: "appearance",
    label: "Appearance",
    sub: "Color presets, custom backgrounds, and the font pair Harbor renders in.",
    icon: "Palette",
  },
  {
    id: "advanced",
    label: "Advanced",
    sub: "Storage, automation, and the settings most people never need.",
    icon: "SlidersHorizontal",
  },
];

export const DEPT_BY_ID: Record<DeptId, Dept> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d]),
) as Record<DeptId, Dept>;

// A search hit or deep link lands on a department page and, when the desktop
// tab lives behind a sub-page on the phone, on that sub-page.
export type Destination = { dept: DeptId; sub?: string };

// Desktop section (and tab) to phone destination. Anything not listed here is
// desktop-only and never appears in phone search results, so a result always
// opens a page where the setting actually exists.
const SECTION_DEST: Partial<Record<SectionId, Destination>> = {
  basics: { dept: "playback" },
  account: { dept: "account" },
  trackers: { dept: "account" },
  trakt: { dept: "account" },
  simkl: { dept: "account" },
  anilist: { dept: "account" },
  mal: { dept: "account" },
  letterboxd: { dept: "account" },
  relay: { dept: "account" },
  player: { dept: "playback" },
  language: { dept: "languages" },
  subtitles: { dept: "languages" },
  streaming: { dept: "sources" },
  streamFilters: { dept: "sources", sub: "filters" },
  library: { dept: "library" },
  theme: { dept: "appearance" },
  storage: { dept: "advanced", sub: "storage" },
  advanced: { dept: "advanced" },
  updates: { dept: "advanced" },
  licenses: { dept: "advanced", sub: "licenses" },
  support: { dept: "advanced", sub: "support" },
};

const TAB_DEST: Partial<Record<string, Destination | null>> = {
  // player: engine and play live on the page itself; mpv-only tabs are dropped
  "player/play": { dept: "playback" },
  // Desktop indexes mpv, HDR and casting rows under this tab; the phone's one
  // engine choice is still found through the Player section match.
  "player/engine": null,
  "player/onscreen": { dept: "playback" },
  "player/xray": { dept: "playback" },
  "player/adskip": { dept: "playback" },
  "player/intros": { dept: "playback" },
  "player/upnext": { dept: "playback" },
  "player/trailers": { dept: "playback" },
  "player/aspect": null,
  "player/audio": null,
  "subtitles/look": { dept: "playback", sub: "sub-style" },
  "subtitles/sync": { dept: "playback", sub: "sub-sync" },
  "subtitles/languages": { dept: "languages" },
  "subtitles/sources": { dept: "languages" },
  "language/app": { dept: "languages" },
  "language/audio": { dept: "languages" },
  "language/discovery": { dept: "languages" },
  "streaming/services": { dept: "sources" },
  "streaming/home-servers": { dept: "sources", sub: "home-servers" },
  "streaming/filters": { dept: "sources" },
  "streaming/sorting": { dept: "sources" },
  "streaming/picker": { dept: "sources" },
  "library/home": { dept: "library" },
  "library/cards": { dept: "library" },
  "library/detail": { dept: "library" },
  "library/providers": { dept: "library", sub: "providers" },
  "library/ai": { dept: "library", sub: "ai" },
  "library/library": { dept: "library" },
  "theme/theme": { dept: "appearance" },
  "theme/library": null,
  "theme/logo": null,
  "theme/type": null,
  "theme/window": null,
  "theme/interface": { dept: "appearance" },
  "theme/ambience": { dept: "appearance" },
  "storage/overview": { dept: "advanced", sub: "storage" },
  "storage/video": { dept: "advanced", sub: "storage" },
  "storage/caches": { dept: "advanced", sub: "storage" },
  "advanced/privacy": { dept: "advanced" },
  "advanced/about": { dept: "advanced" },
  "advanced/system": null,
  "advanced/repair": null,
  "advanced/code": null,
  "account/you": { dept: "account" },
  "account/profiles": { dept: "account" },
  "account/stremio": { dept: "account" },
  "account/harbor": { dept: "account" },
};

export function destinationFor(section: SectionId, tab?: string): Destination | null {
  if (tab) {
    const hit = TAB_DEST[`${section}/${tab}`];
    if (hit !== undefined) return hit;
  }
  return SECTION_DEST[section] ?? null;
}

// Sections whose untabbed search entries all describe rows the phone shows.
// Untabbed entries elsewhere (theme screensaver, hotkeys, the relay deploy
// flow) are desktop rows, so they are kept out of phone results entirely.
const WHOLE_SECTION_OPTIONS = new Set<SectionId>([
  "basics",
  "streamFilters",
  "storage",
  "licenses",
  "support",
  "trackers",
  "trakt",
  "simkl",
  "anilist",
  "mal",
  "letterboxd",
]);

// Destination for one entry of the desktop search index. Stricter than
// destinationFor: an entry without a tab only resolves for sections whose every
// entry exists on the phone, so a result never opens a page without its row.
export function optionDestination(section: SectionId, tab?: string): Destination | null {
  if (tab) return TAB_DEST[`${section}/${tab}`] ?? null;
  return WHOLE_SECTION_OPTIONS.has(section) ? (SECTION_DEST[section] ?? null) : null;
}

// Desktop's own row previews are public-domain film stills; the department
// cards borrow the same frames so the landing reads as the same product.
export { default as stillPlayback } from "@/assets/settings-preview/steamboat-willie.webp";
export { default as stillLanguages } from "@/assets/settings-preview/namakura-gatana.webp";
export { default as stillSources } from "@/assets/settings-preview/steamboat-river.webp";
export { default as stillLibrary } from "@/assets/settings-preview/the-general-still.webp";
export { default as stillAppearance } from "@/assets/settings-preview/the-toll-of-the-sea.webp";
export { default as stillAccount } from "@/assets/settings-preview/harbor-profile.png";
export { default as stillAdvanced } from "@/assets/settings-preview/sherlock-jr-theater.webp";
