import { invoke } from "@tauri-apps/api/core";
import { isMobileNative } from "@/lib/platform";

export type OrientationLock = "landscape" | "portrait" | "auto";

let pendingRestore: ReturnType<typeof setTimeout> | null = null;

/**
 * Forces device orientation on native mobile builds. "landscape" locks the play
 * flow (connecting screen through playback) the way every streaming app does;
 * "auto" restores free rotation on exit. No-op on desktop/web. Drives both iOS
 * and Android through tauri-plugin-harbor-player.
 *
 * The connecting screen and the player are separate nav frames, so committing to
 * a stream unmounts the first (which restores) and mounts the second (which
 * re-locks) back to back. Deferring the "auto" restore one frame lets an
 * immediately following "landscape" cancel it, so that handoff never flashes
 * portrait; a genuine exit has no follow-up lock and the restore lands.
 */
export async function setOrientation(mode: OrientationLock): Promise<void> {
  if (!isMobileNative()) return;
  if (pendingRestore) {
    clearTimeout(pendingRestore);
    pendingRestore = null;
  }
  if (mode === "auto") {
    pendingRestore = setTimeout(() => {
      pendingRestore = null;
      void invoke("plugin:harbor-player|set_orientation", { payload: { mode: "auto" } }).catch(() => {});
    }, 260);
    return;
  }
  await invoke("plugin:harbor-player|set_orientation", { payload: { mode } }).catch(() => {});
}
