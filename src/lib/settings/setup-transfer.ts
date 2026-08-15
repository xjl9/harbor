import type { Settings } from "./types";

/**
 * Portable "Transfer your setup" bundle: the parts of a Harbor install a user
 * would want to carry to another device - their installed addons (by transport
 * URL) and their provider API keys. Kept framework-independent and pure so it
 * is unit-testable and reusable by any surface; the mobile export/import sheets
 * are thin wrappers over these functions.
 *
 * Safety (Hachiware rule): metadata + subtitle keys are read-only catalog keys
 * and always travel. Debrid keys unlock a paid account and only travel when the
 * caller passes includeSensitive, gated behind an explicit toggle in the UI.
 */

export const SETUP_BUNDLE_VERSION = 1 as const;

// Read-only catalog/metadata keys. Low risk, always included.
const META_KEYS = [
  "tmdbKey",
  "tvdbKey",
  "rpdbKey",
  "omdbKey",
  "fanartKey",
  "mdblistKey",
] as const;

// Subtitle provider keys. Also read-only catalog access, always included.
const SUB_KEYS = [
  "opensubtitlesApiKey",
  "jimakuToken",
  "subdlApiKey",
  "subsourceApiKey",
] as const;

// Debrid keys grant access to a paid account: sensitive, opt-in only.
const DEBRID_KEYS = ["rdKey", "tbKey", "adKey", "pmKey", "dlKey"] as const;

type MetaKey = (typeof META_KEYS)[number];
type SubKey = (typeof SUB_KEYS)[number];
type DebridKey = (typeof DEBRID_KEYS)[number];

export type SetupBundle = {
  v: typeof SETUP_BUNDLE_VERSION;
  addons: string[];
  keys: {
    metadata?: Partial<Record<MetaKey, string>>;
    subtitles?: Partial<Record<SubKey, string>>;
    debrid?: Partial<Record<DebridKey, string>>;
  };
};

export type BundleSummary = {
  addonCount: number;
  keyCategories: string[];
  hasSensitive: boolean;
};

/**
 * A configured addon carries its settings in the URL — usually in the path
 * (everything between the host and the trailing manifest.json), but sometimes
 * in a query string or basic-auth userinfo. For debrid/auth addons that config
 * embeds the API key or token, so exporting the URL leaks a credential. Bare
 * public addons (host + /manifest.json, nothing else) carry nothing sensitive.
 */
