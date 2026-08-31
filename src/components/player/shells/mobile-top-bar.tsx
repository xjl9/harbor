import { Airplay, Cast, Lock, Subtitles as SubsIcon, X } from "lucide-react";
import type { CSSProperties } from "react";
import { useT } from "@/lib/i18n";
import { SAFE_INLINE_20 } from "./mobile-chrome";

// Top zone of the mobile shell: vignette scrim plus a single 44px row. Landscape
// is the steady state, so the title never wraps; it truncates between the close
// button and the right cluster.
export function MobileTopBar({
  title,
  subtitle,
  showAirplay,
  showCast,
  scrimStyle,
  zoneStyle,
  interactive,
  onBack,
  onLock,
  onCast,
  onTracks,
}: {
  title: string;
  subtitle?: string;
  showAirplay: boolean;
  showCast: boolean;
  scrimStyle: CSSProperties;
  zoneStyle: CSSProperties;
  interactive: boolean;
  onBack: () => void;
  onLock: () => void;
  onCast: () => void;
  onTracks: () => void;
}) {
  const t = useT();
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
        <TopButton label={t("Close")} onClick={onBack}>
          <X size={22} strokeWidth={2} />
        </TopButton>
        <div className="pointer-events-none mx-2 flex min-w-0 flex-1 flex-col justify-center">
          <span className="truncate font-display text-[17px] font-medium leading-tight tracking-tight text-ink">
            {title}
          </span>
          {subtitle && <span className="truncate text-[12px] leading-tight text-ink-muted">{subtitle}</span>}
        </div>
        <TopButton label={t("Lock screen")} onClick={onLock}>
          <Lock size={22} strokeWidth={2} />
        </TopButton>
        {showAirplay ? (
          <TopButton label={t("AirPlay")} onClick={onCast}>
            <Airplay size={22} strokeWidth={2} />
          </TopButton>
        ) : showCast ? (
          <TopButton label={t("Cast")} onClick={onCast}>
            <Cast size={22} strokeWidth={2} />
          </TopButton>
        ) : null}
        <TopButton label={t("Audio & Subtitles")} onClick={onTracks}>
          <SubsIcon size={22} strokeWidth={2} />
        </TopButton>
      </div>
    </div>
  );
}

function TopButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-white/10"
    >
      {children}
    </button>
  );
}
