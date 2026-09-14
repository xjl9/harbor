import { Trash2 } from "lucide-react";
import { useState } from "react";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import type { LetterboxdSettings } from "@/lib/settings/types";
import { invalidateLetterboxdCache } from "@/lib/stremboxd/cache";
import {
  resolveLetterboxdListPublic,
  validateStremboxdConfig,
  type ManifestValidation,
} from "@/lib/stremboxd/client";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import { buildStremboxdConfig } from "@/lib/stremboxd/settings-helper";
import { openUrl } from "@/lib/window";
import { SetIcon } from "@/views/settings/set-icon";
import {
  ControlRow,
  FIELD,
  FOCUS,
  Field,
  Group,
  InputSheet,
  Notice,
  PhonePage,
  PillButton,
  Row,
  Rows,
  Segmented,
  ToggleRow,
} from "./phone-kit";

type CatalogOption = { id: string; label: string; sub: string; fullOnly?: boolean };

const CATALOG_OPTIONS: CatalogOption[] = [
  { id: "letterboxd-watchlist", label: "Watchlist", sub: "Shows the films you have saved to watch on Letterboxd." },
  { id: "letterboxd-diary", label: "Diary", sub: "Shows everything you have logged, most recent first.", fullOnly: true },
  { id: "letterboxd-liked", label: "Liked Films", sub: "Shows the films you have hearted on Letterboxd." },
  { id: "letterboxd-friends", label: "Friends", sub: "Shows what the people you follow have been watching lately.", fullOnly: true },
  { id: "letterboxd-recommended", label: "Recommended for You", sub: "Shows the picks Letterboxd makes from your own viewing history.", fullOnly: true },
  { id: "letterboxd-popular", label: "Popular This Week", sub: "Shows the films the whole of Letterboxd is watching right now." },
  { id: "letterboxd-top250", label: "Top 250", sub: "Shows the highest rated narrative features of all time." },
];

