import { useT } from "@/lib/i18n";
import { fmtRate } from "./mobile-chrome";
import { MobileGlyph } from "./mobile-glyph";
import { MOBILE_GLYPH } from "./mobile-icons";
import { MobileQualityBadges } from "./mobile-quality-badges";
import { MobileTimeLabel } from "./mobile-seek-bar";

// Row under the scrubber. Left: where we are and how fast. Right: two groups
// split by a hairline, "this stream" (source) and "move on" (prev, next, PiP).
// Nothing here is a primary action, so it all stays quiet: no rest background,
// 22px icons. The boxes are 44pt because that is the platform's touch floor, not
// because the controls want the weight.
//
// No Episodes button: the UP NEXT tab on the screen edge opens the same panel and
// is visible whether the chrome is up or not, so a second way in only made the row
// longer.
export function MobileActionRow({
  durationSec,
  active,
  videoWidth,
  videoHeight,
  hdrGamma,
  rate,
  showRate,
  canPickAnother,
  hasPrevEp,
  hasNextEp,
  showPiP,
  onSpeed,
  onPickAnother,
  onPrevEp,
  onNextEp,
  onPiP,
}: {
  durationSec: number;
  active: boolean;
  videoWidth: number;
  videoHeight: number;
  hdrGamma: string;
  rate: number;
  showRate: boolean;
  canPickAnother: boolean;
  hasPrevEp: boolean;
  hasNextEp: boolean;
  showPiP: boolean;
  onSpeed: () => void;
  onPickAnother: () => void;
  onPrevEp: () => void;
  onNextEp: () => void;
  onPiP: () => void;
}) {
  const t = useT();
  const leftGroup = canPickAnother;
  const rightGroup = hasPrevEp || hasNextEp || showPiP;
  return (
    <div className="flex h-11 items-center justify-between">
      <div className="flex items-center gap-3">
        <MobileTimeLabel durationSec={durationSec} active={active} />
        <MobileQualityBadges videoWidth={videoWidth} videoHeight={videoHeight} hdrGamma={hdrGamma} />
        {showRate && (
          <button
            type="button"
            aria-label={t("Playback speed")}
            onClick={onSpeed}
            className="relative flex h-8 items-center rounded-full bg-white/10 px-2.5 font-mono text-[13px] font-semibold tabular-nums text-ink active:bg-white/20 before:absolute before:-inset-y-2 before:-inset-x-1 before:content-['']"
          >
            {fmtRate(rate)}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {canPickAnother && (
          <ActionButton label={t("Switch source")} onClick={onPickAnother}>
            <MobileGlyph url={MOBILE_GLYPH.pickAnother} size={22} />
          </ActionButton>
        )}
        {leftGroup && rightGroup && <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />}
        {hasPrevEp && (
          <ActionButton label={t("Previous episode")} onClick={onPrevEp}>
            <MobileGlyph url={MOBILE_GLYPH.prevEpisode} size={22} />
          </ActionButton>
        )}
        {hasNextEp && (
          <ActionButton label={t("Next episode")} onClick={onNextEp}>
            <MobileGlyph url={MOBILE_GLYPH.nextEpisode} size={22} />
          </ActionButton>
        )}
        {showPiP && (
          <ActionButton label={t("Picture in picture")} onClick={onPiP}>
            <MobileGlyph url={MOBILE_GLYPH.pipInactive} size={22} />
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-full text-ink active:bg-white/10"
    >
      {children}
    </button>
  );
}
