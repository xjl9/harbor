import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { isMobileNative } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { fetchTrailer, resolveTrailerQuality, trailerSrc } from "@/lib/trailer";
import { NativeTrailerPlayer } from "@/views/detail/native-trailer-player";
import { useReducedMotion, useSheetExit } from "./data";

// The desktop waits minutes for the native extractor because a download is
// worth it there. A phone user is holding a spinner, so past this the overlay
// falls back to the YouTube embed; a late success is still cached for next time.
const NATIVE_WAIT_MS = 12_000;

export function MobileTrailerOverlay({
  id,
  title,
  logo,
  onClose,
}: {
  id: string;
  title: string;
  logo?: string;
  onClose: () => void;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const { settings } = useSettings();
  const { leaving, close } = useSheetExit(onClose);
  const native = isMobileNative();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(!native);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (!native) return;
    let alive = true;
    setSrc(null);
    setFailed(false);
    const deadline = window.setTimeout(() => {
      if (alive) setFailed(true);
    }, NATIVE_WAIT_MS);
    fetchTrailer(id, resolveTrailerQuality(settings.trailerQuality))
      .then((info) => {
        if (!alive) return;
        window.clearTimeout(deadline);
        if (info) setSrc(trailerSrc(info));
        else setFailed(true);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
      window.clearTimeout(deadline);
    };
  }, [id, native, settings.trailerQuality]);

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("{title} trailer", { title })}
      onClick={close}
      className={`fixed inset-0 z-[120] flex items-center justify-center bg-black/90 px-4 ${
        reduced ? "" : leaving ? "md-fade-out" : "md-sheet-fade"
      }`}
    >
      <button
        type="button"
        onClick={close}
        aria-label={t("Close trailer")}
        className="absolute end-4 grid h-11 w-11 place-items-center rounded-full bg-canvas/90 text-ink shadow-[0_8px_22px_-8px_rgba(0,0,0,0.6)]"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        <X size={19} strokeWidth={2.4} />
      </button>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative aspect-video w-full max-w-[720px] overflow-hidden rounded-2xl bg-black shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ${
          reduced ? "" : leaving ? "md-zoom-out" : "md-zoom-in"
        }`}
      >
        {src ? (
          <NativeTrailerPlayer src={src} videoRef={videoRef} />
        ) : failed ? (
          <YouTubeEmbed id={id} title={title} />
        ) : (
          <TrailerLoader title={title} logo={logo} />
        )}
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

function YouTubeEmbed({ id, title }: { id: string; title: string }) {
  const t = useT();
  const params = new URLSearchParams({
    autoplay: "1",
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
    playsinline: "1",
    fs: "1",
  });
  const proto = typeof window !== "undefined" ? (window.location?.protocol ?? "") : "";
  if (/^https?:$/.test(proto) && window.location?.origin) {
    params.set("origin", window.location.origin);
  }
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`}
      title={t("{title} trailer", { title })}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      className="absolute inset-0 h-full w-full border-0"
    />
  );
}

function TrailerLoader({ title, logo }: { title: string; logo?: string }) {
  const t = useT();
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
      {logo ? (
        <img
          src={logo}
          alt={title}
          className="max-h-16 w-auto max-w-[60%] animate-loader-pulse object-contain drop-shadow-[0_18px_45px_rgba(0,0,0,0.55)]"
        />
      ) : (
        <p className="animate-loader-pulse text-center font-display text-[26px] font-medium leading-tight tracking-tight text-white">
          {title}
        </p>
      )}
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.3em] text-white/45">
        {t("Loading trailer")}
      </p>
    </div>
  );
}
