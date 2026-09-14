import { Check, Shuffle } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { nameEquals } from "@/lib/account/name-sync";
import {
  getNameSyncState,
  retryNameSync,
  subscribeNameSyncState,
} from "@/lib/account/name-sync-state";
import { useAvatarValues } from "@/lib/avatars/library";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import type { ProfileAudioMode } from "@/lib/settings/types";
import { currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { useTogether } from "@/lib/together/provider";
import { resizeAvatar } from "@/views/settings/account/avatar-utils";
import { CustomColorPanel, HARBOR_COLOR_SWATCHES } from "@/views/settings/color-picker";
import { SetIcon } from "@/views/settings/set-icon";
import { AvatarCatalogSheet } from "./avatar-catalog-sheet";
import {
  AvatarDisc,
  BottomSheet,
  ControlRow,
  FIELD,
  FOCUS,
  Field,
  Group,
  PhonePage,
  PillButton,
  Row,
  Rows,
  Segmented,
} from "./phone-kit";

const AUDIO_MODES: ReadonlyArray<{ value: ProfileAudioMode; label: string }> = [
  { value: "auto", label: "Play automatically" },
  { value: "click", label: "Only when I press play" },
  { value: "off", label: "Never" },
];

// Account > Your profile from desktop settings (identity-tab.tsx): display
// name, avatar, colour and the profile songs preference. Writes go to the same
// places (harborColor / harborAvatar settings plus the active profile) so a
// paired desktop sees the same identity.
export function IdentityPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const { settings, update } = useSettings();
  const { displayName, setDisplayName } = useTogether();
  const { activeProfile, updateProfile } = useProfiles();
  const avatarValues = useAvatarValues();
  const [author, setAuthor] = useState(currentAuthor);
  const nameSync = useSyncExternalStore(subscribeNameSyncState, getNameSyncState, getNameSyncState);
  const syncPhase = nameSync.accountId === author?.id ? nameSync.phase : "idle";
  useEffect(() => subscribeAuthor(() => setAuthor(currentAuthor())), []);

  const [nameDraft, setNameDraft] = useState(displayName);
  const draftRef = useRef(displayName);
  const previousNameRef = useRef(displayName);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // A late account read must not erase text still being edited in this field:
    // only follow the store while the draft still matches what it last held.
    if (nameEquals(draftRef.current, previousNameRef.current)) {
      draftRef.current = displayName;
      setNameDraft(displayName);
    }
    previousNameRef.current = displayName;
  }, [displayName]);

  const setDraft = (next: string) => {
    draftRef.current = next;
    setNameDraft(next);
  };

  const pushIdentity = (patch: { harborColor?: string; harborAvatar?: string | null }) => {
    update(patch);
    if (!activeProfile) return;
    const profilePatch: { color?: string; avatar?: string | null } = {};
    if (patch.harborColor !== undefined) profilePatch.color = patch.harborColor;
    if (patch.harborAvatar !== undefined) profilePatch.avatar = patch.harborAvatar;
    if (Object.keys(profilePatch).length > 0) updateProfile(activeProfile.id, profilePatch);
  };

  const commitName = () => {
    const trimmed = draftRef.current.trim() || displayName;
    if (nameEquals(trimmed, displayName)) return;
    setDisplayName(trimmed);
    if (activeProfile && trimmed && trimmed !== activeProfile.name) {
      updateProfile(activeProfile.id, { name: trimmed });
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      pushIdentity({ harborAvatar: await resizeAvatar(file, 320) });
    } catch (err) {
      console.warn("[avatar] resize failed", err);
    }
  };

  const stremioAvatar = user?.avatar ?? null;
  const customAvatar = activeProfile?.avatar ?? settings.harborAvatar ?? null;
  const effectiveAvatar = customAvatar ?? stremioAvatar;
  const color = settings.harborColor;
  const isPreset = HARBOR_COLOR_SWATCHES.includes(color.toLowerCase());
  const nameDirty = !nameEquals(nameDraft.trim(), displayName);

  return (
    <PhonePage kicker={t("Account")} title={t("Your profile")} onClose={onClose} wash={color}>
      <section className="flex flex-col items-center gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t("Change your picture")}
          className={`rounded-full ${FOCUS}`}
        >
          <AvatarDisc src={effectiveAvatar} color={color} size={104} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
        <div className="flex w-full flex-col gap-2">
          <Field
            label={t("Display name")}
            hint={
              syncPhase === "error"
                ? t("Could not sync your display name. Check your connection and try again.")
                : syncPhase === "saving"
                  ? t("Syncing display name…")
                  : syncPhase === "saved" && !nameDirty
                    ? t("Display name saved to your Harbor account.")
                    : author?.handle
                      ? `@${author.handle}`
                      : undefined
            }
          >
            <div className="flex gap-2">
              <input
                value={nameDraft}
                maxLength={32}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitName();
                    e.currentTarget.blur();
                  }
                }}
                autoComplete="nickname"
                className={FIELD}
              />
              {(nameDirty || syncPhase === "error") && (
                <PillButton variant="primary" onClick={nameDirty ? commitName : retryNameSync}>
                  {t(nameDirty ? "Save" : "Try again")}
                </PillButton>
              )}
            </div>
          </Field>
        </div>
      </section>

      <Group
        title={t("Avatar")}
        note={t("Upload a picture of your own, or pick one from the Harbor catalog.")}
      >
        <Rows>
          <Row
            icon={<SetIcon name="ImagePlus" size={20} />}
            label={t("Upload photo")}
            onClick={() => fileRef.current?.click()}
          />
          <Row
            icon={<SetIcon name="Images" size={20} />}
            label={t("Choose an avatar")}
            value={t("{n} avatars", { n: avatarValues.length })}
            onClick={() => setCatalogOpen(true)}
          />
          <Row
            icon={<Shuffle size={19} strokeWidth={2.2} />}
            label={t("Random avatar")}
            onClick={() => {
              if (avatarValues.length) {
                pushIdentity({
                  harborAvatar: avatarValues[Math.floor(Math.random() * avatarValues.length)],
                });
              }
            }}
          />
          {customAvatar && (
            <Row
              icon={<SetIcon name="RotateCcw" size={20} />}
              label={stremioAvatar ? t("Reset to Stremio avatar") : t("Reset to default")}
              danger
              onClick={() => pushIdentity({ harborAvatar: null })}
            />
          )}
        </Rows>
      </Group>

      <Group
        title={t("Your color")}
        note={t("Colors your name, your cursor in Watch Together, and the ring around your avatar.")}
      >
        <div className="flex flex-wrap items-center gap-1 px-3 py-3">
          {HARBOR_COLOR_SWATCHES.map((hex) => {
            const selected = color.toLowerCase() === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => pushIdentity({ harborColor: hex })}
                aria-label={hex}
                aria-pressed={selected}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${FOCUS}`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-full transition-transform ${selected ? "scale-110" : ""}`}
                  style={{ background: hex }}
                >
                  {selected && (
                    <span className="grid h-[18px] w-[18px] place-items-center rounded-full bg-ink text-canvas">
                      <Check size={13} strokeWidth={3.2} />
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setColorOpen(true)}
            className={`ms-auto flex min-h-11 items-center gap-2 rounded-full border px-4 text-[13.5px] font-semibold ${FOCUS} ${
              isPreset ? "border-edge-soft/70 text-ink-muted" : "border-ink text-ink"
            }`}
          >
            <span aria-hidden className="h-4 w-4 shrink-0 rounded-full ring-1 ring-edge" style={{ background: color }} />
            {isPreset ? t("Custom") : color.toUpperCase()}
          </button>
        </div>
      </Group>

      <Group
        title={t("Profile songs")}
        note={t("People can pin a track to their profile. This controls what happens when you visit one.")}
      >
        <ControlRow
          icon={<SetIcon name="Music" size={20} />}
          label={t("When you open a profile")}
          sub={
            settings.profileAudio === "off"
              ? t("Profile songs stay hidden and never play.")
              : t("You can always mute or stop a song from the card itself.")
          }
        >
          <Segmented<ProfileAudioMode>
            label={t("When you open a profile")}
            value={settings.profileAudio}
            options={AUDIO_MODES.map((o) => ({ ...o, label: t(o.label) }))}
            onChange={(v) => update({ profileAudio: v })}
            columns={1}
          />
        </ControlRow>
      </Group>

      {catalogOpen && (
        <AvatarCatalogSheet
          current={effectiveAvatar}
          onPick={(value) => {
            pushIdentity({ harborAvatar: value });
            setCatalogOpen(false);
          }}
          onClose={() => setCatalogOpen(false)}
        />
      )}
      {colorOpen && (
        <BottomSheet
          title={t("Your color")}
          onClose={() => setColorOpen(false)}
          footer={
            <PillButton full variant="primary" onClick={() => setColorOpen(false)}>
              {t("Done")}
            </PillButton>
          }
        >
          <CustomColorPanel value={color} onChange={(c) => pushIdentity({ harborColor: c })} />
        </BottomSheet>
      )}
    </PhonePage>
  );
}
