import {
  Check,
  ChevronRight,
  ClipboardPaste,
  Download,
  Eye,
  EyeOff,
  FileText,
  HelpCircle,
  Link2,
  LogOut,
  MonitorSmartphone,
  Puzzle,
  QrCode,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import rpdbLogo from "@/assets/addon-logos/rpdb.png";
import tmdbLogo from "@/assets/addon-logos/tmdb.png";
import tvdbLogo from "@/assets/addon-logos/tvdb.svg";
import { useAuth } from "@/lib/auth";
import { isMobileNative } from "@/lib/platform";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { loadInstalled } from "@/lib/addon-store";
import { useActiveDownloadCount } from "@/lib/download/downloads-store";
import { MobileAddons } from "./mobile-addons";
import { MobileDownloads } from "./mobile-downloads";
import { MobileSettings } from "./mobile-settings";
import { MobileWhosWatching } from "./mobile-whos-watching";
import { ExportSetupSheet } from "./mobile-setup-export";
import { ImportSetupSheet } from "./mobile-setup-import";
import { DebridSheet, type DebridKey, type DebridProvider } from "./mobile-debrid-sheet";
import { DEBRID_PROVIDERS } from "./debrid-providers";
import { useMobileRemote } from "./mobile-remote";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { useKeyboardInset } from "./use-keyboard-inset";
import { setMobileRemoteStyle, useMobileRemoteStyle, type MobileRemoteStyle } from "./remote-style";
import { HARBOR_BUGS_BASE } from "@/lib/config/endpoints";

type EditField = {
  key: "remoteHostAddress" | "tmdbKey" | "tvdbKey" | "rpdbKey";
  label: string;
  placeholder: string;
  hint?: string;
};

export function MobileProfile({ onOpenRemote }: { onOpenRemote: () => void }) {
  const { user, signOut } = useAuth();
  const { activeProfile } = useProfiles();
  const { snapshot, connected } = useMobileRemote();
  const { settings, update } = useSettings();
  const remote = snapshot.profile;
  const name = remote?.name || activeProfile?.name || user?.email?.split("@")[0] || "Guest";
  const avatar = remote?.avatar ?? activeProfile?.avatar ?? null;
  const color = remote?.color ?? activeProfile?.color ?? "oklch(0.78 0.13 60)";
  const [switching, setSwitching] = useState(false);
  const [editing, setEditing] = useState<EditField | null>(null);
  const [debridEditing, setDebridEditing] = useState<DebridProvider | null>(null);
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [downloadsOpen, setDownloadsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const native = isMobileNative();
  const activeDownloads = useActiveDownloadCount();
  const installedAddonCount = loadInstalled().length;

  const keySet = (v: string | undefined) => !!(v && v.trim());

  // Connected providers (a key is saved) float to the top so the user's active
  // services lead; the original DEBRID_PROVIDERS order holds within each group.
  const debridProviders = [
    ...DEBRID_PROVIDERS.filter((p) => keySet(settings[p.key])),
    ...DEBRID_PROVIDERS.filter((p) => !keySet(settings[p.key])),
  ];

  return (
    <div
      className="relative flex min-h-full flex-col gap-7 px-5 pb-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
    >
      {/* Ambient identity wash: the profile's own color bleeds from the top, same cinematic depth as the home hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72"
        style={{
          background: `radial-gradient(125% 72% at 50% -12%, color-mix(in oklab, ${color} 30%, transparent), transparent 72%)`,
        }}
      />

      <header className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => setSwitching(true)}
          className="flex flex-col items-center gap-3.5 transition-transform active:scale-[0.98]"
        >
          <span
            className="flex h-[92px] w-[92px] items-center justify-center overflow-hidden rounded-full text-[32px] font-semibold text-white ring-1 ring-white/15"
            style={{
              background: avatar ? undefined : color,
              boxShadow: `0 18px 48px -14px color-mix(in oklab, ${color} 62%, transparent)`,
            }}
          >
            {avatar ? (
              <img src={avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              name.slice(0, 1).toUpperCase()
            )}
          </span>
          <h1 className="font-display text-[27px] font-medium leading-none tracking-[-0.01em] text-ink">
            {name}
          </h1>
        </button>
        <button
          type="button"
          onClick={() => setSwitching(true)}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-muted backdrop-blur-sm transition-colors active:bg-white/[0.1]"
        >
          <Users size={13} strokeWidth={2.4} />
          Switch profile
        </button>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
          Remote style
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StylePreview kind="dpad" label="D-pad" />
          <StylePreview kind="minimal" label="Touchpad" />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            Streaming setup
          </h2>
          <p className="px-1 text-[12.5px] leading-snug text-ink-subtle">
            A TMDB key unlocks the full catalog. RPDB bakes ratings into every poster.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-elevated/40">
          {native && (
            <>
              <Row
                icon={<Link2 size={20} strokeWidth={2} />}
                label="Desktop connection"
                value={connected ? settings.remoteHostAddress : settings.remoteHostAddress || undefined}
                pending={!connected && !settings.remoteHostAddress}
                pendingLabel="Connect"
                dot={connected ? "ok" : null}
                onClick={() =>
                  setEditing({
                    key: "remoteHostAddress",
                    label: "Desktop connection",
                    placeholder: "192.168.1.20",
                    hint: "IP address of the computer running Harbor, shown in its Remote settings.",
                  })
                }
              />
              <Divider />
            </>
          )}
          <Row
            icon={<LogoBadge src={tmdbLogo} />}
            label="TMDB API key"
            value={keySet(settings.tmdbKey) ? "••••" : undefined}
            pending={!keySet(settings.tmdbKey)}
            dot={keySet(settings.tmdbKey) ? "ok" : null}
            onClick={() =>
              setEditing({
                key: "tmdbKey",
                label: "TMDB API key",
                placeholder: "Paste key",
                hint: "Free at themoviedb.org. Powers rich detail pages and episode grids.",
              })
            }
          />
          <Divider />
          <Row
            icon={<LogoBadge src={tvdbLogo} />}
            label="TVDB API key"
            value={keySet(settings.tvdbKey) ? "••••" : undefined}
            pending={!keySet(settings.tvdbKey)}
            dot={keySet(settings.tvdbKey) ? "ok" : null}
            onClick={() =>
              setEditing({
                key: "tvdbKey",
                label: "TVDB API key",
                placeholder: "Paste key",
                hint: "Optional. Episode orders work without one via Harbor's proxy.",
              })
            }
          />
          <Divider />
          <Row
            icon={<LogoBadge src={rpdbLogo} />}
            label="RPDB API key"
            value={keySet(settings.rpdbKey) ? "••••" : undefined}
            pending={!keySet(settings.rpdbKey)}
            dot={keySet(settings.rpdbKey) ? "ok" : null}
            onClick={() =>
              setEditing({
                key: "rpdbKey",
                label: "RPDB API key",
                placeholder: "Paste key",
                hint: "Rated posters on every rail. Paid plan at ratingposterdb.com.",
              })
            }
          />
          <Divider />
          <Row
            icon={<Puzzle size={20} strokeWidth={2} />}
            label="Addons"
            value={installedAddonCount ? `${installedAddonCount}` : undefined}
            pending={!installedAddonCount}
            pendingLabel="Add"
            onClick={() => setAddonsOpen(true)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
            Debrid
          </h2>
          <p className="px-1 text-[12.5px] leading-snug text-ink-subtle">
            Connect a debrid service and cached streams play direct. Keys stay on this device.
          </p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-elevated/40">
          {debridProviders.map((p, i) => (
            <div key={p.key}>
              {i > 0 && <Divider />}
              <Row
                icon={<LogoBadge src={p.logo} />}
                label={p.label}
                value={keySet(settings[p.key]) ? "••••" : undefined}
                pending={!keySet(settings[p.key])}
                pendingLabel="Connect"
                dot={keySet(settings[p.key]) ? "ok" : null}
                onClick={() => setDebridEditing(p)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-elevated/40">
        {native && (
          <>
            <Row
              icon={<Download size={20} strokeWidth={2} />}
              label="Downloads"
              badge={activeDownloads > 0 ? String(activeDownloads) : undefined}
              onClick={() => setDownloadsOpen(true)}
            />
            <Divider />
          </>
        )}
        <Row
          icon={<SlidersHorizontal size={20} strokeWidth={2} />}
          label="Settings"
          onClick={() => setSettingsOpen(true)}
        />
        <Divider />
        <Row
          icon={<MonitorSmartphone size={20} strokeWidth={2} />}
          label="Remote"
          onClick={onOpenRemote}
        />
        <Divider />
        <Row
          icon={<QrCode size={20} strokeWidth={2} />}
          label="Export setup"
          onClick={() => setExportOpen(true)}
        />
        <Divider />
        <Row
          icon={<ClipboardPaste size={20} strokeWidth={2} />}
          label="Import setup"
          onClick={() => setImportOpen(true)}
        />
        <Divider />
        <Row
          icon={<HelpCircle size={20} strokeWidth={2} />}
          label="Help & feedback"
          onClick={() => window.open(HARBOR_BUGS_BASE, "_blank")}
        />
        <Divider />
        <Row icon={<FileText size={20} strokeWidth={2} />} label="Legal" onClick={() => {}} />
        {user && (
          <>
            <Divider />
            <Row
              icon={<LogOut size={20} strokeWidth={2} />}
              label="Sign out"
              danger
              onClick={signOut}
            />
          </>
        )}
      </section>

      {switching && <MobileWhosWatching onClose={() => setSwitching(false)} />}
      {addonsOpen && <MobileAddons onClose={() => setAddonsOpen(false)} />}
      {settingsOpen && <MobileSettings onClose={() => setSettingsOpen(false)} />}
      {downloadsOpen && <MobileDownloads onClose={() => setDownloadsOpen(false)} />}
      {exportOpen && <ExportSetupSheet onClose={() => setExportOpen(false)} />}
      {importOpen && <ImportSetupSheet onClose={() => setImportOpen(false)} />}
      {editing && (
        <EditSheet
          field={editing}
          initial={String(settings[editing.key] ?? "")}
          onSave={(next) => {
            const v = next.trim();
            if (editing.key === "remoteHostAddress") update({ remoteHostAddress: v });
            else if (editing.key === "tmdbKey") update({ tmdbKey: v });
            else if (editing.key === "tvdbKey") update({ tvdbKey: v });
            else update({ rpdbKey: v });
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {debridEditing && (
        <DebridSheet
          provider={debridEditing}
          initial={String(settings[debridEditing.key] ?? "")}
          onSave={(next) => {
            const v = next.trim();
            // Explicit per-key branches: a computed update({ [k]: v }) widens to a
            // string index and fails tsc (same rule as onboarding ob-debrid).
            const k: DebridKey = debridEditing.key;
            if (k === "rdKey") update({ rdKey: v });
            else if (k === "tbKey") update({ tbKey: v });
            else if (k === "adKey") update({ adKey: v });
            else if (k === "pmKey") update({ pmKey: v });
            else update({ dlKey: v });
            setDebridEditing(null);
          }}
          onClose={() => setDebridEditing(null)}
        />
      )}
    </div>
  );
}

function EditSheet({
  field,
  initial,
  onSave,
  onClose,
}: {
  field: EditField;
  initial: string;
  onSave: (next: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [reveal, setReveal] = useState(false);
  const keyboardInset = useKeyboardInset();
  useRegisterSheet(true);
  // Every field here except the remote host holds a secret (API tokens); mask by
  // default with a reveal toggle, matching desktop's KeyField.
  const secret = field.key !== "remoteHostAddress";
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
        className="relative z-10 w-full max-w-md rounded-t-3xl border border-edge-soft/70 bg-elevated p-5 pb-8 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
      >
        <h3 className="text-[16px] font-semibold text-ink">{field.label}</h3>
        {field.hint && <p className="mt-1 text-[13px] leading-snug text-ink-muted">{field.hint}</p>}
        <div className="relative mt-4">
          <input
            autoFocus
            type={secret && !reveal ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={field.placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode={field.key === "remoteHostAddress" ? "decimal" : "text"}
            className={`w-full rounded-xl border border-edge-soft/70 bg-canvas/70 py-3 ps-4 text-[16px] text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none ${secret ? "pe-12" : "pe-4"}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(value);
            }}
          />
          {secret && (
            <button
              type="button"
              aria-label={reveal ? "Hide" : "Reveal"}
              onClick={() => setReveal((r) => !r)}
              className="absolute end-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-subtle transition-colors active:text-ink"
            >
              {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
        <div className="mt-4 flex gap-3">
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

function StylePreview({ kind, label }: { kind: MobileRemoteStyle; label: string }) {
  const active = useMobileRemoteStyle() === kind;
  return (
    <button
      type="button"
      onClick={() => setMobileRemoteStyle(kind)}
      className={`relative flex flex-col items-center gap-3 rounded-2xl border bg-surface/50 p-4 transition-colors ${
        active ? "border-accent ring-1 ring-accent" : "border-edge-soft/70"
      }`}
    >
      {active && (
        <span className="absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      <span className="flex h-[104px] w-full items-center justify-center rounded-xl bg-canvas/60">
        {kind === "dpad" ? <DpadGlyph /> : <TouchpadGlyph />}
      </span>
      <span className={`text-[13.5px] font-semibold ${active ? "text-ink" : "text-ink-muted"}`}>
        {label}
      </span>
    </button>
  );
}

function DpadGlyph() {
  return (
    <span className="relative grid h-[74px] w-[74px] place-items-center rounded-full bg-elevated/70 ring-1 ring-edge-soft/70">
      <span className="absolute top-1.5 h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-ink-muted" />
      <span className="absolute bottom-1.5 h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-ink-muted" />
      <span className="absolute start-1.5 h-0 w-0 border-y-[5px] border-e-[7px] border-y-transparent border-e-ink-muted" />
      <span className="absolute end-1.5 h-0 w-0 border-y-[5px] border-s-[7px] border-y-transparent border-s-ink-muted" />
      <span className="h-7 w-7 rounded-full bg-raised" />
    </span>
  );
}

function TouchpadGlyph() {
  return (
    <span className="relative flex h-[62px] w-[74px] items-center justify-center rounded-2xl bg-elevated/70 ring-1 ring-edge-soft/70">
      <span className="h-2 w-2 rounded-full bg-ink-muted" />
      <span className="absolute h-[3px] w-8 -rotate-[18deg] rounded-full bg-ink-subtle/50" />
    </span>
  );
}

function Row({
  icon,
  label,
  value,
  dot,
  pending,
  pendingLabel = "Set up",
  badge,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  dot?: "ok" | null;
  pending?: boolean;
  pendingLabel?: string;
  badge?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-raised/60"
    >
      <span className={danger ? "text-danger" : "text-ink-muted"}>{icon}</span>
      <span className={`flex-1 text-[15px] font-medium ${danger ? "text-danger" : "text-ink"}`}>
        {label}
      </span>
      {dot === "ok" && <span className="h-2 w-2 rounded-full bg-success" />}
      {value && <span className="max-w-[40%] truncate text-[13.5px] text-ink-subtle">{value}</span>}
      {badge && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-canvas">
          {badge}
        </span>
      )}
      {pending && (
        <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent">
          {pendingLabel}
        </span>
      )}
      {!danger && <ChevronRight size={18} strokeWidth={2.2} className="text-ink-subtle" />}
    </button>
  );
}

// Brand logo badge shared by the Streaming setup (TMDB/TVDB/RPDB) and Debrid
// rows so both sections read the same premium way instead of a generic icon.
function LogoBadge({ src }: { src: string }) {
  return (
    <span className="flex h-5 w-5 items-center justify-center overflow-hidden rounded-[5px]">
      <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
    </span>
  );
}

function Divider() {
  return <span className="mx-4 block h-px bg-edge-soft/60" />;
}
