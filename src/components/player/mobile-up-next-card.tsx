import { EyeOff, ImageOff, Play, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { ThreeLiquidGlassSurface } from "@/components/ThreeLiquidGlassSurface";
import { useT } from "@/lib/i18n";
import type { SpoilerMask } from "@/lib/spoilers";
import type { PlayEpisode } from "@/lib/view";

const RING_RADIUS = 19;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function MobileUpNextCard({
  nextEp,
  nextEpMask,
  remainingSec,
  leadSec,
  autoAdvancing,
  visible,
  onNextEpisode,
  onCancelAutoNext,
}: {
  nextEp: PlayEpisode;
  nextEpMask?: SpoilerMask;
  remainingSec: number;
  leadSec: number;
  // True only when the gated auto-advance path (useAutoNextEpisode) will actually
  // roll the next episode. The card NEVER advances on its own: that path bypasses
  // the autoplay/sleep/still-watching/min-duration gates. We only mirror its
  // countdown here so the ring does not imply an auto-jump that will not happen.
  autoAdvancing: boolean;
  visible: boolean;
  onNextEpisode: () => void;
  onCancelAutoNext: () => void;
}) {
  const t = useT();
  const actionTakenRef = useRef(false);
  const episodeKey = `${nextEp.sourceMetaId ?? nextEp.imdbId ?? "episode"}:${nextEp.season}:${nextEp.episode}`;

  useEffect(() => {
    actionTakenRef.current = false;
  }, [episodeKey]);

  const countdownComplete = remainingSec <= 0.25;
  const seconds = countdownComplete ? 0 : Math.ceil(remainingSec);
  const progress = countdownComplete
    ? 1
    : Math.min(1, Math.max(0, 1 - remainingSec / Math.max(leadSec, 0.01)));
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);
  const episodeLabel = `S${nextEp.imdbSeason ?? nextEp.season} · E${nextEp.imdbEpisode ?? nextEp.episode}`;
  const title = nextEpMask?.title ? t("Episode title hidden") : nextEp.name?.trim() || episodeLabel;
  const hideThumbnail = nextEpMask?.thumb === true;

  const playNow = () => {
    if (actionTakenRef.current) return;
    actionTakenRef.current = true;
    onNextEpisode();
  };

  const cancel = () => {
    if (actionTakenRef.current) return;
    actionTakenRef.current = true;
    onCancelAutoNext();
  };

  return (
    <div
      aria-hidden={!visible}
      className={`pointer-events-none absolute z-30 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)",
        // Logical inset so the card mirrors to the start edge in RTL like the rest
        // of the player chrome; max() covers whichever physical side holds the notch
        // in landscape.
        insetInlineEnd:
          "calc(max(env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px)) + 1rem)",
        width:
          "min(20rem, calc(100vw - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px) - 2rem))",
      }}
    >
      <ThreeLiquidGlassSurface
        radius="var(--radius-xl)"
        shaderRadius={0.34}
        intensity={0.15}
        refractionStrength={0.04}
        interactive={false}
        alwaysActive
        variant="overlay"
        style={{
          backgroundImage: "none",
          backgroundColor: "color-mix(in srgb, var(--color-canvas) 84%, transparent)",
          boxShadow:
            "0 20px 50px -18px color-mix(in srgb, var(--color-canvas) 88%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-ink) 10%, transparent)",
        }}
        className={`${visible ? "pointer-events-auto" : "pointer-events-none"} w-full`}
        surfaceClassName="border border-edge-soft"
        contentClassName="p-2.5"
      >
        <div className="flex items-start gap-2.5">
          <div className="relative h-[66px] w-[106px] shrink-0 overflow-hidden rounded-lg border border-edge-soft bg-elevated">
            {nextEp.still && !hideThumbnail ? (
              <img
                src={nextEp.still}
                alt=""
                draggable={false}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div
                role="img"
                aria-label={hideThumbnail ? t("Episode image hidden") : t("No episode image")}
                className="grid h-full place-items-center text-ink-subtle"
              >
                {hideThumbnail ? <EyeOff size={19} strokeWidth={1.8} /> : <ImageOff size={19} strokeWidth={1.8} />}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              {t("Up next")}
            </p>
            <h3 className="mt-0.5 truncate font-display text-[15px] font-semibold leading-tight text-ink">
              {title}
            </h3>
            <p className="mt-1 truncate font-mono text-[10.5px] font-medium tabular-nums text-ink-subtle">
              {episodeLabel}
            </p>
          </div>

          {autoAdvancing && (
            <div
              role="timer"
              aria-label={t("Up next in {s}s", { s: seconds })}
              className="relative grid h-12 w-12 shrink-0 place-items-center"
            >
              <svg aria-hidden viewBox="0 0 48 48" className="absolute inset-0 h-full w-full -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--color-edge-soft)"
                  strokeWidth="3"
                />
                <circle
                  cx="24"
                  cy="24"
                  r={RING_RADIUS}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-300 ease-linear motion-reduce:transition-none"
                />
              </svg>
              <span className="font-mono text-[11px] font-semibold tabular-nums text-ink">{seconds}</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2 border-t border-edge-soft pt-2">
          <button
            type="button"
            onClick={cancel}
            disabled={!visible}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold text-ink-muted transition-[background-color,color,transform] active:scale-[0.97] active:bg-raised active:text-ink"
          >
            <X size={14} strokeWidth={2.2} />
            {t("Cancel")}
          </button>
          <button
            type="button"
            onClick={playNow}
            disabled={!visible}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-semibold text-canvas transition-[filter,transform] active:scale-[0.97] active:brightness-90"
          >
            <Play size={13} strokeWidth={2.4} fill="currentColor" />
            {t("Play now")}
          </button>
        </div>
      </ThreeLiquidGlassSurface>
    </div>
  );
}
