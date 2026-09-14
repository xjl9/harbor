import { Check } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { TrackInfo } from "@/lib/player/bridge";
import { haptics } from "@/lib/player/haptics";
import { setNativeSubFps } from "@/lib/player/android-native";
import { useNativeSubFpsState } from "@/lib/player/native-host";
import { isTextSubTrack } from "@/lib/player/sub-format";
import {
  SUBTITLE_FPS_PRESETS,
  formatSubtitleFps,
  matchingSubtitleFpsPreset,
  subtitleFpsAvailability,
  subtitleFpsMatchesVideo,
  validateSubtitleFps,
} from "@/lib/player/subtitle-fps";

// Subtitle FPS correction for the native mpv engine. The desktop control lives in
// the subtitle menu header and reads libmpv over invoke, which the phone has no
// command for, so it renders nothing here; this is the same choice set (no
// correction, match video, the presets, a custom value) as a chip row the thumb
// can reach, driven by the plugin's sub-fps command.
export function MobileSubtitleFps({
  track,
  hasSecondary,
}: {
  track: TrackInfo | null;
  hasSecondary: boolean;
}) {
  const t = useT();
  const { videoFps, subFps } = useNativeSubFpsState();
  const [customOpen, setCustomOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const video = videoFps > 0 ? videoFps : null;
  const current = subFps > 0 ? subFps : null;
  const availability = subtitleFpsAvailability({
    engine: "mpv",
    hasTrack: track != null,
    textBased: isTextSubTrack(track),
    hasSecondary,
    videoFps: video,
    nativeSupported: true,
    autoSyncActive: false,
  });
  const auto = subtitleFpsMatchesVideo(current, video);
  const preset = auto ? null : matchingSubtitleFpsPreset(current);
  const custom = current != null && !auto && preset == null;

  const apply = (fps: number) => {
    haptics.select();
    setNativeSubFps(fps);
    setError(null);
    setCustomOpen(false);
  };

  const commitCustom = () => {
    const result = validateSubtitleFps(draft.replace(",", "."));
    if (!result.ok) {
      setError(t("Enter an FPS from 1 to 240."));
      return;
    }
    apply(result.value);
  };

  const reason = availability.enabled
    ? null
    : availability.reason === "no-track"
      ? t("Select a subtitle track first.")
      : availability.reason === "not-text-based"
        ? t("Subtitle FPS conversion is only available for text-based subtitles.")
        : availability.reason === "secondary-active"
          ? t("Subtitle FPS is unavailable while a secondary subtitle is active.")
          : t("Video FPS is unavailable.");

  return (
    <section className="border-t border-edge-soft px-4 pb-2 pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold text-ink">{t("Subtitle FPS")}</span>
        <span className="font-jakarta text-[12px] tabular-nums text-ink-subtle">
          {current == null ? t("No correction") : formatSubtitleFps(current, 3)}
        </span>
      </div>
      {reason ? (
        <p className="py-2 text-[12.5px] leading-snug text-ink-subtle">{reason}</p>
      ) : (
        <>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip label={t("No correction (default)")} selected={current == null} onClick={() => apply(0)} />
            {video != null && (
              <Chip
                label={`${t("Auto (match video)")} · ${formatSubtitleFps(video, 3)}`}
                selected={auto}
                onClick={() => apply(video)}
              />
            )}
            {SUBTITLE_FPS_PRESETS.map((p) => (
              <Chip key={p.label} label={p.label} selected={preset === p.label} onClick={() => apply(p.value)} />
            ))}
            <Chip
              label={custom && current != null ? formatSubtitleFps(current, 3) : t("Custom...")}
              selected={custom || customOpen}
              onClick={() => {
                setDraft(formatSubtitleFps(current ?? video ?? 25, 3));
                setCustomOpen((v) => !v);
              }}
            />
          </div>
          {customOpen && (
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                commitCustom();
              }}
            >
              <input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                inputMode="decimal"
                enterKeyHint="done"
                aria-label={t("Custom subtitle FPS")}
                className="h-11 min-w-0 flex-1 rounded-xl bg-canvas px-3 text-end font-mono text-[16px] tabular-nums text-ink outline-none focus:bg-raised"
              />
              <button
                type="submit"
                aria-label={t("Apply custom subtitle FPS")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-canvas active:opacity-80"
              >
                <Check size={17} strokeWidth={2.5} />
              </button>
            </form>
          )}
          {error && (
            <p role="alert" className="mt-1.5 text-[12px] text-danger">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex h-11 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-[13.5px] font-semibold tabular-nums transition-colors ${
        selected ? "bg-ink text-canvas" : "bg-raised text-ink-muted active:bg-raised/70"
      }`}
    >
      {label}
    </button>
  );
}
