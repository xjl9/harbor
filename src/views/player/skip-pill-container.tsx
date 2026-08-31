import { useEffect, useMemo, useRef, useState } from "react";
import { usePlaybackPosition } from "@/lib/player/playback-clock";
import { SkipPill } from "@/components/player/skip-pill";
import { MobileUpNextCard } from "@/components/player/mobile-up-next-card";
import { activeSegment, type SkipSegment } from "@/lib/skip-intro";
import { useSettings } from "@/lib/settings";
import { isMobileNative } from "@/lib/platform";
import type { SpoilerMask } from "@/lib/spoilers";
import type { PlayEpisode } from "@/lib/view";

export function nextEpisodeLead(setting: number, durationSec: number): number {
  if (setting === 0) return 0;
  if (setting > 0) return setting;
  return Math.min(45, Math.max(15, Math.round(durationSec * 0.04)));
}

export function SkipPillContainer({
  engine,
  skipSegments,
  durationSec,
  hasNextEpisode,
  hasNextEpDisplay,
  nextEp,
  nextEpMask,
  visible,
  allowAutoSkip = true,
  onSkip,
  onNextEpisode,
  onCancelAutoNext,
}: {
  engine: "html5" | "mpv" | "native";
  skipSegments: SkipSegment[];
  durationSec: number;
  hasNextEpisode: boolean;
  hasNextEpDisplay: boolean;
  nextEp: PlayEpisode | null;
  nextEpMask?: SpoilerMask;
  visible: boolean;
  allowAutoSkip?: boolean;
  onSkip: (sec: number) => void;
  onNextEpisode: () => void;
  onCancelAutoNext: () => void;
}) {
  const { settings } = useSettings();
  const positionSec = usePlaybackPosition();
  const realActiveSkip = activeSegment(skipSegments, positionSec);
  const leadSec = nextEpisodeLead(settings.nextEpisodeLeadSec, durationSec);
  const syntheticOutro = useMemo(() => {
    if (realActiveSkip) return null;
    if (!hasNextEpisode) return null;
    if (durationSec <= 0) return null;
    if (leadSec <= 0) return null;
    const remaining = durationSec - positionSec;
    if (remaining > leadSec || remaining < 0.5) return null;
    const hasRealOutro = skipSegments.some((s) => s.kind === "outro");
    if (hasRealOutro) return null;
    return {
      kind: "outro" as const,
      startSec: Math.max(0, durationSec - leadSec),
      endSec: durationSec,
      source: "chapters" as const,
    };
  }, [realActiveSkip, hasNextEpisode, durationSec, positionSec, skipSegments, leadSec]);
  const remainingSec = Math.max(0, durationSec - positionSec);

  const autoSkippedRef = useRef<SkipSegment | null>(null);
  useEffect(() => {
    autoSkippedRef.current = null;
  }, [skipSegments]);
  useEffect(() => {
    if (!allowAutoSkip || !realActiveSkip) return;
    const wantSkip =
      (realActiveSkip.kind === "intro" && settings.autoSkipIntro) ||
      (realActiveSkip.kind === "recap" && settings.autoSkipRecap) ||
      (realActiveSkip.kind === "outro" && settings.autoSkipOutro) ||
      (realActiveSkip.kind === "ad" && settings.autoSkipAd);
    if (!wantSkip) return;
    if (autoSkippedRef.current === realActiveSkip) return;
    autoSkippedRef.current = realActiveSkip;
    onSkip(realActiveSkip.endSec);
  }, [
    settings.autoSkipIntro,
    settings.autoSkipRecap,
    settings.autoSkipOutro,
    settings.autoSkipAd,
    allowAutoSkip,
    realActiveSkip,
    onSkip,
  ]);

  const [autoHiddenKey, setAutoHiddenKey] = useState<string | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setAutoHiddenKey(null);
    setDismissedKeys(new Set());
  }, [skipSegments]);
  const buttonKey =
    realActiveSkip && settings.showSkipButton
      ? `${realActiveSkip.kind}:${Math.round(realActiveSkip.startSec)}:${Math.round(realActiveSkip.endSec)}`
      : null;
  useEffect(() => {
    if (!buttonKey || settings.skipButtonHideSec <= 0) return;
    const id = window.setTimeout(() => setAutoHiddenKey(buttonKey), settings.skipButtonHideSec * 1000);
    return () => window.clearTimeout(id);
  }, [buttonKey, settings.skipButtonHideSec]);
  const skipHidden =
    buttonKey != null && (buttonKey === autoHiddenKey || dismissedKeys.has(buttonKey));
  const displaySkip = settings.showSkipButton && !skipHidden ? realActiveSkip : null;
  const activeSkip = displaySkip ?? syntheticOutro;
  const mobileUpNextActive =
    isMobileNative() &&
    hasNextEpDisplay &&
    nextEp != null &&
    durationSec > 0 &&
    leadSec > 0 &&
    remainingSec <= leadSec &&
    // A real skippable segment (ad/intro/outro) in the final window must keep its
    // own button; do not let the up-next card hide a skip the user needs to tap.
    !displaySkip;

  if (mobileUpNextActive) {
    return (
      <MobileUpNextCard
        nextEp={nextEp}
        nextEpMask={nextEpMask}
        remainingSec={remainingSec}
        leadSec={leadSec}
        // The card never advances on its own; useAutoNextEpisode owns the gated
        // auto-advance. This flag only mirrors that path for the countdown ring.
        autoAdvancing={settings.autoPlayNextEpisode && durationSec >= 150}
        visible={visible}
        onNextEpisode={onNextEpisode}
        onCancelAutoNext={onCancelAutoNext}
      />
    );
  }

  return (
    <SkipPill
      engine={engine}
      segment={activeSkip}
      hasNextEp={hasNextEpDisplay && leadSec > 0}
      nextEp={nextEp}
      nextEpMask={nextEpMask}
      remainingSec={remainingSec}
      leadSec={leadSec}
      visible={visible}
      onSkip={() => {
        if (activeSkip) onSkip(activeSkip.endSec);
      }}
      onNextEpisode={onNextEpisode}
      onCancelAutoNext={onCancelAutoNext}
      onDismiss={
        displaySkip && buttonKey
          ? () => setDismissedKeys((prev) => new Set(prev).add(buttonKey))
          : undefined
      }
    />
  );
}