export function isConfiguredAddonUrl(u: string): boolean {
  try {
    const url = new URL(u.trim().replace(/^stremio:\/\//i, "https://"));
    // Query params and userinfo are config channels too (?apiKey=..., user:pass@).
    if (url.search || url.username || url.password) return true;
    const middle = url.pathname
      .replace(/\/manifest\.json$/i, "")
      .replace(/^\/+|\/+$/g, "");
    return middle.length > 0;
  } catch {
    // Unparseable: withhold rather than risk leaking an embedded credential.
    return true;
  }
}

/**
 * The current settings and installed-addon transport URLs are passed in rather
 * than read from globals here, so this stays pure and testable without a DOM.
 * Callers wire `loadInstalled().map(a => a.transportUrl)` and `useSettings()`.
 */
export function buildSetupBundle(
  settings: Settings,
  addonUrls: string[],
  opts: { includeSensitive: boolean },
): SetupBundle {
  const all = dedupe(
    addonUrls.filter((u) => typeof u === "string" && u.trim().length > 0),
  );
  // Configured addon URLs can embed debrid/auth credentials, so they are held
  // back with the other sensitive data unless the user opts in.
  const addons = opts.includeSensitive ? all : all.filter((u) => !isConfiguredAddonUrl(u));
  const bundle: SetupBundle = { v: SETUP_BUNDLE_VERSION, addons, keys: {} };

  const metadata = pickKeys(settings, META_KEYS);
  if (Object.keys(metadata).length > 0) bundle.keys.metadata = metadata;

  const subtitles = pickKeys(settings, SUB_KEYS);
  if (Object.keys(subtitles).length > 0) bundle.keys.subtitles = subtitles;

  if (opts.includeSensitive) {
    const debrid = pickKeys(settings, DEBRID_KEYS);
    if (Object.keys(debrid).length > 0) bundle.keys.debrid = debrid;
  }

  return bundle;
}

function pickKeys<K extends keyof Settings>(
  settings: Settings,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const k of keys) {
    const v = settings[k];
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of list) {
    const norm = u.trim();
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
  }
  return out;
}

/** URL-safe base64 of the JSON: a copyable, QR-friendly "setup code". */
export function encodeBundle(bundle: SetupBundle): string {
  return toBase64Url(JSON.stringify(bundle));
}

/** Tolerant, version-checked parse. Returns null on anything malformed. */
export function decodeBundle(code: string): SetupBundle | null {
  const json = fromBase64Url((code ?? "").trim());
  if (json == null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== SETUP_BUNDLE_VERSION) return null;

  const addons = Array.isArray(obj.addons)
    ? obj.addons.filter(
        (s): s is string => typeof s === "string" && s.trim().length > 0,
      )
    : [];

  const keysIn =
    obj.keys && typeof obj.keys === "object"
      ? (obj.keys as Record<string, unknown>)
      : {};
  const keys: SetupBundle["keys"] = {};
  const metadata = sanitizeKeys(keysIn.metadata, META_KEYS);
  if (metadata) keys.metadata = metadata;
  const subtitles = sanitizeKeys(keysIn.subtitles, SUB_KEYS);
  if (subtitles) keys.subtitles = subtitles;
  const debrid = sanitizeKeys(keysIn.debrid, DEBRID_KEYS);
  if (debrid) keys.debrid = debrid;

  return { v: SETUP_BUNDLE_VERSION, addons, keys };
}

function sanitizeKeys<K extends string>(
  value: unknown,
  allowed: readonly K[],
): Partial<Record<K, string>> | null {
  if (!value || typeof value !== "object") return null;
  const src = value as Record<string, unknown>;
  const out: Partial<Record<K, string>> = {};
  for (const k of allowed) {
    const v = src[k];
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function summarizeBundle(bundle: SetupBundle): BundleSummary {
  const keyCategories: string[] = [];
  if (bundle.keys.metadata && Object.keys(bundle.keys.metadata).length > 0)
    keyCategories.push("metadata");
  if (bundle.keys.subtitles && Object.keys(bundle.keys.subtitles).length > 0)
    keyCategories.push("subtitles");
  const hasSensitive = !!(
    bundle.keys.debrid && Object.keys(bundle.keys.debrid).length > 0
  );
  if (hasSensitive) keyCategories.push("debrid");
  return { addonCount: bundle.addons.length, keyCategories, hasSensitive };
}

/**
 * Flatten a bundle's keys into a Settings patch. Merge fills only empty fields
 * (existing keys win); replace overwrites every field the bundle carries. All
 * targeted fields are typed as `string` in Settings, so the collected record is
 * a sound Partial<Settings>. Never removes keys the bundle omits.
 */
export function bundleToSettingsPatch(
  bundle: SetupBundle,
  current: Settings,
  mode: "merge" | "replace",
): Partial<Settings> {
  const patch: Record<string, string> = {};
  const groups = [
    bundle.keys.metadata,
    bundle.keys.subtitles,
    bundle.keys.debrid,
  ];
  for (const group of groups) {
    if (!group) continue;
    for (const [field, value] of Object.entries(group)) {
      if (typeof value !== "string" || value.trim().length === 0) continue;
      if (mode === "replace") {
        patch[field] = value;
      } else {
        const existing = current[field as keyof Settings];
        if (typeof existing !== "string" || existing.trim().length === 0)
          patch[field] = value;
      }
    }
  }
  return patch as Partial<Settings>;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string | null {
  if (!code) return null;
  try {
    const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
