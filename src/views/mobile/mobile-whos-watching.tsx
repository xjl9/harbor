import { Check, Lock, Pencil, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AvatarImage } from "@/components/avatar-image";
import { useT } from "@/lib/i18n";
import { verifyProfilePassword } from "@/lib/profile-password";
import { useProfiles, type PickerView, type Profile } from "@/lib/profiles";
import type { RemoteProfile } from "@/lib/remote/protocol";
import { MOBILE_SAFE_X } from "./chrome-metrics";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { ProfileEditorPage } from "./account/profile-editor";
import { PinPage } from "./account/pin-page";
import { FOCUS } from "./onboarding/ob-shared";

type TileState = "idle" | "chosen" | "dimmed";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const SWITCH_CSS = `
.harbor-ring-lock {
  animation: harbor-ring-lock 380ms var(--ease-out) both;
}
@keyframes harbor-ring-lock {
  0% { opacity: 0; transform: scale(1.28); }
  55% { opacity: 1; }
  72% { transform: scale(0.965); }
  100% { opacity: 1; transform: scale(1); }
}
.harbor-switch-out {
  animation: harbor-switch-out 200ms cubic-bezier(0.4, 0, 1, 1) both;
}
@keyframes harbor-switch-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
`;

/** Profiles on a paired desktop, shown as a second section while connected. */
export type RemoteProfiles = {
  profiles: RemoteProfile[];
  activeId: string | null;
  switchTo: (id: string) => void;
};

