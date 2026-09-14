import { Check, Loader2, Shuffle } from "lucide-react";
import { useRef, useState } from "react";
import anilistLogo from "@/assets/anilist.png";
import simklLogo from "@/assets/simkl.png";
import traktLogo from "@/assets/trakt.svg";
import { emitListToast } from "@/components/lists/list-toast";
import { KidToggle } from "@/components/profile-picker/kid-toggle";
import { KidsSetupPanel } from "@/components/profile-picker/kids-setup-panel";
import { fetchAnilistAvatar } from "@/lib/anilist/profile";
import { useAnilist } from "@/lib/anilist/provider";
import { useAvatarValues } from "@/lib/avatars/library";
import { useT } from "@/lib/i18n";
import { hashProfilePassword, verifyProfilePassword } from "@/lib/profile-password";
import {
  nextProfileColor,
  useProfiles,
  type KidConfig,
  type Profile,
  type ProfileColor,
} from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { fetchSimklAvatar } from "@/lib/simkl/profile";
import { useSimkl } from "@/lib/simkl/provider";
import { fetchTraktAvatar } from "@/lib/trakt/profile";
import { useTrakt } from "@/lib/trakt/provider";
import { resizeAvatar } from "@/views/settings/account/avatar-utils";
import { CustomColorPanel, HARBOR_COLOR_SWATCHES } from "@/views/settings/color-picker";
import { SetIcon } from "@/views/settings/set-icon";
import { AvatarCatalogSheet } from "./avatar-catalog-sheet";
import {
  AvatarDisc,
  BottomSheet,
  ConfirmSheet,
  FIELD,
  FOCUS,
  Field,
  Group,
  PhonePage,
  PillButton,
  Row,
  Rows,
} from "./phone-kit";
import { PinPage } from "./pin-page";

type AvatarSource = "trakt" | "anilist" | "simkl" | "upload" | "builtin" | "removed" | null;
type SubView = "main" | "pin-set" | "pin-change" | "pin-remove";

