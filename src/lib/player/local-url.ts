export function isLocalUrl(url: string): boolean {
  if (!url) return false;
  if (/^file:\/\//i.test(url)) return true;
  if (/^[a-z]:[\\/]/i.test(url)) return true;
  if (url.startsWith("\\\\")) return true;
  if (url.startsWith("/")) return true;
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(url)) return false;
  if (/^[a-z][a-z0-9+.-]+:[^\\/]/i.test(url)) return false;
  return false;
}

// The native players take a URL, and a bare absolute path is not one:
// AVFoundation reads it as a relative reference and refuses to open a saved
// download. Only POSIX absolute paths are rewritten (a phone never sees a drive
// letter), and each segment is encoded on its own so a '#' or '?' in a file name
// stays part of the name instead of becoming a fragment or a query.
export function toNativeFileUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
}
