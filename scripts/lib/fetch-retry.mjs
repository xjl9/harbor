// One unlucky response should not fail a build before anything is compiled.
// A 429 from a font host took out an iOS CI run, and every setup script here
// pulls large artifacts from third parties, so they all want the same handling:
// rate limits, gateway errors and dropped connections are the failures that
// pass on their own a moment later.
//
// Deliberately not retried: anything that will fail again the same way. A 404
// means the pinned URL is wrong, a 401/403 means credentials, and a checksum
// mismatch is the caller's business. Those stop immediately so the message
// stays useful.
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * fetch with bounded retries on transient failures.
 * Resolves with the Response on success, or the last non-ok Response, so
 * callers keep their own status handling and error text.
 */
export async function fetchWithRetry(url, init = {}, { attempts = 4, label = "" } = {}) {
  const tag = label ? `${label} ` : "";
  let res = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      res = await fetch(url, init);
      if (res.ok || !TRANSIENT.has(res.status)) return res;
      console.warn(`[fetch] ${tag}${res.status}, attempt ${attempt} of ${attempts}`);
    } catch (err) {
      console.warn(`[fetch] ${tag}network error (${err.message}), attempt ${attempt} of ${attempts}`);
      res = null;
    }
    // Widening gap rather than a fixed one: a rate limit window is usually
    // seconds, and four quick retries would just spend the budget instantly.
    if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  if (res) return res;
  throw new Error(`${tag}download failed after ${attempts} attempts (network error)`);
}
