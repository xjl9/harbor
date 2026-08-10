import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { useMobileRemote } from "./mobile-remote";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { RendererSheet } from "./renderer-sheet";

export function MobileDeviceSwitcher() {
  const { snapshot } = useMobileRemote();
  const [open, setOpen] = useState(false);
  useRegisterSheet(open);

  const label = snapshot.target.label || "This PC";
  const connected = !!snapshot.target.label && !snapshot.idle;

  // Standalone: the phone is the player, so casting to a host is a secondary action —
  // a quiet icon button, not a labelled "This PC · v0.9.x" chrome pill (dev tell). When
  // actually casting to a computer, expand to name the target so the state reads clearly.
  return (
    <>
      <button
        type="button"
        aria-label={connected ? `Playing on ${label}. Change device` : "Cast to another device"}
        onClick={() => setOpen(true)}
        className={`flex h-11 items-center rounded-full border border-white/10 bg-black/25 text-ink backdrop-blur-xl transition-transform duration-150 active:scale-[0.96] ${
          connected ? "max-w-full gap-2 pe-3.5 ps-2" : "w-11 justify-center"
        }`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted">
          <MonitorSmartphone size={17} strokeWidth={2} />
        </span>
        {connected && (
          <span className="min-w-0 truncate text-[13.5px] font-semibold">{label}</span>
        )}
      </button>
      <RendererSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
