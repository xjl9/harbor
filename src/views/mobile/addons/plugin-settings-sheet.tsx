import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import type { KindAdapter, PluginView, SettingsField } from "@/lib/plugins";
import { errorText } from "@/views/settings/plugins-panel/copy";
import { SetIcon } from "@/views/settings/set-icon";
import { BottomSheet, FOCUS, Group, INPUT, Pill, ToggleRow } from "./kit";

type Values = Record<string, string | boolean>;

// Mirrors plugin-settings-modal.tsx: the same field kinds, the same defaults
// rule, the same save path through adapter.saveSettings. Rendered as a phone
// sheet because the desktop modal assumes a 560px column and a pointer.
function defaultsOf(fields: SettingsField[], current: Values): Values {
  const out: Values = { ...current };
  for (const f of fields) {
    if (f.type === "header" || f.type === "info") continue;
    if (out[f.key] !== undefined) continue;
    if (f.type === "toggle") out[f.key] = f.defaultValue === true;
    else if (f.type === "select") out[f.key] = f.defaultValue ?? f.options[0]?.value ?? "";
    else out[f.key] = f.defaultValue ?? "";
  }
  return out;
}

export function PluginSettingsSheet({
  plugin,
  adapter,
  onClose,
}: {
  plugin: PluginView;
  adapter: KindAdapter;
  onClose: () => void;
}) {
  const t = useT();
  const [fields, setFields] = useState<SettingsField[] | null>(null);
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFields(null);
    setError(null);
    adapter
      .settingsFields?.(plugin.id)
      .then((list) => {
        if (cancelled) return;
        setFields(list);
        setValues(defaultsOf(list, adapter.settingsValues?.(plugin.id) ?? {}));
      })
      .catch((e) => {
        if (cancelled) return;
        setFields([]);
        setError(t("This plugin's settings form failed to load: {error}", { error: errorText(t, e) }));
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, plugin.id, t]);

  const save = async () => {
    if (!fields || !adapter.saveSettings) return;
    setSaving(true);
    try {
      await adapter.saveSettings(plugin.id, values, fields);
      onClose();
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, v: string | boolean) => setValues((cur) => ({ ...cur, [key]: v }));

  let groups: { label?: string; items: SettingsField[] }[] = [];
  for (const f of fields ?? []) {
    if (f.type === "header") {
      groups.push({ label: f.label, items: [] });
      continue;
    }
    if (groups.length === 0) groups.push({ items: [] });
    groups[groups.length - 1].items.push(f);
  }
  groups = groups.filter((g) => g.items.length > 0 || g.label);

  return (
    <BottomSheet
      title={plugin.name}
      sub={t("Settings this plugin asked for. Stored on this computer only.")}
      onClose={onClose}
      actions={
        <>
          <Pill onClick={onClose} disabled={saving}>
            {t("Cancel")}
          </Pill>
          <Pill variant="primary" onClick={() => void save()} disabled={saving || fields === null}>
            {saving ? <SetIcon name="Loader2" size={16} className="animate-spin" /> : t("Save")}
          </Pill>
        </>
      }
    >
      {fields === null && (
        <div className="flex items-center gap-2.5 py-6 text-ink-subtle">
          <SetIcon name="Loader2" size={17} className="animate-spin" />
          <span className="text-[15px]">{t("Loading plugins...")}</span>
        </div>
      )}
      {error && <p className="mb-3 text-[13.5px] leading-relaxed text-danger">{error}</p>}
      <div className="flex flex-col gap-4">
        {groups.map((g, gi) => (
          <div key={gi} className="flex flex-col gap-2">
            {g.label && (
              <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">{g.label}</span>
            )}
            <Group>
              {g.items.map((f, fi) => {
                if (f.type === "header") return null;
                if (f.type === "info") {
                  return (
                    <p key={fi} className="px-4 py-3 text-[13.5px] leading-relaxed text-ink-muted">
                      {f.label}
                    </p>
                  );
                }
                if (f.type === "toggle") {
                  return (
                    <ToggleRow
                      key={f.key}
                      label={f.label}
                      sub={f.description}
                      on={values[f.key] === true}
                      onChange={(v) => set(f.key, v)}
                    />
                  );
                }
                if (f.type === "select") {
                  return (
                    <label key={f.key} className="flex min-h-[52px] flex-col gap-1.5 px-4 py-3">
                      <span className="text-[15px] font-medium text-ink">{f.label}</span>
                      {f.description && <span className="text-[12.5px] leading-snug text-ink-subtle">{f.description}</span>}
                      <select
                        value={String(values[f.key] ?? "")}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={`mt-1 h-11 rounded-xl border border-edge-soft bg-canvas/60 px-3 text-[15px] text-ink ${FOCUS}`}
                      >
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                }
                return (
                  <label key={f.key} className="flex min-h-[52px] flex-col gap-1.5 px-4 py-3">
                    <span className="text-[15px] font-medium text-ink">{f.label}</span>
                    {f.description && <span className="text-[12.5px] leading-snug text-ink-subtle">{f.description}</span>}
                    <span className="mt-1 flex min-h-[44px] items-center rounded-xl border border-edge-soft bg-canvas/60 px-3" dir="ltr">
                      <input
                        type={f.isPassword ? "password" : "text"}
                        value={String(values[f.key] ?? "")}
                        placeholder={f.placeholder}
                        spellCheck={false}
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        onChange={(e) => set(f.key, e.target.value)}
                        className={INPUT}
                      />
                    </span>
                  </label>
                );
              })}
            </Group>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
