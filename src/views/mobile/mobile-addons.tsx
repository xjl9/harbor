import { AlertCircle, Check, Loader2, Plus, Puzzle, Trash2, X } from "lucide-react";
import { useCallback, useState } from "react";
import {
  installFromUrl,
  loadInstalled,
  uninstallAddon,
  type InstalledAddon,
} from "@/lib/addon-store";
import { useRegisterSheet } from "./mobile-sheet-lock";

// Well-known free/debrid stream sources offered as one-tap installs so a fresh
// standalone install has something for the play picker to query. These are the
// bare manifests; debrid keys are configured on the addon's own /configure page.
const SUGGESTIONS: Array<{ id: string; name: string; note: string; url: string }> = [
  {
    id: "com.stremio.torrentio.addon",
    name: "Torrentio",
    note: "Torrent + debrid streams",
    url: "https://torrentio.strem.fun/manifest.json",
  },
  {
    id: "comet.elfhosted.com",
    name: "Comet",
    note: "Debrid-first, fast cached results",
    url: "https://comet.elfhosted.com/manifest.json",
  },
  {
    id: "com.linvo.cinemeta",
    name: "Cinemeta",
    note: "Official catalogs + metadata",
    url: "https://v3-cinemeta.strem.io/manifest.json",
  },
];

export function MobileAddons({ onClose }: { onClose: () => void }) {
  useRegisterSheet(true);
  const [installed, setInstalled] = useState<InstalledAddon[]>(() => loadInstalled());
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => setInstalled(loadInstalled()), []);

  const installedUrls = new Set(installed.map((a) => a.transportUrl.replace(/\/$/, "")));

  const install = useCallback(
    async (raw: string, tag: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      setBusy(tag);
      setError(null);
      try {
        await installFromUrl(trimmed);
        setUrl("");
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not install that addon.");
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (addon: InstalledAddon) => {
      setBusy(addon.transportUrl);
      try {
        await uninstallAddon(addon.id, addon.transportUrl);
        refresh();
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-canvas">
      <header
        className="flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <span className="w-9" />
        <h1 className="font-display text-[19px] font-medium text-ink">Addons</h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-elevated/60 text-ink-muted transition-transform active:scale-90"
        >
          <X size={19} strokeWidth={2.2} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-10">
        <section className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-3.5 py-2">
            <Plus size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste an addon manifest URL"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") install(url, "url");
              }}
            />
            <button
              type="button"
              disabled={!url.trim() || busy === "url"}
              onClick={() => install(url, "url")}
              className="shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[13.5px] font-semibold text-canvas transition-transform active:scale-95 disabled:opacity-40"
            >
              {busy === "url" ? <Loader2 size={15} className="animate-spin" /> : "Add"}
            </button>
          </div>
          {error && (
            <p className="flex items-start gap-1.5 px-1 text-[13px] text-danger">
              <AlertCircle size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
        </section>

        {installed.length > 0 && (
          <section className="mt-7 flex flex-col gap-3">
            <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
              Installed
            </h2>
            <div className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/40">
              {installed.map((addon, i) => (
                <div key={addon.transportUrl}>
                  {i > 0 && <span className="mx-4 block h-px bg-edge-soft/60" />}
                  <div className="flex items-center gap-3.5 px-4 py-3.5">
                    <AddonMark logo={addon.manifest?.logo} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">
                        {addon.manifest?.name || addon.id}
                      </p>
                      <p className="truncate text-[12.5px] text-ink-subtle">
                        {(addon.manifest?.types || []).slice(0, 3).join(" · ") || "addon"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${addon.manifest?.name || addon.id}`}
                      disabled={busy === addon.transportUrl}
                      onClick={() => remove(addon)}
                      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-raised/60 disabled:opacity-40"
                    >
                      {busy === addon.transportUrl ? (
                        <Loader2 size={17} className="animate-spin" />
                      ) : (
                        <Trash2 size={17} strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7 flex flex-col gap-3">
          <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            Suggested
          </h2>
          <div className="flex flex-col gap-2.5">
            {SUGGESTIONS.map((s) => {
              const done = installedUrls.has(s.url.replace(/\/$/, ""));
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-4 py-3"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-raised text-ink-muted">
                    <Puzzle size={18} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{s.name}</p>
                    <p className="truncate text-[12.5px] text-ink-subtle">{s.note}</p>
                  </div>
                  <button
                    type="button"
                    disabled={done || busy === s.url}
                    onClick={() => install(s.url, s.url)}
                    className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-transform active:scale-95 ${
                      done
                        ? "bg-transparent text-success"
                        : "bg-ink text-canvas disabled:opacity-40"
                    }`}
                  >
                    {done ? (
                      <span className="flex items-center gap-1">
                        <Check size={14} strokeWidth={2.6} /> Added
                      </span>
                    ) : busy === s.url ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function AddonMark({ logo }: { logo?: string }) {
  if (logo) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-raised">
        <img src={logo} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-ink-muted">
      <Puzzle size={18} strokeWidth={2} />
    </span>
  );
}
