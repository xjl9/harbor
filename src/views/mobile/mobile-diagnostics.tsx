import { useState } from "react";
import { getRecentErrors } from "@/lib/bug-report";
import { SheetShell } from "./mobile-setup-shared";
import { scrubText } from "./report-redact";

// Reads the app's own error buffer on the device it happened on.
//
// The buffer and its redaction already existed for submitting a report; what was
// missing was any way to just LOOK at it. On a sideloaded build there is no
// inspector, so the only way to find out why something failed was to reproduce it
// on a simulator and read localStorage out of the app container - which is what
// made one addon bug take four build cycles.
//
// Everything is put through the same scrubText the submitted report uses, so URLs,
// tokens and key=value pairs are redacted before they are shown or copied. That
// matters here: addon transport URLs carry debrid keys, and this screen exists to
// be copied and sent to someone.

export function DiagnosticsSheet({ onClose }: { onClose: () => void }) {
  const [entries] = useState(() => getRecentErrors().slice().reverse());
  const [copied, setCopied] = useState(false);

  const report = [
    `Harbor diagnostics — ${new Date().toISOString()}`,
    `entries: ${entries.length}`,
    "",
    ...entries.map(
      (e) =>
        `${new Date(e.ts).toISOString().slice(11, 19)} ${e.src ?? "app"} — ${scrubText(e.msg)}`,
    ),
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused in a web view; the text is on screen and
      // selectable either way, so this stays a convenience.
    }
  };

  return (
    <SheetShell title="Diagnostics" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[13.5px] leading-relaxed text-ink-subtle">
          Recent warnings and errors from this app. Keys and links are already redacted, so this
          is safe to copy and send.
        </p>

        <button
          type="button"
          onClick={() => void copy()}
          disabled={entries.length === 0}
          className="h-11 rounded-full bg-ink px-4 text-[14px] font-semibold text-canvas transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy report"}
        </button>

        {entries.length === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-ink-subtle">
            Nothing logged yet. If something misbehaves, come back here and copy the report.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {entries.map((e, i) => (
              <div
                key={`${e.ts}-${i}`}
                className="rounded-lg border border-edge-soft/60 bg-canvas/40 px-3 py-2"
              >
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-subtle">
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent">
                    {e.src ?? "app"}
                  </span>
                </div>
                <p className="mt-1 break-words font-mono text-[12px] leading-snug text-ink-muted">
                  {scrubText(e.msg)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </SheetShell>
  );
}
