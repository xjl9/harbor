import { safeFetch as fetch } from "@/lib/safe-fetch";
import { readActiveStremioAuthKey } from "./auth";
import { setUserAddons, userAddons, type Addon } from "./addons";
import { applyOrderToItems } from "./addons-store/reorder";

const STORAGE_KEY = "harbor.installed-addons";
const SEEDED_KEY = "harbor.addons.seeded.v1";
const DISABLED_KEY = "harbor.addons.disabled";

const DEFAULT_ADDONS: Array<{ id: string; transportUrl: string }> = [];

// Ties the "already seeded" mark to WHICH addons the build seeds. The mark used to
// be the constant "1", so an install that carried it forward from an earlier build
// skipped a different seed set entirely - upgrading in place left the app with the
// old sources and no sign that anything had been withheld.
function seedFingerprint(): string {
  return DEFAULT_ADDONS.map((a) => normalizeTransportUrl(a.transportUrl))
    .sort()
    .join("|");
}

function normalizeTransportUrl(url: string): string {
  return url.replace(/\/$/, "");
}

const SEED_DIAG_KEY = "harbor.addons.seed.lastError";
const SEED_ATTEMPTS = 4;

// One pass over the seed set. Returns how many sources are still outstanding, so
// the caller can decide whether the set is done or worth another attempt.
async function seedPass(): Promise<number> {
  const have = new Set(loadInstalled().map((a) => normalizeTransportUrl(a.transportUrl)));
  let failed = 0;
  let lastError = "";
  for (const def of DEFAULT_ADDONS) {
    if (have.has(normalizeTransportUrl(def.transportUrl))) continue;
    try {
      const manifest = await fetchManifestAt(def.transportUrl);
      const next = loadInstalled().filter((a) => a.transportUrl !== def.transportUrl);
      next.push({
        id: manifest.id || def.id,
        transportUrl: def.transportUrl,
        installedAt: Date.now(),
        manifest,
      });
      saveInstalled(next);
    } catch (e) {
      failed += 1;
      lastError = `${def.id}: ${e instanceof Error ? e.message : String(e)}`;
      console.warn(`[addons] failed to seed ${def.id}`, e);
    }
  }
  // A breadcrumb, because every symptom of a failed seed looks identical from the
  // outside: no sources, no flag, nothing on screen saying why.
  try {
    if (failed > 0) localStorage.setItem(SEED_DIAG_KEY, lastError);
    else localStorage.removeItem(SEED_DIAG_KEY);
  } catch {}
  return failed;
}

export async function seedDefaultAddonsIfFirstRun(): Promise<void> {
  // Written before anything can return, so the three outcomes are distinguishable
  // from outside the app. Absent means this was never called at all; "n=0" means
  // the build carries no seed set; anything else means it ran with sources and the
  // failure is further down. Telling those apart by their symptom is impossible -
  // all three look like an empty addon list.
  try {
    localStorage.setItem(SEED_DIAG_KEY, `entered n=${DEFAULT_ADDONS.length}`);
  } catch {}
  try {
    if (DEFAULT_ADDONS.length === 0) return;
    const fingerprint = seedFingerprint();
    if (localStorage.getItem(SEEDED_KEY) === fingerprint) return;

    // Retried, not attempted once. This runs from an effect on the app's first
    // render, which on native is early enough to lose a race with the fetch
    // bridge: the very same request succeeds seconds later from a tap, so a
    // single attempt at mount failed every launch and left the app permanently
    // sourceless. Backing off and asking again costs nothing when the first
    // attempt works, which is the normal case.
    for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1200 * attempt));
      }
      const failed = await seedPass();
      if (failed === 0) {
        // Only claim the set is seeded once nothing is outstanding. Marking it
        // after a failed fetch left the app with no retry on any later launch.
        localStorage.setItem(SEEDED_KEY, fingerprint);
        return;
      }
    }

    // Every retry lost. Record the sources anyway, without manifests: the entry
    // is what makes the addon exist, and fetchInstalledAddons already hydrates a
    // manifest-less entry the first time anything asks for it - by which point
    // the app is long past startup and the fetch works. Betting the whole feature
    // on a fetch succeeding during mount is what left the app sourceless; this
    // does not care why that fetch failed.
    const have = new Set(loadInstalled().map((a) => normalizeTransportUrl(a.transportUrl)));
    const pending = DEFAULT_ADDONS.filter(
      (d) => !have.has(normalizeTransportUrl(d.transportUrl)),
    );
    if (pending.length > 0) {
      const next = loadInstalled();
      for (const def of pending) {
        next.push({ id: def.id, transportUrl: def.transportUrl, installedAt: Date.now() });
      }
      saveInstalled(next);
      window.dispatchEvent(new Event("harbor:addons-changed"));
    }
    // Deliberately NOT marked seeded: the manifests are still owed, so a later
    // launch should try to fetch them properly rather than assume this is done.
  } catch (e) {
    console.warn("[addons] seed default failed", e);
  }
}

