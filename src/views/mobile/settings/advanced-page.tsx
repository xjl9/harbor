import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  applyBackup,
  BACKUP_SECTIONS,
  backupKeyCount,
  backupSectionLabel,
  backupSections,
  buildBackup,
  parseBackup,
  type Backup,
  type BackupSectionKey,
} from "@/lib/backup";
import { APP_VERSION, BUILD_DATE, BUILD_ID, IS_BETA_BUILD } from "@/lib/build-info";
import { downloadText } from "@/lib/download-text";
import { useT } from "@/lib/i18n";
import { useOnboarding } from "@/lib/onboarding";
import { blockedTrackerCount, subscribeBlockedTrackers } from "@/lib/privacy/blocklist";
import { useSettings } from "@/lib/settings";
import { LicensesPanel } from "@/views/settings/licenses-panel";
import type { SectionId } from "@/views/settings/shared";
import { StoragePanel } from "@/views/settings/storage-panel";
import { SupportPanel } from "@/views/settings/support-panel";
import { DiagnosticsSheet } from "../mobile-diagnostics";
import { DEPT_BY_ID } from "./registry";
import { ActionRow, Dept, DesktopPanel, FOCUS, Group, NavRow, Note, PhonePage, ToggleRow } from "./kit";

type Sub = "storage" | "licenses" | "support" | "export" | "restore";

// A backup is a JSON file. On iOS a synthetic <a download> does nothing inside
// the webview, so the share sheet goes first (Save to Files, AirDrop, Mail);
// downloadText stays as the fallback for builds where sharing files is refused.
async function shareOrSave(text: string): Promise<boolean> {
  const name = `harbor-backup-${new Date().toISOString().slice(0, 10)}.harbx`;
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof File !== "undefined" && typeof nav.share === "function") {
    const file = new File([text], name, { type: "application/json" });
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "Harbor backup" });
        return true;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return false;
      }
    }
  }
  return downloadText(name, text, ["harbx"], "Harbor backup");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3.5 px-4 py-3.5">
      <span className="shrink-0 text-[15.5px] font-medium text-ink">{label}</span>
      <span className="min-w-0 flex-1 break-words text-end font-mono text-[13px] tabular-nums text-ink-subtle">
        {value}
      </span>
    </div>
  );
}

