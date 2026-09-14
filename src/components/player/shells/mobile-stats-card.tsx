import type { PlayerSnapshot } from "@/lib/player/bridge";
import { useT } from "@/lib/i18n";
import { useNativeSubFpsState } from "@/lib/player/native-host";
import { SAFE_INLINE_20 } from "./mobile-chrome";

// Playback stats for the phone. The desktop StatsOverlay polls libmpv through
// invoke (bitrates, drops, hwdec), none of which exists on a phone, labels any
// non-mpv engine "HTML5", and tells you to press I to hide it. This card shows what
// the native bridge actually knows and sits below the phone top bar instead of in
// the desktop corner the bar covers.
export function MobileStatsCard({
  snap,
  engineName,
}: {
  snap: PlayerSnapshot;
  engineName: string;
}) {
  const t = useT();
  const { videoFps } = useNativeSubFpsState();
  const audio = snap.audioTracks.find((x) => x.selected) ?? null;
  const sub = snap.subtitleTracks.find((x) => x.selected) ?? null;
  const rows: Array<[string, string]> = [
    [t("Engine"), engineName],
    [t("Resolution"), snap.videoWidth && snap.videoHeight ? `${snap.videoWidth}×${snap.videoHeight}` : "-"],
  ];
  if (videoFps > 0) rows.push([t("Frame rate"), `${videoFps.toFixed(3).replace(/\.?0+$/, "")} fps`]);
  if (audio?.codec) rows.push([t("Audio codec"), audio.codec]);
  rows.push([t("Audio track"), audio ? audio.title || audio.lang || audio.label : "-"]);
  rows.push([t("Subtitle track"), sub ? sub.title || sub.lang || sub.label : t("Off")]);
  rows.push([t("Speed"), `${snap.rate.toFixed(2)}×`]);
  rows.push([t("Volume"), `${Math.round(snap.volume * 100)}%`]);

  return (
    <div
      className="pointer-events-none absolute z-20 w-[min(300px,calc(100vw-40px))] rounded-2xl border border-edge-soft bg-canvas/85 p-3.5 font-mono text-[11.5px] leading-relaxed text-ink shadow-[0_18px_50px_-15px_rgba(0,0,0,0.7)] backdrop-blur-md"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 64px)", insetInlineStart: SAFE_INLINE_20 }}
    >
      <p className="mb-1.5 font-sans text-[10px] font-bold uppercase tracking-[0.2em] text-ink-subtle">
        {t("Stats overlay")}
      </p>
      <dl className="flex flex-col gap-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-ink-muted">{k}</dt>
            <dd className="min-w-0 truncate text-end">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
