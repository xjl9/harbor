import { useEffect, useState } from "react";
import { AddonLogo, resolveAddonLogo } from "@/components/addon-logo";
import { openInstallerViewport } from "@/components/installer-viewport";
import {
  fetchManifestAt,
  findHostnameMatch,
  installFromUrl,
  isInstalled,
  manifestToConfigureUrl,
  parseAddonUrl,
} from "@/lib/addon-store";
import type { Addon } from "@/lib/addons";
import { useT } from "@/lib/i18n";
import { SetIcon } from "@/views/settings/set-icon";
import { BottomSheet, Field, INPUT, Note, Pill } from "./kit";

type Resolved = {
  manifest: Addon["manifest"];
  url: string;
  matchKind: "fresh" | "id-match" | "hostname-match";
  replaceId: string | null;
  replaceName: string | null;
};

// Phone version of the desktop add-by-URL bar plus the install modal behind it.
// parseAddonUrl already turns stremio:// links into https and appends
// /manifest.json, so a pasted share link, a configure page URL or a bare host
// all resolve the same way desktop resolves them. A Paste button reads the
// clipboard directly because the iOS keyboard hides its paste key behind a
// long press most people never find.
export function AddByUrl({
  incoming,
  onIncomingHandled,
  onInstalled,
  showToast,
}: {
  incoming?: string | null;
  onIncomingHandled?: () => void;
  onInstalled: (id: string) => void;
  showToast: (kind: "ok" | "error", text: string) => void;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const canPaste = typeof navigator !== "undefined" && !!navigator.clipboard?.readText;

  const resolve = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || reading) return;
    setReading(true);
    setError(null);
    try {
      const parsed = parseAddonUrl(trimmed);
      if (parsed.kind === "error") throw new Error(parsed.message);
      const manifest = await fetchManifestAt(parsed.url);
      let matchKind: Resolved["matchKind"] = "fresh";
      let replaceId: string | null = null;
      let replaceName: string | null = null;
      if (isInstalled(manifest.id)) {
        matchKind = "id-match";
      } else {
        const host = findHostnameMatch(parsed.url);
        if (host) {
          matchKind = "hostname-match";
          replaceId = host.id;
          replaceName = host.manifest?.name ?? host.id;
        }
      }
      setResolved({ manifest, url: parsed.url, matchKind, replaceId, replaceName });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Couldn't read that addon URL."));
    } finally {
      setReading(false);
    }
  };

  // A stremio:// link handed over by the deep-link bridge resolves straight
  // into the confirm sheet, exactly like a pasted one.
  useEffect(() => {
    if (!incoming) return;
    setValue(incoming);
    void resolve(incoming);
    onIncomingHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

  const paste = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      setValue(text);
      void resolve(text);
    } catch {
      setError(t("Couldn't read the clipboard. Paste into the field instead."));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Field icon={<SetIcon name="Link2" size={17} strokeWidth={2.1} />} focused={focused}>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => e.key === "Enter" && void resolve(value)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text").trim();
                if (text) {
                  e.preventDefault();
                  setValue(text);
                }
              }}
              placeholder={t("Paste manifest URL or stremio:// link")}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className={INPUT}
            />
            {value.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setValue("")}
                aria-label={t("Clear")}
                className="no-press -me-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-subtle"
              >
                <SetIcon name="X" size={15} strokeWidth={2.4} />
              </button>
            )}
          </Field>
        </div>
        {value.trim().length > 0 ? (
          <Pill variant="primary" disabled={reading} onClick={() => void resolve(value)}>
            {reading ? <SetIcon name="Loader2" size={16} className="animate-spin" /> : t("Install")}
          </Pill>
        ) : canPaste ? (
          <Pill onClick={() => void paste()} icon={<SetIcon name="ClipboardCopy" size={15} strokeWidth={2.1} />}>
            {t("Paste")}
          </Pill>
        ) : null}
      </div>
      {error && (
        <Note tone="danger">
          <SetIcon name="AlertCircle" size={13} strokeWidth={2.3} className="me-1 inline-block align-[-2px]" />
          {error}
        </Note>
      )}
      {resolved && (
        <ConfirmInstallSheet
          resolved={resolved}
          onClose={() => setResolved(null)}
          onDone={(id, text) => {
            setResolved(null);
            setValue("");
            showToast("ok", text);
            onInstalled(id);
          }}
          onFail={(text) => showToast("error", text)}
        />
      )}
    </div>
  );
}

function ConfirmInstallSheet({
  resolved,
  onClose,
  onDone,
  onFail,
}: {
  resolved: Resolved;
  onClose: () => void;
  onDone: (id: string, toast: string) => void;
  onFail: (text: string) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const m = resolved.manifest;
  const logo = resolveAddonLogo(m.logo, resolved.url);
  const configurable = m.behaviorHints?.configurable === true || m.behaviorHints?.configurationRequired === true;
  const isUpdate = resolved.matchKind !== "fresh";
  const types = (m.types ?? []).slice(0, 3).join(" · ");

  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await installFromUrl(resolved.url, {
        replaceId: resolved.replaceId ?? undefined,
      });
      onDone(
        result.addon.manifest.id,
        result.replaced ? t("Updated") : result.syncedToStremio ? t("Installed") : t("Installed locally"),
      );
    } catch (e) {
      onFail(e instanceof Error ? e.message : t("Install failed."));
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      title={isUpdate ? t("Update addon") : t("Install addon")}
      onClose={onClose}
      actions={
        <>
          <Pill onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </Pill>
          <Pill
            variant="primary"
            onClick={() => void install()}
            disabled={busy}
            icon={busy ? <SetIcon name="Loader2" size={15} className="animate-spin" /> : undefined}
          >
            {busy ? (isUpdate ? t("Updating") : t("Installing")) : isUpdate ? t("Update") : t("Install")}
          </Pill>
        </>
      }
    >
      <div className="flex items-start gap-3.5 rounded-2xl border border-edge-soft/70 bg-canvas/50 p-3.5">
        <AddonLogo addonId={m.id} addonName={m.name} manifestLogo={logo} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-medium text-ink">{m.name}</p>
          <p className="truncate text-[12.5px] text-ink-subtle">
            {[m.version ? `v${m.version}` : null, types].filter(Boolean).join(" · ")}
          </p>
          {m.description && (
            <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-ink-muted">{m.description}</p>
          )}
        </div>
      </div>
      {resolved.matchKind === "hostname-match" && resolved.replaceName && (
        <p className="mt-3 text-[13px] leading-relaxed text-accent">
          {t(
            "Looks like a re-configure of {name}. We'll replace the existing entry so you don't end up with two copies.",
            { name: resolved.replaceName },
          )}
        </p>
      )}
      {resolved.matchKind === "id-match" && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
          {t("This addon is already installed. Continue to swap in this link.")}
        </p>
      )}
      {configurable && (
        <button
          type="button"
          onClick={() => openInstallerViewport(manifestToConfigureUrl(resolved.url), m.name, logo)}
          className={`no-press mt-3 flex min-h-[48px] w-full items-center gap-3 rounded-2xl border border-edge-soft/70 bg-canvas/50 px-4 text-start`}
        >
          <SetIcon name="Settings2" size={18} strokeWidth={2} className="shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-ink">{t("Open setup page")}</span>
            <span className="block text-[12px] leading-snug text-ink-subtle">
              {t("Configure on the addon's setup page")}
            </span>
          </span>
          <SetIcon name="ChevronRight" size={16} strokeWidth={2.2} className="shrink-0 text-ink-subtle dir-icon" />
        </button>
      )}
    </BottomSheet>
  );
}
