import { Check, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { DEBRID_PROVIDERS } from "../debrid-providers";
import { DebridSheet, type DebridKey, type DebridProvider } from "../mobile-debrid-sheet";
import { FOCUS, tapHaptic } from "./ob-shared";

// Optional step: connecting a debrid provider is never required to finish setup
// (the orchestrator lists "debrid" in `skippable`, so Skip / the top-right X
// always advance). Tapping a provider opens the same DebridSheet the profile
// uses, so validation and the settings write are identical in both places. A
// successful Save advances to the next step via onAdvance.
export function ObDebrid({ onAdvance }: { onAdvance: () => void }) {
  const { settings, update } = useSettings();
  const t = useT();
  const [editing, setEditing] = useState<DebridProvider | null>(null);

  const keySet = (v: string | undefined) => !!(v && v.trim());

  // Explicit per-key branches keep the write typed as Partial<Settings>; a
  // computed update({ [k]: v }) widens to a string index and fails tsc (same
  // rule as mobile-profile's DebridSheet handler).
  const setKey = (key: DebridKey, next: string) => {
    const val = next.trim();
    if (key === "rdKey") update({ rdKey: val });
    else if (key === "tbKey") update({ tbKey: val });
    else if (key === "adKey") update({ adKey: val });
    else if (key === "pmKey") update({ pmKey: val });
    else update({ dlKey: val });
  };

  return (
    <div className="flex flex-col gap-6">
      <span className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
        {t("Step 4 · Debrid")}
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[30px] font-medium leading-[1.08] tracking-tight text-ink">
          {t("Get faster, more reliable streams")}
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {t(
            "Connect a debrid provider to see cached streams that can start immediately. This is optional, requires a separate paid provider account, and can be configured later in Settings.",
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
          {t("Choose your provider")}
        </span>
        <div className="overflow-hidden rounded-xl border border-edge-soft bg-canvas/40">
          {DEBRID_PROVIDERS.map((p, i) => {
            const connected = keySet(settings[p.key]);
            return (
              <div key={p.key}>
                {i > 0 && <span className="mx-4 block h-px bg-edge-soft/60" />}
                <button
                  type="button"
                  onClick={() => {
                    tapHaptic();
                    setEditing(p);
                  }}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-start ${FOCUS}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[5px]">
                    <img
                      src={p.logo}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span className="flex-1 text-[15px] font-medium text-ink">{p.label}</span>
                  {connected && (
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-accent">
                      <Check size={14} strokeWidth={2.6} />
                      {t("Connected")}
                    </span>
                  )}
                  <ChevronRight
                    size={18}
                    strokeWidth={2.2}
                    className="dir-icon shrink-0 text-ink-subtle"
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[13px] text-ink-subtle">
        {t("No debrid? Skip this. Harbor still finds free public streams, they can just be slower.")}
      </p>

      {editing && (
        <DebridSheet
          provider={editing}
          initial={String(settings[editing.key] ?? "")}
          onSave={(next) => {
            setKey(editing.key, next);
            setEditing(null);
            // Successful connect advances; Skip / the top-right X advance too.
            onAdvance();
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
