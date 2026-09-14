import { Check, Lock, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { AvatarImage } from "@/components/avatar-image";
import { useT } from "@/lib/i18n";
import { verifyProfilePassword } from "@/lib/profile-password";
import { useProfiles, type Profile } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { SetIcon } from "@/views/settings/set-icon";
import { PinPage } from "./pin-page";
import { ProfileEditorPage } from "./profile-editor";
import {
  BottomSheet,
  ControlRow,
  FOCUS,
  Group,
  PhonePage,
  Row,
  Rows,
  Segmented,
} from "./phone-kit";

const INTERVALS = [
  { value: "launch", label: "Every launch" },
  { value: "15m", label: "Every 15 min" },
  { value: "30m", label: "Every 30 min" },
  { value: "never", label: "Never" },
] as const;
type Interval = (typeof INTERVALS)[number]["value"];

type View =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "edit"; profile: Profile }
  | { kind: "unlock"; profile: Profile };

// Account > Profiles from desktop settings: the profile strip (switch, edit,
// add), the settings scope for the active profile, and the startup defaults.
export function ProfilesPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { profiles, activeProfile, selectProfile, updateProfile, sessionUnlockedIds } =
    useProfiles();
  const { settings, update, setSettingsLinked } = useSettings();
  const [view, setView] = useState<View>({ kind: "list" });
  const [startAsOpen, setStartAsOpen] = useState(false);

  const linked = activeProfile ? activeProfile.settingsLinked !== false : true;
  const setScope = (next: boolean) => {
    if (!activeProfile || next === linked) return;
    setSettingsLinked(next);
    updateProfile(activeProfile.id, { settingsLinked: next });
  };

  const switchTo = (p: Profile) => {
    if (p.id === activeProfile?.id) {
      setView({ kind: "edit", profile: p });
      return;
    }
    if (p.passwordHash && !sessionUnlockedIds.has(p.id)) {
      setView({ kind: "unlock", profile: p });
      return;
    }
    selectProfile(p.id, { unlocked: sessionUnlockedIds.has(p.id) });
  };

  if (view.kind === "create") {
    return (
      <ProfileEditorPage
        mode={{ kind: "create" }}
        onClose={() => setView({ kind: "list" })}
        onDone={() => setView({ kind: "list" })}
      />
    );
  }
  if (view.kind === "edit") {
    return (
      <ProfileEditorPage
        mode={{ kind: "edit", profile: view.profile }}
        onClose={() => setView({ kind: "list" })}
        onDone={() => setView({ kind: "list" })}
      />
    );
  }
  if (view.kind === "unlock" && view.profile.passwordHash) {
    const hash = view.profile.passwordHash;
    return (
      <PinPage
        title={t("Enter {name}'s PIN", { name: view.profile.name })}
        subtitle={t("Profile is locked. Enter the 4-digit PIN to continue.")}
        mode="verify"
        verify={(pin) => verifyProfilePassword(pin, hash)}
        onBack={() => setView({ kind: "list" })}
        onComplete={() => {
          selectProfile(view.profile.id, { unlocked: true });
          setView({ kind: "list" });
        }}
      />
    );
  }

  const interval: Interval = settings.profilePromptInterval ?? "launch";
  const defaultId = settings.defaultProfileId ?? "";
  const defaultProfile = profiles.find((p) => p.id === defaultId) ?? null;
  const isPrimary = !!activeProfile?.isPrimary;

  return (
    <PhonePage kicker={t("Account")} title={t("Profiles")} onClose={onClose} wash={activeProfile?.color}>
      <section className="flex flex-col gap-4">
        <p className="px-1 text-[13px] leading-relaxed text-ink-muted">
          {t("Create profiles for the people who use Harbor. Each can have its own appearance, settings, and PIN.")}{" "}
          {t("Choose a profile to switch. Use the pencil to edit its details and access settings.")}
        </p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
          {profiles.map((p) => {
            const active = p.id === activeProfile?.id;
            const locked = !!p.passwordHash && !sessionUnlockedIds.has(p.id);
            const canEdit = isPrimary || active;
            return (
              <div
                key={p.id}
                className={`relative flex flex-col items-center gap-3 rounded-2xl border bg-elevated/40 px-2 pb-3 pt-4 ${
                  active ? "border-accent" : "border-white/[0.06]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => switchTo(p)}
                  aria-label={active ? t("Edit {name}", { name: p.name }) : t("Switch to {name}", { name: p.name })}
                  className={`flex w-full flex-col items-center gap-2.5 rounded-xl outline-none ${FOCUS}`}
                >
                  <span className="relative">
                    <span
                      className="flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full bg-elevated"
                      style={{ boxShadow: `0 0 0 3px ${p.color}` }}
                    >
                      <AvatarImage src={p.avatar} className="h-full w-full object-cover" />
                    </span>
                    {locked && (
                      <span className="absolute -bottom-0.5 -end-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-canvas text-ink ring-1 ring-edge">
                        <Lock size={12} strokeWidth={2.4} />
                      </span>
                    )}
                  </span>
                  <span className="flex w-full flex-col items-center gap-1.5">
                    <span className="max-w-full truncate text-[14px] font-medium text-ink">{p.name}</span>
                    <span className="flex min-h-[20px] items-center">
                      {active ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-accent/12 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent">
                          <Check size={11} strokeWidth={3} />
                          {t("Active")}
                        </span>
                      ) : p.isPrimary ? (
                        <span className="inline-flex items-center rounded-md bg-raised/70 px-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                          {t("profile.primary")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setView({ kind: "edit", profile: p })}
                    aria-label={t("Edit {name}", { name: p.name })}
                    className={`absolute -end-1 -top-1 flex h-11 w-11 items-center justify-center rounded-full text-ink-subtle ${FOCUS}`}
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas/95 ring-1 ring-edge">
                      <Pencil size={13} strokeWidth={2.2} />
                    </span>
                  </button>
                )}
              </div>
            );
          })}
          {isPrimary && (
            <button
              type="button"
              onClick={() => setView({ kind: "create" })}
              aria-label={t("Add profile")}
              className={`flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-edge bg-elevated/20 px-2 pb-3 pt-4 text-ink-subtle transition-colors active:bg-elevated/60 ${FOCUS}`}
            >
              <span className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-elevated">
                <Plus size={24} strokeWidth={2.2} />
              </span>
              <span className="text-[14px] font-medium text-ink-muted">{t("Add")}</span>
              <span className="min-h-[20px]" />
            </button>
          )}
        </div>
      </section>

      {activeProfile && (
        <Group>
          <ControlRow
            icon={<SetIcon name="SlidersHorizontal" size={20} />}
            label={t("Settings for this profile")}
            sub={
              linked
                ? t("One set of preferences everyone on this Harbor uses.")
                : t("This profile keeps its own preferences, separate from everyone else.")
            }
          >
            <Segmented
              label={t("Settings for this profile")}
              value={linked ? "shared" : "independent"}
              options={[
                { value: "shared", label: t("Shared") },
                { value: "independent", label: t("Independent") },
              ]}
              onChange={(v) => setScope(v === "shared")}
              columns={2}
            />
          </ControlRow>
        </Group>
      )}

      {profiles.length > 1 && (
        <Group title={t("Startup & default")}>
          <Rows>
            <ControlRow
              icon={<SetIcon name="Clock" size={20} />}
              label={t("Who's watching")}
              sub={t("Choose when Harbor asks you to pick a profile. Timed prompts appear when you return to Harbor.")}
            >
              <Segmented<Interval>
                label={t("Who's watching")}
                value={interval}
                options={INTERVALS.map((o) => ({ ...o, label: t(o.label) }))}
                onChange={(v) => update({ profilePromptInterval: v })}
                columns={2}
              />
            </ControlRow>
            <Row
              icon={<SetIcon name="UserCheck" size={20} />}
              label={t("Start as")}
              sub={t("Open this profile at launch. Timed prompts can still appear later. Profiles with a PIN cannot be a default.")}
              value={defaultProfile?.name ?? t("No default profile")}
              onClick={() => setStartAsOpen(true)}
            />
          </Rows>
        </Group>
      )}

      {startAsOpen && (
        <BottomSheet title={t("Start as")} onClose={() => setStartAsOpen(false)}>
          <div className="-mx-2 flex flex-col">
            <PickRow
              on={!defaultId}
              label={t("No default profile")}
              onClick={() => {
                update({ defaultProfileId: "" });
                setStartAsOpen(false);
              }}
            />
            {profiles
              .filter((p) => !p.passwordHash)
              .map((p) => (
                <PickRow
                  key={p.id}
                  on={defaultId === p.id}
                  label={p.name}
                  avatar={p.avatar}
                  color={p.color}
                  onClick={() => {
                    update({ defaultProfileId: p.id });
                    setStartAsOpen(false);
                  }}
                />
              ))}
          </div>
        </BottomSheet>
      )}
    </PhonePage>
  );
}

function PickRow({
  on,
  label,
  avatar,
  color,
  onClick,
}: {
  on: boolean;
  label: string;
  avatar?: string | null;
  color?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-12 items-center gap-3 rounded-xl px-2 text-start transition-colors active:bg-raised/60 ${FOCUS}`}
    >
      {color !== undefined && (
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-elevated"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        >
          <AvatarImage src={avatar} className="h-full w-full object-cover" />
        </span>
      )}
      <span className={`min-w-0 flex-1 truncate text-[15px] ${on ? "font-semibold text-ink" : "text-ink-muted"}`}>
        {label}
      </span>
      {on && <Check size={16} strokeWidth={2.6} className="shrink-0 text-accent" />}
    </button>
  );
}
