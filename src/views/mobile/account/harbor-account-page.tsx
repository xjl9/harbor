import { useEffect, useState } from "react";
import { HarborMark } from "@/components/icons/harbor-mark";
import { fetchMe } from "@/lib/account/identity";
import { useT } from "@/lib/i18n";
import { currentAuthor, logoutAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { AccountAuthForm } from "@/views/account/account-auth-form";
import { HandleClaimCard } from "@/views/account/handle-claim-card";
import { VerifiedBadge } from "@/views/account/verified-badge";
import { RecoveryReveal } from "@/views/settings/theme-panel/custom-themes-section/author-account-panel/recovery-reveal";
import { SetIcon } from "@/views/settings/set-icon";
import { ConfirmSheet, Group, PhonePage, PillButton, Row, Rows } from "./phone-kit";

// Account > Harbor account from desktop settings (views/account/
// harbor-account-panel.tsx). The desktop SignedOutHero needs the settings
// navigation context, so the signed-out state is rebuilt here; the auth form,
// handle claim card and recovery reveal are the desktop components as-is.
export function HarborAccountPage({
  onClose,
  onOpenStremio,
}: {
  onClose: () => void;
  onOpenStremio: () => void;
}) {
  const t = useT();
  const [author, setAuthor] = useState(currentAuthor);
  const [reveal, setReveal] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "signin">("register");
  const [handleOpen, setHandleOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => subscribeAuthor(() => setAuthor(currentAuthor())), []);
  useEffect(() => {
    if (author) void fetchMe();
  }, [author?.id]);
  useEffect(() => {
    if (author) setAuthOpen(false);
  }, [author]);

  return (
    <PhonePage kicker={t("Account")} title={t("Harbor account")} onClose={onClose}>
      {!author ? (
        <>
          {authOpen ? (
            <div className="hset-phone-auth">
              <AccountAuthForm
                inline
                initialMode={authMode}
                onRecovery={setReveal}
                onClose={() => setAuthOpen(false)}
              />
            </div>
          ) : (
            <>
              <section className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <h2 className="font-display text-[28px] font-medium leading-tight tracking-tight text-ink">
                    {t("A little more you.")}
                  </h2>
                  <p className="text-[14.5px] leading-relaxed text-ink-muted">
                    {t("Claim your @handle, share your themes, and make a profile of your own.")}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <PillButton
                    variant="primary"
                    full
                    onClick={() => {
                      setAuthMode("register");
                      setAuthOpen(true);
                    }}
                  >
                    {t("Create your account")}
                  </PillButton>
                  <PillButton
                    full
                    onClick={() => {
                      setAuthMode("signin");
                      setAuthOpen(true);
                    }}
                  >
                    {t("Sign in")}
                  </PillButton>
                </div>
              </section>
              <Group>
                <Row
                  icon={<SetIcon name="Library" size={20} />}
                  label={t("Bringing your Stremio library?")}
                  sub={t("Connect Stremio to bring in your library and addons.")}
                  onClick={onOpenStremio}
                />
              </Group>
            </>
          )}
        </>
      ) : (
        <>
          <Group note={t("Your handle across Harbor.")}>
            <div className="flex items-center gap-4 px-4 py-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[16px] border border-edge-soft bg-canvas text-ink">
                <HarborMark className="h-11 w-11" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <bdi dir="ltr" className="min-w-0 truncate text-[20px] font-semibold leading-tight tracking-tight text-ink">
                    {author.handle ? `@${author.handle}` : author.username}
                  </bdi>
                  {author.verified && <VerifiedBadge />}
                </span>
                <span className="flex items-center gap-1.5 text-[12.5px] text-ink-subtle">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  <span className="truncate">
                    {author.handle
                      ? t("Signed in as {username}", { username: author.username })
                      : t("Signed in to your Harbor account")}
                  </span>
                </span>
              </span>
            </div>
          </Group>

          <Group>
            <Rows>
              <Row
                icon={<SetIcon name="AtSign" size={20} />}
                label={author.handle ? t("Change handle") : t("Claim a handle")}
                value={author.handle ? `@${author.handle}` : undefined}
                pending={!author.handle}
                pendingLabel={t("Claim")}
                onClick={() => setHandleOpen((v) => !v)}
              />
              {handleOpen && (
                <div className="hset-phone-auth px-4 pb-4">
                  <HandleClaimCard author={author} />
                </div>
              )}
              <Row
                icon={<SetIcon name="LogOut" size={20} />}
                label={t("Sign out")}
                danger
                busy={signingOut}
                onClick={() => setConfirmOut(true)}
              />
            </Rows>
          </Group>
        </>
      )}

      {reveal && <RecoveryReveal code={reveal} onDone={() => setReveal(null)} />}
      {confirmOut && author && (
        <ConfirmSheet
          title={t("Sign out")}
          message={t("Sign out of your Harbor account on this device?")}
          confirmLabel={t("Sign out")}
          danger
          busy={signingOut}
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            setSigningOut(true);
            void logoutAuthor().finally(() => {
              setSigningOut(false);
              setConfirmOut(false);
            });
          }}
        />
      )}
    </PhonePage>
  );
}
