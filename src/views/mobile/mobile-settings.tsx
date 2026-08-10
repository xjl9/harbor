import { Check, ChevronLeft, Globe } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import type { ContentCategory } from "@/lib/settings/types";
import { useRegisterSheet } from "./mobile-sheet-lock";

// Only settings the mobile shell actually reads are surfaced here, so every
// control changes something real on the device — no decorative toggles.
const CATEGORIES: Array<{ key: ContentCategory; label: string; hint: string }> = [
  { key: "anime", label: "Anime", hint: "Anime browse view, rows and picks" },
  { key: "liveTv", label: "Live TV", hint: "IPTV channels and guide" },
  { key: "sports", label: "Sports", hint: "Live sports schedules" },
  { key: "manga", label: "Manga", hint: "Manga reader and library" },
  { key: "adult", label: "Adult", hint: "Adult catalogs and addons" },
];

const REGIONS: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "IE", name: "Ireland" },
  { code: "IN", name: "India" },
  { code: "PH", name: "Philippines" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "JP", name: "Japan" },
  { code: "KR", name: "South Korea" },
];

export function MobileSettings({ onClose }: { onClose: () => void }) {
  useRegisterSheet(true);
  const { settings, update } = useSettings();
  const [regionOpen, setRegionOpen] = useState(false);

  const region = REGIONS.find((r) => r.code === settings.region) ?? null;
  const setCategory = (key: ContentCategory, show: boolean) =>
    update({ hideContent: { ...settings.hideContent, [key]: !show } });

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-canvas">
      <header
        className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="-ms-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted transition-transform active:scale-[0.94]"
        >
          <ChevronLeft size={24} strokeWidth={2.2} />
        </button>
        <h1 className="font-display text-[22px] font-medium tracking-[-0.01em] text-ink">Settings</h1>
      </header>

      <div
        className="flex-1 overflow-y-auto px-5 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        <div className="flex flex-col gap-7">
          <Section label="Appearance">
            <Card>
              <div className="flex flex-col gap-3 px-4 py-4">
                <div>
                  <p className="text-[15px] font-medium text-ink">Home layout</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-ink-subtle">
                    Cinematic leads with a full-bleed hero. Classic is a compact grid.
                  </p>
                </div>
                <Segmented
                  value={settings.homeMode}
                  onChange={(v) => update({ homeMode: v })}
                  options={[
                    { value: "harbor", label: "Cinematic" },
                    { value: "classic", label: "Classic" },
                  ]}
                />
              </div>
              <Divider />
              <ToggleRow
                label="Separate Continue Watching per profile"
                hint="Each profile keeps its own resume list."
                on={settings.cwPerProfile}
                onChange={(v) => update({ cwPerProfile: v })}
              />
            </Card>
          </Section>

          <Section
            label="Content"
            caption="Choose which categories appear in the view switcher and rows."
          >
            <Card>
              {CATEGORIES.map((c, i) => (
                <div key={c.key}>
                  {i > 0 && <Divider />}
                  <ToggleRow
                    label={c.label}
                    hint={c.hint}
                    on={!settings.hideContent[c.key]}
                    onChange={(v) => setCategory(c.key, v)}
                  />
                </div>
              ))}
            </Card>
          </Section>

          <Section
            label="Region"
            caption="Sets the catalog region for trending, popular and provider rows."
          >
            <Card>
              <button
                type="button"
                onClick={() => setRegionOpen(true)}
                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-raised/60"
              >
                <Globe size={20} strokeWidth={2} className="text-ink-muted" />
                <span className="flex-1 text-[15px] font-medium text-ink">Catalog region</span>
                <span className="text-[13.5px] text-ink-subtle">
                  {region ? region.name : settings.region || "Default"}
                </span>
              </button>
            </Card>
          </Section>
        </div>
      </div>

      {regionOpen && (
        <RegionSheet
          current={settings.region}
          onPick={(code) => {
            update({ region: code });
            setRegionOpen(false);
          }}
          onClose={() => setRegionOpen(false)}
        />
      )}
    </div>
  );
}

function RegionSheet({
  current,
  onPick,
  onClose,
}: {
  current: string;
  onPick: (code: string) => void;
  onClose: () => void;
}) {
  useRegisterSheet(true);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        className="relative z-10 max-h-[70vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/[0.07] bg-elevated pb-8 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="sticky top-0 bg-elevated/95 px-5 pb-2 pt-4 backdrop-blur">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/20" />
          <h3 className="font-display text-[19px] font-medium text-ink">Catalog region</h3>
        </div>
        <div className="px-3">
          {REGIONS.map((r) => {
            const active = r.code === current;
            return (
              <button
                key={r.code}
                type="button"
                onClick={() => onPick(r.code)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors active:bg-raised/60"
              >
                <span className={`flex-1 text-[15px] ${active ? "font-semibold text-ink" : "font-medium text-ink-muted"}`}>
                  {r.name}
                </span>
                <span className="text-[12.5px] text-ink-subtle">{r.code}</span>
                {active && <Check size={18} strokeWidth={2.6} className="text-accent" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
          {label}
        </h2>
        {caption && <p className="px-1 text-[12.5px] leading-snug text-ink-subtle">{caption}</p>}
      </div>
      {children}
    </section>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-elevated/40">{children}</div>
  );
}

function Divider() {
  return <span className="mx-4 block h-px bg-edge-soft/60" />;
}

function ToggleRow({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-subtle">{hint}</p>}
      </div>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200 ${
        on ? "bg-accent" : "bg-raised"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[24px] w-[24px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-200 ${
          on ? "translate-x-[23px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-full bg-raised/70 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-full py-2 text-[13.5px] font-semibold transition-colors ${
              active ? "bg-ink text-canvas" : "text-ink-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
