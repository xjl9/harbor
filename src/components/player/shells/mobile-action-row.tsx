import { useT } from "@/lib/i18n";
import { fmtRate } from "./mobile-chrome";
import { MobileButton, MOBILE_GLYPH_SIZE } from "./mobile-button";
import { MobileGlyph } from "./mobile-glyph";
import { MOBILE_GLYPH } from "./mobile-icons";
import { MobileQualityBadges } from "./mobile-quality-badges";
import { MobileTimeLabel } from "./mobile-seek-bar";

// Row under the scrubber. Left: where we are and how fast. Right: two groups
// split by a hairline, "this stream" (source) and "move on" (prev, next, PiP).
// Everything goes through MobileButton, so the whole row is one height, one
// radius and one glyph weight.
//
// The speed control is a button like the rest of them now rather than a pill with
// a permanent grey background. At 1x it is the plain text on the picture; changing
// the speed lights it, which is the one state worth painting.
//
// An Episodes button for series. The UP NEXT edge tab still exists, but it fades
// with the chrome, sits on the side the notch covers in landscape, and on a phone
// is a 32pt-wide target; the row is where every other control already lives.
export function MobileActionRow({
  durationSec,
  active,
  videoWidth,
  videoHeight,
  hdrGamma,
  rate,
  showRate,
  sleepActive = false,
  canPickAnother,
  hasPrevEp,
  hasNextEp,
  showPiP,
  showEpisodes = false,
  onSpeed,
  onPickAnother,
  onPrevEp,
  onNextEp,
  onPiP,
  onEpisodes,
}: {
  durationSec: number;
  active: boolean;
  videoWidth: number;
  videoHeight: number;
  hdrGamma: string;
  rate: number;
  showRate: boolean;
  /** A running sleep timer lights the speed control, where the timer is set. */
  sleepActive?: boolean;
  canPickAnother: boolean;
  hasPrevEp: boolean;
  hasNextEp: boolean;
  showPiP: boolean;
  showEpisodes?: boolean;
  onSpeed: () => void;
  onPickAnother: () => void;
  onPrevEp: () => void;
  onNextEp: () => void;
  onPiP: () => void;
  onEpisodes?: () => void;
}) {
  const t = useT();
  const leftGroup = canPickAnother;
  const rightGroup = hasPrevEp || hasNextEp || showPiP || showEpisodes;
  return (
    <div className="flex h-11 items-center justify-between">
      <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
        <MobileTimeLabel durationSec={durationSec} active={active} />
        {/* The badges go first on a narrow portrait phone: with Episodes added, a
            series on a 393pt screen needs the room for its transport buttons, and
            the resolution is already on the stream the viewer picked. */}
        <span className="flex items-center [@media(max-width:400px)]:hidden">
          <MobileQualityBadges videoWidth={videoWidth} videoHeight={videoHeight} hdrGamma={hdrGamma} />
        </span>
        {showRate && (
          <MobileButton
            label={t("Speed and sleep timer")}
            onClick={onSpeed}
            active={rate !== 1 || sleepActive}
            wide
          >
            <span className="font-jakarta text-[13px] font-semibold tabular-nums">{fmtRate(rate)}</span>
          </MobileButton>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {canPickAnother && (
          <MobileButton label={t("Switch source")} onClick={onPickAnother}>
            <MobileGlyph url={MOBILE_GLYPH.pickAnother} size={MOBILE_GLYPH_SIZE} />
          </MobileButton>
        )}
        {leftGroup && rightGroup && <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />}
        {hasPrevEp && (
          <MobileButton label={t("Previous episode")} onClick={onPrevEp}>
            <MobileGlyph url={MOBILE_GLYPH.prevEpisode} size={MOBILE_GLYPH_SIZE} />
          </MobileButton>
        )}
        {hasNextEp && (
          <MobileButton label={t("Next episode")} onClick={onNextEp}>
            <MobileGlyph url={MOBILE_GLYPH.nextEpisode} size={MOBILE_GLYPH_SIZE} />
          </MobileButton>
        )}
        {showEpisodes && onEpisodes && (
          <MobileButton label={t("Episodes")} onClick={onEpisodes}>
            <MobileGlyph url={MOBILE_GLYPH.upNext} size={MOBILE_GLYPH_SIZE} />
          </MobileButton>
        )}
        {showPiP && (
          <MobileButton label={t("Picture in picture")} onClick={onPiP}>
            <MobileGlyph url={MOBILE_GLYPH.pipInactive} size={MOBILE_GLYPH_SIZE} />
          </MobileButton>
        )}
      </div>
    </div>
  );
}