function readAuthKey(): string | null {
  return readActiveStremioAuthKey();
}

async function pushToStremio(addon: Addon, mode: "install" | "uninstall"): Promise<boolean> {
  const authKey = readAuthKey();
  if (!authKey) return true;
  try {
    const current = await userAddons(authKey);
    const filtered = current.filter((a) => a.transportUrl !== addon.transportUrl);
    const next = mode === "install" ? [...filtered, addon] : filtered;
    return await setUserAddons(authKey, next);
  } catch {
    return false;
  }
}

export type InstalledAddon = {
  id: string;
  transportUrl: string;
  installedAt: number;
  manifest?: Addon["manifest"];
};

const SLIM_MANIFEST_KEYS = [
  "id",
  "name",
  "version",
  "description",
  "logo",
  "background",
  "types",
  "idPrefixes",
  "resources",
  "catalogs",
  "behaviorHints",
] as const;

function slimManifest(manifest: Addon["manifest"] | undefined): Addon["manifest"] | undefined {
  if (!manifest) return undefined;
  const src = manifest as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of SLIM_MANIFEST_KEYS) {
    const v = src[k];
    if (v === undefined) continue;
    if (k === "description" && typeof v === "string") {
      out[k] = v.slice(0, 400);
      continue;
    }
    if (k === "logo" && typeof v === "string" && v.startsWith("data:")) {
      continue;
    }
    if (k === "background" && typeof v === "string" && v.startsWith("data:")) {
      continue;
    }
    if (k === "catalogs" && Array.isArray(v)) {
      out[k] = (v as Array<Record<string, unknown>>).map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        extra: Array.isArray(c.extra)
          ? (c.extra as Array<Record<string, unknown>>).map((e) => ({
              name: e.name,
              isRequired: e.isRequired,
            }))
          : undefined,
      }));
      continue;
    }
    out[k] = v;
  }
  return out as Addon["manifest"];
}

export function loadInstalled(): InstalledAddon[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as InstalledAddon[];
  } catch {
    return [];
  }
}

function saveInstalled(list: InstalledAddon[]) {
  const slim = list.map((a) => ({ ...a, manifest: slimManifest(a.manifest) }));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch (e) {
    if (e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22)) {
      const stripped = list.map((a) => ({
        id: a.id,
        transportUrl: a.transportUrl,
        installedAt: a.installedAt,
      }));
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
      } catch (e2) {
        console.warn("[addons] localStorage still full after stripping manifests", e2);
      }
    } else {
      throw e;
    }
  }
}

export function reorderInstalled(urlSequence: string[]): void {
  const items = loadInstalled();
  if (items.length < 2) return;
  saveInstalled(applyOrderToItems(items, urlSequence));
}

export function loadDisabledAddons(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((u): u is string => typeof u === "string"));
  } catch {
    return new Set();
  }
}

function saveDisabledAddons(set: Set<string>): void {
  try {
    localStorage.setItem(DISABLED_KEY, JSON.stringify([...set]));
  } catch (e) {
    console.warn("[addons] couldn't persist disabled addons", e);
  }
}

export function isAddonEnabled(transportUrl: string): boolean {
  return !loadDisabledAddons().has(transportUrl);
}

export function setAddonEnabled(transportUrl: string, enabled: boolean): void {
  const set = loadDisabledAddons();
  if (enabled) set.delete(transportUrl);
  else set.add(transportUrl);
  saveDisabledAddons(set);
}

export function filterEnabled<T extends { transportUrl: string }>(items: T[]): T[] {
  const disabled = loadDisabledAddons();
  if (disabled.size === 0) return items;
  return items.filter((a) => !disabled.has(a.transportUrl));
}

