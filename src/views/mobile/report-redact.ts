import type { Diagnostics } from "@/lib/bug-report";

/**
 * Boundary scrubber for the mobile problem report.
 *
 * collectDiagnostics() captures window.onerror and unhandledrejection text
 * verbatim, and those messages routinely carry the exact things a report must
 * never leave the device with: addon transport URLs with the debrid key baked
 * into the path, stream URLs, `?api_key=` query strings, bearer tokens and
 * on-device file paths. Everything leaving the mobile path is rewritten here
 * rather than trusting the collector to have stayed clean.
 */

const URL_RE = /[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi;
const WIN_PATH_RE = /[A-Za-z]:\\[^\s"'<>)]*/g;
const UNIX_PATH_RE = /\/(?:Users|home|var|private|data|storage|mnt|root)\/[^\s"'<>),]*/g;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// The leading [A-Za-z_-]* lets prefixed names through too (rdKey=, tmdbKey=).
const PAIR_RE =
  /\b([A-Za-z_-]*(?:api[_-]?key|key|token|secret|password|passwd|session|signature|authorization|auth))\s*[=:]\s*"?([^\s&"',;)]+)"?/gi;
// A media or subtitle filename names something out of the user's library.
const FILE_RE =
  /[^\s/\\"']*\.(?:mkv|mp4|m4v|avi|mov|webm|ts|m2ts|flac|mp3|srt|ass|ssa|sub|vtt|m3u|m3u8|strm|torrent)\b/gi;
// Long unbroken alphanumeric runs are keys, tokens or hashes far more often
// than they are words. Greedy match needs no boundaries, which keeps this off
// lookbehind (unsupported on older iOS WebKit).
const TOKEN_RE = /[A-Za-z0-9_-]{24,}/g;
const TOKEN_TEST = /[A-Za-z0-9_-]{24,}/;
// Bundle file name, optionally with the :line:col a stack trace appends.
const ASSET_RE = /^([\w.-]+\.(?:js|mjs|cjs|css|html|tsx|ts))(?::\d+)*$/;

const MAX_MESSAGE = 300;

function safeUrl(raw: string): string {
  let host = "";
  let scheme = "";
  let asset = "";
  try {
    const u = new URL(raw);
    scheme = u.protocol;
    // Userinfo (user:pass@host) never survives; a host label long enough to be
    // a key is dropped too, since some services put the key in a subdomain.
    host = TOKEN_TEST.test(u.hostname) ? "host" : u.hostname;
    const last = ASSET_RE.exec(u.pathname.split("/").pop() || "");
    if (last) asset = `/${last[1]}`;
  } catch {
    return "<url>";
  }
  return `<url ${scheme}//${host}${asset}>`;
}

/**
 * Strips URLs, paths, emails, key/value pairs and token-shaped runs.
 *
 * `max` defaults to the short cap that suits a captured error line. Pass the
 * field's own limit for text the user wrote, otherwise a real set of repro steps
 * is cut off mid-sentence without the reporter ever seeing it.
 */
export function scrubText(input: string, max = MAX_MESSAGE): string {
  const out = input
    .replace(URL_RE, (m) => safeUrl(m))
    .replace(WIN_PATH_RE, "<path>")
    .replace(UNIX_PATH_RE, "<path>")
    .replace(FILE_RE, "<file>")
    .replace(EMAIL_RE, "<email>")
    .replace(PAIR_RE, (_m, name: string) => `${name}=<redacted>`)
    .replace(TOKEN_RE, "<redacted>");
  return out.length > max ? `${out.slice(0, max)}…` : out;
}

const OS_LABEL: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
};

/**
 * The collector's user-agent fallback reads an iPhone as macOS ("like Mac OS
 * X"), which only happens when the OS plugin is unavailable. Correct it from
 * the user agent so beta reports name the real platform.
 */
function normalizeOs(diag: Diagnostics): string {
  const key = diag.os.trim().toLowerCase();
  if (/iphone|ipad|ipod/i.test(diag.ua) && key !== "ios") return "iOS";
  if (/android/i.test(diag.ua) && key !== "android") return "Android";
  return OS_LABEL[key] ?? diag.os;
}

/** Everything transmitted from the mobile path passes through here first. */
export function sanitizeDiagnostics(diag: Diagnostics): Diagnostics {
  return {
    ...diag,
    os: normalizeOs(diag),
    // Model and OS build only. No serial, no identifier, no account data.
    ua: scrubText(diag.ua),
    flags: { ...diag.flags },
    recentErrors: diag.recentErrors.map((e) => ({
      ts: e.ts,
      msg: scrubText(e.msg),
      src: e.src,
    })),
  };
}
