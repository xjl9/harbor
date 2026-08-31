import type { SubCue } from "@/lib/subtitles/parser";
import type { SubtitleLoadMetadata } from "@/lib/subtitles/types";

export type TrackInfo = {
  id: string;
  label: string;
  lang?: string;
  kind: "audio" | "subtitle";
  selected: boolean;
  codec?: string;
  channels?: string;
  channelCount?: number;
  title?: string;
  external?: boolean;
  externalFilename?: string;
  forced?: boolean;
  default?: boolean;
  hearingImpaired?: boolean;
  secondary?: boolean;
  url?: string;
  release?: string;
  provider?: string;
  matchScore?: number;
  subId?: string;
};

export type Chapter = {
  title: string;
  startSec: number;
};

export type PlayerStatus = "idle" | "loading" | "ready" | "playing" | "paused" | "ended" | "error";

export type PlayerSnapshot = {
  status: PlayerStatus;
  positionSec: number;
  durationSec: number;
  bufferedSec: number;
  buffering: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  audioTracks: TrackInfo[];
  subtitleTracks: TrackInfo[];
  chapters: Chapter[];
  subDelaySec: number;
  audioDelaySec: number;
  subText: string;
  subStartSec: number;
  secondarySubText: string;
  audioNormalize: boolean;
  videoWidth: number;
  videoHeight: number;
  hdrGamma: string;
  errorMessage: string | null;
  errorCode: "decode" | "codec" | "network" | "source" | "unknown" | null;
  noAudio?: boolean;
  // Native mobile only: set once when the player surface (Android Activity or
  // iOS view controller) is torn down for good (back out / finish). The React
  // player view watches this to pop back to detail instead of lingering as an
  // empty webview under the closed surface.
  nativeClosed?: boolean;
};

export type PlayerSource = {
  url: string;
  subtitles?: { id?: string; url: string; lang?: string; m?: string }[];
  notWebReady?: boolean;
  startAtSec?: number;
  isLive?: boolean;
  headers?: Record<string, string>;
};

export type PlayerBridge = {
  attach: (host: HTMLElement) => void;
  detach: () => void;
  load: (src: PlayerSource) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  seek: (sec: number) => void;
  frameStep?: (dir: 1 | -1) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setRate: (r: number) => void;
  setAudioTrack: (id: string) => void;
  setSubtitleTrack: (id: string | null) => void;
  setSecondarySubtitleTrack: (id: string | null) => void;
  setSubVisible: (on: boolean) => void;
  setSubDelay: (sec: number) => void;
  setAudioDelay: (sec: number) => void;
  setPanscan: (value: number) => void;
  setVideoZoom: (log2: number) => void;
  setAspectOverride: (ratio: string) => void;
  setStretch: (on: boolean) => void;
  setVideoEq: (name: string, value: number) => void;
  setAnime4kShaders: (shaders: string[]) => void;
  setShaderProps?: (props: Record<string, string>) => void;
  addSubtitle: (
    url: string,
    lang?: string,
    title?: string,
    select?: boolean,
    metadata?: SubtitleLoadMetadata,
  ) => Promise<boolean>;
  getSelectedTrackCues: () => SubCue[] | null;
  getSelectedTrackUrl: () => string | null;
  setAudioNormalize: (on: boolean) => void;
  setAudioProfile?: (profile: string) => void;
  setHdrToSdr?: (on: boolean, oled: boolean) => void;
  setAudioDevice?: (name: string) => void;
  setMediaInfo?: (info: { title: string; artist?: string; artwork?: string }) => void;
  screenshot: (path: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  setAbLoop: (a: number | null, b: number | null) => void;
  requestPiP: () => Promise<void>;
  exitPiP: () => Promise<void>;
  requestFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  capabilities: () => PlayerCapabilities;
  subscribe: (listener: (snap: PlayerSnapshot) => void) => () => void;
  destroy: () => void;
};

export type PlayerCapabilities = {
  engine: "html5" | "mpv" | "native";
  pictureInPicture: boolean;
  airplay: boolean;
  chromecast: boolean;
  hdrPassthrough: boolean;
  hardwareDecode: boolean;
  // Feature flags the shells read to hide controls an engine cannot honor.
  // Optional so the desktop bridges stay untouched; a missing flag means
  // supported (see capabilityFlags).
  rate?: boolean;
  volume?: boolean;
  subDelay?: boolean;
  audioDelay?: boolean;
  addSubtitle?: boolean;
  subStyle?: boolean;
  subSync?: boolean;
};

export type PlayerCapabilityFlags = Required<
  Pick<PlayerCapabilities, "rate" | "volume" | "subDelay" | "audioDelay" | "addSubtitle" | "subStyle" | "subSync">
>;

// Resolves the optional feature flags, defaulting every unset one to true so
// mpv/html5 bridges that predate the flags keep their full control set.
export function capabilityFlags(caps?: PlayerCapabilities): PlayerCapabilityFlags {
  return {
    rate: caps?.rate ?? true,
    volume: caps?.volume ?? true,
    subDelay: caps?.subDelay ?? true,
    audioDelay: caps?.audioDelay ?? true,
    addSubtitle: caps?.addSubtitle ?? true,
    subStyle: caps?.subStyle ?? true,
    subSync: caps?.subSync ?? true,
  };
}

export const emptySnapshot: PlayerSnapshot = {
  status: "idle",
  positionSec: 0,
  durationSec: 0,
  bufferedSec: 0,
  buffering: false,
  volume: 1,
  muted: false,
  rate: 1,
  audioTracks: [],
  subtitleTracks: [],
  chapters: [],
  subDelaySec: 0,
  audioDelaySec: 0,
  subText: "",
  subStartSec: 0,
  secondarySubText: "",
  audioNormalize: false,
  videoWidth: 0,
  videoHeight: 0,
  hdrGamma: "",
  errorMessage: null,
  errorCode: null,
};
