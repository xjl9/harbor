import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import allDebridLogo from "@/assets/addon-logos/alldebrid.webp";
import debridLinkLogo from "@/assets/addon-logos/debridlink.png";
import premiumizeLogo from "@/assets/addon-logos/premiumize.png";
import realDebridLogo from "@/assets/addon-logos/realdebrid.png";
import torboxLogo from "@/assets/addon-logos/torbox.png";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { FOCUS, tapHaptic } from "./ob-shared";

type DebridKey = "rdKey" | "tbKey" | "adKey" | "pmKey" | "dlKey";

// Same settings keys the stream picker reads via useDebridClients(), matching the
// desktop "Debrid services" section. Every provider is plain key paste, so this
// writes the key straight through with no verify call, exactly like desktop.
const PROVIDERS: Array<{ key: DebridKey; label: string; logo: string; placeholder: string }> = [
  { key: "rdKey", label: "Real-Debrid", logo: realDebridLogo, placeholder: "API token" },
  { key: "tbKey", label: "TorBox", logo: torboxLogo, placeholder: "API key" },
  { key: "adKey", label: "AllDebrid", logo: allDebridLogo, placeholder: "API key" },
  { key: "pmKey", label: "Premiumize", logo: premiumizeLogo, placeholder: "API key" },
  { key: "dlKey", label: "Debrid-Link", logo: debridLinkLogo, placeholder: "API key" },
];

export function ObDebrid() {
  const { settings, update } = useSettings();
  const t = useT();
  const [open, setOpen] = useState<DebridKey | null>(null);
  // Draft the key locally and commit on blur/Enter so we do not rewrite global
  // settings (and re-run the app-wide debrid registry memo) on every keystroke.
  const [draft, setDraft] = useState("");

  // Explicit branches keep the write typed as Partial<Settings>; a computed key
  // would widen to a string index and fail the check.
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
          {t("Instant, cached streams")}
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {t(
            "Paste a debrid API key and Harbor plays cached torrents direct, no seeding or buffering. Connect any service you pay for. Your keys stay on this device.",
          )}
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-edge-soft bg-canvas/40">
        {PROVIDERS.map((p, i) => {
          const val = (settings[p.key] || "").trim();
          const isOpen = open === p.key;
          return (
            <div key={p.key}>
              {i > 0 && <span className="mx-4 block h-px bg-edge-soft/60" />}
              <button
                type="button"
                onClick={() => {
                  tapHaptic();
                  if (isOpen) {
                    if (draft.trim() !== val) setKey(p.key, draft);
                    setOpen(null);
                  } else {
                    setDraft(settings[p.key] || "");
                    setOpen(p.key);
                  }
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
                {val && (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-accent">
                    <Check size={14} strokeWidth={2.6} />
                    {t("Connected")}
                  </span>
                )}
                <ChevronDown
                  size={18}
                  strokeWidth={2.2}
                  className={`shrink-0 text-ink-subtle transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="px-4 pb-4">
                  <input
                    autoFocus
                    type="password"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => {
                      if (draft.trim() !== val) setKey(p.key, draft);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                    }}
                    placeholder={p.placeholder}
                    spellCheck={false}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    inputMode="text"
                    className="w-full rounded-xl border border-edge bg-canvas px-4 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-subtle/60 focus:border-ink-subtle"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[13px] text-ink-subtle">
        {t("No debrid? Skip this. Harbor still finds free public streams, they can just be slower.")}
      </p>
    </div>
  );
}
