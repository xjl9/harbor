import { AlertCircle, Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { loadInstalled } from "@/lib/addon-store";
import { useSettings } from "@/lib/settings";
import {
  collectDiagnostics,
  installBugReportErrorCapture,
  submitBugReport,
  type Diagnostics,
  type Severity,
} from "@/lib/bug-report";
import { SheetShell } from "./mobile-setup-shared";
import { WhatGetsSent } from "./mobile-report-diagnostics";
import { useKeyboardInset } from "./use-keyboard-inset";
import { sanitizeDiagnostics, scrubText } from "./report-redact";

type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; id: string }
  | { kind: "failed"; message: string };

const SEVERITIES: Array<{ id: Severity; label: string; note: string }> = [
  { id: "low", label: "Low", note: "cosmetic, minor" },
  { id: "normal", label: "Normal", note: "annoying" },
  { id: "high", label: "High", note: "feature broken" },
  { id: "critical", label: "Critical", note: "app unusable" },
];

// Selection always reads as the accent ring the other mobile sheets use; the
// top two tiers additionally take their own color so urgency is visible.
const SEVERITY_TONE: Record<Severity, string> = {
  low: "border-accent bg-accent/[0.06] text-ink ring-1 ring-accent",
  normal: "border-accent bg-accent/[0.06] text-ink ring-1 ring-accent",
  high: "border-accent bg-accent/[0.10] text-accent ring-1 ring-accent",
  critical: "border-danger bg-danger/[0.10] text-danger ring-1 ring-danger",
};

const MIN_STEPS = 12;
const MIN_DETAIL = 8;
const MAX_FIELD = 2000;

