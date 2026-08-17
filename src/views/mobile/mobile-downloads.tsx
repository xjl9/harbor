import { useMemo } from "react";
import { Download, X } from "lucide-react";
import {
  useDownloads,
  type DownloadItem,
} from "@/lib/download/downloads-store";
import { fmtBytes, fmtSpeed } from "@/views/downloads/downloads-format";
import { MobileDownloadRow } from "./mobile-download-row";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { MOBILE_SAFE_X } from "./chrome-metrics";

function isActive(d: DownloadItem): boolean {
  return d.status === "downloading" || d.status === "paused";
}
function isSaved(d: DownloadItem): boolean {
  return d.status === "done";
}
function isIssue(d: DownloadItem): boolean {
  return (
    d.status === "error" ||
    d.status === "interrupted" ||
    d.status === "canceled"
  );
}

export function MobileDownloads({ onClose }: { onClose: () => void }) {
  useRegisterSheet(true);
  const items = useDownloads();

  const { active, saved, issues } = useMemo(
    () => ({
      active: items.filter(isActive),
      saved: items.filter(isSaved),
      issues: items.filter(isIssue),
    }),
    [items],
  );

  const totalBps = items.reduce(
    (sum, d) => (d.status === "downloading" ? sum + d.bytesPerSec : sum),
    0,
  );
  const savedBytes = saved.reduce(
    (sum, d) => sum + (d.totalBytes ?? d.receivedBytes),
    0,
  );
  const summary =
    items.length === 0
      ? null
      : [
          active.length > 0 ? `${active.length} active` : null,
          totalBps > 0 ? fmtSpeed(totalBps) : null,
          saved.length > 0 ? `${saved.length} saved` : null,
          savedBytes > 0 ? fmtBytes(savedBytes) : null,
        ]
          .filter(Boolean)
          .join("  ·  ");

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-canvas"
      style={MOBILE_SAFE_X}
    >
      <header
        className="flex items-center justify-between px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <span className="w-9" />
        <div className="flex flex-col items-center">
          <h1 className="font-display text-[19px] font-medium text-ink">
            Downloads
          </h1>
          {summary && (
            <p className="text-[11.5px] tabular-nums text-ink-subtle">
              {summary}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="no-press flex h-9 w-9 items-center justify-center rounded-full bg-elevated/60 text-ink-muted transition-transform active:scale-90"
        >
          <X size={19} strokeWidth={2.2} />
        </button>
      </header>

      <div
        className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto overscroll-y-contain px-5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
        }}
      >
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-7 pt-1">
            <Section title="Downloading" items={active} />
            <Section title="Saved offline" items={saved} />
            <Section title="Needs attention" items={issues} />
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: DownloadItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((d) => (
          <MobileDownloadRow key={d.id} d={d} />
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-[20px] border border-dashed border-edge-soft/70 bg-elevated/25 px-8 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-elevated text-ink-subtle">
        <Download size={26} strokeWidth={1.8} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] font-semibold text-ink">No downloads yet</p>
        <p className="max-w-[300px] text-[13px] leading-relaxed text-ink-muted">
          Open a movie or episode, tap Download, and pick a source. It saves
          here for offline watching.
        </p>
      </div>
    </div>
  );
}
