import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { SyncIndicatorPosition } from "@/lib/sync-toast-position";
import { SetIcon } from "@/views/settings/set-icon";
import { ControlRow, Group, Rows, Segmented, ToggleRow } from "./phone-kit";

const POSITIONS: ReadonlyArray<{ value: SyncIndicatorPosition; label: string }> = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
  { value: "bottom-center", label: "Bottom center" },
];

// views/settings/sync-indicator-setting.tsx: the badge over the player when an
// episode syncs to AniList or MyAnimeList.
export function SyncIndicatorGroup() {
  const t = useT();
  const { settings, update } = useSettings();
  return (
    <Group
      title={t("Sync indicator")}
      note={t("The badge that appears over the player when an episode syncs to your tracker.")}
    >
      <Rows>
        <ToggleRow
          icon={<SetIcon name="BadgeCheck" size={20} />}
          label={t("Show sync indicator")}
          sub={t("Turn off to hide the sync badge during playback.")}
          on={settings.syncIndicator}
          onChange={(v) => update({ syncIndicator: v })}
        />
        {settings.syncIndicator && (
          <ControlRow label={t("Position")} sub={t("Corners keep it clear of subtitles along the bottom.")}>
            <Segmented<SyncIndicatorPosition>
              label={t("Position")}
              value={settings.syncIndicatorPosition}
              options={POSITIONS.map((o) => ({ ...o, label: t(o.label) }))}
              onChange={(v) => update({ syncIndicatorPosition: v })}
              columns={2}
            />
          </ControlRow>
        )}
      </Rows>
    </Group>
  );
}
