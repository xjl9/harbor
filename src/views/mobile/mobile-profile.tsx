import { Check, Users } from "lucide-react";
import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import rpdbLogo from "@/assets/addon-logos/rpdb.png";
import tmdbLogo from "@/assets/addon-logos/tmdb.png";
import tvdbLogo from "@/assets/addon-logos/tvdb.svg";
import stremioMark from "@/assets/stremio.png";
import { useAnilist } from "@/lib/anilist/provider";
import { useAuth } from "@/lib/auth";
import { loadInstalled } from "@/lib/addon-store";
import { HARBOR_BUGS_BASE } from "@/lib/config/endpoints";
import { useActiveDownloadCount } from "@/lib/download/downloads-store";
import { useT } from "@/lib/i18n";
import { useMal } from "@/lib/mal/provider";
import { isMobileNative } from "@/lib/platform";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { listPendingWatches } from "@/lib/simkl/pending-sync";
import { useSimkl } from "@/lib/simkl/provider";
import { currentAuthor, subscribeAuthor } from "@/lib/theme-auth";
import { listPendingStops } from "@/lib/trakt/pending-sync";
import { useTrakt } from "@/lib/trakt/provider";
import { SetIcon } from "@/views/settings/set-icon";
import { AnilistPage } from "./account/anilist-page";
import { HarborAccountPage } from "./account/harbor-account-page";
import { IdentityPage } from "./account/identity-page";
import { LegalPage } from "./account/legal-page";
import { LetterboxdPage } from "./account/letterboxd-page";
import { MalPage } from "./account/mal-page";
import { AvatarDisc, FOCUS, Group, InputSheet, LogoBadge, Row, Rows } from "./account/phone-kit";
import { ProfilesPage } from "./account/profiles-page";
import { RelayPage } from "./account/relay-page";
import { SimklPage } from "./account/simkl-page";
import { StremioAccountPage, StremioSignInSheet } from "./account/stremio";
import { TRACKERS, type TrackerId } from "./account/tracker-shared";
import { TraktPage } from "./account/trakt-page";
import { DebridSheet, type DebridKey, type DebridProvider } from "./mobile-debrid-sheet";
import { DEBRID_PROVIDERS } from "./debrid-providers";
import { DiagnosticsSheet } from "./mobile-diagnostics";
import { MobileAddons } from "./mobile-addons";
import { MobileDownloads } from "./mobile-downloads";
import { consumeMobileIntent, MOBILE_INTENT_EVENT } from "./mobile-intent";
import { useMobileRemote } from "./mobile-remote";
import { MobileReportSheet } from "./mobile-report-sheet";
import { MobileSettings } from "./mobile-settings";
import { ExportSetupSheet } from "./mobile-setup-export";
import { ImportSetupSheet } from "./mobile-setup-import";
import { MobileThemeSheet } from "./mobile-theme-sheet";
import { MobileWhosWatching } from "./mobile-whos-watching";
import { setMobileRemoteStyle, useMobileRemoteStyle, type MobileRemoteStyle } from "./remote-style";

// The plugins sheet belongs to the addons area and may land after this file.
// A glob resolves to an empty map while the module is absent, so the Plugins
// row hides itself instead of breaking the build, and appears once it exists.
const PLUGIN_MODULES = import.meta.glob<{ MobilePluginsSheet: ComponentType<{ onClose: () => void }> }>(
  "./mobile-plugins.tsx",
);
const loadPlugins = PLUGIN_MODULES["./mobile-plugins.tsx"];
const MobilePluginsSheet = loadPlugins
  ? lazy(() => loadPlugins().then((m) => ({ default: m.MobilePluginsSheet })))
  : null;

type KeyField = "remoteHostAddress" | "tmdbKey" | "tvdbKey" | "rpdbKey";
type EditField = { key: KeyField; label: string; placeholder: string; hint?: string; logo?: string };

