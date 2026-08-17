import { Check, ExternalLink, Key, Loader2, X } from "lucide-react";
import { useState } from "react";
import tmdbLogo from "@/assets/addon-logos/tmdb.png";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { openUrl } from "@/lib/window";

// Logic mirrors src/components/onboarding/tmdb-step.tsx (live verify against
// api.themoviedb.org, 460ms saved beat, live tmdbKey write on change). Mobile
// layout: the Verify button drops below the input as its own full-width row.
export function ObTmdb() {
  const { settings, update } = useSettings();
  const t = useT();
  const [draft, setDraft] = useState(settings.tmdbKey);
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "bad">(
    settings.tmdbKey ? "ok" : "idle",
  );
  const [pulseKey, setPulseKey] = useState(0);

  const validate = async () => {
    if (!draft.trim()) return;
    setStatus("checking");
    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(draft.trim())}`,
      );
      if (res.ok) {
        await new Promise((r) => setTimeout(r, 460));
        update({ tmdbKey: draft.trim() });
        setStatus("ok");
        setPulseKey((k) => k + 1);
        // Drop the keyboard so the onboarding footer returns.
        (document.activeElement as HTMLElement | null)?.blur();
      } else {
        setStatus("bad");
      }
    } catch {
      setStatus("bad");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <span className="text-[12.5px] font-medium uppercase tracking-[0.16em] text-ink-subtle">
        {t("Step 1 · Metadata")}
      </span>
      <div className="flex flex-col gap-3">
        <h1 className="flex flex-wrap items-center font-display text-[30px] font-medium leading-[1.08] tracking-tight text-ink">
          {t("Connect")}
          <img src={tmdbLogo} alt="" className="ms-3 me-1.5 h-7 w-7 rounded-md" />
          TMDB
        </h1>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {t(
            "Free, two-minute signup. Unlocks Trending, In Theaters Now, Top Rated, and per-streaming catalogs (Netflix, Disney+, Hulu, …). Your key stays on this machine.",
          )}
        </p>
      </div>
      <button
        onClick={() => openUrl("https://www.themoviedb.org/settings/api")}
        className="inline-flex w-fit items-center gap-1.5 text-[14px] text-ink underline-offset-4 active:underline"
      >
        {t("Get a free key at themoviedb.org")} <ExternalLink size={13} />
      </button>
      <div className="flex flex-col gap-2.5">
        <div
          key={`pulse-${pulseKey}`}
          className={`flex w-full items-center gap-2.5 rounded-xl border border-edge bg-canvas px-4 transition-colors focus-within:border-ink-subtle ${
            status === "ok" ? "animate-verified-pulse" : ""
          }`}
        >
          <Key size={15} className="text-ink-subtle" />
          <input
            type="password"
            value={draft}
            onChange={(e) => {
              const next = e.target.value.trim();
              setDraft(e.target.value);
              setStatus("idle");
              // Committing every keystroke meant typing three characters and then
              // skipping left that fragment as the live key, and a broken key
              // degrades metadata quietly. Only commit a cleared field or a
              // full-length v3 key, so a valid key still persists for someone who
              // never taps Verify (validate() commits the checked one either way).
              if (next.length === 0 || next.length === 32) update({ tmdbKey: next });
            }}
            onKeyDown={(e) => e.key === "Enter" && validate()}
            placeholder={t("v3 API key")}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            inputMode="text"
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-subtle/60"
          />
          {status === "ok" && (
            <Check
              key={`check-${pulseKey}`}
              size={16}
              strokeWidth={2.5}
              className="animate-done-pop text-accent"
            />
          )}
          {status === "bad" && (
            <X size={16} strokeWidth={2.5} className="animate-done-pop text-danger" />
          )}
        </div>
        <button
          onClick={validate}
          disabled={!draft.trim() || status === "checking" || status === "ok"}
          className={`flex h-12 w-full items-center justify-center gap-1.5 rounded-xl px-5 text-[14px] font-semibold transition-all duration-300 ${
            status === "ok"
              ? "bg-accent-soft text-accent"
              : "bg-ink text-canvas disabled:scale-100 disabled:opacity-50"
          } ${status === "ok" ? "animate-verified-button-pulse" : ""}`}
        >
          {status === "checking" ? (
            <span className="flex items-center gap-2 animate-copy-swap">
              <Loader2 size={14} className="animate-spin" />
              {t("Checking")}
            </span>
          ) : status === "ok" ? (
            <span key={`saved-${pulseKey}`} className="flex items-center gap-1.5 animate-copy-swap">
              <Check size={14} strokeWidth={2.8} />
              {t("Saved")}
            </span>
          ) : (
            t("Verify")
          )}
        </button>
      </div>
      <p className="text-[13px] text-ink-subtle">
        {t("Skip if you'd rather just use Cinemeta. Harbor still works, you'll just see fewer rails.")}
      </p>
    </div>
  );
}