// Trackers > Letterboxd from desktop settings (views/settings/letterboxd-panel.tsx):
// enable, public/full mode, username (+ password and 2FA for full), connect or
// verify, catalogs, custom lists, on-screen toggles and hidden catalogs.
export function LetterboxdPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const lb = settings.letterboxd;
  const { session, isFullConnected, login, disconnect } = useLetterboxd();

  const [username, setUsername] = useState(lb.username);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<ManifestValidation | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const syncConfig = (patch: Partial<LetterboxdSettings>) => {
    const next = { ...lb, ...patch };
    update({ letterboxd: { ...next, encodedConfig: buildStremboxdConfig(next) } });
  };

  const toggleCatalog = (id: string, on: boolean) => {
    syncConfig({
      selectedCatalogs: on ? [...lb.selectedCatalogs, id] : lb.selectedCatalogs.filter((c) => c !== id),
    });
    setVerify(null);
  };

  const handleVerify = async () => {
    setBusy(true);
    setVerify(null);
    const config = buildStremboxdConfig({ ...lb, username, selectedCatalogs: lb.selectedCatalogs });
    const result = await validateStremboxdConfig(config, username.trim().length > 0);
    setVerify(result);
    if (result.ok) {
      update({ letterboxd: { ...lb, enabled: true, username: username.trim(), encodedConfig: config } });
      invalidateLetterboxdCache();
    }
    setBusy(false);
  };

  const handleLogin = async () => {
    setBusy(true);
    setLoginError(null);
    const result = await login(username.trim(), password, totp || undefined);
    setBusy(false);
    if (result.kind === "success") {
      setPassword("");
      setTotp("");
      setNeeds2fa(false);
      update({ letterboxd: { ...lb, enabled: true, mode: "full", username: result.session.username } });
      invalidateLetterboxdCache();
    } else if (result.kind === "2fa") {
      setNeeds2fa(true);
    } else {
      setLoginError(result.message);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setPassword("");
    setTotp("");
    setNeeds2fa(false);
    setLoginError(null);
  };

  const addList = async (raw: string) => {
    const url = raw.trim();
    if (!url) return;
    setListBusy(true);
    setListError(null);
    try {
      const ref = await resolveLetterboxdListPublic(url);
      const catalogId = `letterboxd-list-${ref.id}`;
      const next = {
        ...lb,
        listRefs: [
          ...lb.listRefs.filter((r) => r.id !== ref.id),
          { id: ref.id, name: ref.name, owner: ref.owner, filmCount: ref.filmCount },
        ],
        selectedCatalogs: lb.selectedCatalogs.includes(catalogId)
          ? lb.selectedCatalogs
          : [...lb.selectedCatalogs, catalogId],
      };
      update({ letterboxd: { ...next, encodedConfig: buildStremboxdConfig(next) } });
      invalidateLetterboxdCache();
      setListOpen(false);
    } catch {
      setListError(t("Could not resolve that Letterboxd list URL."));
    }
    setListBusy(false);
  };

  const removeList = (id: string) => {
    const catalogId = `letterboxd-list-${id}`;
    const next = {
      ...lb,
      listRefs: lb.listRefs.filter((r) => r.id !== id),
      selectedCatalogs: lb.selectedCatalogs.filter((c) => c !== catalogId),
    };
    update({ letterboxd: { ...next, encodedConfig: buildStremboxdConfig(next) } });
    invalidateLetterboxdCache();
  };

  const listMeta = (ref: LetterboxdSettings["listRefs"][number]) => {
    if (ref.owner && ref.filmCount != null)
      return t("A list by {owner}, {n} films.", { owner: ref.owner, n: ref.filmCount });
    if (ref.owner) return t("A list by {owner}.", { owner: ref.owner });
    if (ref.filmCount != null) return t("{n} films.", { n: ref.filmCount });
    return t("A Letterboxd list you added by address.");
  };

  const isPublic = lb.mode === "public";
  const connectDisabled = isPublic
    ? busy || username.trim().length === 0
    : busy || username.trim().length === 0 || password.length === 0;

  return (
    <PhonePage kicker={t("Trackers")} title="Letterboxd" onClose={onClose} wash="#40bcf4">
      <section className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-elevated ring-1 ring-white/[0.06]">
          <img src={letterboxdLogo} alt="" draggable={false} className="h-8 w-8 object-contain" />
        </span>
        <p className="text-[13.5px] leading-relaxed text-ink-muted">
          {t("Bring your Letterboxd watchlist, diary, liked films and lists into Harbor through the Stremboxd bridge.")}
        </p>
      </section>

      <Group>
        <ToggleRow
          label={t("Enable Letterboxd integration")}
          sub={t("Turning this on adds your Letterboxd catalogs to the home page and a Letterboxd panel to every film page.")}
          on={lb.enabled}
          onChange={(on) => update({ letterboxd: { ...lb, enabled: on } })}
        />
      </Group>

      {lb.enabled && (
        <>
          <Group title={t("Connection")}>
            <Rows>
              <ControlRow
                label={t("Mode")}
                sub={
                  isPublic
                    ? t("Public mode reads your account with nothing but your username. You get your watchlist, liked films, popular this week and the Top 250, and no password is needed.")
                    : t("Full mode signs in with your Letterboxd password so your diary, friends activity and personal ratings work too. The password goes only to Stremboxd to fetch a token, and Harbor never stores it.")
                }
              >
                <Segmented
                  label={t("Mode")}
                  value={lb.mode}
                  options={[
                    { value: "public", label: t("Public") },
                    { value: "full", label: t("Full") },
                  ]}
                  onChange={(m) => update({ letterboxd: { ...lb, mode: m } })}
                  columns={2}
                />
              </ControlRow>
              <div className="flex flex-col gap-3 px-4 py-4">
                <Field label={t("Letterboxd username")} hint={t("The handle in your profile address, letterboxd.com/your-name.")}>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setVerify(null);
                    }}
                    placeholder="your-name"
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    className={FIELD}
                  />
                </Field>
                {!isPublic && (
                  <Field label={t("Letterboxd password")} hint={t("Sent once to Stremboxd to obtain a sign-in token. Harbor never keeps it.")}>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("Your Letterboxd password")}
                      autoComplete="current-password"
                      className={FIELD}
                    />
                  </Field>
                )}
                {!isPublic && needs2fa && (
                  <Field label={t("Two-factor authentication code")} hint={t("Letterboxd asked for a second step. Enter the six digit code, then connect again.")}>
                    <input
                      type="text"
                      value={totp}
                      onChange={(e) => setTotp(e.target.value)}
                      placeholder="123456"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      className={FIELD}
                    />
                  </Field>
                )}
                {loginError && <Notice tone="danger">{loginError}</Notice>}
                <PillButton
                  variant="primary"
                  full
                  busy={busy}
                  disabled={connectDisabled}
                  onClick={() => void (isPublic ? handleVerify() : handleLogin())}
                >
                  <SetIcon name="Link2" size={16} />
                  {isPublic ? t("Connect / Verify") : needs2fa ? t("Verify & connect") : t("Connect")}
                </PillButton>
                <p className="text-[12px] leading-snug text-ink-subtle">
                  {isPublic
                    ? t("Checks the username against Stremboxd and turns on the catalogs it finds.")
                    : t("Signs in to Letterboxd and unlocks your diary, friends activity and ratings.")}
                </p>
                {verify && (
                  <Notice tone={verify.ok ? "ok" : "danger"}>
                    {verify.ok ? t("Connected. {n} catalogs are available.", { n: verify.catalogs }) : verify.message}
                  </Notice>
                )}
              </div>
              {isFullConnected && session && (
                <Row
                  icon={<SetIcon name="UserCheck" size={20} />}
                  label={session.displayName ? `${session.displayName} (@${session.username})` : `@${session.username}`}
                  sub={t("Full mode is active, so diary, friends activity and your ratings all work.")}
                  dot="ok"
                  trailing={
                    <PillButton variant="danger" onClick={handleDisconnect}>
                      {t("Disconnect")}
                    </PillButton>
                  }
                />
              )}
              <Row
                icon={<SetIcon name="ExternalLink" size={20} />}
                label={t("About Stremboxd")}
                sub={t("Opens stremboxd.com, the community bridge that reads Letterboxd on Harbor's behalf.")}
                onClick={() => openUrl("https://stremboxd.com/configure")}
              />
            </Rows>
          </Group>

          <Group title={t("Catalogs to show")}>
            <Rows>
              {CATALOG_OPTIONS.map((opt) => (
                <ToggleRow
                  key={opt.id}
                  label={t(opt.label)}
                  sub={t(opt.sub)}
                  on={lb.selectedCatalogs.includes(opt.id)}
                  onChange={(on) => toggleCatalog(opt.id, on)}
                  lockReason={opt.fullOnly && !isFullConnected ? t("Sign in with Full mode to use this catalog.") : undefined}
                />
              ))}
            </Rows>
          </Group>

          <Group title={t("Custom lists")}>
            <Rows>
              <Row
                icon={<SetIcon name="Plus" size={20} />}
                label={t("Add a list")}
                sub={t("Paste the address of any public Letterboxd list to add it as its own row.")}
                onClick={() => {
                  setListError(null);
                  setListOpen(true);
                }}
              />
              {lb.listRefs.map((ref) => (
                <Row
                  key={ref.id}
                  icon={<SetIcon name="ListVideo" size={20} />}
                  label={ref.name}
                  sub={listMeta(ref)}
                  trailing={
                    <button
                      type="button"
                      onClick={() => removeList(ref.id)}
                      aria-label={t("Remove")}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle active:text-danger ${FOCUS}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  }
                />
              ))}
            </Rows>
          </Group>

          <Group title={t("On screen")}>
            <Rows>
              <ToggleRow
                label={t("Show my rating on movie posters")}
                sub={t("Puts the score you gave a film in the corner of its poster, wherever Letterboxd has one for you.")}
                on={lb.showRatingsOnPosters}
                onChange={(on) => syncConfig({ showRatingsOnPosters: on })}
              />
              <ToggleRow
                label={t("Blur comments and reviews by default")}
                sub={t("Comments and reviews on detail pages stay blurred until you reveal them, even when they are not tagged as spoilers. This one switch covers Trakt and Letterboxd.")}
                on={!!settings.blurComments}
                onChange={(on) => update({ blurComments: on })}
              />
            </Rows>
          </Group>

          {lb.hiddenCatalogs.length > 0 && (
            <Group
              title={t("Hidden catalogs")}
              note={t("These rows are switched on but hidden from your home page. Choose Show to bring one back.")}
            >
              <Rows>
                {lb.hiddenCatalogs.map((id) => {
                  const opt = CATALOG_OPTIONS.find((o) => o.id === id);
                  const listRef = lb.listRefs.find((r) => `letterboxd-list-${r.id}` === id);
                  const label = opt ? t(opt.label) : (listRef?.name ?? id);
                  return (
                    <Row
                      key={id}
                      label={label}
                      trailing={
                        <PillButton
                          onClick={() =>
                            update({
                              letterboxd: { ...lb, hiddenCatalogs: lb.hiddenCatalogs.filter((h) => h !== id) },
                            })
                          }
                        >
                          {t("Show")}
                        </PillButton>
                      }
                    />
                  );
                })}
              </Rows>
            </Group>
          )}
        </>
      )}

      {listOpen && (
        <InputSheet
          title={t("Add a list")}
          hint={t("Paste the address of any public Letterboxd list to add it as its own row.")}
          logo={letterboxdLogo}
          initial=""
          placeholder={t("letterboxd.com/username/list/slug")}
          inputMode="url"
          saveLabel={t("Add")}
          busy={listBusy}
          error={listError}
          onSave={(v) => void addList(v)}
          onClose={() => setListOpen(false)}
        />
      )}
    </PhonePage>
  );
}
