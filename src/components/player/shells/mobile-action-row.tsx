import { Layers, ListVideo, PictureInPicture2, SkipBack, SkipForward } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fmtRate } from "./mobile-chrome";
import { MobileTimeLabel } from "./mobile-seek-bar";

// Row under the scrubber. Left: where we are and how fast. Right: two groups
// split by a hairline, "this stream" (source, episodes) and "move on" (prev,
// next, PiP). Nothing here is a primary action; it all stays 40px and quiet.
export function MobileActionRow({
  durationSec,
  active,
  rate,
  showRate,
  canPickAnother,
  isSeries,
  hasPrevEp,
  hasNextEp,
  showPiP,
  onSpeed,
  onPickAnother,
  onEpisodes,
  onPrevEp,
  onNextEp,
  onPiP,
}: {
  durationSec: number;
  active: boolean;
  rate: number;
  showRate: boolean;
  canPickAnother: boolean;
  isSeries: boolean;
  hasPrevEp: boolean;
  hasNextEp: boolean;
  showPiP: boolean;
  onSpeed: () => void;
  onPickAnother: () => void;
  onEpisodes: () => void;
  onPrevEp: () => void;
  onNextEp: () => void;
  onPiP: () => void;
}) {
  const t = useT();
  const leftGroup = canPickAnother || isSeries;
  const rightGroup = hasPrevEp || hasNextEp || showPiP;
  return (
    <div className="flex h-10 items-center justify-between">
      <div className="flex items-center gap-3">
        <MobileTimeLabel durationSec={durationSec} active={active} />
        {showRate && (
          <button
            type="button"
            aria-label={t("Playback speed")}
            onClick={onSpeed}
            className="flex h-8 items-center rounded-full bg-white/10 px-2.5 font-mono text-[13px] font-semibold tabular-nums text-ink active:bg-white/20"
          >
            {fmtRate(rate)}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        {canPickAnother && (
          <ActionButton label={t("Switch source")} onClick={onPickAnother}>
            <Layers size={22} strokeWidth={2} />
          </ActionButton>
        )}
        {isSeries && (
          <ActionButton label={t("Episodes")} onClick={onEpisodes}>
            <ListVideo size={22} strokeWidth={2} />
          </ActionButton>
        )}
        {leftGroup && rightGroup && <span aria-hidden className="mx-1 h-5 w-px bg-white/10" />}
        {hasPrevEp && (
          <ActionButton label={t("Previous episode")} onClick={onPrevEp}>
            <SkipBack size={22} strokeWidth={2} />
          </ActionButton>
        )}
        {hasNextEp && (
          <ActionButton label={t("Next episode")} onClick={onNextEp}>
            <SkipForward size={22} strokeWidth={2} />
          </ActionButton>
        )}
        {showPiP && (
          <ActionButton label={t("Picture in picture")} onClick={onPiP}>
            <PictureInPicture2 size={22} strokeWidth={2} />
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
      className="flex h-10 w-10 items-center justify-center rounded-full text-ink active:bg-white/10"
    >
      {children}
    </button>
  );
}
