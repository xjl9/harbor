import { useEffect } from "react";
import { Cast, Check, MonitorSmartphone, Wifi } from "lucide-react";
import { useMobileRemote } from "./mobile-remote";
import { SHEET_EXIT_CSS, useSheetPresence } from "./remote-extras";
import { APP_VERSION } from "@/lib/build-info";
import { isMobileNative } from "@/lib/platform";
import { useSettings } from "@/lib/settings";
import { useRemoteDiscovery } from "@/lib/remote/use-remote-discovery";

export function RendererSheet({ open, onClose, title = "Play on" }: { open: boolean; onClose: () => void; title?: string }) {
  const { snapshot, sendCommand, connected } = useMobileRemote();
  const { render, leaving } = useSheetPresence(open);
  const { settings, update } = useSettings();
  const { hosts } = useRemoteDiscovery(open);
  const native = isMobileNative();
  const hostVersion = snapshot.hostVersion ?? APP_VERSION;
  const configuredHost = (settings.remoteHostAddress ?? "").trim();

  useEffect(() => {
    if (open) sendCommand({ action: "castDiscover" });
  }, [open, sendCommand]);

  if (!render) return null;

  const target = snapshot.target;
  const localActive = target.kind === "local";

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col justify-end bg-black/60 backdrop-blur-sm ${leaving ? "harbor-sheet-scrim-out" : "animate-fade-in"}`}
      onClick={onClose}
    >
      <style>{SHEET_EXIT_CSS}</style>
      {/* A busy Wi-Fi can discover a dozen targets; bound the panel to the visible
          viewport and scroll the list so the handle and title never leave the screen. */}
      <div
        className={`flex min-h-0 flex-col rounded-t-[28px] border-t border-edge-soft/60 bg-elevated ${leaving ? "harbor-sheet-panel-out" : "animate-in slide-in-from-bottom-4 duration-300"}`}
        style={{
          maxHeight: "calc(100% - env(safe-area-inset-top, 0px) - 12px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-ink/20" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h3 className="min-w-0 flex-1 text-[16px] font-semibold text-ink">{title}</h3>
          {snapshot.castDiscovering && (
            <span className="shrink-0 text-[12px] text-ink-subtle">Scanning…</span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-2">
          {native &&
            hosts.map((h) => {
              const isHost = connected && configuredHost === h.host;
              const isConnecting = !connected && configuredHost === h.host;
              return (
                <DeviceRow
                  key={h.id}
                  name={h.name}
                  sub={h.host}
                  badge={h.version ? `Harbor ${h.version}` : undefined}
                  icon={<Wifi size={20} strokeWidth={2} />}
                  active={isHost}
                  connecting={isConnecting}
                  onSelect={() => {
                    update({ remoteHostAddress: h.host });
                    onClose();
                  }}
                />
              );
            })}
          <DeviceRow
            name="Your computer"
            badge={`Harbor ${hostVersion}`}
            icon={<MonitorSmartphone size={20} strokeWidth={2} />}
            active={localActive}
            onSelect={() => {
              sendCommand({ action: "setTarget", target: "local" });
              onClose();
            }}
          />
          {snapshot.castDevices.map((d) => (
            <DeviceRow
              key={d.id}
              name={d.name}
              sub={d.model ?? d.kind}
              icon={<Cast size={20} strokeWidth={2} />}
              active={target.kind === "cast" && target.deviceId === d.id}
              onSelect={() => {
                sendCommand({ action: "setTarget", target: { castDeviceId: d.id } });
                onClose();
              }}
            />
          ))}
          {snapshot.castDevices.length === 0 && !snapshot.castDiscovering && (
            <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
              No cast devices found on your network.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceRow({
  name,
  sub,
  badge,
  icon,
  active,
  connecting = false,
  onSelect,
}: {
  name: string;
  sub?: string;
  badge?: string;
  icon: React.ReactNode;
  active: boolean;
  connecting?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex min-h-[3.25rem] shrink-0 items-center gap-3.5 rounded-2xl px-4 py-3 text-start transition-colors active:bg-raised/60"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-accent-soft text-accent" : "bg-raised text-ink-muted"}`}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className={`truncate text-[15px] font-semibold ${active ? "text-accent" : "text-ink"}`}>{name}</span>
          {badge && (
            <span className="shrink-0 rounded-md bg-raised px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-subtle">
              {badge}
            </span>
          )}
        </span>
        {sub && <span className="truncate text-[12px] text-ink-subtle">{sub}</span>}
      </span>
      {active && <Check size={19} strokeWidth={2.6} className="shrink-0 text-accent" />}
      {connecting && (
        <span className="shrink-0 text-[11.5px] font-semibold text-ink-subtle">…</span>
      )}
    </button>
  );
}
