// Tab registry for the phone library. The ids follow src/views/library/shared.ts
// except "mediaServers", which keeps the spelling the phone already persisted so
// a tab saved before this change still restores. The phone keeps its own
// storage key because its strip predates the desktop split.

export type LibraryTab =
  | "library"
  | "watchlist"
  | "history"
  | "lists"
  | "favorites"
  | "trakt"
  | "anilist"
  | "mal"
  | "simkl"
  | "letterboxd"
  | "local"
  | "mediaServers";

// Grid tabs are the ones useLibraryData builds on-device; the rest own their
// own fetchers.
export type GridTab = "library" | "watchlist" | "history" | "favorites" | "local" | "mediaServers";

export const GRID_TABS: ReadonlySet<string> = new Set<GridTab>([
  "library",
  "watchlist",
  "history",
  "favorites",
  "local",
  "mediaServers",
]);

const ALL_TABS: ReadonlySet<string> = new Set<LibraryTab>([
  "library",
  "watchlist",
  "history",
  "lists",
  "favorites",
  "trakt",
  "anilist",
  "mal",
  "simkl",
  "letterboxd",
  "local",
  "mediaServers",
]);

export const TAB_KEY = "harbor.mobile.library.tab";

export function isGridTab(tab: LibraryTab): tab is GridTab {
  return GRID_TABS.has(tab);
}

export function readSavedTab(): LibraryTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v && ALL_TABS.has(v)) return v as LibraryTab;
  } catch {}
  return "library";
}

export function writeSavedTab(tab: LibraryTab): void {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {}
}
