import { AlertCircle, Check, Loader2, Puzzle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { installFromUrl, loadInstalled } from "@/lib/addon-store";
import { useT } from "@/lib/i18n";
import { ADDON_SUGGESTIONS } from "../mobile-addons";
import { FOCUS, tapHaptic } from "./ob-shared";

// Optional step, and the one that fixes the fresh install: DEFAULT_ADDONS is
// empty, so without this a tester finishes setup with zero stream sources and
// nothing can play. The list is the same ADDON_SUGGESTIONS the Addons sheet
// offers, installed through the same installFromUrl path (which also fires
// harbor:addons-changed, so Home rebuilds its rows straight away). The
// orchestrator lists "addons" in `skippable`, so Skip and the top-right X still
// finish setup.
export function ObAddons() {
  const t = useT();
  const [installed, setInstalled] = useState<Set<string>>(() => installedUrlSet());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => setInstalled(installedUrlSet()), []);

  // A Stremio sign-in on the previous step can pull addons in behind our back.
  useEffect(() => {
    window.addEventListener("harbor:addons-changed", refresh);
    return () => window.removeEventListener("harbor:addons-changed", refresh);
  }, [refresh]);

  const add = async (url: string) => {
    tapHaptic();
    setBusy(url);
    setError(null);
    try {
      await installFromUrl(url);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not install that addon."));
    } finally {
      setBusy(null);
    }
  };

  const any = installed.size > 0;

  return (
    <div className="flex flex-col gap-6">
      <span className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
        {t("Sources")}
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[30px] font-medium leading-[1.08] tracking-tight text-ink">
          {t("Give Harbor something to play")}
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {t(
            "Addons are where catalogs and streams come from, and Harbor starts with none. Add one now so the first title you open has something to play.",
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-edge-soft bg-canvas/40">
        {ADDON_SUGGESTIONS.map((s, i) => {
          const done = installed.has(normalizeUrl(s.url));
          const working = busy === s.url;
          return (
            <div key={s.id}>
              {i > 0 && <span className="mx-4 block h-px bg-edge-soft/60" />}
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-raised text-ink-muted">
                  <Puzzle size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-ink">{s.name}</p>
                  <p className="truncate text-[12.5px] text-ink-subtle">{s.note}</p>
                </div>
                {done ? (
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-semibold text-accent">
                    <Check size={14} strokeWidth={2.6} />
                    {t("Added")}
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => void add(s.url)}
                    aria-label={t("Add {name}", { name: s.name })}
                    className={`shrink-0 rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-canvas transition-transform active:scale-95 disabled:opacity-40 ${FOCUS}`}
                  >
                    {working ? <Loader2 size={15} className="animate-spin" /> : t("Add")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-[13px] text-danger">
          <AlertCircle size={14} strokeWidth={2.2} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <p className="text-[13px] text-ink-subtle">
        {any
          ? t("Add or remove sources anytime from Profile, under Addons.")
          : t(
              "Not sure which? Torrentio and Cinemeta cover most people. You can change this later in Profile, under Addons.",
            )}
      </p>
    </div>
  );
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function installedUrlSet(): Set<string> {
  return new Set(loadInstalled().map((a) => normalizeUrl(a.transportUrl)));
}
