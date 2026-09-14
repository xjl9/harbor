import { invoke } from "@tauri-apps/api/core";
import { isPlayerInteractionLocked } from "@/lib/player/interaction-lock";

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let lastState = "";
let lastActionAt = 0;
let lastPositionSec: number | null = null;
let lastPositionAt = 0;
let lastPlaying = false;

export function mediaKeyGate(): boolean {
  if (isPlayerInteractionLocked()) return false;
  const now = Date.now();
  if (now - lastActionAt < 350) return false;
  lastActionAt = now;
  return true;
}

export function updateMediaControls(
  playing: boolean,
  title: string,
  subtitle: string,
  artUrl?: string | null,
  durationSec?: number | null,
  positionSec?: number | null,
  volume?: number | null,
): void {
  if (!isTauri()) return;
  const art = artUrl ?? null;
  const dur =
    typeof durationSec === "number" && Number.isFinite(durationSec) && durationSec > 0
      ? Math.round(durationSec)
      : null;
  const vol =
    typeof volume === "number" && Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : null;
  const volKey = vol != null ? Math.round(vol * 100) : "";
  const pos =
    typeof positionSec === "number" && Number.isFinite(positionSec) && positionSec >= 0
      ? positionSec
      : null;

  const now = Date.now();
  const state = `${playing ? 1 : 0}|${title}|${subtitle}|${art ?? ""}|${dur ?? 0}|${volKey}`;
  const metadataChanged = state !== lastState;

  let positionDrift = false;
  if (pos != null) {
    if (lastPositionSec == null || playing !== lastPlaying) {
      positionDrift = true;
    } else if (playing) {
      const elapsed = (now - lastPositionAt) / 1000;
      const expected = lastPositionSec + elapsed;
      if (Math.abs(pos - expected) > 1.2) {
        positionDrift = true;
      }
    } else {
      if (Math.abs(pos - lastPositionSec) > 0.5) {
        positionDrift = true;
      }
    }
  }

  if (!metadataChanged && !positionDrift) return;

  lastState = state;
  lastPlaying = playing;
  if (pos != null) {
    lastPositionSec = pos;
    lastPositionAt = now;
  }

  invoke("media_controls_update", {
    playing,
    title,
    subtitle,
    artUrl: art,
    durationSec: dur,
    positionSec: pos,
    volume: vol,
  }).catch(() => {});
}

export function notifyMediaSeeked(positionSec: number): void {
  if (!isTauri() || !Number.isFinite(positionSec)) return;
  lastPositionSec = Math.max(0, positionSec);
  lastPositionAt = Date.now();
  invoke("media_controls_seeked", { positionSec }).catch(() => {});
}

export function clearMediaControls(): void {
  if (!isTauri()) return;
  lastState = "";
  lastPositionSec = null;
  lastPositionAt = 0;
  lastPlaying = false;
  invoke("media_controls_clear").catch(() => {});
}