// The phone's profile picker. It lists the LOCAL profiles from useProfiles(),
// the same store the desktop ProfilePickerModal reads, so switching, adding,
// editing and PIN locks all behave like the desktop picker. A paired desktop's
// profiles appear underneath as their own section while a host is connected;
// that used to be the only thing this screen showed.
export function MobileWhosWatching({
  onClose,
  initialView,
  dismissible = true,
  remote,
}: {
  onClose: () => void;
  initialView?: PickerView;
  /** False at launch: a profile has to be chosen before the app is usable. */
  dismissible?: boolean;
  remote?: RemoteProfiles;
}) {
  const t = useT();
  useRegisterSheet(true);
  const { profiles, activeProfile, selectProfile, sessionUnlockedIds } = useProfiles();
  const activeId = activeProfile?.id ?? null;
  const isPrimary = !!activeProfile?.isPrimary;
  const [view, setView] = useState<PickerView>(initialView ?? { kind: "list" });
  const [reduced] = useState(prefersReducedMotion);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  const finish = (commit: () => void) => {
    if (reduced) {
      commit();
      return;
    }
    timers.current.push(window.setTimeout(() => setExiting(true), 360));
    timers.current.push(window.setTimeout(commit, 560));
  };

  const chooseLocal = (p: Profile) => {
    if (selectingId) return;
    if (p.passwordHash && !sessionUnlockedIds.has(p.id) && p.id !== activeId) {
      setView({ kind: "unlock", profileId: p.id });
      return;
    }
    setSelectingId(p.id);
    finish(() => {
      // selectProfile also clears pickerOpen, so a launch-time picker closes
      // itself here; the explicit onClose covers the Profile-tab sheet.
      if (p.id === activeId || selectProfile(p.id, { unlocked: sessionUnlockedIds.has(p.id) })) {
        onClose();
      } else {
        setSelectingId(null);
        setExiting(false);
      }
    });
  };

  const chooseRemote = (id: string) => {
    if (selectingId || !remote) return;
    setSelectingId(`remote:${id}`);
    finish(() => {
      if (id !== remote.activeId) remote.switchTo(id);
      onClose();
    });
  };

  if (view.kind === "create") {
    return (
      <ProfileEditorPage
        mode={{ kind: "create" }}
        onClose={() => setView({ kind: "list" })}
        onDone={onClose}
      />
    );
  }
  if (view.kind === "edit") {
    const target = profiles.find((p) => p.id === view.profileId);
    if (target) {
      return (
        <ProfileEditorPage
          mode={{ kind: "edit", profile: target }}
          onClose={() => setView({ kind: "list" })}
          onDone={() => setView({ kind: "list" })}
        />
      );
    }
  }
  if (view.kind === "unlock") {
    const target = profiles.find((p) => p.id === view.profileId);
    if (target?.passwordHash) {
      const hash = target.passwordHash;
      return (
        <PinPage
          title={t("Enter {name}'s PIN", { name: target.name })}
          subtitle={t("Profile is locked. Enter the 4-digit PIN to continue.")}
          mode="verify"
          verify={(pin) => verifyProfilePassword(pin, hash)}
          onBack={() => setView({ kind: "list" })}
          onComplete={() => {
            if (selectProfile(target.id, { unlocked: true })) onClose();
            else setView({ kind: "list" });
          }}
        />
      );
    }
  }

  const remoteProfiles = remote?.profiles ?? [];
  const showRemote = remoteProfiles.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Who's watching")}
      className={`fixed inset-0 z-[70] flex flex-col overflow-hidden bg-canvas ${
        exiting ? "harbor-switch-out pointer-events-none" : "animate-fade-in"
      }`}
      style={{
        ...MOBILE_SAFE_X,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)",
      }}
    >
      <style>{SWITCH_CSS}</style>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[46%]"
        style={{
          background: `radial-gradient(110% 78% at 50% -8%, color-mix(in oklch, ${
            activeProfile?.color ?? "var(--color-accent)"
          } 12%, transparent), transparent 68%)`,
        }}
      />

      <header className="relative flex min-h-11 items-center justify-end px-5 pb-1">
        {dismissible && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className={`no-press flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-elevated/60 text-ink-muted ring-1 ring-edge-soft backdrop-blur transition-transform duration-150 active:scale-[0.94] active:bg-raised ${FOCUS}`}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        )}
      </header>

      <div className="relative flex flex-1 flex-col overflow-y-auto px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="my-auto flex w-full flex-col items-center py-8">
          <div className={`mb-9 flex flex-col items-center gap-1.5 ${reduced ? "" : "harbor-step"}`}>
            <h1 className="font-display text-[26px] font-medium tracking-tight text-ink">
              {t("Who's watching?")}
            </h1>
            <p className="text-[13.5px] text-ink-muted">{t("Pick a profile to continue.")}</p>
          </div>

          <div className="flex w-full max-w-[440px] flex-wrap justify-center gap-x-4 gap-y-7">
            {profiles.map((p, i) => {
              const state: TileState =
                selectingId == null ? "idle" : selectingId === p.id ? "chosen" : "dimmed";
              const canEdit = isPrimary || p.id === activeId;
              return (
                <ProfileTile
                  key={p.id}
                  name={p.name}
                  avatar={p.avatar}
                  color={p.color}
                  locked={!!p.passwordHash && !sessionUnlockedIds.has(p.id)}
                  primary={p.isPrimary}
                  active={p.id === activeId}
                  state={state}
                  reduced={reduced}
                  delay={110 + Math.min(i, 9) * 52}
                  onSelect={() => chooseLocal(p)}
                  onEdit={canEdit ? () => setView({ kind: "edit", profileId: p.id }) : undefined}
                />
              );
            })}
            {isPrimary && (
              <button
                type="button"
                onClick={() => setView({ kind: "create" })}
                aria-label={t("Add profile")}
                className={`group flex w-[clamp(94px,27vw,116px)] touch-manipulation flex-col items-center gap-3 outline-none transition-[transform,opacity] duration-[420ms] ${
                  selectingId ? "scale-90 opacity-0" : reduced ? "" : "harbor-pop"
                } ${FOCUS}`}
                style={
                  !selectingId && !reduced
                    ? { animationDelay: `${110 + Math.min(profiles.length, 9) * 52}ms` }
                    : undefined
                }
              >
                <span className="flex h-[clamp(72px,22vw,94px)] w-[clamp(72px,22vw,94px)] items-center justify-center rounded-full border-2 border-dashed border-edge text-ink-subtle transition-transform duration-200 group-active:scale-[0.94]">
                  <Plus size={26} strokeWidth={2.2} />
                </span>
                <span className="text-[14px] font-medium text-ink-muted">{t("Add profile")}</span>
              </button>
            )}
          </div>

          {showRemote && (
            <div className="mt-12 flex w-full max-w-[440px] flex-col items-center gap-6">
              <div className="flex w-full items-center gap-3">
                <span className="h-px flex-1 bg-edge-soft" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
                  {t("On your computer")}
                </span>
                <span className="h-px flex-1 bg-edge-soft" />
              </div>
              <div className="flex w-full flex-wrap justify-center gap-x-4 gap-y-7">
                {remoteProfiles.map((p, i) => {
                  const key = `remote:${p.id ?? i}`;
                  const state: TileState =
                    selectingId == null ? "idle" : selectingId === key ? "chosen" : "dimmed";
                  return (
                    <ProfileTile
                      key={key}
                      name={p.name}
                      avatar={p.avatar}
                      color={p.color}
                      active={!!p.id && p.id === remote?.activeId}
                      state={state}
                      reduced={reduced}
                      delay={220 + Math.min(i, 9) * 52}
                      onSelect={() => p.id && chooseRemote(p.id)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileTile({
  name,
  avatar,
  color,
  locked,
  primary,
  active,
  state,
  reduced,
  delay,
  onSelect,
  onEdit,
}: {
  name: string;
  avatar: string | null;
  color: string;
  locked?: boolean;
  primary?: boolean;
  active: boolean;
  state: TileState;
  reduced: boolean;
  delay: number;
  onSelect: () => void;
  onEdit?: () => void;
}) {
  const t = useT();
  const stateClass =
    state === "chosen"
      ? "z-10 scale-[1.05]"
      : state === "dimmed"
        ? "scale-90 opacity-0"
        : reduced
          ? ""
          : "harbor-pop";

  return (
    <div
      className={`relative flex w-[clamp(94px,27vw,116px)] flex-col items-center gap-3 transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${stateClass}`}
      style={state === "idle" && !reduced ? { animationDelay: `${delay}ms` } : undefined}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={t("Switch to {name}", { name })}
        className={`group flex touch-manipulation flex-col items-center gap-3 rounded-2xl outline-none ${FOCUS}`}
      >
        <span className="relative">
          <span
            className={`flex h-[clamp(72px,22vw,94px)] w-[clamp(72px,22vw,94px)] items-center justify-center overflow-hidden rounded-full bg-elevated shadow-[0_12px_28px_-14px_rgba(0,0,0,0.75)] transition-transform duration-200 group-active:scale-[0.94] ${
              active ? "ring-2 ring-offset-4 ring-offset-canvas" : ""
            }`}
            style={{
              boxShadow: `0 0 0 3px ${color}`,
              ...(active ? ({ "--tw-ring-color": color } as React.CSSProperties) : {}),
            }}
          >
            <AvatarImage src={avatar} className="h-full w-full object-cover" />
          </span>
          {state === "chosen" && (
            <span
              aria-hidden
              className="harbor-ring-lock pointer-events-none absolute -inset-[7px] rounded-full border-[2.5px]"
              style={{ borderColor: color }}
            />
          )}
          {active && (
            <span
              aria-hidden
              className="pointer-events-none absolute -bottom-0.5 -end-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-accent text-canvas shadow-md ring-2 ring-canvas"
            >
              <Check size={14} strokeWidth={3} />
            </span>
          )}
          {locked && !active && (
            <span
              aria-label={t("chrome.locked")}
              className="pointer-events-none absolute -bottom-0.5 -end-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-canvas text-ink shadow-md ring-1 ring-edge"
            >
              <Lock size={12} strokeWidth={2.4} />
            </span>
          )}
        </span>
        <span className="flex max-w-full flex-col items-center gap-0.5">
          <span
            className={`max-w-full truncate text-center text-[14px] ${
              active ? "font-semibold text-ink" : "font-medium text-ink-muted"
            }`}
          >
            {name}
          </span>
          {primary && (
            <span className="text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
              {t("profile.primary")}
            </span>
          )}
        </span>
      </button>
      {onEdit && state === "idle" && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={t("Edit {name}", { name })}
          className={`absolute -end-1 -top-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-canvas/95 text-ink ring-1 ring-edge shadow-md">
            <Pencil size={12} strokeWidth={2.4} />
          </span>
        </button>
      )}
    </div>
  );
}