export function AdvancedPage({
  onBack,
  onJump,
  initialSub,
  anchor,
}: {
  onBack: () => void;
  onJump: (section: SectionId, tab?: string) => void;
  initialSub?: string | null;
  anchor?: string | null;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const { resetOnboarding, resetNudges } = useOnboarding();
  const dept = DEPT_BY_ID.advanced;
  const [sub, setSub] = useState<Sub | null>(
    initialSub === "storage" || initialSub === "licenses" || initialSub === "support" ? initialSub : null,
  );
  const [diagOpen, setDiagOpen] = useState(false);
  const [blocked, setBlocked] = useState(() => blockedTrackerCount());
  useEffect(() => subscribeBlockedTrackers(() => setBlocked(blockedTrackerCount())), []);
  const [phase, setPhase] = useState<"idle" | "walkthrough" | "hints">("idle");
  useEffect(() => {
    if (phase === "idle") return;
    const id = window.setTimeout(() => setPhase("idle"), 1400);
    return () => window.clearTimeout(id);
  }, [phase]);

  // Backup state lives on the page so the export and restore sub-pages can
  // close without losing a pending file.
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<BackupSectionKey>>(() => new Set(BACKUP_SECTIONS.map((s) => s.key)));
  const [pending, setPending] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoreError, setRestoreError] = useState(false);

  const privacySub = settings.blockTrackers
    ? blocked > 0
      ? t("{count} tracker request blocked this session. Harbor itself sends zero telemetry.", { count: blocked.toLocaleString() })
      : t("Watching for ad, analytics, and tracking requests. Harbor itself sends zero telemetry.")
    : t("Ad, analytics, and tracking requests pass through untouched.");

  const doExport = async () => {
    setError(null);
    setBusy(true);
    try {
      const backup = await buildBackup([...selected]);
      const ok = await shareOrSave(JSON.stringify(backup, null, 2));
      if (ok) {
        setExported(true);
        setSub(null);
      }
    } catch {
      setError("Could not build the backup file.");
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseBackup(typeof reader.result === "string" ? reader.result : "");
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPending(res.backup);
      setRestoreError(false);
      setSub("restore");
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(file);
  };

  const confirmRestore = () => {
    if (!pending) return;
    setBusy(true);
    setRestoreError(false);
    void applyBackup(pending)
      .then(() => window.setTimeout(() => window.location.reload(), 280))
      .catch(() => {
        setBusy(false);
        setRestoreError(true);
      });
  };

  const versionValue = `${APP_VERSION}${IS_BETA_BUILD ? ` (${t("Beta")})` : ""}`;
  const buildValue = `${BUILD_ID}${BUILD_DATE ? ` ${BUILD_DATE}` : ""}`;

  return (
    <>
      <PhonePage title={t(dept.label)} kicker={t("Settings")} icon={dept.icon} onBack={onBack} anchor={anchor}>
        <Dept index={0} icon="Lock" title={t("Privacy")}>
          <Group>
            <ToggleRow
              icon="ShieldCheck"
              label={t("Block ads & trackers")}
              sub={privacySub}
              on={settings.blockTrackers}
              onChange={(v) => update({ blockTrackers: v })}
            />
          </Group>
        </Dept>

        <Dept
          index={1}
          icon="HardDrive"
          title={t("Storage")}
          standfirst={t("See what Harbor stores on this computer and clear caches when you want the space back.")}
        >
          <Group>
            <NavRow
              icon="HardDrive"
              label={t("Storage overview")}
              sub={t("Review local app data and caches. Cached pages rebuild as you browse; temporary video files are managed separately.")}
              onClick={() => setSub("storage")}
            />
          </Group>
        </Dept>

        <Dept index={2} icon="FolderArchive" title={t("Backup & restore")}>
          <Group>
            <NavRow
              icon="Download"
              label={t("Export your setup")}
              sub={t("Choose which parts of your setup to save in one backup file. Your Stremio sign-in is excluded.")}
              value={exported ? t("Saved") : undefined}
              onClick={() => setSub("export")}
            />
            <NavRow
              icon="Upload"
              label={t("Restore from a backup")}
              sub={t("Choose a Harbor backup and review what it contains before restoring. Your Stremio sign-in stays on this device.")}
              onClick={() => fileRef.current?.click()}
            />
          </Group>
          {error && (
            <p role="alert" className="px-1 text-[13px] leading-relaxed text-danger">
              {t(error)}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".harbx,application/json,.json"
            onChange={onFile}
            className="hidden"
          />
        </Dept>

        <Dept
          index={3}
          icon="Info"
          title={t("About")}
          standfirst={t("Build identity. Useful when filing a bug report.")}
        >
          <Group>
            <InfoRow label={t("Version")} value={versionValue} />
            <InfoRow label={t("Build")} value={buildValue} />
          </Group>
          <Group label={t("Onboarding")} note={t("Replay the walkthrough or unhide every dismissed tip in the app.")}>
            <ActionRow
              icon="RotateCw"
              label={t("Replay walkthrough")}
              sub={t("Re-runs the welcome flow and clears every dismissed tip.")}
              cta={phase === "walkthrough" ? t("Done") : t("Replay")}
              tone={phase === "walkthrough" ? "success" : "neutral"}
              onClick={() => {
                resetOnboarding();
                setPhase("walkthrough");
              }}
            />
            <ActionRow
              icon="RotateCcw"
              label={t("Restore dismissed hints")}
              sub={t("Brings back the small in-app tips you've dismissed without redoing the welcome flow.")}
              cta={phase === "hints" ? t("Restored") : t("Restore")}
              tone={phase === "hints" ? "success" : "neutral"}
              onClick={() => {
                resetNudges();
                setPhase("hints");
              }}
            />
          </Group>
        </Dept>

        <Dept index={4} icon="HelpAbout" title={t("Help & about")}>
          <Group>
            <NavRow
              icon="Activity"
              label={t("Diagnostics")}
              sub={t("Recent warnings and errors from this app. Keys and links are already redacted, so this is safe to copy and send.")}
              onClick={() => setDiagOpen(true)}
            />
            <NavRow
              icon="Scale"
              label={t("Licenses & attribution")}
              sub={t("Harbor's licence, the projects it is built on, and the people and services that make it possible.")}
              onClick={() => setSub("licenses")}
            />
            <NavRow
              icon="Heart"
              label={t("Support Harbor")}
              sub={t("Who keeps the lights on, what Harbor is built on, and where to put money if you want to.")}
              onClick={() => setSub("support")}
            />
          </Group>
        </Dept>

        {/* Inside the page so it stacks above it: the diagnostics shell sits at
            the shell's sheet layer, which is below a department page. */}
        {diagOpen && <DiagnosticsSheet onClose={() => setDiagOpen(false)} />}
      </PhonePage>

      {sub === "storage" && (
        <PhonePage title={t("Storage")} kicker={t(dept.label)} icon="HardDrive" depth={2} onBack={() => setSub(null)}>
          <DesktopPanel onJump={onJump} hideTabs={["video"]}>
            <StoragePanel />
          </DesktopPanel>
        </PhonePage>
      )}
      {sub === "licenses" && (
        <PhonePage title={t("Licenses & attribution")} kicker={t(dept.label)} icon="Scale" depth={2} onBack={() => setSub(null)}>
          <DesktopPanel onJump={onJump}>
            <LicensesPanel />
          </DesktopPanel>
        </PhonePage>
      )}
      {sub === "support" && (
        <PhonePage title={t("Support Harbor")} kicker={t(dept.label)} icon="Heart" depth={2} onBack={() => setSub(null)}>
          <DesktopPanel onJump={onJump}>
            <SupportPanel />
          </DesktopPanel>
        </PhonePage>
      )}
      {sub === "export" && (
        <PhonePage title={t("Export your setup")} kicker={t(dept.label)} icon="Download" depth={2} onBack={() => setSub(null)}>
          <Dept
            index={0}
            icon="FolderArchive"
            title={t("What should the backup include?")}
            standfirst={t("Choose the sections to save in one file. Your Stremio sign-in is excluded.")}
          >
            <Group>
              {BACKUP_SECTIONS.map((s) => (
                /* Labels only: the section descriptions in lib/backup.ts have no
                   translations yet, and a column of English prose under every
                   switch reads as unfinished. The warning icon still marks the
                   two sections that carry credentials. */
                <ToggleRow
                  key={s.key}
                  icon={s.warning ? "AlertTriangle" : undefined}
                  label={t(backupSectionLabel(s.key))}
                  on={selected.has(s.key)}
                  onChange={(v) =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (v) next.add(s.key);
                      else next.delete(s.key);
                      return next;
                    })
                  }
                />
              ))}
            </Group>
            {error && (
              <p role="alert" className="px-1 text-[13px] leading-relaxed text-danger">
                {t(error)}
              </p>
            )}
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={() => void doExport()}
              className={`flex h-[52px] w-full items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-canvas disabled:opacity-40 ${FOCUS}`}
            >
              {t("Export {n} sections", { n: selected.size })}
            </button>
          </Dept>
        </PhonePage>
      )}
      {sub === "restore" && pending && (
        <PhonePage
          title={t("Restore this backup?")}
          kicker={t(dept.label)}
          icon="Upload"
          depth={2}
          onBack={() => {
            if (busy) return;
            setPending(null);
            setSub(null);
          }}
        >
          <Dept
            index={0}
            icon="FolderArchive"
            title={t("Restore this backup?")}
            standfirst={t(
              "This file restores its {n} saved entries and replaces only those parts of your setup. Anything it does not contain stays exactly as it is.",
              { n: String(backupKeyCount(pending)) },
            )}
          >
            <div className="flex flex-wrap gap-2">
              {backupSections(pending).map((key) => (
                <span key={key} className="rounded-lg bg-elevated px-3 py-1.5 text-[13px] text-ink-muted">
                  {t(backupSectionLabel(key))}
                </span>
              ))}
            </div>
            {pending.sections?.includes("iptv") && !pending.sections.includes("iptvCredentials") && (
              <Note>{t("Xtream credentials were left out of this backup.")}</Note>
            )}
            <Note>
              {t("Saved {when} from Harbor {app}. Your Stremio sign-in stays as is.", {
                when: pending.exportedAt ? new Date(pending.exportedAt).toLocaleString() : t("an unknown date"),
                app: pending.app,
              })}
            </Note>
            {restoreError && (
              <p role="alert" className="px-1 text-[13px] leading-relaxed text-danger">
                {t("Restore did not finish. Some settings may already have changed. Free some storage, then try again.")}
              </p>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={confirmRestore}
              className={`flex h-[52px] w-full items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-canvas disabled:opacity-40 ${FOCUS}`}
            >
              {busy ? t("Restoring...") : t("Restore and reload")}
            </button>
          </Dept>
        </PhonePage>
      )}
    </>
  );
}
