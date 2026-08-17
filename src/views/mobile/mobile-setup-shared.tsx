import { Check, X } from "lucide-react";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { MOBILE_SAFE_X } from "./chrome-metrics";

// Human labels for the key categories a bundle can carry, shared by both sheets.
export const CATEGORY_LABEL: Record<string, string> = {
  metadata: "Metadata keys",
  subtitles: "Subtitle keys",
  debrid: "Debrid keys",
};

export function SheetShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useRegisterSheet(true);
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
        <h1 className="font-display text-[19px] font-medium text-ink">
          {title}
        </h1>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="no-press flex h-9 w-9 items-center justify-center rounded-full bg-elevated/60 text-ink-muted transition-transform active:scale-90"
        >
          <X size={19} strokeWidth={2.2} />
        </button>
      </header>
      {/* Both setup screens share this shell, so the tablet cap belongs here
          rather than in each of them. Export in particular had its debrid-keys
          switch a full screen away from the label it belongs to. */}
      <div
        className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto px-5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function IncludedLine({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-edge-soft/70 bg-elevated/40 px-3.5 py-2.5">
      <span className="text-ink-muted">{icon}</span>
      <span className="text-[14px] font-medium text-ink">{label}</span>
    </div>
  );
}

export function ModeCard({
  active,
  title,
  note,
  onClick,
}: {
  active: boolean;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col gap-1 rounded-2xl border p-3.5 text-start transition-colors ${
        active
          ? "border-accent bg-accent/[0.06] ring-1 ring-accent"
          : "border-edge-soft/70 bg-elevated/40"
      }`}
    >
      {active && (
        <span className="absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      <span
        className={`text-[14.5px] font-semibold ${active ? "text-ink" : "text-ink-muted"}`}
      >
        {title}
      </span>
      <span className="text-[11.5px] leading-snug text-ink-subtle">{note}</span>
    </button>
  );
}

export function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        on ? "bg-accent" : "bg-raised"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-ink shadow-sm transition-transform ${
          on ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </span>
  );
}