export function MobileReportSheet({ onClose }: { onClose: () => void }) {
  const { settings } = useSettings();
  const auth = useAuth();
  const keyboardInset = useKeyboardInset();
  const [steps, setSteps] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [reporterName, setReporterName] = useState("");
  const [reporterContact, setReporterContact] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  useEffect(() => installBugReportErrorCapture(), []);

  const hasTmdb = !!settings.tmdbKey;
  const hasRpdb = !!settings.rpdbKey;
  const hasTrakt = !!settings.traktAccessToken;
  const hasStremio = !!auth.authKey;
  const debridCount = [
    settings.rdKey,
    settings.tbKey,
    settings.adKey,
    settings.pmKey,
    settings.dlKey,
  ].filter(Boolean).length;

  useEffect(() => {
    let cancelled = false;
    void collectDiagnostics({
      playerEngine: settings.playerEngine,
      region: settings.region,
      hasTmdb,
      hasRpdb,
      hasTrakt,
      hasStremio,
      debridCount,
      addonCount: loadInstalled().length,
      iptvCount: settings.iptvPlaylists.length,
    }).then((d) => {
      if (!cancelled) setDiag(sanitizeDiagnostics(d));
    });
    return () => {
      cancelled = true;
    };
  }, [
    settings.playerEngine,
    settings.region,
    settings.iptvPlaylists.length,
    hasTmdb,
    hasRpdb,
    hasTrakt,
    hasStremio,
    debridCount,
  ]);

  const missing =
    steps.trim().length < MIN_STEPS
      ? "Describe what you did in a bit more detail."
      : expected.trim().length < MIN_DETAIL
        ? "Add what you expected to happen."
        : actual.trim().length < MIN_DETAIL
          ? "Add what happened instead."
          : !diag
            ? "Reading device details."
            : null;

  const sending = phase.kind === "sending";
  const canSend = !missing && !!diag && !sending;

  const send = async () => {
    if (!canSend || !diag) return;
    setPhase({ kind: "sending" });
    // The textareas accept up to MAX_FIELD, so scrub at that limit: the short
    // default is for captured error lines, not for what the reporter wrote.
    const cleanActual = scrubText(actual.trim(), MAX_FIELD);
    try {
      const { id } = await submitBugReport(
        {
          // The backend keys reports off a short summary; the first line of
          // what went wrong is the closest thing this form has to one.
          summary: cleanActual.split("\n")[0].slice(0, 240),
          severity,
          steps: scrubText(steps.trim(), MAX_FIELD),
          expected: scrubText(expected.trim(), MAX_FIELD),
          actual: cleanActual,
          reporterName: reporterName.trim(),
          reporterGithub: "",
          reporterContact: reporterContact.trim(),
          consentCredit: !!(reporterName.trim() || reporterContact.trim()),
          files: [],
        },
        diag,
      );
      setPhase({ kind: "sent", id });
    } catch (e) {
      setPhase({
        kind: "failed",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  if (phase.kind === "sent") {
    return (
      <SheetShell title="Report a problem" onClose={onClose}>
        <div className="mt-10 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <Check size={28} strokeWidth={2.4} />
          </span>
          <h2 className="mt-4 text-[18px] font-semibold text-ink">Report sent</h2>
          <p className="mt-1.5 text-[13.5px] leading-snug text-ink-muted">
            Thanks. Keep this reference in case we follow up.
          </p>
          <span className="mt-4 rounded-full border border-edge-soft/70 bg-elevated/40 px-4 py-2 font-mono text-[13px] text-ink">
            {phase.id}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="mt-7 w-full rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas transition-transform active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell title="Report a problem" onClose={onClose}>
      <div style={{ paddingBottom: keyboardInset }}>
        <p className="text-[13.5px] leading-snug text-ink-muted">
          Three short answers turn a report into a fix. Be as specific as you
          can about what you tapped.
        </p>

        <Field label="What did you do">
          <TextArea
            value={steps}
            onChange={setSteps}
            rows={5}
            placeholder={"1. Opened Movies\n2. Tapped The Substance\n3. Tapped Play"}
          />
        </Field>

        <Field label="What did you expect">
          <TextArea
            value={expected}
            onChange={setExpected}
            rows={3}
            placeholder="The stream starts within a few seconds."
          />
        </Field>

        <Field label="What happened instead">
          <TextArea
            value={actual}
            onChange={setActual}
            rows={3}
            placeholder="The spinner stayed forever and nothing played."
          />
        </Field>

        <Field label="How bad is it">
          <div className="grid grid-cols-2 gap-2.5">
            {SEVERITIES.map((s) => {
              const on = severity === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSeverity(s.id)}
                  className={`flex flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-3 text-start transition-colors ${
                    on
                      ? SEVERITY_TONE[s.id]
                      : "border-edge-soft/70 bg-elevated/40 text-ink-muted"
                  }`}
                >
                  <span className="text-[14.5px] font-semibold">{s.label}</span>
                  <span className="text-[11.5px] text-ink-subtle">{s.note}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Credit (optional)">
          <div className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/40">
            <CreditInput
              value={reporterName}
              onChange={setReporterName}
              placeholder="Display name"
              maxLength={120}
            />
            <span className="mx-4 block h-px bg-edge-soft/60" />
            <CreditInput
              value={reporterContact}
              onChange={setReporterContact}
              placeholder="Email or Discord"
              maxLength={200}
            />
          </div>
          <p className="mt-2 px-1 text-[12px] leading-snug text-ink-subtle">
            Leave blank to stay anonymous. Filled in, you get credited in the
            release notes if this leads to a fix.
          </p>
        </Field>

        <div className="mt-6">
          <WhatGetsSent diag={diag} />
        </div>

        {phase.kind === "failed" && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-danger/40 bg-danger/[0.08] px-3.5 py-3">
            <AlertCircle
              size={16}
              strokeWidth={2.2}
              className="mt-0.5 shrink-0 text-danger"
            />
            <span className="text-[13px] leading-snug text-danger">
              Could not send the report. Check your connection. Your answers are
              still here, so you can try again.
            </span>
          </div>
        )}

        <button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {sending && <Loader2 size={16} className="animate-spin" />}
          {sending
            ? "Sending"
            : phase.kind === "failed"
              ? "Try again"
              : "Send report"}
        </button>
        <p className="mt-2.5 min-h-4 px-1 text-center text-[12px] text-ink-subtle">
          {missing ?? "Ready to send"}
        </p>
      </div>
    </SheetShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 flex flex-col gap-2.5">
      <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
        {label}
      </h2>
      {children}
    </section>
  );
}

function TextArea({
  value,
  onChange,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  placeholder: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      maxLength={MAX_FIELD}
      placeholder={placeholder}
      autoCapitalize="sentences"
      autoCorrect="on"
      className="w-full resize-none rounded-2xl border border-edge-soft/70 bg-canvas/70 px-4 py-3 text-[16px] leading-relaxed text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none"
    />
  );
}

function CreditInput({
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  maxLength: number;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      autoCapitalize="none"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      className="w-full bg-transparent px-4 py-3 text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none"
    />
  );
}