export function isInstalled(id: string): boolean {
  return loadInstalled().some((a) => a.id === id);
}

export function transportUrlFor(id: string): string | null {
  return loadInstalled().find((a) => a.id === id)?.transportUrl ?? null;
}

function transportHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function findHostnameMatch(transportUrl: string): InstalledAddon | null {
  const host = transportHost(transportUrl);
  if (!host) return null;
  return loadInstalled().find((a) => transportHost(a.transportUrl) === host) ?? null;
}

export type AddonUrlParse =
  | { kind: "ok"; url: string }
  | { kind: "error"; message: string };

export function parseAddonUrl(input: string): AddonUrlParse {
  let raw = input.trim();
  if (!raw) return { kind: "error", message: "Paste a manifest URL or stremio:// link." };
  if (raw.startsWith("stremio://")) raw = "https://" + raw.slice("stremio://".length);
  raw = raw.replace(/\/#\/configure\/?$/, "");
  raw = raw.replace(/\/configure\/?$/, "");
  raw = raw.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(raw)) {
    return { kind: "error", message: "URL must start with https:// or stremio://" };
  }
  if (!/manifest\.json(\?.*)?$/i.test(raw)) {
    raw = raw + "/manifest.json";
  }
  try {
    new URL(raw);
  } catch {
    return { kind: "error", message: "That doesn't look like a valid URL." };
  }
  return { kind: "ok", url: raw };
}

function validateManifest(m: unknown): { ok: true; manifest: Addon["manifest"] } | { ok: false; error: string } {
  if (!m || typeof m !== "object") return { ok: false, error: "Manifest is not a JSON object." };
  const obj = m as Record<string, unknown>;
  if (typeof obj.id !== "string" || obj.id.length === 0) return { ok: false, error: "Manifest is missing an `id`." };
  if (typeof obj.name !== "string" || obj.name.length === 0) return { ok: false, error: "Manifest is missing a `name`." };
  return { ok: true, manifest: obj as Addon["manifest"] };
}

