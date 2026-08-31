import { invoke, addPluginListener, type PluginListener } from "@tauri-apps/api/core";

export type NativeSubtitle = { url: string; lang?: string; label?: string };

export type NativeLoadRequest = {
  url: string;
  headers?: Record<string, string>;
  subtitles?: NativeSubtitle[];
  startAtSec?: number;
  title?: string;
  canNext?: boolean;
  /** iOS: native video behind a transparent web view, JS draws all controls. */
  webChrome?: boolean;
};

export type NativeTick = {
  positionSec: number;
  durationSec: number;
  bufferedSec: number;
  playing: boolean;
  /** Configured playback rate (not zeroed while paused). */
  rate: number;
};
export type NativeState = {
  status: "loading" | "ready" | "ended" | "error";
  errorCode?: string;
  /** iOS engine that emitted the state; absent on Android. */
  engine?: "mpv" | "av";
};
export type NativeHaptic = "light" | "medium" | "heavy" | "select";
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
export async function setRate(rate: number): Promise<void> {
  await invoke("plugin:harbor-player|set_rate", { payload: { rate } });
}
export async function setVolume(volume: number): Promise<void> {
  await invoke("plugin:harbor-player|set_volume", { payload: { volume } });
}
export async function setSubDelay(seconds: number): Promise<void> {
  await invoke("plugin:harbor-player|set_sub_delay", { payload: { seconds } });
}
export async function setAudioDelay(seconds: number): Promise<void> {
  await invoke("plugin:harbor-player|set_audio_delay", { payload: { seconds } });
}
export async function showRoutePicker(): Promise<void> {
  await invoke("plugin:harbor-player|show_route_picker");
}
export async function haptic(kind: NativeHaptic): Promise<void> {
  await invoke("plugin:harbor-player|haptic", { payload: { kind } });
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
