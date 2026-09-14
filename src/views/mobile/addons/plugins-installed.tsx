import { useEffect, useRef, useState } from "react";
import { AddonLogo } from "@/components/addon-logo";
import { relativeTime } from "@/lib/dates";
import { useT, useUiLanguage } from "@/lib/i18n";
import {
  pluginKinds,
  usePluginKindsVersion,
  type CheckResult,
  type KindAdapter,
  type PluginKind,
  type PluginView,
} from "@/lib/plugins";
import { useSettings } from "@/lib/settings";
import { languageNames } from "@/views/settings/plugins-panel/bits";
import { errorText, healthErrorText, kindLabel, stateCopy } from "@/views/settings/plugins-panel/copy";
import { SetIcon } from "@/views/settings/set-icon";
import { Chip, Department, EmptyCard, FOCUS, Group, Knob, Pill, tapHaptic, ToggleRow } from "./kit";
import { PluginSettingsSheet } from "./plugin-settings-sheet";

type RepoBucket = { key: string; repoName: string; kind: PluginKind; adapter: KindAdapter; plugins: PluginView[] };

function groupByRepo(): RepoBucket[] {
  const map = new Map<string, RepoBucket>();
  for (const adapter of pluginKinds()) {
    for (const p of adapter.plugins()) {
      const key = `${adapter.kind}|${p.repoUrl}`;
      const g = map.get(key) ?? { key, repoName: p.repoName, kind: adapter.kind, adapter, plugins: [] };
      g.plugins.push(p);
      map.set(key, g);
    }
  }
  return [...map.values()];
}

// Phone counterpart of plugins-panel/installed-tab.tsx: the same four
// settings, the same repo grouping and the same per-plugin row states.
export function InstalledPluginsPhone({ onAddRepository }: { onAddRepository: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  usePluginKindsVersion();
  const groups = groupByRepo();
  const waitSeconds = Math.max(8, Math.min(120, settings.addonTimeoutSec ?? 30));

  return (
    <>
      <Department
        index={0}
        first
        kicker={t("Plugins")}
        folio="01"
        title={t("Use plugins")}
        standfirst={t(
          "Plugins are small scripts that look for streams on sites Harbor does not know about. Everything here was installed by you, from repositories you chose.",
        )}
      >
        <Group>
          <ToggleRow
            label={t("Use plugins")}
            sub={t(
              "Ask every enabled plugin for streams when you press Play. Turn this off to pause them all without removing anything.",
            )}
            on={settings.pluginsEnabled}
            onChange={(v) => update({ pluginsEnabled: v })}
          />
          <ToggleRow
            label={t("Group by repository")}
            sub={t(
              "Show one source per repository in the picker instead of one per plugin. Useful when a repository ships many small providers.",
            )}
            on={settings.pluginsGroupByRepo}
            onChange={(v) => update({ pluginsGroupByRepo: v })}
          />
          <ToggleRow
            label={t("Also use plugins for background checks")}
            sub={t(
              "Let auto-download and the next-episode prefetch ask plugins too. Off keeps plugins to the moment you press Play.",
            )}
            on={settings.pluginsBackground}
            onChange={(v) => update({ pluginsBackground: v })}
          />
          <div className="flex min-h-[52px] items-center gap-3.5 px-4 py-3">
            <SetIcon name="Timer" size={20} strokeWidth={2} className="shrink-0 text-ink-muted" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[15px] font-medium text-ink">{t("Wait time")}</span>
              <span className="text-[12.5px] leading-snug text-ink-subtle">
                {t("Plugins share the addon wait time, {n} seconds unless you changed it under Streaming sources.", {
                  n: waitSeconds,
                })}
              </span>
            </span>
          </div>
        </Group>
      </Department>

      <Department
        index={1}
        kicker={t("Plugins")}
        folio="02"
        title={t("Installed plugins")}
        standfirst={settings.pluginsEnabled ? undefined : t("Plugins are paused. Turn on Use plugins above to run them.")}
      >
        {groups.length === 0 ? (
          <EmptyCard
            icon={<SetIcon name="Puzzle" size={26} strokeWidth={1.8} />}
            title={t("Nothing installed yet")}
            body={t("Add a repository, then install the providers you want. They show up here.")}
            action={
              <Pill variant="primary" onClick={onAddRepository}>
                {t("Add a repository")}
              </Pill>
            }
          />
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <section key={g.key} className="flex flex-col gap-2">
                <h3 className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                  {`${g.repoName} · ${kindLabel(t, g.kind)}`}
                </h3>
                <Group>
                  {g.plugins.map((p) => (
                    <PluginRowPhone
                      key={p.id}
                      plugin={p}
                      adapter={g.adapter}
                      masterOff={g.kind === "stream" && !settings.pluginsEnabled}
                    />
                  ))}
                </Group>
              </section>
            ))}
          </div>
        )}
      </Department>
    </>
  );
}

