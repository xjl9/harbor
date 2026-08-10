import { invoke, addPluginListener, type PluginListener } from "@tauri-apps/api/core";

export type NativeSubtitle = { url: string; lang?: string; label?: string };

export type NativeLoadRequest = {
  url: string;
  headers?: Record<string, string>;
  subtitles?: NativeSubtitle[];
  startAtSec?: number;
  title?: string;
};

export type NativeTick = {
  positionSec: number;
  durationSec: number;
  bufferedSec: number;
  playing: boolean;
};
export type NativeState = { status: "loading" | "ready" | "ended" | "error"; errorCode?: string };
export type NativeClosed = { positionSec: number; durationSec: number };

export async function load(req: NativeLoadRequest): Promise<void> {
  await invoke("plugin:harbor-player|load", { payload: req });
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

export function onTick(cb: (t: NativeTick) => void): Promise<PluginListener> {
  return addPluginListener("harbor-player", "tick", cb);
}
export function onState(cb: (s: NativeState) => void): Promise<PluginListener> {
  return addPluginListener("harbor-player", "state", cb);
}
export function onClosed(cb: (c: NativeClosed) => void): Promise<PluginListener> {
  return addPluginListener("harbor-player", "closed", cb);
}
