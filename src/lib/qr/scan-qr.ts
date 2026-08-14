import { isMobileNative } from "@/lib/platform";

// Native camera QR scanning via the Tauri barcode-scanner plugin (AVFoundation
// on iOS, MLKit on Android). Kept behind this helper so the rest of the app
// never imports the native plugin directly: web and desktop builds have no
// scanner and callers fall back to pasting a code. The plugin module is loaded
// dynamically for the same reason — it must not be pulled into a non-mobile bundle.

export function canScanQr(): boolean {
  return isMobileNative();
}

/**
 * Opens the native camera scanner and resolves with the decoded QR text, or
 * null if scanning is unavailable, denied, or cancelled. Never throws, so the
 * caller can always offer the paste path as a fallback.
 */
export async function scanQr(): Promise<string | null> {
  if (!isMobileNative()) return null;
  try {
    const { scan, Format, cancel } = await import("@tauri-apps/plugin-barcode-scanner");
    const result = await scan({ formats: [Format.QRCode] });
    // Tear the camera session down whether or not a code was found.
    try {
      await cancel();
    } catch {
      // Already stopped; nothing to clean up.
    }
    const content = result?.content;
    return typeof content === "string" && content.length > 0 ? content : null;
  } catch {
    // Permission denied, user cancel, or the plugin is unavailable.
    return null;
  }
}