type Busy = "toggle" | "update" | "revert" | "remove" | "check" | null;

function PluginRowPhone({
  plugin,
  adapter,
  masterOff,
}: {
  plugin: PluginView;
  adapter: KindAdapter;
  masterOff: boolean;
}) {
  const t = useT();
  const uiLang = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const confirmTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  const copy = stateCopy(t, plugin);
  const locked = !!copy.lock;
  const sub = [
    `v${plugin.version}`,
    plugin.kind === "stream" && plugin.types.length >= 2 ? t("Movies and series") : null,
    languageNames(plugin.lang, uiLang, t("All languages")),
    plugin.author,
  ]
    .filter(Boolean)
    .join(" · ");

  const run = async (kind: Busy, fn: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setBusy(null);
    }
  };

  // Two taps within three seconds, exactly like the desktop row, so a stray
  // tap never uninstalls anything and there is no extra sheet to dismiss.
  const remove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      confirmTimer.current = window.setTimeout(() => setConfirmRemove(false), 3000);
      return;
    }
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirmRemove(false);
    void run("remove", () => adapter.uninstall(plugin.id));
  };

  const health = adapter.health?.(plugin.id) ?? null;
  const log = adapter.log?.(plugin.id) ?? [];
  const activity = health?.lastError
    ? healthErrorText(t, health.lastError)
    : health?.lastSkip
      ? t("Skipped: {reason}", { reason: health.lastSkip })
      : health?.lastCount != null && health.lastTitle
        ? health.lastCount > 0
          ? t("Found {count} streams for {title} in {seconds}s", {
              count: health.lastCount,
              title: health.lastTitle,
              seconds: ((health.lastMs ?? 0) / 1000).toFixed(1),
            })
          : t("No streams for {title}", { title: health.lastTitle })
        : t("Nothing yet. Kept on this computer only.");

  const checkText = check
    ? check.error
      ? t("Failed: {error}", { error: check.error })
      : check.count > 0
        ? `${t("Found {count} streams in {seconds}s.", { count: check.count, seconds: (check.ms / 1000).toFixed(1) })} ${t("{requests} requests", { requests: check.requests })}`
        : t("No streams came back.")
    : t("Runs this plugin on a real title and shows what came back.");

  const filesDesc = plugin.installedAt
    ? t("v{version} from {repo}, installed {when}.", {
        version: plugin.version,
        repo: plugin.repoName,
        when: relativeTime(plugin.installedAt),
      })
    : plugin.repoName;

  return (
    <div className={locked ? "opacity-60" : ""}>
      <div className="flex items-center gap-2 py-2 ps-3.5 pe-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`no-press flex min-h-[48px] min-w-0 flex-1 items-center gap-3 text-start ${FOCUS}`}
        >
          <AddonLogo addonId={plugin.id} addonName={plugin.name} manifestLogo={plugin.icon} size="lg" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="min-w-0 truncate text-[15px] font-medium text-ink">{plugin.name}</span>
              {plugin.nsfw && <Chip>18+</Chip>}
              {plugin.format === "provider-script" && <Chip>{t("Script")}</Chip>}
              {plugin.verified && <Chip accent>{t("Verified")}</Chip>}
            </span>
            <span className={`text-[12px] leading-snug ${copy.lock ? "text-accent" : "text-ink-subtle"}`}>{copy.lock ?? sub}</span>
            {copy.desc && <span className="text-[12px] leading-snug text-accent">{copy.desc}</span>}
            {masterOff && !locked && (
              <span className="text-[12px] leading-snug text-ink-subtle">
                {t("Plugins are paused. Turn on Use plugins above to run them.")}
              </span>
            )}
            {(error ?? copy.warn) && <span className="text-[12px] leading-snug text-danger">{error ?? copy.warn}</span>}
          </span>
          <SetIcon
            name="ChevronDown"
            size={16}
            strokeWidth={2.2}
            className={`shrink-0 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={plugin.enabled && !locked}
          aria-label={plugin.name}
          disabled={locked || busy === "toggle"}
          onClick={() => {
            if (locked) return;
            tapHaptic();
            void run("toggle", () => adapter.setEnabled(plugin.id, !plugin.enabled));
          }}
          className={`no-press group flex h-11 shrink-0 items-center px-1 disabled:opacity-60 ${FOCUS}`}
        >
          <Knob on={plugin.enabled && !locked} />
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-edge-soft/60 bg-canvas/30 px-4 py-3">
          <div className="flex flex-col gap-2">
            <NestedLabel title={t("Plugin files")} desc={filesDesc} />
            <div className="flex flex-wrap gap-2">
              {plugin.updateVersion && adapter.update && (
                <Pill
                  small
                  variant="primary"
                  disabled={!!busy}
                  onClick={() => void run("update", () => adapter.update!(plugin.id))}
                  icon={<SetIcon name={busy === "update" ? "Loader2" : "RefreshCw"} size={14} className={busy === "update" ? "animate-spin" : undefined} />}
                >
                  {t("Update to v{version}", { version: plugin.updateVersion })}
                </Pill>
              )}
              {plugin.canRevert && plugin.previousVersion && adapter.revert && (
                <Pill small disabled={!!busy} onClick={() => void run("revert", () => adapter.revert!(plugin.id))}>
                  {t("Revert to v{version}", { version: plugin.previousVersion })}
                </Pill>
              )}
              {plugin.hasSettings && adapter.settingsFields && (
                <Pill small onClick={() => setSettingsOpen(true)} icon={<SetIcon name="Settings2" size={14} strokeWidth={2.2} />}>
                  {t("Settings")}
                </Pill>
              )}
              <Pill
                small
                variant="danger"
                disabled={busy === "remove"}
                onClick={remove}
                icon={<SetIcon name={busy === "remove" ? "Loader2" : "Trash2"} size={14} className={busy === "remove" ? "animate-spin" : undefined} />}
              >
                {confirmRemove ? t("Remove and uninstall {count}?", { count: 1 }) : t("Remove")}
              </Pill>
            </div>
          </div>

          {plugin.kind === "stream" && (
            <NestedLabel
              title={t("Reaches")}
              desc={
                (plugin.hosts.length > 0
                  ? plugin.hosts.join(", ")
                  : t("Any public website. This plugin did not say which sites it uses.")) +
                (plugin.learnedHosts.length > 0 ? `\n${t("Seen so far: {hosts}", { hosts: plugin.learnedHosts.join(", ") })}` : "")
              }
            />
          )}

          {adapter.log && plugin.kind === "stream" && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setLogOpen((v) => !v)}
                aria-expanded={logOpen}
                className={`no-press -mx-1 flex min-h-[44px] items-center gap-2 rounded-xl px-1 text-start ${FOCUS}`}
              >
                <span className="min-w-0 flex-1">
                  <NestedLabel title={t("Recent activity")} desc={activity} />
                </span>
                <SetIcon name="ChevronDown" size={15} strokeWidth={2.2} className={`shrink-0 text-ink-subtle transition-transform ${logOpen ? "rotate-180" : ""}`} />
              </button>
              {logOpen && (
                <pre
                  dir="ltr"
                  className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl bg-elevated px-3.5 py-3 font-mono text-[11.5px] leading-[17px] text-ink-muted"
                >
                  {log.length === 0
                    ? t("Nothing yet. Kept on this computer only.")
                    : log.map((l) => `${new Date(l.at).toLocaleTimeString()} ${l.level} ${l.text}`).join("\n")}
                </pre>
              )}
            </div>
          )}

          {plugin.checkable && adapter.check && (
            <div className="flex flex-col gap-2">
              <NestedLabel title={t("Check it works")} desc={checkText} />
              <div>
                <Pill
                  small
                  disabled={busy === "check"}
                  onClick={() =>
                    void run("check", async () => {
                      setCheck(await adapter.check!(plugin.id));
                    })
                  }
                  icon={busy === "check" ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : undefined}
                >
                  {busy === "check" ? t("Checking…") : t("Check it works")}
                </Pill>
              </div>
            </div>
          )}
        </div>
      )}

      {settingsOpen && (
        <PluginSettingsSheet plugin={plugin} adapter={adapter} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}

function NestedLabel({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13.5px] font-medium text-ink">{title}</span>
      <span className="whitespace-pre-line text-[12px] leading-snug text-ink-subtle">{desc}</span>
    </div>
  );
}
