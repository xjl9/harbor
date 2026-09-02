import type { CSSProperties } from "react";
import { useT } from "@/lib/i18n";
import { SAFE_INLINE_20 } from "./mobile-chrome";
import { MobileButton, MOBILE_GLYPH_SIZE } from "./mobile-button";
import { MobileGlyph } from "./mobile-glyph";
import { MOBILE_GLYPH } from "./mobile-icons";

// Top zone of the mobile shell: vignette scrim plus a single 44px row. Landscape
// is the steady state, so the title never wraps; it truncates between the close
// button and the right cluster.
//
// Fill rather than lock in the second slot. A lock only protects against a
// problem the gesture layer should not be creating; filling the screen is a
// choice a viewer makes on almost every scope film watched on a phone.
export function MobileTopBar({
  title,
  subtitle,
  season,
  episode,
  showAirplay,
  showCast,
  fillMode,
  scrimStyle,
  zoneStyle,
  interactive,
  onBack,
  onToggleFill,
  onCast,
  onTracks,
}: {
  title: string;
  subtitle?: string;
  season?: number | null;
  episode?: number | null;
  showAirplay: boolean;
  showCast: boolean;
  fillMode: boolean;
  scrimStyle: CSSProperties;
  zoneStyle: CSSProperties;
  interactive: boolean;
  onBack: () => void;
  onToggleFill: () => void;
  onCast: () => void;
  onTracks: () => void;
}) {
  const t = useT();
  // Which episode is playing, not just which show. The bar used to carry the series
  // name and a release year, so three episodes in a row looked identical and there
  // was nothing on screen telling you where you were.
  const coords =
    season != null && episode != null
      ? `S${season} · E${episode}`
      : episode != null
        ? `E${episode}`
        : null;
  // The subtitle often ALREADY carries the show and the episode numbers, which is
  // how the deck ended up reading "S2 · E1 · REGULAR SHOW · S2 · E1". Only add the
  // coordinates when the subtitle is not already stating them.
  const subtitleHasCoords =
    !!subtitle && !!coords && subtitle.replace(/\s+/g, " ").includes(coords);
  const deck = (subtitleHasCoords ? subtitle : [coords, subtitle].filter(Boolean).join(" · ")) || null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-28"
        style={{
          ...scrimStyle,
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in srgb, var(--color-canvas) 80%, transparent) 0%, color-mix(in srgb, var(--color-canvas) 35%, transparent) 40%, transparent 100%)",
        }}
      />
      <div
        className={`relative flex h-11 items-center gap-1 ${interactive ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{
          ...zoneStyle,
          marginTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingInline: SAFE_INLINE_20,
        }}
      >
        <MobileButton label={t("Close")} onClick={onBack}>
          <MobileGlyph url={MOBILE_GLYPH.close} size={MOBILE_GLYPH_SIZE} />
        </MobileButton>
        <div className="pointer-events-none mx-2 flex min-w-0 flex-1 flex-col justify-center">
          <span className="truncate font-jakarta text-[17px] font-medium leading-tight tracking-tight text-ink">
            {title}
          </span>
          {deck && (
            <span className="truncate font-jakarta text-[11px] uppercase tracking-[0.14em] leading-tight text-ink-muted">
              {deck}
            </span>
          )}
        </div>
        <MobileButton label={t("Fill screen")} onClick={onToggleFill} active={fillMode}>
          <MobileGlyph url={MOBILE_GLYPH.fill} size={MOBILE_GLYPH_SIZE} />
        </MobileButton>
        {showAirplay ? (
          <MobileButton label={t("AirPlay")} onClick={onCast}>
            <MobileGlyph url={MOBILE_GLYPH.castIdle} size={MOBILE_GLYPH_SIZE} />
          </MobileButton>
        ) : showCast ? (
          <MobileButton label={t("Cast")} onClick={onCast}>
            <MobileGlyph url={MOBILE_GLYPH.castIdle} size={MOBILE_GLYPH_SIZE} />
          </MobileButton>
        ) : null}
        <MobileButton label={t("Audio & Subtitles")} onClick={onTracks}>
          <MobileGlyph url={MOBILE_GLYPH.subtitles} size={MOBILE_GLYPH_SIZE} />
        </MobileButton>
      </div>
    </div>
  );
}