type Page =
  | "identity"
  | "profiles"
  | "stremio"
  | "harbor"
  | "relay"
  | "legal"
  | TrackerId
  | null;

const ICON = 20;

export function MobileProfile({ onOpenRemote }: { onOpenRemote: () => void }) {
  const t = useT();
  const { user } = useAuth();
  const { activeProfile, profiles } = useProfiles();
  const { snapshot, connected, sendCommand } = useMobileRemote();
  const { settings, update } = useSettings();
  const trakt = useTrakt();
  const simkl = useSimkl();
  const anilist = useAnilist();
  const mal = useMal();
  const [author, setAuthor] = useState(currentAuthor);
  useEffect(() => subscribeAuthor(() => setAuthor(currentAuthor())), []);

  const name = activeProfile?.name || user?.email?.split("@")[0] || t("Guest");
  const avatar = activeProfile?.avatar ?? settings.harborAvatar ?? user?.avatar ?? null;
  const color = activeProfile?.color ?? settings.harborColor ?? "oklch(0.78 0.13 60)";

  const [switching, setSwitching] = useState(false);
  const [page, setPage] = useState<Page>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [editing, setEditing] = useState<EditField | null>(null);
  const [debridEditing, setDebridEditing] = useState<DebridProvider | null>(null);
  // Opened straight from a surface that has no screen of its own. The
  // initializer covers the first visit (this tab is not mounted yet when the
  // request is made); the listener below covers every later visit, since the
  // shell keeps visited tabs mounted and the initializer would never run again.
  const [addonsOpen, setAddonsOpen] = useState(() => consumeMobileIntent("addons"));
  useState(() => consumeMobileIntent("debrid"));
  const [settingsOpen, setSettingsOpen] = useState(() => consumeMobileIntent("settings"));
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(() => consumeMobileIntent("theme"));
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  const native = isMobileNative();
  const activeDownloads = useActiveDownloadCount();
  const installedAddonCount = loadInstalled().length;

  useEffect(() => {
    const onIntent = (e: Event) => {
      const which = (e as CustomEvent<string>).detail;
      if (which === "addons" && consumeMobileIntent("addons")) setAddonsOpen(true);
      if (which === "settings" && consumeMobileIntent("settings")) setSettingsOpen(true);
      if (which === "theme" && consumeMobileIntent("theme")) setThemeOpen(true);
      // This page IS the debrid destination, so arriving is the whole action.
      // Consume anyway or the flag lingers and fires on a later visit.
      if (which === "debrid") consumeMobileIntent("debrid");
    };
    window.addEventListener(MOBILE_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(MOBILE_INTENT_EVENT, onIntent);
  }, []);

  const keySet = (v: string | undefined) => !!(v && v.trim());

  // Connected providers (a key is saved) float to the top so the user's active
  // services lead; the original DEBRID_PROVIDERS order holds within each group.
  const debridProviders = [
    ...DEBRID_PROVIDERS.filter((p) => keySet(settings[p.key])),
    ...DEBRID_PROVIDERS.filter((p) => !keySet(settings[p.key])),
  ];

  const lb = settings.letterboxd;
  const trackerState: Record<TrackerId, { connected: boolean; handle?: string | null; pending: number }> = {
    trakt: { connected: trakt.isConnected, handle: trakt.username, pending: trakt.isConnected ? listPendingStops().length : 0 },
    simkl: { connected: simkl.isConnected, handle: simkl.username, pending: simkl.isConnected ? listPendingWatches().length : 0 },
    anilist: { connected: anilist.isConnected, handle: anilist.userName, pending: 0 },
    mal: { connected: mal.isConnected, handle: mal.userName, pending: 0 },
    letterboxd: { connected: !!lb?.enabled && !!lb?.username, handle: lb?.username, pending: 0 },
  };

  const remoteProfiles =
    connected && snapshot.profiles.length
      ? {
          profiles: snapshot.profiles,
          activeId: snapshot.profile?.id ?? null,
          switchTo: (id: string) => sendCommand({ action: "setProfile", id }),
        }
      : undefined;

  const closePage = () => setPage(null);

  return (
    <div
      className="relative mx-auto flex min-h-full w-full max-w-[680px] flex-col gap-9 px-5 pb-12"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}
    >
      {/* Ambient identity wash: the profile's own color bleeds from the top, same cinematic depth as the home hero.
          Sized to the viewport rather than to this column: the column is capped on
          a tablet, and inset-x-0 pinned the gradient to that cap, which drew two
          vertical seams down the top of the screen where the wash stopped. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 -z-10 h-72 w-screen -translate-x-1/2"
        style={{
          background: `radial-gradient(125% 72% at 50% -12%, color-mix(in oklab, ${color} 30%, transparent), transparent 72%)`,
        }}
      />

      <header className="flex flex-col items-center gap-5">
        <button
          type="button"
          onClick={() => setPage("identity")}
          aria-label={t("Your profile")}
          className={`flex flex-col items-center gap-4 rounded-3xl ${FOCUS}`}
        >
          <span
            className="block rounded-full"
            style={{ boxShadow: `0 18px 48px -14px color-mix(in oklab, ${color} 62%, transparent)` }}
          >
            <AvatarDisc src={avatar} color={color} size={96} />
          </span>
          <h1 className="max-w-full truncate font-display text-[29px] font-medium leading-none tracking-[-0.01em] text-ink">
            {name}
          </h1>
        </button>
        <button
          type="button"
          onClick={() => setSwitching(true)}
          className={`flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-4 text-[12.5px] font-semibold text-ink-muted backdrop-blur-sm transition-colors active:bg-white/[0.1] ${FOCUS}`}
        >
          <Users size={13} strokeWidth={2.4} />
          {profiles.length > 1 ? t("Switch profile") : t("Who's watching")}
        </button>
      </header>

      <Group title={t("Account")}>
        <Rows>
          <Row
            icon={<SetIcon name="UserRound" size={ICON} />}
            label={t("Your profile")}
            value={author?.handle ? `@${author.handle}` : undefined}
            onClick={() => setPage("identity")}
          />
          <Row
            icon={<SetIcon name="Users" size={ICON} />}
            label={t("Profiles")}
            value={String(profiles.length)}
            onClick={() => setPage("profiles")}
          />
          {user ? (
            <Row
              icon={<LogoBadge src={stremioMark} size={20} />}
              label="Stremio"
              value={user.fullname || user.email || undefined}
              dot="ok"
              onClick={() => setPage("stremio")}
            />
          ) : (
            <Row
              icon={<LogoBadge src={stremioMark} size={20} />}
              label={t("Sign in to Stremio")}
              pending
              pendingLabel={t("Sign in")}
              onClick={() => setSignInOpen(true)}
            />
          )}
          <Row
            icon={<SetIcon name="Sailboat" size={ICON} />}
            label={t("Harbor account")}
            value={author ? (author.handle ? `@${author.handle}` : author.username) : undefined}
            dot={author ? "ok" : null}
            pending={!author}
            pendingLabel={t("Sign in")}
            onClick={() => setPage("harbor")}
          />
        </Rows>
      </Group>

      <Group title={t("Trackers")}>
        <Rows>
          {TRACKERS.map((tr) => {
            const s = trackerState[tr.id];
            return (
              <Row
                key={tr.id}
                icon={<LogoBadge src={tr.logo} size={20} />}
                label={tr.name}
                value={s.connected ? (s.handle ? `@${s.handle}` : t("Connected")) : undefined}
                dot={s.connected ? "ok" : null}
                badge={s.pending > 0 ? String(s.pending) : undefined}
                pending={!s.connected}
                pendingLabel={t("Connect")}
                onClick={() => setPage(tr.id)}
              />
            );
          })}
        </Rows>
      </Group>

      <section className="flex flex-col gap-4">
        <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
          {t("Remote style")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StylePreview kind="dpad" label={t("D-pad")} />
          <StylePreview kind="minimal" label={t("Touchpad")} />
        </div>
      </section>

      <Group
        title={t("Streaming setup")}
        note={t("A TMDB key unlocks the full catalog. RPDB bakes ratings into every poster.")}
      >
        <Rows>
          {native && (
            <Row
              icon={<SetIcon name="Monitor" size={ICON} />}
              label={t("Desktop connection")}
              value={settings.remoteHostAddress || undefined}
              pending={!connected && !settings.remoteHostAddress}
              pendingLabel={t("Connect")}
              dot={connected ? "ok" : null}
              onClick={() =>
                setEditing({
                  key: "remoteHostAddress",
                  label: t("Desktop connection"),
                  placeholder: "192.168.1.20",
                  hint: t("IP address of the computer running Harbor, shown in its Remote settings."),
                })
              }
            />
          )}
          <Row
            icon={<LogoBadge src={tmdbLogo} size={20} />}
            label={t("TMDB API key")}
            value={keySet(settings.tmdbKey) ? "••••" : undefined}
            pending={!keySet(settings.tmdbKey)}
            dot={keySet(settings.tmdbKey) ? "ok" : null}
            onClick={() =>
              setEditing({
                key: "tmdbKey",
                label: t("TMDB API key"),
                logo: tmdbLogo,
                placeholder: t("Paste key"),
                hint: t("Free at themoviedb.org. Powers rich detail pages and episode grids."),
              })
            }
          />
          <Row
            icon={<LogoBadge src={tvdbLogo} size={20} />}
            label={t("TVDB API key")}
            value={keySet(settings.tvdbKey) ? "••••" : undefined}
            pending={!keySet(settings.tvdbKey)}
            dot={keySet(settings.tvdbKey) ? "ok" : null}
            onClick={() =>
              setEditing({
                key: "tvdbKey",
                label: t("TVDB API key"),
                logo: tvdbLogo,
                placeholder: t("Paste key"),
                hint: t("Optional. Episode orders work without one via Harbor's proxy."),
              })
            }
          />
          <Row
            icon={<LogoBadge src={rpdbLogo} size={20} />}
            label={t("RPDB API key")}
            value={keySet(settings.rpdbKey) ? "••••" : undefined}
            pending={!keySet(settings.rpdbKey)}
            dot={keySet(settings.rpdbKey) ? "ok" : null}
            onClick={() =>
              setEditing({
                key: "rpdbKey",
                label: t("RPDB API key"),
                logo: rpdbLogo,
                placeholder: t("Paste key"),
                hint: t("Rated posters on every rail. Paid plan at ratingposterdb.com."),
              })
            }
          />
          <Row
            icon={<SetIcon name="Puzzle" size={ICON} />}
            label={t("Addons")}
            value={installedAddonCount ? `${installedAddonCount}` : undefined}
            pending={!installedAddonCount}
            pendingLabel={t("Add")}
            onClick={() => setAddonsOpen(true)}
          />
          {MobilePluginsSheet && (
            <Row
              icon={<SetIcon name="Plug" size={ICON} />}
              label={t("Plugins")}
              onClick={() => setPluginsOpen(true)}
            />
          )}
        </Rows>
      </Group>

      <Group
        title={t("Debrid")}
        note={t("Connect a debrid service and cached streams play direct. Keys stay on this device.")}
      >
        <Rows>
          {debridProviders.map((p) => (
            <Row
              key={p.key}
              icon={<LogoBadge src={p.logo} size={20} />}
              label={p.label}
              value={keySet(settings[p.key]) ? "••••" : undefined}
              pending={!keySet(settings[p.key])}
              pendingLabel={t("Connect")}
              dot={keySet(settings[p.key]) ? "ok" : null}
              onClick={() => setDebridEditing(p)}
            />
          ))}
        </Rows>
      </Group>

      <Group>
        <Rows>
          {native && (
            <Row
              icon={<SetIcon name="Download" size={ICON} />}
              label={t("Downloads")}
              badge={activeDownloads > 0 ? String(activeDownloads) : undefined}
              onClick={() => setDownloadsOpen(true)}
            />
          )}
          <Row
            icon={<SetIcon name="SlidersHorizontal" size={ICON} />}
            label={t("Settings")}
            onClick={() => setSettingsOpen(true)}
          />
          <Row
            icon={<SetIcon name="SmartphoneNfc" size={ICON} />}
            label={t("Remote")}
            onClick={onOpenRemote}
          />
          <Row
            icon={<SetIcon name="RelaySettings" size={ICON} />}
            label={t("Harbor Relay")}
            value={settings.togetherRelayUrl ? t("Connected") : undefined}
            onClick={() => setPage("relay")}
          />
          <Row
            icon={<SetIcon name="Upload" size={ICON} />}
            label={t("Export setup")}
            onClick={() => setExportOpen(true)}
          />
          <Row
            icon={<SetIcon name="FileDown" size={ICON} />}
            label={t("Import setup")}
            onClick={() => setImportOpen(true)}
          />
          <Row
            icon={<SetIcon name="Bug" size={ICON} />}
            label={t("Report a problem")}
            onClick={() => setReportOpen(true)}
          />
          <Row
            icon={<SetIcon name="Activity" size={ICON} />}
            label={t("Diagnostics")}
            onClick={() => setDiagOpen(true)}
          />
          <Row
            icon={<SetIcon name="MessageSquare" size={ICON} />}
            label={t("Help & feedback")}
            href={HARBOR_BUGS_BASE}
          />
          <Row
            icon={<SetIcon name="Scale" size={ICON} />}
            label={t("Legal")}
            onClick={() => setPage("legal")}
          />
        </Rows>
      </Group>

      {switching && (
        <MobileWhosWatching onClose={() => setSwitching(false)} remote={remoteProfiles} />
      )}
      {signInOpen && <StremioSignInSheet onClose={() => setSignInOpen(false)} />}
      {page === "identity" && <IdentityPage onClose={closePage} />}
      {page === "profiles" && <ProfilesPage onClose={closePage} />}
      {page === "stremio" && (
        <StremioAccountPage
          onClose={closePage}
          onManageAddons={() => {
            setPage(null);
            setAddonsOpen(true);
          }}
        />
      )}
      {page === "harbor" && (
        <HarborAccountPage
          onClose={closePage}
          onOpenStremio={() => {
            setPage(null);
            if (user) setPage("stremio");
            else setSignInOpen(true);
          }}
        />
      )}
      {page === "relay" && <RelayPage onClose={closePage} />}
      {page === "legal" && <LegalPage onClose={closePage} />}
      {page === "trakt" && <TraktPage onClose={closePage} />}
      {page === "simkl" && <SimklPage onClose={closePage} />}
      {page === "anilist" && <AnilistPage onClose={closePage} />}
      {page === "mal" && <MalPage onClose={closePage} />}
      {page === "letterboxd" && <LetterboxdPage onClose={closePage} />}
      {addonsOpen && <MobileAddons onClose={() => setAddonsOpen(false)} />}
      {pluginsOpen && MobilePluginsSheet && (
        <Suspense fallback={null}>
          <MobilePluginsSheet onClose={() => setPluginsOpen(false)} />
        </Suspense>
      )}
      {settingsOpen && <MobileSettings onClose={() => setSettingsOpen(false)} />}
      {themeOpen && <MobileThemeSheet onClose={() => setThemeOpen(false)} />}
      {downloadsOpen && <MobileDownloads onClose={() => setDownloadsOpen(false)} />}
      {exportOpen && <ExportSetupSheet onClose={() => setExportOpen(false)} />}
      {importOpen && <ImportSetupSheet onClose={() => setImportOpen(false)} />}
      {reportOpen && <MobileReportSheet onClose={() => setReportOpen(false)} />}
      {diagOpen && <DiagnosticsSheet onClose={() => setDiagOpen(false)} />}
      {editing && (
        <InputSheet
          title={editing.label}
          hint={editing.hint}
          logo={editing.logo}
          initial={String(settings[editing.key] ?? "")}
          placeholder={editing.placeholder}
          // Every field here except the remote host holds a secret (API tokens);
          // mask by default with a reveal toggle, matching desktop's KeyField.
          secret={editing.key !== "remoteHostAddress"}
          inputMode={editing.key === "remoteHostAddress" ? "decimal" : "text"}
          onSave={(next) => {
            const v = next.trim();
            if (editing.key === "remoteHostAddress") update({ remoteHostAddress: v });
            else if (editing.key === "tmdbKey") update({ tmdbKey: v });
            else if (editing.key === "tvdbKey") update({ tvdbKey: v });
            else update({ rpdbKey: v });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {debridEditing && (
        <DebridSheet
          provider={debridEditing}
          initial={String(settings[debridEditing.key] ?? "")}
          onSave={(next) => {
            const v = next.trim();
            // Explicit per-key branches: a computed update({ [k]: v }) widens to a
            // string index and fails tsc (same rule as onboarding ob-debrid).
            const k: DebridKey = debridEditing.key;
            if (k === "rdKey") update({ rdKey: v });
            else if (k === "tbKey") update({ tbKey: v });
            else if (k === "adKey") update({ adKey: v });
            else if (k === "pmKey") update({ pmKey: v });
            else update({ dlKey: v });
            setDebridEditing(null);
          }}
          onClose={() => setDebridEditing(null)}
        />
      )}
    </div>
  );
}

function StylePreview({ kind, label }: { kind: MobileRemoteStyle; label: string }) {
  const active = useMobileRemoteStyle() === kind;
  return (
    <button
      type="button"
      onClick={() => setMobileRemoteStyle(kind)}
      className={`relative flex flex-col items-center gap-3 rounded-2xl border bg-surface/50 p-4 transition-colors ${FOCUS} ${
        active ? "border-accent ring-1 ring-accent" : "border-edge-soft/70"
      }`}
    >
      {active && (
        <span className="absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      <span className="flex h-[104px] w-full items-center justify-center rounded-xl bg-canvas/60">
        {kind === "dpad" ? <DpadGlyph /> : <TouchpadGlyph />}
      </span>
      <span className={`text-[13.5px] font-semibold ${active ? "text-ink" : "text-ink-muted"}`}>
        {label}
      </span>
    </button>
  );
}

function DpadGlyph() {
  return (
    <span className="relative grid h-[74px] w-[74px] place-items-center rounded-full bg-elevated/70 ring-1 ring-edge-soft/70">
      <span className="absolute top-1.5 h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-ink-muted" />
      <span className="absolute bottom-1.5 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-ink-muted" />
      <span className="absolute start-1.5 h-0 w-0 border-y-[5px] border-e-[7px] border-y-transparent border-e-ink-muted" />
      <span className="absolute end-1.5 h-0 w-0 border-y-[5px] border-s-[7px] border-y-transparent border-s-ink-muted" />
      <span className="h-7 w-7 rounded-full bg-raised" />
    </span>
  );
}

function TouchpadGlyph() {
  return (
    <span className="relative flex h-[62px] w-[74px] items-center justify-center rounded-2xl bg-elevated/70 ring-1 ring-edge-soft/70">
      <span className="h-2 w-2 rounded-full bg-ink-muted" />
      <span className="absolute h-[3px] w-8 -rotate-[18deg] rounded-full bg-ink-subtle/50" />
    </span>
  );
}
