import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { resolveTrailerId } from "@/lib/trailer";

const LINGER_MS = 1400;

// Hero trailer autoplay for the phone, honoring the same heroTrailers and
// heroTrailerAudio settings as the desktop HeroCarousel. The desktop plays a
// file the Rust side extracts (fetch_trailer); the phone's trailer path is the
// YouTube embed the detail sheet already uses (MobileTrailerOverlay), so the
// hero mounts that same embed muted and looping behind the artwork once the
// slide has held still for a moment. It sits under pointer-events-none so the
// hero's Play and info controls keep every tap. Audio, when enabled, drives the
// player through the IFrame API; iOS may still refuse unmuted autoplay, and
// then the toggle below lets the viewer turn the sound on by hand.
export function HeroTrailerLayer({
  meta,
  active,
  onPlaying,
  className = "",
}: {
  meta: Meta;
  active: boolean;
  onPlaying?: (playing: boolean) => void;
  className?: string;
}) {
  const t = useT();
  const { settings } = useSettings();
  const enabled = settings.heroTrailers;
  const wantAudio = settings.heroTrailerAudio;
  const [videoId, setVideoId] = useState<string | null>(null);
  const [lingered, setLingered] = useState(false);
  const [ready, setReady] = useState(false);
  const [muted, setMuted] = useState(!wantAudio);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setVideoId(null);
    setReady(false);
    if (!enabled || !active) return;
    let alive = true;
    resolveTrailerId(meta, settings.tmdbKey)
      .then((id) => {
        if (alive) setVideoId(id);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, active, meta, settings.tmdbKey]);

  useEffect(() => {
    setLingered(false);
    if (!enabled || !active) return;
    const id = window.setTimeout(() => setLingered(true), LINGER_MS);
    return () => window.clearTimeout(id);
  }, [enabled, active, meta.id]);

  useEffect(() => {
    setMuted(!wantAudio);
  }, [wantAudio, meta.id]);

  const playing = enabled && active && lingered && !!videoId && ready;
  useEffect(() => {
    onPlaying?.(playing);
  }, [playing, onPlaying]);

  const post = (func: "mute" | "unMute") => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  };

  if (!enabled || !active || !lingered || !videoId) return null;

  const params = new URLSearchParams({
    autoplay: "1",
    mute: wantAudio ? "0" : "1",
    controls: "0",
    loop: "1",
    playlist: videoId,
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
    playsinline: "1",
    enablejsapi: "1",
    disablekb: "1",
  });
  const proto = typeof window !== "undefined" ? (window.location?.protocol ?? "") : "";
  if (/^https?:$/.test(proto) && window.location?.origin) params.set("origin", window.location.origin);

  return (
    <>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-700 ${className}`}
        style={{ opacity: ready ? 1 : 0 }}
      >
        <iframe
          ref={frameRef}
          src={`https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`}
          title=""
          tabIndex={-1}
          allow="autoplay; encrypted-media"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setReady(true)}
          // Oversized and centred so the player's own letterbox never shows at
          // the hero's portrait aspect; the hero is cinematic, not a video box.
          className="absolute left-1/2 top-1/2 h-[120%] w-[220%] -translate-x-1/2 -translate-y-1/2 border-0"
        />
      </div>
      {wantAudio && ready && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const next = !muted;
            setMuted(next);
            post(next ? "mute" : "unMute");
          }}
          aria-label={muted ? t("Unmute") : t("Mute")}
          className="absolute end-4 top-[calc(env(safe-area-inset-top,0px)+58px)] z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md"
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
      )}
    </>
  );
}
