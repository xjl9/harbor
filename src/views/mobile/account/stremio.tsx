import { Check, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import stremioLogo from "@/assets/stremio-wordmark.png";
import stremioMark from "@/assets/stremio.png";
import { AddonLogo, AddonLogoStack, resolveAddonLogo } from "@/components/addon-logo";
import type { Addon } from "@/lib/addons";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { SetIcon } from "@/views/settings/set-icon";
import {
  BottomSheet,
  ConfirmSheet,
  FIELD,
  Field,
  Group,
  LogoBadge,
  Notice,
  PhonePage,
  PillButton,
  Row,
  Rows,
} from "./phone-kit";

// Sign-in sheet: the same form and useAuth().signIn call as onboarding's
// ob-stremio.tsx, reachable after onboarding from the Profile tab.
export function StremioSignInSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { user, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signing in closes the sheet; the Profile tab re-renders in its signed-in
  // state underneath.
  useEffect(() => {
    if (user) onClose();
  }, [user, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Sign-in failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet onClose={onClose} ariaLabel={t("Sign in to Stremio")}>
      <form onSubmit={submit} className="flex flex-col gap-5 pt-4">
        <div className="flex justify-center">
          <img
            src={stremioLogo}
            alt="Stremio"
            className="h-11"
            style={{ filter: "grayscale(1) invert(1)" }}
          />
        </div>
        <p className="text-center text-[13.5px] leading-relaxed text-ink-muted">
          {t("Sign in to sync your library, watch progress, and addons.")}
        </p>
        <div className="flex flex-col gap-3">
          <Field label={t("Email")}>
            <input
              type="email"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="email"
              inputMode="email"
              className={FIELD}
            />
          </Field>
          <Field label={t("Password")}>
            <input
              type="password"
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={FIELD}
            />
          </Field>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="flex h-12 items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition-transform disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "linear-gradient(135deg, #6c5cff 0%, #8b5cff 100%)",
            boxShadow: "0 10px 30px -12px rgba(108, 92, 255, 0.55)",
          }}
        >
          {busy ? t("Signing in…") : t("Sign in to Stremio")}
        </button>
        <button
          type="button"
          onClick={() => openUrl("https://www.stremio.com/register")}
          className="flex min-h-11 items-center justify-center gap-1.5 text-[12.5px] text-ink-subtle transition-colors active:text-ink-muted"
        >
          <span>{t("Don't have an account?")}</span>
          <span className="font-medium text-ink-muted">{t("Create one")}</span>
          <ExternalLink size={11} />
        </button>
      </form>
    </BottomSheet>
  );
}

// Account > Stremio from desktop settings (stremio-card.tsx plus
// synced-addons-card.tsx): who is signed in, the Stremio ID, the addon
// collection pulled from the account, re-authenticate and sign out.
export function StremioAccountPage({
  onClose,
  onManageAddons,
}: {
  onClose: () => void;
  onManageAddons: () => void;
}) {
  const t = useT();
  const { user, authKey, signOut } = useAuth();
  const [reveal, setReveal] = useState(false);
  const [reauth, setReauth] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [copied, setCopied] = useState(false);
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const sync = async () => {
    if (!authKey || busy) return;
    setBusy(true);
    try {
      const mod = await import("@/lib/addons");
      setAddons(await mod.userAddons(authKey));
      setLastSynced(Date.now());
    } catch {
      setAddons(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (authKey && addons == null) void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey]);

  useEffect(() => {
    if (!user) onClose();
  }, [user, onClose]);

  const maskedEmail = useMemo(() => {
    if (!user?.email) return "";
    const [local, domain] = user.email.split("@");
    if (!domain) return "*****";
    return `${local.slice(0, 1)}${"*".repeat(Math.max(local.length - 1, 4))}@${domain}`;
  }, [user]);

  if (!user) return null;
  const count = addons?.length ?? null;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(user._id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <PhonePage kicker={t("Account")} title={t("Stremio account")} onClose={onClose} wash="#6c5cff">
      <Group note={t("Library, watch progress, and addon collection sync from this account.")}>
        <div className="flex items-center gap-4 px-4 py-4">
          <StremioAvatar
            src={user.avatar}
            initial={(user.fullname || user.email || "?").trim()[0]?.toUpperCase() ?? "?"}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">
              {user.fullname || user.email.split("@")[0] || t("Signed in")}
            </div>
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="mt-0.5 flex min-h-8 items-center text-[12.5px] text-ink-subtle"
              dir="ltr"
            >
              <span className="truncate font-mono">{reveal ? user.email : maskedEmail}</span>
              <span className="ms-2 shrink-0 font-sans font-semibold text-accent">
                {reveal ? t("Hide") : t("Reveal")}
              </span>
            </button>
          </div>
          <Check size={18} strokeWidth={2.4} className="shrink-0 text-success" />
        </div>
      </Group>

      <Group>
        <Rows>
          <Row
            icon={<SetIcon name="Fingerprint" size={20} />}
            label={t("Stremio ID")}
            sub={t("The account identifier Stremio uses for your library and addon collection.")}
            value={copied ? t("Copied") : user._id}
            onClick={() => void copyId()}
          />
          <Row
            icon={<SetIcon name="LogIn" size={20} />}
            label={t("Re-authenticate")}
            sub={t("Sign in again to refresh this device's session.")}
            onClick={() => setReauth(true)}
          />
        </Rows>
      </Group>

      <Group
        title={t("Synced addons")}
        note={t("Harbor pulls your addon collection from Stremio. Manage individual addons in Streaming sources.")}
      >
        <div className="flex flex-col gap-4 px-4 py-4">
          <div className="flex items-center gap-4">
            <SetIcon name="Puzzle" size={20} className="text-ink-muted" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium text-ink">{t("Your collection")}</span>
              <span className="text-[12.5px] text-ink-subtle">
                {lastSynced
                  ? t("Last synced {n}s ago.", { n: Math.round((Date.now() - lastSynced) / 1000) })
                  : t("Pulled from your Stremio account.")}
              </span>
            </div>
            <span className="flex shrink-0 items-baseline gap-1.5">
              <span className="font-display text-[26px] font-medium leading-none tracking-tight text-ink tabular-nums">
                {count != null ? count : "…"}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                {count === 1 ? t("addon synced") : t("addons synced")}
              </span>
            </span>
          </div>
          {addons && addons.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="flex min-h-11 items-center gap-3 self-start"
            >
              <AddonLogoStack
                addons={addons.map((a) => ({
                  id: a.manifest.id,
                  name: a.manifest.name,
                  logo: resolveAddonLogo(a.manifest.logo, a.transportUrl),
                }))}
                size="lg"
                max={5}
              />
              <span className="text-[13px] font-semibold text-ink-muted">
                {showAll ? t("Hide") : t("All addons ({n})", { n: addons.length })}
              </span>
            </button>
          )}
          {showAll && addons && (
            <div className="flex flex-col">
              {addons.map((a) => (
                <div key={a.manifest.id} className="flex min-h-11 items-center gap-3">
                  <AddonLogo
                    addonId={a.manifest.id}
                    addonName={a.manifest.name}
                    manifestLogo={resolveAddonLogo(a.manifest.logo, a.transportUrl)}
                    size="sm"
                  />
                  <span className="min-w-0 truncate text-[14px] text-ink">{a.manifest.name}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2.5">
            <PillButton variant="primary" onClick={() => void sync()} busy={busy} full>
              {busy ? t("Syncing…") : t("Sync now")}
            </PillButton>
            <PillButton onClick={onManageAddons} full>
              {t("Manage")}
            </PillButton>
          </div>
        </div>
      </Group>

      <Group>
        <Row
          icon={<SetIcon name="LogOut" size={20} />}
          label={t("Sign out of Stremio")}
          sub={t("Stops syncing on this device. Your library stays safe in your Stremio account.")}
          danger
          onClick={() => setConfirmOut(true)}
        />
      </Group>

      {reauth && <StremioSignInSheet onClose={() => setReauth(false)} />}
      {confirmOut && (
        <ConfirmSheet
          title={t("Sign out of Stremio")}
          message={t("Stops syncing on this device. Your library stays safe in your Stremio account.")}
          confirmLabel={t("Sign out")}
          danger
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            setConfirmOut(false);
            signOut();
          }}
        />
      )}
    </PhonePage>
  );
}

export function StremioRowLogo() {
  return <LogoBadge src={stremioMark} />;
}

function StremioAvatar({ src, initial }: { src?: string; initial: string }) {
  const [failed, setFailed] = useState(false);
  const url = !failed ? src || "https://web.stremio.com/images/default_avatar.png" : null;
  if (url) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="h-12 w-12 shrink-0 rounded-full bg-canvas object-cover"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-[16px] font-medium text-canvas">
      {initial}
    </div>
  );
}
