import { Check, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import type { ContentCategory } from "@/lib/settings/types";
import { osClass } from "@/lib/platform";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { useKeyboardInset } from "./use-keyboard-inset";
import { MOBILE_SAFE_X } from "./chrome-metrics";

// Only settings the mobile shell actually reads are surfaced here, so every
// control changes something real on the device — no decorative toggles.
const CATEGORIES: Array<{ key: ContentCategory; label: string }> = [
  { key: "anime", label: "Anime" },
  { key: "liveTv", label: "Live TV" },
  { key: "sports", label: "Sports" },
  { key: "manga", label: "Manga" },
  { key: "adult", label: "Adult" },
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

// Shared focus token — the same amber scalpel, so focus reads instantly on a
// TV/gamepad as well as touch. Applied to every interactive element.
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Light-impact feedback, gated: navigator.vibrate is a no-op on desktop (no
// vibration hardware) and fires on Android touch surfaces. iOS native haptics
// would swap in here once the Tauri binding is wired.
function tapHaptic() {
  if (typeof navigator === "undefined") return;
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }
}

export function MobileSettings({ onClose }: { onClose: () => void }) {
  useRegisterSheet(true);
  const { settings, update } = useSettings();
  const [regionOpen, setRegionOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(onClose, 300);
    return () => window.clearTimeout(t);
  }, [closing, onClose]);

  const region = REGIONS.find((r) => r.code === settings.region) ?? null;
  const setCategory = (key: ContentCategory, show: boolean) =>
    update({ hideContent: { ...settings.hideContent, [key]: !show } });

  // The in-webview player is only reachable on iOS: pickBridge() honors an html5
  // engine setting solely on iOS (Android always takes the native surface), so a
  // toggle elsewhere would be dead. Read the raw OS, not isMobileNative().
  const isIos = osClass() === "ios";
  const inAppPlayer = settings.playerEngine === "html5";

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      {/* Ambient amber wash — Settings has no identity colour, so it whispers (~14%). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />

      <header
        className="flex items-center gap-3 px-5 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          type="button"
          onClick={() => setClosing(true)}
          aria-label="Back"
          className={`-ms-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        <div>
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.22em] text-ink-subtle">
            Preferences
          </p>
          <h1 className="font-display text-[30px] font-medium leading-none tracking-[-0.02em] text-ink">
            Settings
          </h1>
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto px-5"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)",
        }}
      >
        <Department
          index={0}
          first
          kicker="Display"
          folio="01"
          title="How home looks"
          standfirst="Set the shape of the home screen and how continue watching is kept."
        >
          <LayoutChoice
            value={settings.homeMode}
            onChange={(v) => update({ homeMode: v })}
          />
          <span className="mt-4 block h-px bg-edge-soft" />
          <ToggleRow
            label="Separate Continue Watching per profile"
            on={settings.cwPerProfile}
            onChange={(v) => update({ cwPerProfile: v })}
          />
        </Department>

        <Department
          index={1}
          kicker="Catalog"
          folio="02"
          title="What shows up"
          standfirst="Choose which categories appear in the view switcher and rows."
        >
          <div className="overflow-hidden rounded-2xl border border-edge-soft bg-elevated/40">
            {CATEGORIES.map((c, i) => (
              <div key={c.key}>
                {i > 0 && <span className="mx-4 block h-px bg-edge-soft/60" />}
                <ToggleRow
                  label={c.label}
                  on={!settings.hideContent[c.key]}
                  onChange={(v) => setCategory(c.key, v)}
                />
              </div>
            ))}
          </div>
        </Department>

        <Department
          index={2}
          kicker="Region"
          folio="03"
          title="Where you watch from"
          standfirst="Sets the catalog region for trending, popular and provider rows."
        >
          <button
            type="button"
            onClick={() => setRegionOpen(true)}
            className={`flex w-full items-center gap-3.5 py-3.5 text-start ${FOCUS}`}
          >
            <Globe
              size={20}
              strokeWidth={2}
              className="shrink-0 text-ink-muted"
            />
            <span className="shrink-0 text-[15.5px] font-medium text-ink">
              Catalog region
            </span>
            {/* The value is the only flexible part, so a long region name ellipsizes
                instead of squeezing the label onto two lines at 375px. */}
            <span className="min-w-0 flex-1 truncate text-end text-[14px] text-ink-muted">
              {region ? region.name : settings.region || "Default"}
            </span>
            {region && (
              <span className="shrink-0 rounded-md bg-raised/50 px-1.5 py-0.5 font-mono text-[12px] tracking-[0.06em] text-ink-subtle">
                {region.code}
              </span>
            )}
            <ChevronRight
              size={18}
              strokeWidth={2.2}
              className="shrink-0 text-ink-subtle"
            />
          </button>
        </Department>

        {isIos && (
          <Department
            index={3}
            kicker="Playback"
            folio="04"
            title="How video plays"
            standfirst="The native player is the default and plays every format. Turn on the in-app player for Harbor's touch controls on direct and HLS streams; MKV, HEVC and AC3 still need the native player."
          >
            <div className="overflow-hidden rounded-2xl border border-edge-soft bg-elevated/40">
              <ToggleRow
                label="In-app player"
                on={inAppPlayer}
                onChange={(v) => update({ playerEngine: v ? "html5" : "auto" })}
              />
            </div>
          </Department>
        )}
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

// The signature: a serif department headline sitting ON a full-bleed hairline
// rule with a mono folio numeral floated to the right margin. The repeating unit
// IS the screen's identity and rhymes with mobile-rail.tsx.
function Department({
  index,
  first,
  kicker,
  folio,
  title,
  standfirst,
  children,
}: {
  index: number;
  first?: boolean;
  kicker: string;
  folio: string;
  title: string;
  standfirst: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`harbor-rise ${first ? "mt-2" : "mt-11"}`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-ink-subtle">
          {kicker}
        </span>
        <span className="font-mono text-[12px] tabular-nums tracking-[0.05em] text-ink-subtle/55">
          {folio}
        </span>
      </div>
      <div className="mt-[3px] flex items-center gap-3.5">
        <h2 className="shrink-0 font-display text-[21px] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h2>
        <span className="h-px flex-1 bg-edge-soft" />
      </div>
      <p className="mt-3 max-w-[32ch] text-[13px] leading-relaxed text-ink-muted">
        {standfirst}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

// Two editorial plates showing the actual Cinematic vs Classic layouts, not a
// pill — the choice is a layout, so show it. Reuses the profile StylePreview idiom.
function LayoutChoice({
  value,
  onChange,
}: {
  value: "harbor" | "classic";
  onChange: (v: "harbor" | "classic") => void;
}) {
  const opts: Array<{ v: "harbor" | "classic"; label: string }> = [
    { v: "harbor", label: "Cinematic" },
    { v: "classic", label: "Classic" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Home layout"
      className="grid grid-cols-2 gap-3"
    >
      {opts.map((o) => {
        const active = value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            onClick={() => {
              if (active) return;
              tapHaptic();
              onChange(o.v);
            }}
            className={`no-press relative rounded-2xl border bg-surface/50 p-3 text-start transition-colors ${FOCUS} ${
              active ? "border-accent ring-1 ring-accent" : "border-edge-soft"
            }`}
          >
            <div className="rounded-xl bg-canvas/60 p-2.5">
              <div className="h-24">
                {o.v === "harbor" ? (
                  <div className="flex h-full flex-col gap-1.5">
                    <div className="h-14 rounded-md bg-raised" />
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="h-5 rounded bg-edge" />
                      <div className="h-5 rounded bg-edge" />
                      <div className="h-5 rounded bg-edge" />
                    </div>
                  </div>
                ) : (
                  <div className="grid h-full grid-cols-3 grid-rows-2 gap-1.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="rounded bg-edge" />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <span
              className={`mt-2 block font-display text-[15px] ${active ? "text-ink" : "text-ink-muted"}`}
            >
              {o.label}
            </span>
            {active && (
              <span className="harbor-pop absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// The ROW is the control: a full-width role=switch button whose label is its
// accessible name. Fixes hit-target, a11y naming, and dead-label-area in one move.
function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        tapHaptic();
        onChange(!on);
      }}
      className={`no-press group flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
    >
      {/* Label encodes state: ink when ON, ink-muted when OFF. */}
      <span
        className={`min-w-0 flex-1 text-[15px] font-medium ${on ? "text-ink" : "text-ink-muted"}`}
      >
        {label}
      </span>
      <span
        aria-hidden
        className={`relative flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-[220ms] [transition-timing-function:var(--ease-out)] ${
          on ? "bg-accent" : "bg-raised"
        }`}
      >
        {/* Warm off-white knob, elongates on press for a real-switch feel. */}
        <span
          className={`absolute start-[2px] h-[27px] w-[27px] rounded-full bg-ink shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-edge transition-all duration-[220ms] [transition-timing-function:var(--ease-out)] group-active:w-[31px] ${
            on
              ? "translate-x-[20px] group-active:translate-x-[16px]"
              : "translate-x-0"
          }`}
        />
      </span>
    </button>
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
  const keyboardInset = useKeyboardInset();
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const dismiss = (after: () => void) => {
    setLeaving(true);
    window.setTimeout(after, 300);
  };
  const pick = (code: string) => {
    if (pending) return;
    tapHaptic();
    setPending(code);
    // Let the choice land before the sheet leaves.
    window.setTimeout(() => dismiss(() => onPick(code)), 190);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return REGIONS;
    return REGIONS.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
    );
  }, [query]);

  const chosen = pending ?? current;
  const open = entered && !leaving;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center transition-[padding] duration-150"
      style={{ paddingBottom: keyboardInset }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => dismiss(onClose)}
        className={`no-press absolute inset-0 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "oklch(0.12 0.006 48 / 0.62)" }}
      />
      <div
        /* Bound against the container the keyboard inset already shortened, not
           the full viewport: 78vh with a keyboard open still overflows. */
        className={`relative z-10 flex max-h-[calc(100%-env(safe-area-inset-top,0px)-12px)] w-full max-w-md flex-col rounded-t-3xl border border-edge bg-elevated shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)] transition-transform duration-300 [transition-timing-function:var(--ease-out)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
        }}
      >
        <div className="px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink/20" />
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-[19px] font-medium text-ink">
              Catalog region
            </h3>
            <span className="font-mono text-[12px] tabular-nums text-ink-subtle">
              {filtered.length}
            </span>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search regions"
            aria-label="Search regions"
            className={`mt-3 w-full rounded-xl border border-edge-soft bg-canvas/60 px-3.5 py-2.5 text-[16px] text-ink placeholder:text-ink-subtle ${FOCUS}`}
          />
        </div>
        <div className="mt-2 overflow-y-auto px-3">
          {filtered.map((r) => {
            const active = r.code === chosen;
            return (
              <button
                key={r.code}
                type="button"
                ref={active ? activeRef : undefined}
                onClick={() => pick(r.code)}
                className={`grid w-full grid-cols-[1fr_auto_20px] items-center gap-3 px-2 py-3.5 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
              >
                <span
                  className={`truncate text-[15px] ${active ? "font-medium text-ink" : "text-ink-muted"}`}
                >
                  {r.name}
                </span>
                <span className="rounded-md bg-raised/50 px-1.5 py-0.5 font-mono text-[12px] tracking-[0.06em] text-ink-subtle">
                  {r.code}
                </span>
                {active ? (
                  <Check
                    size={18}
                    strokeWidth={2.6}
                    className="harbor-pop text-accent"
                  />
                ) : (
                  <span />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