export async function fetchManifestAt(transportUrl: string): Promise<Addon["manifest"]> {
  const res = await fetch(transportUrl, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Manifest fetch failed (HTTP ${res.status}). Check the URL.`);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error("Response wasn't valid JSON. The URL may not be a Stremio manifest.");
  }
  const v = validateManifest(json);
  if (!v.ok) throw new Error(v.error);
  return v.manifest;
}

export type InstallResult = {
  addon: Addon;
  syncedToStremio: boolean;
  replaced: boolean;
};

export async function installAddon(id: string, transportUrl: string): Promise<Addon> {
  const manifest = await fetchManifestAt(transportUrl);
  const canonicalId = manifest.id || id;
  const next = loadInstalled().filter((a) => a.transportUrl !== transportUrl);
  next.push({ id: canonicalId, transportUrl, installedAt: Date.now(), manifest });
  saveInstalled(next);
  const addon: Addon = { manifest, transportUrl };
  await pushToStremio(addon, "install");
  return addon;
}

export async function installFromUrl(
  rawUrl: string,
  options: { replaceId?: string } = {},
): Promise<InstallResult> {
  const parsed = parseAddonUrl(rawUrl);
  if (parsed.kind === "error") throw new Error(parsed.message);
  const manifest = await fetchManifestAt(parsed.url);
  const id = manifest.id;
  const before = loadInstalled();
  const replaceId = options.replaceId && options.replaceId !== id ? options.replaceId : null;
  const replacedById = before.some((a) => a.id === id);
  const replacedByOld = replaceId != null && before.some((a) => a.id === replaceId);
  const next = before.filter((a) => a.transportUrl !== parsed.url && (!replaceId || a.id !== replaceId));
  next.push({ id, transportUrl: parsed.url, installedAt: Date.now(), manifest });
  saveInstalled(next);
  const addon: Addon = { manifest, transportUrl: parsed.url };
  const syncedToStremio = await pushToStremio(addon, "install");
  if (replaceId && replaceId !== id) {
    const authKey = readAuthKey();
    if (authKey) {
      try {
        const current = await userAddons(authKey);
        const trimmed = current.filter((a) => a.manifest.id !== replaceId);
        if (trimmed.length !== current.length) {
          await setUserAddons(authKey, trimmed);
        }
      } catch {
        /* noop */
      }
    }
  }
  notifyAddonsChanged({ id: addon.manifest.id, installed: true });
  return { addon, syncedToStremio, replaced: replacedById || replacedByOld };
}

// Home rows, search and the addon store all refresh off this event. Desktop
// views fire it themselves after calling in here; mobile surfaces did not, so an
// install looked like it had silently failed until the next launch. Emitting from
// the store covers every caller (a duplicate event just refreshes twice).
function notifyAddonsChanged(detail: { id: string; installed: boolean }): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("harbor:addons-changed", { detail }));
}

export async function uninstallAddon(id: string, transportUrl?: string): Promise<void> {
  const removed = transportUrl
    ? loadInstalled().filter((a) => a.transportUrl === transportUrl)
    : loadInstalled().filter((a) => a.id === id);
  const next = transportUrl
    ? loadInstalled().filter((a) => a.transportUrl !== transportUrl)
    : loadInstalled().filter((a) => a.id !== id);
  saveInstalled(next);
  if (removed.length > 0) {
    const disabled = loadDisabledAddons();
    let touched = false;
    for (const a of removed) if (disabled.delete(a.transportUrl)) touched = true;
    if (touched) saveDisabledAddons(disabled);
  }
  // Fire before the Stremio sync below so the UI updates even when signed out.
  notifyAddonsChanged({ id, installed: false });
  const authKey = readAuthKey();
  if (!authKey) return;
  const current = await userAddons(authKey).catch(() => [] as Addon[]);
  const filtered = transportUrl
    ? current.filter((a) => a.transportUrl !== transportUrl)
    : current.filter((a) => a.manifest.id !== id);
  if (filtered.length !== current.length) {
    await setUserAddons(authKey, filtered).catch(() => {});
  }
}

export async function fetchInstalledAddons(): Promise<Addon[]> {
  const list = loadInstalled();
  if (list.length === 0) return [];
  const tasks = list.map(async (entry): Promise<Addon | null> => {
    if (entry.manifest) {
      return { manifest: entry.manifest, transportUrl: entry.transportUrl };
    }
    try {
      const manifest = await fetchManifestAt(entry.transportUrl);
      const updated = loadInstalled().map((e) =>
        e.id === entry.id ? { ...e, manifest } : e,
      );
      saveInstalled(updated);
      return { manifest, transportUrl: entry.transportUrl };
    } catch {
      return null;
    }
  });
  const results = await Promise.all(tasks);
  return results.filter((a): a is Addon => a !== null);
}

export function manifestToConfigureUrl(transportUrl: string): string {
  return transportUrl.replace(/manifest\.json(\?.*)?$/i, "configure");
}

export function manifestToShareUrl(transportUrl: string, scheme: "https" | "stremio" = "https"): string {
  if (scheme === "stremio") {
    return transportUrl.replace(/^https?:\/\//i, "stremio://");
  }
  return transportUrl;
}

export function cometConfigFor(debridService: string, apiKey: string): string {
  const settings = {
    maxResultsPerResolution: 0,
    maxSize: 0,
    cachedOnly: false,
    sortCachedUncachedTogether: false,
    removeTrash: true,
    resultFormat: ["all"],
    debridServices: [{ service: debridService, apiKey: apiKey.trim() }],
    enableTorrent: true,
    deduplicateStreams: true,
    scrapeDebridAccountTorrents: false,
    debridStreamProxyPassword: "",
    languages: { required: [], allowed: [], exclude: [], preferred: [] },
    resolutions: {},
    options: {
      remove_ranks_under: -10000000000,
      allow_english_in_languages: false,
      remove_unknown_languages: false,
    },
  };
  return btoa(JSON.stringify(settings));
}

export function cometUrlFor(debridService: string, apiKey: string): string {
  const b64 = cometConfigFor(debridService, apiKey);
  return `https://comet.elfhosted.com/${b64}/manifest.json`;
}

export const COMET_ID = "comet.elfhosted.com";

export function cometKeyFromUrl(transportUrl: string): { service: string; apiKey: string } | null {
  const m = transportUrl.match(/comet\.elfhosted\.com\/([^/]+)\/manifest\.json/);
  if (!m) return null;
  try {
    const json = JSON.parse(atob(m[1]));
    const svc = json?.debridServices?.[0];
    if (!svc?.service || !svc?.apiKey) return null;
    return { service: svc.service, apiKey: svc.apiKey };
  } catch {
    return null;
  }
}
