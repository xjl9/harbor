import { AlertCircle, Check, Eye, EyeOff, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buildDebridClients, type DebridKeys } from "@/lib/debrid/registry";
import type { Account } from "@/lib/debrid/types";
import { openUrl } from "@/lib/window";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { useKeyboardInset } from "./use-keyboard-inset";

// Settings field names are exactly the keys of DebridKeys, so a provider key can
// index straight into a DebridKeys object for the single-provider validation build.
export type DebridKey = keyof DebridKeys;

export type DebridProvider = {
  key: DebridKey;
  label: string;
  logo: string;
  placeholder: string;
  hint: string;
  // Provider's official API-key page, opened in the system browser from the sheet.
  apiKeyUrl: string;
};

// idle before a check; checking while account() is in flight; valid/warn/invalid
// after. warn = key accepted but the account is not premium (cached streams will
// not resolve), which the debrid lib surfaces distinctly from a rejected key.
type Verdict = "idle" | "checking" | "valid" | "warn" | "invalid";

// Build a one-provider client through the same registry factory the stream
// picker uses, so validation exercises the real code path with no new HTTP.
function clientForKey(providerKey: DebridKey, key: string) {
  const keys: DebridKeys = { rdKey: "", tbKey: "", adKey: "", pmKey: "", dlKey: "" };
  keys[providerKey] = key;
  return buildDebridClients(keys)[0];
}

function accountLine(a: Account): string {
  const who = a.username || a.email || "";
  if (a.premiumUntil) {
    const until = new Date(a.premiumUntil * 1000).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return who ? `${who} · premium until ${until}` : `Premium until ${until}`;
  }
  return who || "Account verified";
}

function errorLine(code: string): string {
  switch (code) {
    case "unauthorized":
      return "Key rejected. Double-check you pasted the full token.";
    case "rate-limited":
      return "Rate limited by the provider. Try again in a moment.";
    case "network-error":
    case "timeout":
      return "Couldn't reach the provider. Check your connection.";
    default:
      return `Couldn't verify this key (${code}).`;
  }
}

export function DebridSheet({
  provider,
  initial,
  onSave,
  onClose,
}: {
  provider: DebridProvider;
  initial: string;
  onSave: (next: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [reveal, setReveal] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>("idle");
  const [detail, setDetail] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const keyboardInset = useKeyboardInset();
  useRegisterSheet(true);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Never leave a revealed key on screen: re-mask when the app backgrounds
  // (app switcher, lock) and on unmount, so the secret is hidden by default.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") setReveal(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      setReveal(false);
    };
  }, []);

  const trimmed = value.trim();
  const checking = verdict === "checking";

  function reset(next: string) {
    setValue(next);
    // Any edit invalidates a prior verdict so the strip never lies about the key.
    if (verdict !== "idle") setVerdict("idle");
    abortRef.current?.abort();
  }

  async function validate() {
    const key = value.trim();
    if (!key || checking) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setVerdict("checking");
    setDetail("");
    const client = clientForKey(provider.key, key);
    if (!client) {
      setVerdict("idle");
      return;
    }
    const result = await client.account(controller.signal);
    if (controller.signal.aborted) return;
    if (result.ok) {
      if (result.data.premium) {
        setVerdict("valid");
      } else {
        setVerdict("warn");
      }
      setDetail(accountLine(result.data));
    } else {
      // A cancelled check reports "aborted". If our own signal fired it we already
      // returned above; reaching here means the strip would otherwise hang on
      // "checking", so clear it to idle.
      if (result.code === "aborted") {
        setVerdict("idle");
        return;
      }
      if (result.code === "not-premium") {
        setVerdict("warn");
        setDetail("Key works, but this account isn't premium. Cached streams won't resolve.");
      } else {
        setVerdict("invalid");
        setDetail(errorLine(result.code));
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center transition-[padding] duration-150"
      style={{ paddingBottom: keyboardInset }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        className="relative z-10 w-full max-w-md rounded-t-3xl border border-edge-soft/70 bg-elevated p-5 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-canvas/60">
            <img src={provider.logo} alt="" draggable={false} className="h-5 w-5 object-contain" />
          </span>
          <h3 className="text-[16px] font-semibold text-ink">{provider.label}</h3>
        </div>
        <p className="mt-2 text-[13px] leading-snug text-ink-muted">{provider.hint}</p>

        <div className="relative mt-4">
          <input
            autoFocus
            type={reveal ? "text" : "password"}
            value={value}
            onChange={(e) => reset(e.target.value)}
            onPaste={(e) => {
              // Trim a pasted token immediately so a stray leading/trailing space
              // never lingers in the field (validate/save trim too, as a backstop).
              const pasted = e.clipboardData.getData("text");
              if (pasted !== pasted.trim()) {
                e.preventDefault();
                const el = e.currentTarget;
                const start = el.selectionStart ?? value.length;
                const end = el.selectionEnd ?? value.length;
                reset((value.slice(0, start) + pasted.trim() + value.slice(end)).trim());
              }
            }}
            placeholder={provider.placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-xl border border-edge-soft/70 bg-canvas/70 py-3 pe-12 ps-4 text-[16px] text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(value);
            }}
          />
          <button
            type="button"
            aria-label={reveal ? "Hide" : "Reveal"}
            onClick={() => setReveal((r) => !r)}
            className="absolute end-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle transition-colors active:text-ink"
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <button
          type="button"
          onClick={() => openUrl(provider.apiKeyUrl)}
          className="-my-1 mt-1.5 flex items-center gap-1.5 py-2 ps-1 text-[12.5px] font-medium text-ink-subtle transition-colors active:text-ink"
        >
          Where do I find this?
          <ExternalLink size={13} strokeWidth={2.2} />
        </button>

        {verdict !== "idle" && (
          <div
            className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12.5px] leading-snug ${
              verdict === "valid"
                ? "bg-success/10 text-success"
                : verdict === "warn"
                  ? "bg-accent/10 text-accent"
                  : verdict === "invalid"
                    ? "bg-danger/10 text-danger"
                    : "bg-white/[0.05] text-ink-muted"
            }`}
          >
            <span className="mt-px shrink-0">
              {verdict === "checking" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : verdict === "valid" ? (
                <Check size={15} strokeWidth={2.6} />
              ) : (
                <AlertCircle size={15} />
              )}
            </span>
            <span className="flex-1">
              {verdict === "checking" ? "Checking key with the provider…" : detail}
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={validate}
          disabled={!trimmed || checking}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-edge-soft/70 py-3 text-[14.5px] font-semibold text-ink-muted transition-colors active:bg-raised/60 disabled:opacity-40"
        >
          {checking && <Loader2 size={16} className="animate-spin" />}
          {verdict === "valid" || verdict === "warn" || verdict === "invalid" ? "Validate again" : "Validate"}
        </button>

        <div className="mt-3 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-edge-soft/70 py-3 text-[14.5px] font-semibold text-ink-muted transition-colors active:bg-raised/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(value)}
            className="flex-1 rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas transition-transform active:scale-[0.98]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
