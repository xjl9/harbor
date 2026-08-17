import {
  AlertCircle,
  Check,
  ClipboardPaste,
  KeyRound,
  Loader2,
  Puzzle,
  QrCode,
  ShieldAlert,
  Subtitles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  installFromUrl,
  loadInstalled,
  uninstallAddon,
} from "@/lib/addon-store";
import { useSettings } from "@/lib/settings";
import {
  bundleToSettingsPatch,
  decodeBundle,
  summarizeBundle,
  type SetupBundle,
} from "@/lib/settings/setup-transfer";
import {
  CATEGORY_LABEL,
  IncludedLine,
  ModeCard,
  SheetShell,
} from "./mobile-setup-shared";
import { useKeyboardInset } from "./use-keyboard-inset";
import { canScanQr, scanQr } from "@/lib/qr/scan-qr";

type ImportPhase =
  | { kind: "idle" }
  | { kind: "applying" }
  | {
      kind: "done";
      addonsAdded: number;
      addonsFailed: number;
      keysApplied: number;
    };

export function ImportSetupSheet({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const keyboardInset = useKeyboardInset();
  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [phase, setPhase] = useState<ImportPhase>({ kind: "idle" });

  const trimmed = raw.trim();
  const bundle: SetupBundle | null = useMemo(
    () => (trimmed ? decodeBundle(trimmed) : null),
    [trimmed],
  );
  const summary = bundle ? summarizeBundle(bundle) : null;
  const invalid = trimmed.length > 0 && !bundle;

  const apply = async () => {
    if (!bundle) return;
    setPhase({ kind: "applying" });

    const installedUrls = new Set(
      loadInstalled().map((a) => a.transportUrl.replace(/\/$/, "")),
    );
    let addonsAdded = 0;
    let addonsFailed = 0;
    for (const url of bundle.addons) {
      if (mode === "merge" && installedUrls.has(url.replace(/\/$/, "")))
        continue;
      try {
        await installFromUrl(url);
        addonsAdded++;
      } catch {
        addonsFailed++;
      }
    }

    // Replace removes addons this code does not carry (explicit, post-Apply only).
    if (mode === "replace") {
      const keep = new Set(bundle.addons.map((u) => u.replace(/\/$/, "")));
      for (const a of loadInstalled()) {
        if (!keep.has(a.transportUrl.replace(/\/$/, ""))) {
          try {
            await uninstallAddon(a.id, a.transportUrl);
          } catch {
            /* leave it installed on failure */
          }
        }
      }
    }

    const patch = bundleToSettingsPatch(bundle, settings, mode);
    const keysApplied = Object.keys(patch).length;
    if (keysApplied > 0) update(patch);

    setPhase({ kind: "done", addonsAdded, addonsFailed, keysApplied });
  };

  if (phase.kind === "done") {
    return (
      <SheetShell title="Import setup" onClose={onClose}>
        <div className="mt-10 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <Check size={28} strokeWidth={2.4} />
          </span>
          <h2 className="mt-4 text-[18px] font-semibold text-ink">
            Setup applied
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-muted">
            {phase.addonsAdded} {phase.addonsAdded === 1 ? "addon" : "addons"}{" "}
            added
            {phase.addonsFailed > 0
              ? `, ${phase.addonsFailed} failed`
              : ""} · {phase.keysApplied}{" "}
            {phase.keysApplied === 1 ? "key" : "keys"} written.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-7 w-full rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas"
          >
            Done
          </button>
        </div>
      </SheetShell>
    );
  }

  const applying = phase.kind === "applying";

  return (
    <SheetShell title="Import setup" onClose={onClose}>
      <div style={{ paddingBottom: keyboardInset }}>
        <p className="text-[13.5px] leading-snug text-ink-muted">
          Paste a setup code from another device. Nothing changes until you tap
          Apply.
        </p>

        {canScanQr() && (
          <button
            type="button"
            onClick={async () => {
              const scanned = await scanQr();
              if (scanned) setRaw(scanned);
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas"
          >
            <QrCode size={17} strokeWidth={2.4} />
            Scan QR code
          </button>
        )}

        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-3.5 py-2">
          <ClipboardPaste
            size={18}
            strokeWidth={2.2}
            className="shrink-0 text-ink-subtle"
          />
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste setup code"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[15px] text-ink placeholder:font-sans placeholder:text-ink-subtle focus:outline-none"
          />
          {raw && (
            <button
              type="button"
              onClick={() => setRaw("")}
              aria-label="Clear"
              className="shrink-0 text-ink-subtle transition-colors active:text-ink"
            >
              <X size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>

        {invalid && (
          <p className="mt-2 flex items-start gap-1.5 px-1 text-[13px] text-danger">
            <AlertCircle
              size={14}
              strokeWidth={2.2}
              className="mt-0.5 shrink-0"
            />
            That code isn't valid, or it's from a newer version of Harbor.
          </p>
        )}

        {bundle && summary && (
          <>
            <section className="mt-6 flex flex-col gap-2.5">
              <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                This code contains
              </h2>
              <div className="flex flex-col gap-2">
                <IncludedLine
                  icon={<Puzzle size={16} strokeWidth={2} />}
                  label={`${summary.addonCount} ${summary.addonCount === 1 ? "addon" : "addons"}`}
                />
                {summary.keyCategories.map((c) => (
                  <IncludedLine
                    key={c}
                    icon={
                      c === "subtitles" ? (
                        <Subtitles size={16} strokeWidth={2} />
                      ) : (
                        <KeyRound size={16} strokeWidth={2} />
                      )
                    }
                    label={CATEGORY_LABEL[c] ?? c}
                  />
                ))}
              </div>
              {summary.hasSensitive && (
                <p className="flex items-start gap-1.5 px-1 text-[12px] leading-snug text-accent">
                  <ShieldAlert
                    size={13}
                    strokeWidth={2.2}
                    className="mt-0.5 shrink-0"
                  />
                  Includes debrid / login keys.
                </p>
              )}
            </section>

            <section className="mt-6 flex flex-col gap-2.5">
              <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                How to apply
              </h2>
              <div className="grid grid-cols-2 gap-2.5">
                <ModeCard
                  active={mode === "merge"}
                  title="Merge"
                  note="Add addons, fill empty keys. Keeps what you have."
                  onClick={() => setMode("merge")}
                />
                <ModeCard
                  active={mode === "replace"}
                  title="Replace"
                  note="Overwrite keys and remove addons not in this code."
                  onClick={() => setMode("replace")}
                />
              </div>
            </section>

            <button
              type="button"
              onClick={apply}
              disabled={applying}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas disabled:opacity-50"
            >
              {applying && <Loader2 size={16} className="animate-spin" />}
              {applying ? "Applying…" : "Apply"}
            </button>
          </>
        )}

        {!bundle && !invalid && (
          <div className="mt-10 flex flex-col items-center text-center text-ink-subtle">
            <QrCode size={34} strokeWidth={1.6} />
            <p className="mt-3 max-w-[240px] text-[13px] leading-snug">
              Open Export on your other device to get a setup code.
            </p>
          </div>
        )}
      </div>
    </SheetShell>
  );
}
