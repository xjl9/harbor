import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, WifiOff } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { isMobileNative } from "@/lib/platform";
import type { RemoteCommand, RemoteSnapshot } from "@/lib/remote/protocol";
import { useRemoteClient } from "@/lib/remote/use-remote-client";
import { useSettings } from "@/lib/settings";
import { useView, type PlayEpisode } from "@/lib/view";

type PlayOpts = {
  season?: number;
  episode?: number;
  resume?: boolean;
  // Full episode descriptor for anime/series that need the rich stream ids
  // (kitsuStreamId, imdbId, tvdbEpisodeId, sourceMetaId, ...). Used on native
  // local playback; the web remote falls back to season/episode.
  playEpisode?: PlayEpisode;
};

type MobileRemoteValue = {
  connected: boolean;
  snapshot: RemoteSnapshot;
  playOnHost: (meta: Meta, opts?: PlayOpts) => void;
  openOnHost: (meta: Meta) => void;
  // Explicit "send to my connected computer" actions (host-targeted, flash on send).
  sendToHost: (meta: Meta) => void;
  castPlay: (meta: Meta, opts?: PlayOpts) => void;
  sendCommand: (command: RemoteCommand) => boolean;
};

const Ctx = createContext<MobileRemoteValue | null>(null);

export function MobileRemoteProvider({ children }: { children: ReactNode }) {
  const { settings, update } = useSettings();
  // Web remote is served BY the desktop, so its host is implied. A native build
  // has no implied host — connect only to an explicitly configured one.
  const native = isMobileNative();
  const configuredHost = (settings.remoteHostAddress ?? "").trim();
  const { status, snapshot, sendCommand } = useRemoteClient(
    native ? configuredHost || undefined : undefined,
    { enabled: !native || configuredHost !== "" },
  );
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<number>(0);

  useEffect(() => {
    const nextTmdb = snapshot.tmdbKey ?? "";
    const nextRpdb = snapshot.rpdbKey ?? "";
    const nextTvdb = snapshot.tvdbKey ?? "";
    const patch: Parameters<typeof update>[0] = {};
    if (nextTmdb && nextTmdb !== settings.tmdbKey) patch.tmdbKey = nextTmdb;
    if (nextRpdb && nextRpdb !== settings.rpdbKey) patch.rpdbKey = nextRpdb;
    if (nextTvdb && nextTvdb !== settings.tvdbKey) patch.tvdbKey = nextTvdb;
    if (snapshot.tmdbLanguage !== undefined && snapshot.tmdbLanguage !== settings.tmdbLanguage)
      patch.tmdbLanguage = snapshot.tmdbLanguage;
    if (
      snapshot.tmdbImageLangs !== undefined &&
      snapshot.tmdbImageLangs.join("\0") !== settings.tmdbImageLangs.join("\0")
    )
      patch.tmdbImageLangs = snapshot.tmdbImageLangs;
    if (
      snapshot.translateTitles !== undefined &&
      snapshot.translateTitles !== settings.translateTitles
    )
      patch.translateTitles = snapshot.translateTitles;
    if (
      snapshot.translateDescriptions !== undefined &&
      snapshot.translateDescriptions !== settings.translateDescriptions
    )
      patch.translateDescriptions = snapshot.translateDescriptions;
    if (Object.keys(patch).length > 0) update(patch);
  }, [
    snapshot.tmdbKey,
    snapshot.rpdbKey,
    snapshot.tvdbKey,
    snapshot.tmdbLanguage,
    snapshot.tmdbImageLangs,
    snapshot.translateTitles,
    snapshot.translateDescriptions,
    settings.tmdbKey,
    settings.rpdbKey,
    settings.tvdbKey,
    settings.tmdbLanguage,
    settings.tmdbImageLangs,
    settings.translateTitles,
    settings.translateDescriptions,
    update,
  ]);

  const showFlash = useCallback((ok: boolean, text: string) => {
    setFlash({ ok, text });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFlash(null), 2200);
  }, []);

  const connected = status === "connected";
  const view = useView();

  const playOnHost = useCallback(
    (meta: Meta, opts?: PlayOpts) => {
      // On a native standalone build, "Play" resolves and plays locally through
      // the same picker + player the desktop uses. The web remote build keeps
      // driving the connected desktop.
      if (native) {
        const episode: PlayEpisode | undefined =
          opts?.playEpisode ??
          (opts?.season != null && opts?.episode != null
            ? { season: opts.season, episode: opts.episode }
            : undefined);
        view.openPicker(meta, episode, { autoPlay: settings.instantPlay, resume: opts?.resume ?? true });
        return;
      }
      const sent = sendCommand({
        action: "playMeta",
        metaId: meta.id,
        metaType: meta.type,
        name: meta.name,
        poster: meta.poster,
        season: opts?.season,
        episode: opts?.episode,
        resume: opts?.resume ?? true,
      });
      showFlash(sent, sent ? `Playing on your computer` : "Not connected to a computer");
    },
    [native, view, sendCommand, showFlash, settings.instantPlay],
  );

  const openOnHost = useCallback(
    (meta: Meta) => {
      // General navigation (person pages, rail taps): on a native build this opens
      // the detail locally on the phone. The web remote has no local surface, so it
      // drives the connected desktop instead. Explicit "send to my computer" lives
      // in sendToHost, so tapping a poster or an actor never teleports off-device.
      if (native) {
        view.openMeta(meta);
        return;
      }
      sendCommand({
        action: "openMeta",
        metaId: meta.id,
        metaType: meta.type,
        name: meta.name,
        poster: meta.poster,
      });
    },
    [native, view, sendCommand],
  );

  // Explicit cross-device sends. Unlike openOnHost these always target the
  // connected Harbor instance and surface a flash; the detail sheet only offers
  // them while `connected`, so they never promise a send that can't happen.
  const sendToHost = useCallback(
    (meta: Meta) => {
      const sent = sendCommand({
        action: "openMeta",
        metaId: meta.id,
        metaType: meta.type,
        name: meta.name,
        poster: meta.poster,
      });
      showFlash(sent, sent ? "Opened on your computer" : "Not connected to a computer");
    },
    [sendCommand, showFlash],
  );

  // The real cast: send the title to the connected host's player. Reuses the
  // proven playMeta command the web remote already drives; the host resolves the
  // stream and starts playback exactly as its own Play would.
  const castPlay = useCallback(
    (meta: Meta, opts?: PlayOpts) => {
      const sent = sendCommand({
        action: "playMeta",
        metaId: meta.id,
        metaType: meta.type,
        name: meta.name,
        poster: meta.poster,
        season: opts?.season,
        episode: opts?.episode,
        resume: opts?.resume ?? true,
      });
      showFlash(sent, sent ? "Playing on your computer" : "Not connected to a computer");
    },
    [sendCommand, showFlash],
  );

  const value = useMemo<MobileRemoteValue>(
    () => ({ connected, snapshot, playOnHost, openOnHost, sendToHost, castPlay, sendCommand }),
    [connected, snapshot, playOnHost, openOnHost, sendToHost, castPlay, sendCommand],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {flash && (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <div
            className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-semibold shadow-[0_8px_28px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-fade-in ${
              flash.ok ? "bg-ink text-canvas" : "bg-danger/90 text-white"
            }`}
          >
            {flash.ok ? (
              <Check size={16} strokeWidth={2.6} />
            ) : (
              <WifiOff size={16} strokeWidth={2.4} />
            )}
            {flash.text}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useMobileRemote(): MobileRemoteValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMobileRemote must be used within MobileRemoteProvider");
  return v;
}
