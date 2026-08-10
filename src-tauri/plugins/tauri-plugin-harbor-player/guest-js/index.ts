import { invoke, Channel } from "@tauri-apps/api/core";

export type NativeSubtitle = { url: string; lang?: string; label?: string };

export type NativeLoadRequest = {
  url: string;
  headers?: Record<string, string>;
  subtitles?: NativeSubtitle[];
  startAtSec?: number;
  title?: string;
};

export type NativePlayerEvent =
  | { event: "tick"; positionSec: number; durationSec: number; bufferedSec: number; playing: boolean }
  | { event: "state"; status: "loading" | "ready" | "ended" | "error"; errorCode?: string }
  | { event: "closed"; positionSec: number; durationSec: number };

export async function load(req: NativeLoadRequest, channel: Channel<NativePlayerEvent>): Promise<void> {
  await invoke("plugin:harbor-player|load", { payload: req, channel });
}
export async function play(): Promise<void> {
  await invoke("plugin:harbor-player|play");
}
export async function pause(): Promise<void> {
  await invoke("plugin:harbor-player|pause");
}
export async function seek(positionSec: number): Promise<void> {
  await invoke("plugin:harbor-player|seek", { payload: { positionSec } });
}
export async function stop(): Promise<void> {
  await invoke("plugin:harbor-player|stop");
}
