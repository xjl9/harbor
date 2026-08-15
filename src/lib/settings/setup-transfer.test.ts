/**
 * Round-trip + shape tests for the portable setup-transfer bundle. The repo has
 * no test runner wired, so these follow the existing type-verification pattern
 * (tsc-checked); each case is also runnable under `node --experimental-strip-types`
 * by calling runSetupTransferTests(). Pure functions only - no DOM required.
 */
import {
  buildSetupBundle,
  bundleToSettingsPatch,
  decodeBundle,
  encodeBundle,
  isConfiguredAddonUrl,
  summarizeBundle,
  type SetupBundle,
} from "./setup-transfer";
import type { Settings } from "./types";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`setup-transfer test failed: ${msg}`);
}

// Minimal settings stub: only the key fields the bundle reads matter, so a
// partial cast keeps the fixture readable without the full Settings surface.
const fixture = {
  tmdbKey: "TMDB",
  tvdbKey: "",
  rpdbKey: "RP",
  omdbKey: "",
  fanartKey: "",
  mdblistKey: "MDB",
  opensubtitlesApiKey: "OS",
  jimakuToken: "",
  subdlApiKey: "",
  subsourceApiKey: "",
  rdKey: "REAL-DEBRID",
  tbKey: "",
  adKey: "",
  pmKey: "",
  dlKey: "",
} as unknown as Settings;

const addonUrls = [
  "https://a.example/manifest.json",
  "https://b.example/manifest.json",
  "https://a.example/manifest.json",
];

export function runSetupTransferTests(): void {
  // Public bundle: dedupes addons, carries metadata + subtitles, omits debrid.
  const pub = buildSetupBundle(fixture, addonUrls, { includeSensitive: false });
  assert(pub.addons.length === 2, "addons deduped");
  assert(pub.keys.debrid === undefined, "public omits debrid");
  assert(pub.keys.metadata?.tmdbKey === "TMDB", "metadata carried");
  assert(!("tvdbKey" in (pub.keys.metadata ?? {})), "empty key skipped");
  assert(
    pub.keys.subtitles?.opensubtitlesApiKey === "OS",
    "subtitle key carried",
  );

  // Sensitive bundle round-trips through the URL-safe code exactly.
  const sens = buildSetupBundle(fixture, addonUrls, { includeSensitive: true });
  assert(
    sens.keys.debrid?.rdKey === "REAL-DEBRID",
    "sensitive includes debrid",
  );
  const code = encodeBundle(sens);
  assert(!/[+/=]/.test(code), "code is url-safe");
  const back = decodeBundle(code);
  assert(
    JSON.stringify(back) === JSON.stringify(sens),
    "encode/decode round-trips",
  );

  // Summary reflects contents.
  const sum = summarizeBundle(sens);
  assert(
    sum.addonCount === 2 && sum.hasSensitive,
    "summary counts + sensitivity",
  );
  assert(
    sum.keyCategories.join(",") === "metadata,subtitles,debrid",
    "summary categories",
  );

  // Tolerant decode: junk, empty, and unknown-version all yield null.
  assert(decodeBundle("not-a-code!!") === null, "garbage rejected");
  assert(decodeBundle("") === null, "empty rejected");
  const futureCode = encodeBundle({
    v: 99 as unknown as 1,
    addons: [],
    keys: {},
  } as SetupBundle);
  assert(decodeBundle(futureCode) === null, "future version rejected");

  // Merge fills only empty fields; replace overwrites.
  const current = { tmdbKey: "KEEP", rpdbKey: "" } as unknown as Settings;
  const merge = bundleToSettingsPatch(sens, current, "merge");
  assert(!("tmdbKey" in merge), "merge keeps existing");
  assert(
    (merge as Record<string, string>).rpdbKey === "RP",
    "merge fills empty",
  );
  const replace = bundleToSettingsPatch(sens, current, "replace");
  assert(
    (replace as Record<string, string>).tmdbKey === "TMDB",
    "replace overwrites",
  );

  // Configured addon URLs embed credentials in the path and must stay out of a
  // public export; a bare public addon is safe to share.
  const configured = "https://torrentio.strem.fun/realdebrid=SECRET/manifest.json";
  const bare = "https://a.example/manifest.json";
  assert(isConfiguredAddonUrl(configured), "configured url detected");
  assert(!isConfiguredAddonUrl(bare), "bare url not configured");
  // Config can also travel in the query string or basic-auth userinfo.
  assert(
    isConfiguredAddonUrl("https://addon.example/manifest.json?apiKey=SECRET"),
    "query-config url detected",
  );
  assert(
    isConfiguredAddonUrl("https://user:pass@addon.example/manifest.json"),
    "userinfo url detected",
  );
  const mixed = [bare, configured];
  const pubMixed = buildSetupBundle(fixture, mixed, { includeSensitive: false });
  assert(
    pubMixed.addons.length === 1 && pubMixed.addons[0] === bare,
    "public export withholds configured addons",
  );
  const sensMixed = buildSetupBundle(fixture, mixed, { includeSensitive: true });
  assert(sensMixed.addons.length === 2, "sensitive export includes configured addons");
}
