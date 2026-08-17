import {
  AlertCircle,
  Check,
  Copy,
  KeyRound,
  Puzzle,
  ShieldAlert,
  Subtitles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { loadInstalled } from "@/lib/addon-store";
import { useSettings } from "@/lib/settings";
import {
  buildSetupBundle,
  encodeBundle,
  summarizeBundle,
} from "@/lib/settings/setup-transfer";
import { qrToSvg } from "@/lib/qr/qr-encode";
import {
  CATEGORY_LABEL,
  IncludedLine,
  SheetShell,
  Switch,
} from "./mobile-setup-shared";

export function ExportSetupSheet({ onClose }: { onClose: () => void }) {
  const { settings } = useSettings();
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [copied, setCopied] = useState(false);

  const { code, svg, summary } = useMemo(() => {
    const bundle = buildSetupBundle(
      settings,
      loadInstalled().map((a) => a.transportUrl),
      { includeSensitive },
    );
    const c = encodeBundle(bundle);
    return {
      code: c,
      svg: qrToSvg(c, { ecc: "M", border: 2 }),
      summary: summarizeBundle(bundle),
    };
  }, [settings, includeSensitive]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <SheetShell title="Export setup" onClose={onClose}>
      <p className="text-[13.5px] leading-snug text-ink-muted">
        Move your addons and keys to another device. Scan the code there, or
        copy it and paste it into Import.
      </p>

      {svg ? (
        // QR must stay black-on-white for reliable scanning regardless of app theme.
        <div className="mt-5 flex justify-center">
          <div
            className="rounded-2xl bg-white p-4 text-black"
            dangerouslySetInnerHTML={{ __html: svg }}
            style={{ width: 232, height: 232 }}
          />
        </div>
      ) : (
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.05] px-3.5 py-3 text-[12.5px] text-ink-muted">
          <AlertCircle size={15} className="shrink-0" />
          Too much to fit in a QR. Use the copyable code below.
        </div>
      )}

      <button
        type="button"
        onClick={copy}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas"
      >
        {copied ? (
          <Check size={16} strokeWidth={2.6} />
        ) : (
          <Copy size={16} strokeWidth={2.2} />
        )}
        {copied ? "Copied" : "Copy setup code"}
      </button>

      <p className="mt-2.5 break-all rounded-xl border border-edge-soft/70 bg-elevated/40 px-3.5 py-3 font-mono text-[11px] leading-relaxed text-ink-subtle">
        {code}
      </p>

      <section className="mt-6 flex flex-col gap-2.5">
        <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
          Included
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
      </section>

      <button
        type="button"
        onClick={() => setIncludeSensitive((v) => !v)}
        className="mt-5 flex w-full items-start gap-3 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-4 py-3.5 text-start transition-colors active:bg-raised/60"
      >
        <span
          className={`mt-0.5 ${includeSensitive ? "text-accent" : "text-ink-subtle"}`}
        >
          <ShieldAlert size={20} strokeWidth={2} />
        </span>
        <span className="flex-1">
          <span className="block text-[14.5px] font-medium text-ink">
            Include debrid / login keys
          </span>
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-subtle">
            Off by default. These unlock your paid accounts, so only share the
            code privately.
          </span>
        </span>
        <Switch on={includeSensitive} />
      </button>
    </SheetShell>
  );
}