// Phone counterpart of components/profile-picker/editor-view.tsx. Same model,
// same save semantics (kids config with a hashed parent PIN, profile PIN,
// Stremio sharing, avatar-source flags), laid out as one scrolling page with a
// pinned Save bar. The desktop-only pieces are left out on purpose: locked
// sidebar tabs (the phone shell has no sidebar) and the copy-data-from-primary
// import flow.
export function ProfileEditorPage({
  mode,
  onClose,
  onDone,
}: {
  mode: { kind: "create" } | { kind: "edit"; profile: Profile };
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const {
    profiles,
    activeProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
    setPrimary,
  } = useProfiles();
  const { update } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: anilistConnected } = useAnilist();
  const { isConnected: simklConnected } = useSimkl();
  const avatarValues = useAvatarValues();

  const editing = mode.kind === "edit" ? mode.profile : null;
  const primary = profiles.find((p) => p.isPrimary);
  const activeIsPrimary = !!activeProfile?.isPrimary;
  const isOwnProfile = editing?.id === activeProfile?.id;
  const isPrimary = editing?.isPrimary === true;
  const showAdvanced = activeIsPrimary || mode.kind === "create";
  const canShare = !isPrimary && !!primary && primary.id !== editing?.id;

  const [name, setName] = useState(editing?.name ?? "");
  const [avatar, setAvatar] = useState<string | null>(editing?.avatar ?? null);
  const [avatarSource, setAvatarSource] = useState<AvatarSource>(null);
  const [color, setColor] = useState<ProfileColor>(
    editing?.color ?? nextProfileColor(profiles),
  );
  const [shareWith, setShareWith] = useState<string | null>(
    editing ? editing.shareStremioWith : (primary?.id ?? null),
  );
  const [draftKid, setDraftKid] = useState<KidConfig | null>(editing?.kid ?? null);
  const [draftParentPin, setDraftParentPin] = useState<string | null>(null);
  const [draftPin, setDraftPin] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubView>("main");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "primary" | "share" | null>(null);
  const [fetching, setFetching] = useState<"trakt" | "anilist" | "simkl" | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const trimmed = name.trim();
  const canSave =
    trimmed.length > 0 && (!draftKid || !draftParentPin || draftParentPin.length === 4);
  const locked = editing ? !!editing.passwordHash : draftPin != null;
  const isPreset = HARBOR_COLOR_SWATCHES.includes(color.toLowerCase());

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAvatar(await resizeAvatar(file, 320));
      setAvatarSource("upload");
    } catch (err) {
      console.warn("[profile] avatar resize failed", err);
    }
  };

  const useTrackerAvatar = async (which: "trakt" | "anilist" | "simkl") => {
    setFetching(which);
    setFetchError(null);
    const fetcher =
      which === "trakt" ? fetchTraktAvatar : which === "anilist" ? fetchAnilistAvatar : fetchSimklAvatar;
    const service = which === "trakt" ? "Trakt" : which === "anilist" ? "AniList" : "Simkl";
    try {
      const url = await fetcher();
      if (!url) {
        setFetchError(t("No {service} avatar found on your account.", { service }));
        return;
      }
      setAvatar(url);
      setAvatarSource(which);
    } catch {
      setFetchError(t("Couldn't reach {service}.", { service }));
    } finally {
      setFetching(null);
    }
  };

  const randomAvatar = () => {
    if (!avatarValues.length) return;
    setAvatar(avatarValues[Math.floor(Math.random() * avatarValues.length)]);
    setAvatarSource("builtin");
  };

  const submit = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      let kidToSave = draftKid;
      if (draftKid) {
        let parentPinHash = editing?.kid?.parentPinHash ?? null;
        if (draftParentPin && draftParentPin.length === 4) {
          parentPinHash = await hashProfilePassword(draftParentPin);
        }
        kidToSave = { age: draftKid.age, curfewMinutes: draftKid.curfewMinutes ?? null, parentPinHash };
      }
      if (editing) {
        updateProfile(editing.id, {
          name: trimmed,
          avatar,
          color,
          kid: kidToSave,
          ...(canShare ? { shareStremioWith: shareWith } : {}),
        });
      } else {
        const p = createProfile({ name: trimmed, avatar, color, kid: kidToSave });
        const patch: Parameters<typeof updateProfile>[1] = {};
        if (canShare && shareWith !== p.shareStremioWith) patch.shareStremioWith = shareWith;
        if (draftPin) patch.passwordHash = await hashProfilePassword(draftPin);
        if (Object.keys(patch).length > 0) updateProfile(p.id, patch);
        // unlocked: the user set this PIN seconds ago in this very form. Without
        // the flag selectProfile refuses the profile they just created.
        selectProfile(p.id, { unlocked: true });
      }
      if (avatarSource && (isOwnProfile || mode.kind === "create")) {
        update({
          useAnilistAvatar: avatarSource === "anilist",
          useTraktAvatar: avatarSource === "trakt",
          useSimklAvatar: avatarSource === "simkl",
        });
      }
      onDone();
    } finally {
      setSaving(false);
    }
  };

  if (subView === "pin-set") {
    return (
      <PinPage
        key="pin-set"
        title={editing ? t("Set a PIN for {name}", { name: trimmed || editing.name }) : t("Set a PIN")}
        subtitle={t("Pick a 4-digit PIN. You'll be asked for it before this profile opens.")}
        mode="set"
        onBack={() => setSubView("main")}
        onComplete={async (pin) => {
          if (editing) updateProfile(editing.id, { passwordHash: await hashProfilePassword(pin) });
          else setDraftPin(pin);
          setSubView("main");
        }}
      />
    );
  }
  if (subView === "pin-change" && editing?.passwordHash) {
    const hash = editing.passwordHash;
    return (
      <PinPage
        key="pin-change"
        title={t("Enter current PIN")}
        subtitle={t("Confirm your current PIN, then pick a new one.")}
        mode="verify"
        onBack={() => setSubView("main")}
        verify={(pin) => verifyProfilePassword(pin, hash)}
        onComplete={() => setSubView("pin-set")}
      />
    );
  }
  if (subView === "pin-remove" && editing?.passwordHash) {
    const hash = editing.passwordHash;
    return (
      <PinPage
        key="pin-remove"
        title={t("Enter current PIN")}
        subtitle={t("Confirm your current PIN to remove the lock.")}
        mode="verify"
        onBack={() => setSubView("main")}
        verify={(pin) => verifyProfilePassword(pin, hash)}
        onComplete={() => {
          updateProfile(editing.id, { passwordHash: null });
          setSubView("main");
        }}
      />
    );
  }

  const chip =
    "flex min-h-11 items-center gap-2 rounded-full border border-edge-soft/70 bg-elevated/50 px-4 text-[13.5px] font-semibold text-ink-muted transition-colors active:bg-raised/60 disabled:opacity-50";

  return (
    <PhonePage
      kicker={editing ? t("Edit profile") : t("profile.new")}
      title={editing ? editing.name : t("profile.new")}
      onClose={onClose}
      wash={color}
      footer={
        <>
          <PillButton full onClick={onClose}>
            {t("Cancel")}
          </PillButton>
          <PillButton full variant="primary" onClick={() => void submit()} disabled={!canSave} busy={saving}>
            {editing ? t("Save") : t("Create profile")}
          </PillButton>
        </>
      }
    >
      {/* Identity: avatar, name and the ways to change the picture. */}
      <section className="flex flex-col items-center gap-5">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t("Change your picture")}
          className={`rounded-full ${FOCUS}`}
        >
          <AvatarDisc src={avatar} color={color} size={104} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickFile}
          className="hidden"
        />
        <div className="flex w-full flex-col gap-3">
          <Field label={t("Display name")}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Display name")}
              maxLength={32}
              autoComplete="nickname"
              className={FIELD}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className={`${chip} ${FOCUS}`}>
              <SetIcon name="ImagePlus" size={16} />
              {t("Upload photo")}
            </button>
            <button type="button" onClick={() => setCatalogOpen(true)} className={`${chip} ${FOCUS}`}>
              <AvatarFanPeek values={avatarValues} />
              {t("Choose an avatar")}
            </button>
            <button type="button" onClick={randomAvatar} aria-label={t("Random avatar")} className={`${chip} ${FOCUS}`}>
              <Shuffle size={15} strokeWidth={2.2} />
            </button>
            {traktConnected && (
              <button type="button" onClick={() => void useTrackerAvatar("trakt")} disabled={fetching != null} className={`${chip} ${FOCUS}`}>
                {fetching === "trakt" ? <Loader2 size={14} className="animate-spin" /> : <img src={traktLogo} alt="" className="h-4 w-4 object-contain" />}
                {t("Use Trakt avatar")}
              </button>
            )}
            {anilistConnected && (
              <button type="button" onClick={() => void useTrackerAvatar("anilist")} disabled={fetching != null} className={`${chip} ${FOCUS}`}>
                {fetching === "anilist" ? <Loader2 size={14} className="animate-spin" /> : <img src={anilistLogo} alt="" className="h-4 w-4 object-contain" />}
                {t("Use AniList avatar")}
              </button>
            )}
            {simklConnected && (
              <button type="button" onClick={() => void useTrackerAvatar("simkl")} disabled={fetching != null} className={`${chip} ${FOCUS}`}>
                {fetching === "simkl" ? <Loader2 size={14} className="animate-spin" /> : <img src={simklLogo} alt="" className="h-4 w-4 object-contain" />}
                {t("Use Simkl avatar")}
              </button>
            )}
            {avatar && (
              <button
                type="button"
                onClick={() => {
                  setAvatar(null);
                  setAvatarSource("removed");
                }}
                className={`${chip} text-danger ${FOCUS}`}
              >
                {t("common.remove")}
              </button>
            )}
          </div>
          {fetchError && <p className="text-[13px] text-amber-200/85">{fetchError}</p>}
        </div>
      </section>

      <Group title={t("Your color")} note={t("Colors your name, your cursor in Watch Together, and the ring around your avatar.")}>
        <div className="flex flex-wrap items-center gap-1 px-3 py-3">
          {HARBOR_COLOR_SWATCHES.map((hex) => {
            const selected = color.toLowerCase() === hex;
            return (
              <button
                key={hex}
                type="button"
                onClick={() => setColor(hex)}
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

      {showAdvanced && !isPrimary && (
        <KidToggle
          value={draftKid}
          onChange={(next) => {
            setDraftKid(next);
            if (!next) setDraftParentPin(null);
          }}
        />
      )}

      {draftKid && (
        <KidsSetupPanel
          avatar={avatar}
          setAvatar={(v) => {
            setAvatar(v);
            setAvatarSource("builtin");
          }}
          kid={draftKid}
          setKid={setDraftKid}
          parentPin={draftParentPin}
          setParentPin={setDraftParentPin}
          hasExistingPin={!!editing?.kid?.parentPinHash}
        />
      )}

      {showAdvanced && !draftKid && (
        <Group
          title={t("Profile PIN")}
          note={t("Ask for a 4-digit PIN before this profile opens.")}
        >
          <Rows>
            {locked ? (
              <Row
                icon={<SetIcon name="Lock" size={20} />}
                label={t("Change PIN")}
                dot="ok"
                onClick={() => (editing ? setSubView("pin-change") : setSubView("pin-set"))}
              />
            ) : (
              <Row
                icon={<SetIcon name="Lock" size={20} />}
                label={t("Set a PIN")}
                pending
                pendingLabel={t("Off")}
                onClick={() => setSubView("pin-set")}
              />
            )}
            {locked && (
              <Row
                icon={<SetIcon name="KeyRound" size={20} />}
                label={t("Remove PIN")}
                danger
                onClick={() => (editing ? setSubView("pin-remove") : setDraftPin(null))}
              />
            )}
          </Rows>
        </Group>
      )}

      {showAdvanced && !draftKid && canShare && primary && (
        <Group
          title={t("Stremio account")}
          note={
            shareWith === primary.id
              ? t("Use the primary profile's Stremio library, watchlist, and addons.")
              : t("Sign in from the Profile tab after saving. Library and addons stay separate.")
          }
        >
          <Rows>
            <ChoiceRow
              on={shareWith === primary.id}
              label={t("Share with {name}", { name: primary.name })}
              onClick={() => {
                if (shareWith === primary.id) return;
                if (editing) setConfirm("share");
                else setShareWith(primary.id);
              }}
            />
            <ChoiceRow
              on={shareWith === null}
              label={t("Use a separate Stremio account")}
              onClick={() => setShareWith(null)}
            />
          </Rows>
        </Group>
      )}

      {editing && !isPrimary && activeIsPrimary && (
        <Group title={t("Manage")}>
          <Rows>
            <Row
              icon={<SetIcon name="Crown" size={20} />}
              label={t("Make primary")}
              sub={t("The primary profile owns the shared Stremio account and can edit every other profile.")}
              onClick={() => setConfirm("primary")}
            />
            <Row
              icon={<SetIcon name="Trash2" size={20} />}
              label={t("Delete profile")}
              danger
              onClick={() => setConfirm("delete")}
            />
          </Rows>
        </Group>
      )}

      {catalogOpen && (
        <AvatarCatalogSheet
          current={avatar}
          onPick={(value) => {
            setAvatar(value);
            setAvatarSource("builtin");
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
          <CustomColorPanel value={color} onChange={setColor} />
        </BottomSheet>
      )}
      {confirm === "delete" && editing && (
        <ConfirmSheet
          title={t("Delete profile")}
          message={t("Delete {name}? Their watch history, favorites and settings on this device go with it.", { name: editing.name })}
          confirmLabel={t("Delete")}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            deleteProfile(editing.id);
            emitListToast(t("Deleted {name}", { name: editing.name }));
            setConfirm(null);
            onDone();
          }}
        />
      )}
      {confirm === "primary" && editing && (
        <ConfirmSheet
          title={t("Make primary")}
          message={t("Make {name} the primary profile? The current primary becomes a regular profile.", { name: editing.name })}
          confirmLabel={t("Make primary")}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setPrimary(editing.id);
            setConfirm(null);
          }}
        />
      )}
      {confirm === "share" && primary && (
        <ConfirmSheet
          title={t("Stremio account")}
          message={t(
            "Switch to sharing? This profile will use {name}'s library, watchlist and addons. Its own data is kept but hidden until you switch back.",
            { name: primary.name },
          )}
          confirmLabel={t("Share")}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            setShareWith(primary.id);
            setConfirm(null);
          }}
        />
      )}
    </PhonePage>
  );
}

function ChoiceRow({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex w-full items-center gap-4 px-4 py-4 text-start transition-colors active:bg-raised/60 ${FOCUS}`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ring-2 ${
          on ? "bg-accent text-canvas ring-accent" : "ring-edge"
        }`}
      >
        {on && <Check size={12} strokeWidth={3} />}
      </span>
      <span className={`text-[15px] font-medium ${on ? "text-ink" : "text-ink-muted"}`}>{label}</span>
    </button>
  );
}

/* Three overlapping catalog avatars, the phone-sized cousin of AvatarFan. */
function AvatarFanPeek({ values }: { values: string[] }) {
  const [picks] = useState(() => {
    const v = [...values];
    for (let i = v.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [v[i], v[j]] = [v[j], v[i]];
    }
    return v.slice(0, 3);
  });
  return (
    <span className="flex items-center">
      {picks.map((value, i) => (
        <span
          key={value.slice(0, 24) + i}
          className="-ms-2 block h-6 w-6 shrink-0 overflow-hidden rounded-full ring-2 ring-elevated first:ms-0"
          style={{ zIndex: i }}
        >
          <img src={value} alt="" draggable={false} className="h-full w-full object-cover" />
        </span>
      ))}
    </span>
  );
}
