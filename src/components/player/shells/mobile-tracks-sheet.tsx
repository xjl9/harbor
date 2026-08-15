import { useState } from "react";
import type { TrackInfo } from "@/lib/player/bridge";
import type { SubtitleAddHandler } from "@/lib/player/subtitle-load";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { haptics } from "@/lib/player/haptics";
import { AudioMenuBody } from "../audio-menu";
import { SubtitleMenuBody } from "../subtitle-menu";
import { MobileSheet } from "./mobile-sheet";

type Tab = "subtitles" | "audio";

// One sheet, two segmented tabs — the Netflix "Audio & Subtitles" model. Reuses
// the exact desktop menu bodies so track metadata (codec, forced, delay/sync)
// stays identical; only the presentation (bottom sheet vs anchored dropdown) changes.
export function MobileTracksSheet({
  open,
  onClose,
  initialTab,
  engine,
  audioTracks,
  subtitleTracks,
  audioDelaySec,
  subDelaySec,
  onAudio,
  onSubtitle,
  onAudioDelay,
  onSubDelay,
  onAddSubtitle,
  onEnterSync,
  onOpenSubStyle,
  metaImdbId,
  metaTitle,
  metaReleaseDate,
  season,
  episode,
}: {
  open: boolean;
  onClose: () => void;
  initialTab: Tab;
  engine: "html5" | "mpv" | "native";
  audioTracks: TrackInfo[];
  subtitleTracks: TrackInfo[];
  audioDelaySec: number;
  subDelaySec: number;
  onAudio: (id: string) => void;
  onSubtitle: (id: string | null) => void;
  onAudioDelay: (sec: number) => void;
  onSubDelay: (sec: number) => void;
  onAddSubtitle: SubtitleAddHandler;
  onEnterSync?: () => void;
  onOpenSubStyle: () => void;
  metaImdbId?: string | null;
  metaTitle?: string | null;
  metaReleaseDate?: string | null;
  season?: number | null;
  episode?: number | null;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>(initialTab);
  const showAudioTab = engine !== "html5";
  const activeTab: Tab = showAudioTab ? tab : "subtitles";
  const preferredLanguages =
    settings.preferredSubLangs.length > 0 ? settings.preferredSubLangs : settings.preferredLanguages;

  return (
    <MobileSheet open={open} onClose={onClose} heightClass="h-[68vh]">
      {showAudioTab && (
        <div className="px-4 pb-3">
          <div className="flex rounded-full bg-raised p-1">
            <SegButton label={t("Subtitles")} active={activeTab === "subtitles"} onClick={() => setTab("subtitles")} />
            <SegButton label={t("Audio")} active={activeTab === "audio"} onClick={() => setTab("audio")} />
          </div>
        </div>
      )}
      <div className="flex h-full min-h-0 flex-col">
        {activeTab === "subtitles" ? (
          <SubtitleMenuBody
            tracks={subtitleTracks}
            selectedId={subtitleTracks.find((x) => x.selected)?.id ?? null}
            delaySec={subDelaySec}
            onSelect={(id) => {
              haptics.select();
              onSubtitle(id);
            }}
            onDelay={onSubDelay}
            onEnterSync={onEnterSync}
            onAddSubtitle={onAddSubtitle}
            metaImdbId={metaImdbId}
            metaTitle={metaTitle}
            metaReleaseDate={metaReleaseDate}
            season={season}
            episode={episode}
            preferredLanguages={preferredLanguages}
            onOpenStyleBar={onOpenSubStyle}
            onClose={onClose}
          />
        ) : (
          <AudioMenuBody
            tracks={audioTracks}
            selectedId={audioTracks.find((x) => x.selected)?.id ?? null}
            delaySec={audioDelaySec}
            engine={engine}
            onSelect={(id) => {
              haptics.select();
              onAudio(id);
            }}
            onDelay={onAudioDelay}
            onClose={onClose}
          />
        )}
      </div>
    </MobileSheet>
  );
}

function SegButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 flex-1 rounded-full text-[13.5px] font-semibold transition-colors ${
        active ? "bg-ink text-canvas" : "text-ink-muted"
      }`}
    >
      {label}
    </button>
  );
}
