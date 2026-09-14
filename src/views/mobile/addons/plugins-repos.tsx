import { useEffect, useRef, useState } from "react";
import { AddonLogo } from "@/components/addon-logo";
import { relativeTime } from "@/lib/dates";
import { useT, useUiLanguage } from "@/lib/i18n";
import {
  addRepoAnyKind,
  pluginKinds,
  usePluginKindsVersion,
  type EntryView,
  type KindAdapter,
  type RepoView,
} from "@/lib/plugins";
import { useSettings } from "@/lib/settings";
import { splitRepoLinks } from "@/lib/streams/plugins";
import { languageNames } from "@/views/settings/plugins-panel/bits";
import { errorText, kindLabel } from "@/views/settings/plugins-panel/copy";
import { SetIcon } from "@/views/settings/set-icon";
import { Chip, Department, EmptyCard, Field, FOCUS, Group, IconButton, INPUT, Note, Pill, ToggleRow } from "./kit";

// Phone counterpart of plugins-panel/repositories-tab.tsx and repo-group.tsx:
// the same add flow through addRepoAnyKind (which runs detectRepoKind and
// routes to the right adapter), the same repo list with install / update /
// remove, and the same daily check toggle.
export function RepositoriesPhone() {
  const t = useT();
  const { settings, update } = useSettings();
  usePluginKindsVersion();
  const [link, setLink] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  const add = async (raw = link) => {
    const links = splitRepoLinks(raw);
    if (!links.length || busy) return;
    setBusy(true);
    setError(null);
    setAdded(null);
    let last: RepoView | null = null;
    let lastError: string | null = null;
    for (const l of links) {
      try {
        last = await addRepoAnyKind(l);
      } catch (e) {
        lastError = errorText(t, e);
      }
    }
    setBusy(false);
    if (last) {
      setLink("");
      setAdded(t("Added {repo} with {count} providers.", { repo: last.name, count: last.entries.length }));
      window.setTimeout(() => setAdded(null), 5000);
    }
    if (lastError) setError(lastError);
  };

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setLink(text);
      void add(text);
    } catch {
      setError(t("Couldn't read the clipboard. Paste into the field instead."));
    }
  };

  const repos = pluginKinds().flatMap((adapter) => adapter.repos().map((repo) => ({ repo, adapter })));

  return (
    <>
      <Department
        index={0}
        first
        kicker={t("Repositories")}
        folio="01"
        title={t("Add a repository")}
        standfirst={t(
          "Paste the manifest link of a repository you trust. Harbor reads its own plugin repositories and provider-script repositories as they are, and installs nothing until you choose to.",
        )}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1" dir="ltr">
              <Field icon={<SetIcon name="Link2" size={17} strokeWidth={2.1} />} focused={focused}>
                <input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void add();
                    }
                  }}
                  onPaste={() => window.setTimeout(() => setLink((v) => v.trim()), 0)}
                  placeholder="https://github.com/user/repo"
                  aria-label={t("Repository link")}
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${INPUT} font-mono text-[15px]`}
                />
              </Field>
            </div>
            {link.trim() ? (
              <Pill
                variant="primary"
                disabled={busy}
                onClick={() => void add()}
                icon={busy ? <SetIcon name="Loader2" size={15} className="animate-spin" /> : undefined}
              >
                {busy ? t("Checking…") : t("Add")}
              </Pill>
            ) : canPaste ? (
              <Pill onClick={() => void paste()} icon={<SetIcon name="ClipboardCopy" size={15} strokeWidth={2.1} />}>
                {t("Paste")}
              </Pill>
            ) : null}
          </div>
          <Note tone={added ? "accent" : "muted"}>
            {added ??
              t("Any GitHub link works, raw or not. Harbor adds /manifest.json when it is missing. Paste several to add them all.")}
          </Note>
          {error && <Note tone="danger">{error}</Note>}
        </div>
      </Department>

      <Department index={1} kicker={t("Repositories")} folio="02" title={t("Your repositories")}>
        {repos.length === 0 ? (
          <EmptyCard
            icon={<SetIcon name="Package" size={26} strokeWidth={1.8} />}
            title={t("No repositories yet")}
            body={t("Add one above. Nothing installs until you pick a plugin.")}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {repos.map(({ repo, adapter }) => (
              <RepoGroupPhone key={`${repo.kind}|${repo.url}`} repo={repo} adapter={adapter} />
            ))}
          </div>
        )}
      </Department>

      <Department index={2} kicker={t("Repositories")} folio="03" title={t("Checking for updates")}>
        <Group>
          <ToggleRow
            label={t("Check repositories daily")}
            sub={t(
              "Once a day, look for newer versions and show an Update button here. Harbor never installs an update by itself.",
            )}
            on={settings.pluginsAutoCheck}
            onChange={(v) => update({ pluginsAutoCheck: v })}
          />
        </Group>
      </Department>
    </>
  );
}

function foreignText(t: (k: string) => string, kind: RepoView["foreign"]): string {
  if (kind === "tachiyomi") {
    return t(
      "This is a Tachiyomi / Mihon repo. Those are Android (APK) extensions, so Harbor can't run them directly. To use these sources on desktop, run a Suwayomi server and connect Harbor to it from the Servers section.",
    );
  }
  if (kind === "paperback") {
    return t(
      "This is a Paperback (iOS) repo, which Harbor can't use. For desktop sources, connect a Suwayomi server from the Servers section.",
    );
  }
  return t(
    "This does not look like a plugin repository. Harbor expects { name, plugins } or a provider-script manifest with scrapers.",
  );
}

type Confirm = "remove" | "remove-all" | null;

function RepoGroupPhone({ repo, adapter }: { repo: RepoView; adapter: KindAdapter }) {
  const t = useT();
  const uiLang = useUiLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const confirmTimer = useRef<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setErrors((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
    try {
      await fn();
    } catch (e) {
      setErrors((cur) => ({ ...cur, [key]: errorText(t, e) }));
    } finally {
      setBusy(null);
    }
  };

  // Destructive repo actions arm on the first tap and fire on a second tap
  // inside three seconds, the same guard desktop's repo group uses.
  const arm = (what: Exclude<Confirm, null>, action: () => void) => {
    if (confirm !== what) {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      setConfirm(what);
      confirmTimer.current = window.setTimeout(() => setConfirm(null), 3000);
      return;
    }
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    setConfirm(null);
    action();
  };

  const pending = repo.entries.filter((e) => !e.installed && !e.repoDisabled);
  const installed = repo.entries.filter((e) => e.installed && e.installedId);
  const updatable = repo.entries.filter((e) => e.updateAvailable && e.installedId);

  const installAll = () =>
    run("install-all", async () => {
      setProgress({ done: 0, total: pending.length });
      try {
        if (adapter.installAll) {
          await adapter.installAll(repo.url, (done, total) => setProgress({ done, total }));
          return;
        }
        let done = 0;
        for (const e of pending) {
          try {
            await adapter.install(repo.url, e.id);
          } catch {
            /* the row shows its own state on refresh */
          }
          done += 1;
          setProgress({ done, total: pending.length });
        }
      } finally {
        setProgress(null);
      }
    });

  const updateAll = () =>
    run("update-all", async () => {
      for (const e of updatable) await adapter.update!(e.installedId!);
    });

  const removeAll = () =>
    run("remove-all", async () => {
      for (const e of installed) await adapter.uninstall(e.installedId!);
    });

  const headerDesc =
    repo.updates > 0
      ? t("{count} updates available", { count: repo.updates })
      : `${repo.host}${repo.checkedAt ? ` · ${t("checked {when}", { when: relativeTime(repo.checkedAt) })}` : ""}`;
  const warn = repo.error
    ? t("Could not reach this repository. Installed plugins keep working.")
    : (errors.remove ?? errors.refresh ?? errors["install-all"] ?? errors["update-all"] ?? errors["remove-all"]);

  return (
    <div className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/40">
      <div className="flex items-center gap-1 py-2 ps-3.5 pe-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`no-press flex min-h-[48px] min-w-0 flex-1 items-center gap-3 text-start ${FOCUS}`}
        >
          <SetIcon name="PackageOpen" size={20} strokeWidth={2} className="shrink-0 text-ink-muted" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="truncate text-[15px] font-medium text-ink">{repo.name}</span>
            <span className="flex flex-wrap gap-1">
              <Chip>{kindLabel(t, repo.kind)}</Chip>
              {repo.format === "provider-script" && <Chip>{t("Script")}</Chip>}
              {repo.entries.length > 0 && <Chip>{t("{count} plugins", { count: repo.entries.length })}</Chip>}
              {repo.installedCount > 0 && <Chip accent>{t("{count} installed", { count: repo.installedCount })}</Chip>}
            </span>
            <span className={`truncate text-[12px] ${repo.updates > 0 ? "text-accent" : "text-ink-subtle"}`}>
              {progress ? t("Installing {done} of {total}", progress) : headerDesc}
            </span>
            {warn && <span className="text-[12px] leading-snug text-danger">{warn}</span>}
          </span>
          <SetIcon
            name="ChevronDown"
            size={16}
            strokeWidth={2.2}
            className={`shrink-0 text-ink-subtle transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <IconButton
          name="RefreshCw"
          label={repo.error ? t("Retry") : t("Refresh")}
          disabled={!!busy}
          spin={busy === "refresh" || repo.loading}
          onClick={() => void run("refresh", () => adapter.refreshRepo(repo.url))}
        />
      </div>

      {open && (
        <div className="flex flex-col gap-3 border-t border-edge-soft/60 bg-canvas/30 px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {updatable.length > 0 && adapter.update && (
              <Pill small variant="primary" disabled={!!busy} onClick={() => void updateAll()}>
                {busy === "update-all" ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : t("Update all")}
              </Pill>
            )}
            {pending.length > 0 && !repo.foreign && (
              <Pill small variant="primary" disabled={!!busy} onClick={() => void installAll()}>
                {busy === "install-all" ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : t("Install all")}
              </Pill>
            )}
            {installed.length > 0 && (
              <Pill small variant="danger" disabled={!!busy} onClick={() => arm("remove-all", () => void removeAll())}>
                {busy === "remove-all" ? (
                  <SetIcon name="Loader2" size={14} className="animate-spin" />
                ) : confirm === "remove-all" ? (
                  t("Remove and uninstall {count}?", { count: installed.length })
                ) : (
                  t("Remove all")
                )}
              </Pill>
            )}
            <Pill
              small
              variant="danger"
              disabled={!!busy && busy !== "remove"}
              onClick={() => arm("remove", () => void run("remove", () => adapter.removeRepo(repo.url)))}
              icon={<SetIcon name={busy === "remove" ? "Loader2" : "Trash2"} size={14} className={busy === "remove" ? "animate-spin" : undefined} />}
            >
              {confirm === "remove" ? t("Remove and uninstall {count}?", { count: repo.installedCount }) : t("Remove")}
            </Pill>
          </div>

          {repo.foreign && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-ink">{repo.host}</span>
              <span className="text-[12px] leading-snug text-ink-subtle">{foreignText(t, repo.foreign)}</span>
            </div>
          )}

          {repo.loading && repo.entries.length === 0 && !repo.foreign && (
            <div className="flex items-center gap-2 text-ink-subtle">
              <SetIcon name="Loader2" size={16} className="animate-spin" />
              <span className="text-[13.5px]">{t("Loading plugins...")}</span>
            </div>
          )}

          {!repo.loading && !repo.error && !repo.foreign && repo.entries.length === 0 && (
            <span className="text-[13.5px] text-ink-muted">{t("This repository lists no plugins.")}</span>
          )}

          {repo.entries.length > 0 && (
            <Group className="bg-elevated/60">
              {repo.entries.map((entry) => (
                <EntryRowPhone
                  key={entry.id}
                  entry={entry}
                  repo={repo}
                  adapter={adapter}
                  busy={busy}
                  error={errors[entry.id]}
                  uiLang={uiLang}
                  run={run}
                />
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

function EntryRowPhone({
  entry,
  repo,
  adapter,
  busy,
  error,
  uiLang,
  run,
}: {
  entry: EntryView;
  repo: RepoView;
  adapter: KindAdapter;
  busy: string | null;
  error: string | undefined;
  uiLang: string;
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
}) {
  const t = useT();
  const desc = [entry.description, entry.note, languageNames(entry.lang, uiLang, t("All languages"))]
    .filter(Boolean)
    .join(" · ");
  const working = busy === entry.id;
  return (
    <div className={`flex items-center gap-3 py-2 ps-3 pe-1.5 ${entry.repoDisabled ? "opacity-60" : ""}`}>
      <AddonLogo addonId={entry.id} addonName={entry.name} manifestLogo={entry.icon} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-medium text-ink">{entry.name}</span>
          <Chip>v{entry.version}</Chip>
          {entry.installed && <Chip accent>{t("Installed")}</Chip>}
          {entry.nsfw && <Chip>18+</Chip>}
        </span>
        {entry.repoDisabled ? (
          <span className="text-[12px] leading-snug text-accent">{t("Turned off by its repository.")}</span>
        ) : (
          desc && <span className="line-clamp-2 text-[12px] leading-snug text-ink-subtle">{desc}</span>
        )}
        {error && <span className="text-[12px] leading-snug text-danger">{error}</span>}
      </div>
      {entry.installed ? (
        <div className="flex shrink-0 items-center">
          {entry.updateAvailable && entry.installedId && adapter.update && (
            <Pill small variant="primary" disabled={!!busy} onClick={() => void run(entry.id, () => adapter.update!(entry.installedId!))}>
              {working ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : t("Update")}
            </Pill>
          )}
          {entry.installedId && (
            <IconButton
              name="Trash2"
              danger
              label={t("Remove")}
              disabled={!!busy}
              spin={working}
              onClick={() => void run(entry.id, () => adapter.uninstall(entry.installedId!))}
            />
          )}
        </div>
      ) : (
        <Pill
          small
          variant="primary"
          disabled={!!busy || entry.repoDisabled}
          onClick={() => void run(entry.id, () => adapter.install(repo.url, entry.id))}
        >
          {working ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : t("Install")}
        </Pill>
      )}
    </div>
  );
}
