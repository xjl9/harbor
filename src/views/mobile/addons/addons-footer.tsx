import { useState } from "react";
import { AgeGateModal } from "@/components/age-gate-modal";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { SetIcon } from "@/views/settings/set-icon";
import { Department, FOCUS, Group, Row, tapHaptic, ToggleRow } from "./kit";

const CHOICES = [15, 30, 45, 60, 90] as const;

// The addons page footer: the desktop AddonTimeoutSetting as tappable choices,
// the adult toggle behind the same age gate desktop uses, and the door to the
// plugins sheet so the two source systems sit next to each other.
export function AddonsFooter({
  index,
  onOpenPlugins,
}: {
  index: number;
  onOpenPlugins: () => void;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const raw = settings.addonTimeoutSec ?? 30;
  const current = Number.isFinite(raw) ? Math.max(8, Math.min(120, raw)) : 30;
  const choices = [...new Set<number>([...CHOICES, current])].sort((a, b) => a - b);

  return (
    <>
      <Department
        index={index}
        kicker={t("Sources")}
        folio={String(index + 1).padStart(2, "0")}
        title={t("Addon wait time")}
        standfirst={t("How long Harbor waits for each addon to return results.")}
      >
        <div role="radiogroup" aria-label={t("Addon wait time")} className="flex flex-wrap gap-2">
          {choices.map((seconds) => {
            const active = seconds === current;
            return (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  if (active) return;
                  tapHaptic();
                  update({ addonTimeoutSec: seconds });
                }}
                className={`no-press flex h-11 items-center rounded-full px-4 text-[13.5px] font-semibold transition-colors ${
                  active ? "bg-ink text-canvas" : "bg-elevated/50 text-ink-muted ring-1 ring-edge-soft/60"
                } ${FOCUS}`}
              >
                {seconds === 30 ? t("30 seconds (default)") : t("{seconds} seconds", { seconds })}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-muted">
          {t("Results appear as they arrive. Increase the wait time if an addon often needs a refresh before its results appear.")}
        </p>
      </Department>

      <Department
        index={index + 1}
        kicker={t("Sources")}
        folio={String(index + 2).padStart(2, "0")}
        title={t("More sources")}
      >
        <Group>
          <ToggleRow
            icon={<SetIcon name="Shield" size={20} strokeWidth={2} />}
            label={t("Show adult addons")}
            sub={t("Hidden unless you pass the age check.")}
            on={settings.showAdultAddons}
            onChange={(v) => {
              if (!v) {
                update({ showAdultAddons: false });
                return;
              }
              setAgeGateOpen(true);
            }}
          />
          <Row
            icon={<SetIcon name="Blocks" size={20} strokeWidth={2} />}
            label={t("Plugins")}
            sub={t("Small scripts that look for streams on sites Harbor does not know about.")}
            onClick={onOpenPlugins}
          />
        </Group>
      </Department>

      <AgeGateModal
        open={ageGateOpen}
        onClose={() => setAgeGateOpen(false)}
        onPass={() => update({ showAdultAddons: true })}
      />
    </>
  );
}
