import { useEffect, useRef } from "react";

/**
 * Native mobile only. The player runs in a separate Android Activity layered on
 * top of the webview; the webview PlayerView stays mounted underneath purely to
 * drive the bridge (load/play) and mirror position for resume + scrobble. When
 * that Activity is torn down for good (user backs out / finishes), the native
 * bridge flags snap.nativeClosed. Pop the now-empty webview player view back to
 * the detail page so it does not linger under the closed native surface.
 *
 * Stream swaps (auto-retry, live reload, next episode) reuse the singleTask
 * Activity via onNewIntent and deliberately do NOT emit a native "closed" event,
 * so ordinary playback transitions never trigger this and auto-next / auto-retry
 * are unaffected.
 */
export function useNativeClose(params: {
  engine: "html5" | "mpv" | "native";
  nativeClosed: boolean | undefined;
  srcUrl: string;
  closePlayer: () => void | Promise<void>;
}) {
  const { engine, nativeClosed, srcUrl, closePlayer } = params;
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [srcUrl]);

  useEffect(() => {
    if (engine !== "native") return;
    if (!nativeClosed) return;
    if (firedRef.current) return;
    firedRef.current = true;
    void closePlayer();
  }, [engine, nativeClosed, srcUrl, closePlayer]);
}
