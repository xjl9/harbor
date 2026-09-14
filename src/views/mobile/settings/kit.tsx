// Desktop settings import these names from ./icons, which re-exports lucide and
// swaps in the bespoke settings art wherever Harbor has drawn one.
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Lock, Search, X } from "@/views/settings/icons";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Flag } from "@/components/flag";
import { useT } from "@/lib/i18n";
import { normalizeLang } from "@/lib/subtitles/language";
import { SetIcon } from "@/views/settings/set-icon";
import { PageActionsProvider, type PageActionReg } from "@/views/settings/page-actions";
import { SettingsActiveContext, settingsAnchor, type SectionId } from "@/views/settings/shared";
import { SubTabsProvider, type SubTabReg } from "@/views/settings/sub-tabs";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { useKeyboardInset } from "../use-keyboard-inset";

// The phone settings kit. Every department page is built from these pieces so
// the rows read identically from Playback to Advanced, the way desktop's
// SettingRow/ToggleRow do. Labels and help copy come straight from the desktop
// panels, so a user who knows one knows the other.

// Shared focus token: the same amber scalpel, so focus reads instantly on a
// TV/gamepad as well as touch. Applied to every interactive element.
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Light-impact feedback, gated: navigator.vibrate is a no-op on desktop (no
// vibration hardware) and fires on Android touch surfaces.
export function tapHaptic() {
  if (typeof navigator === "undefined") return;
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }
}

const PAGE_MS = 260;

// A full-screen page that slides in from the trailing edge and slides back out
// on Back. Pages nest (department over landing, sub-page over department), so
// each one takes its own z-index step and registers as a sheet to freeze the
// shell's gestures underneath it.
export function PhonePage({
  title,
  kicker,
  icon,
  onBack,
  depth = 1,
  anchor,
  children,
}: {
  title: string;
  kicker?: string;
  icon?: string;
  onBack: () => void;
  depth?: 1 | 2;
  anchor?: string | null;
  children: ReactNode;
}) {
  useRegisterSheet(true);
  const t = useT();
  const [closing, setClosing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(onBack, PAGE_MS);
    return () => window.clearTimeout(id);
  }, [closing, onBack]);

  // Search deep-links land on the row the desktop index pointed at. The row is
  // identified the same way desktop anchors are (settingsAnchor of its title),
  // so the desktop search index needs no phone-specific data.
  useEffect(() => {
    if (!anchor) return;
    const root = scrollRef.current;
    if (!root) return;
    const id = window.setTimeout(() => {
      const el = root.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      // Inline rather than a stylesheet class: the phone kit owns no CSS file,
      // and a two-second wash is all the row needs to say "this one".
      el.style.transition = "background-color 600ms var(--ease-out)";
      el.style.backgroundColor = "color-mix(in oklab, var(--color-accent) 16%, transparent)";
      window.setTimeout(() => {
        el.style.backgroundColor = "";
        window.setTimeout(() => {
          el.style.transition = "";
        }, 700);
      }, 1400);
    }, PAGE_MS + 40);
    return () => window.clearTimeout(id);
  }, [anchor]);

  return (
    <div
      className={`fixed inset-0 flex flex-col bg-canvas ${depth === 1 ? "z-[71]" : "z-[72]"} ${
        closing
          ? "translate-x-full transition-transform duration-[260ms] [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56"
        style={{
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 10%, transparent), transparent 70%)",
        }}
      />
      <header
        className="mx-auto flex w-full max-w-[680px] items-center gap-2 px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <button
          type="button"
          onClick={() => setClosing(true)}
          aria-label={t("Back")}
          className={`-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-elevated/70 text-ink ring-1 ring-edge-soft/70">
            <SetIcon name={icon} size={19} strokeWidth={1.9} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="truncate text-[11px] font-sans font-semibold uppercase tracking-[0.2em] text-ink-subtle">
              {kicker}
            </p>
          )}
          <h1 className="truncate font-display text-[24px] font-medium leading-tight tracking-[-0.015em] text-ink">
            {title}
          </h1>
        </div>
      </header>
      <div
        ref={scrollRef}
        className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto overscroll-contain px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >
        {children}
      </div>
    </div>
  );
}

// The signature: a serif department headline sitting ON a full-bleed hairline
// rule with a mono folio numeral floated to the right margin. The repeating unit
// IS the screen's identity and rhymes with mobile-rail.tsx.
export function Dept({
  index,
  icon,
  title,
  standfirst,
  children,
}: {
  index: number;
  icon?: string;
  title: string;
  standfirst?: string;
  children: ReactNode;
}) {
  const folio = String(index + 1).padStart(2, "0");
  return (
    <section
      id={settingsAnchor(title)}
      className={`harbor-rise scroll-mt-4 ${index === 0 ? "mt-2" : "mt-10"}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div className="flex items-center gap-3">
        {icon && (
          <span className="shrink-0 text-ink-muted">
            <SetIcon name={icon} size={18} strokeWidth={1.9} />
          </span>
        )}
        <h2 className="min-w-0 shrink font-display text-[21px] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h2>
        <span className="h-px min-w-3 flex-1 bg-edge-soft" />
        <span className="font-mono text-[12px] tabular-nums tracking-[0.05em] text-ink-subtle/55">
          {folio}
        </span>
      </div>
      {standfirst && (
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">{standfirst}</p>
      )}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

// A rounded plate holding a run of rows, hairlines between them. The optional
// label is the desktop SettingGroup heading.
export function Group({
  label,
  note,
  children,
}: {
  label?: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="px-1 text-[11px] font-sans font-semibold uppercase tracking-[0.18em] text-ink-subtle">
          {label}
        </span>
      )}
      <div className="overflow-hidden rounded-2xl border border-edge-soft bg-elevated/40 [&>*+*]:border-t [&>*+*]:border-edge-soft/60">
        {children}
      </div>
      {note && <p className="px-1 text-[12.5px] leading-relaxed text-ink-subtle">{note}</p>}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[12.5px] leading-relaxed text-ink-subtle">{children}</p>;
}

function Lead({ icon, logo, dim }: { icon?: string; logo?: string; dim?: boolean }) {
  if (logo) {
    return (
      <span
        className={`mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-[6px] ${dim ? "opacity-50 saturate-50" : ""}`}
      >
        <img src={logo} alt="" draggable={false} className="h-full w-full object-contain" />
      </span>
    );
  }
  if (icon) {
    return (
      <span className={`mt-[2px] shrink-0 text-ink-muted ${dim ? "opacity-50" : ""}`}>
        <SetIcon name={icon} size={20} strokeWidth={1.9} />
      </span>
    );
  }
  return null;
}

function RowText({
  label,
  sub,
  warn,
  on = true,
}: {
  label: string;
  sub?: ReactNode;
  warn?: string;
  on?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className={`text-[15.5px] font-medium leading-snug ${on ? "text-ink" : "text-ink-muted"}`}>
        {label}
      </span>
      {sub && <span className="text-[12.5px] leading-relaxed text-ink-subtle">{sub}</span>}
      {warn && <span className="mt-0.5 text-[12.5px] leading-relaxed text-danger">{warn}</span>}
    </span>
  );
}

// The ROW is the control: a full-width role=switch button whose label is its
// accessible name. Fixes hit-target, a11y naming, and dead-label-area in one move.
export function ToggleRow({
  icon,
  logo,
  label,
  sub,
  on,
  onChange,
  lockReason,
  warn,
}: {
  icon?: string;
  logo?: string;
  label: string;
  sub?: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
  lockReason?: string;
  warn?: string;
}) {
  const locked = !!lockReason;
  const effective = on && !locked;
  return (
    <button
      type="button"
      role="switch"
      id={settingsAnchor(label)}
      aria-checked={effective}
      disabled={locked}
      onClick={() => {
        if (locked) return;
        tapHaptic();
        onChange(!on);
      }}
      className={`no-press group flex w-full items-start gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-raised/50 disabled:cursor-not-allowed ${FOCUS}`}
    >
      <Lead icon={icon} logo={logo} dim={locked} />
      <RowText
        label={label}
        sub={
          lockReason ? (
            <span className="inline-flex items-start gap-1.5 text-accent">
              <Lock size={12} strokeWidth={2.4} className="mt-[3px] shrink-0" />
              <span>{lockReason}</span>
            </span>
          ) : (
            sub
          )
        }
        warn={warn}
        on={effective}
      />
      <span
        aria-hidden
        className={`relative mt-[1px] flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-[220ms] [transition-timing-function:var(--ease-out)] ${
          effective ? "bg-accent" : "bg-raised"
        } ${locked ? "opacity-50" : ""}`}
      >
        <span
          className={`absolute start-[2px] h-[27px] w-[27px] rounded-full bg-ink shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-edge transition-all duration-[220ms] [transition-timing-function:var(--ease-out)] group-active:w-[31px] ${
            effective
              ? "translate-x-[20px] group-active:translate-x-[16px] rtl:-translate-x-[20px] rtl:group-active:-translate-x-[16px]"
              : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

// Label on the left, the current value and a chevron on the right. The label
// holds its width and the value absorbs the squeeze: a truncated label reads as
// broken, a truncated value still reads as a value.
export function NavRow({
  icon,
  logo,
  label,
  sub,
  value,
  valueLead,
  badge,
  dot,
  pending,
  pendingLabel,
  onClick,
  chevron = true,
}: {
  icon?: string;
  logo?: string;
  label: string;
  sub?: ReactNode;
  value?: string;
  valueLead?: ReactNode;
  badge?: string;
  dot?: "ok" | null;
  pending?: boolean;
  pendingLabel?: string;
  onClick: () => void;
  chevron?: boolean;
}) {
  const t = useT();
  return (
    <button
      type="button"
      id={settingsAnchor(label)}
      onClick={onClick}
      className={`flex w-full items-start gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-raised/60 ${FOCUS}`}
    >
      <Lead icon={icon} logo={logo} />
      <RowText label={label} sub={sub} />
      {dot === "ok" && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-success" />}
      {(value || valueLead) && (
        <span className="mt-[2px] flex min-w-0 max-w-[45%] shrink items-center gap-1.5 text-end">
          {valueLead}
          {value && <span className="truncate text-[13.5px] text-ink-subtle">{value}</span>}
        </span>
      )}
      {badge && (
        <span className="mt-[3px] flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-canvas">
          {badge}
        </span>
      )}
      {pending && (
        <span className="mt-[1px] shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent">
          {pendingLabel ?? t("Set up")}
        </span>
      )}
      {chevron && (
        <ChevronRight
          size={18}
          strokeWidth={2.2}
          className="mt-[3px] shrink-0 text-ink-subtle rtl:-scale-x-100"
        />
      )}
    </button>
  );
}

// A row that runs an action from a trailing pill instead of navigating.
export function ActionRow({
  icon,
  label,
  sub,
  cta,
  tone = "neutral",
  disabled,
  onClick,
}: {
  icon?: string;
  label: string;
  sub?: ReactNode;
  cta: string;
  tone?: "neutral" | "primary" | "danger" | "success";
  disabled?: boolean;
  onClick: () => void;
}) {
  const skin =
    tone === "primary"
      ? "bg-ink text-canvas"
      : tone === "danger"
        ? "border border-danger/40 text-danger"
        : tone === "success"
          ? "bg-success/15 text-success"
          : "border border-edge-soft text-ink";
  return (
    <div id={settingsAnchor(label)} className="flex w-full items-start gap-3.5 px-4 py-3.5">
      <Lead icon={icon} />
      <RowText label={label} sub={sub} />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          tapHaptic();
          onClick();
        }}
        className={`mt-[1px] flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold transition-transform active:scale-95 disabled:opacity-40 ${skin} ${FOCUS}`}
      >
        {cta}
      </button>
    </div>
  );
}

// One option of a radio group rendered as a row with a trailing check, the
// phone form of desktop's ChoiceBlock / "Picked" rows.
export function ChoiceRow({
  icon,
  logo,
  label,
  sub,
  selected,
  tag,
  onClick,
}: {
  icon?: string;
  logo?: string;
  label: string;
  sub?: ReactNode;
  selected: boolean;
  tag?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      id={settingsAnchor(label)}
      onClick={() => {
        if (selected) return;
        tapHaptic();
        onClick();
      }}
      className={`no-press flex w-full items-start gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
    >
      <Lead icon={icon} logo={logo} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-[15.5px] font-medium leading-snug ${selected ? "text-ink" : "text-ink-muted"}`}>
            {label}
          </span>
          {tag && (
            <span className="rounded-md bg-accent/12 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-accent">
              {tag}
            </span>
          )}
        </span>
        {sub && <span className="text-[12.5px] leading-relaxed text-ink-subtle">{sub}</span>}
      </span>
      <span className="mt-[2px] flex h-6 w-6 shrink-0 items-center justify-center">
        {selected ? (
          <span className="harbor-pop flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
            <Check size={12} strokeWidth={3} />
          </span>
        ) : (
          <span className="h-5 w-5 rounded-full border border-edge" />
        )}
      </span>
    </button>
  );
}

export type SegmentOption<T extends string> = { value: T; label: string };

// A pill segmented control that always fits the column: up to three options on
// one line, more wrap into a grid so no label ever ellipsizes at 402pt.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  const cols = options.length <= 3 ? options.length : options.length === 4 ? 2 : 3;
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-1 rounded-xl bg-canvas/70 p-1 ring-1 ring-edge-soft"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              if (active) return;
              tapHaptic();
              onChange(o.value);
            }}
            className={`no-press min-h-[40px] rounded-lg px-2 text-[13.5px] font-semibold leading-tight transition-colors ${
              active ? "bg-ink text-canvas" : "text-ink-muted active:bg-raised/60"
            } ${FOCUS}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A labelled row whose control is a segmented pill on its own line below the
// copy, the phone form of desktop's `wide` SettingRow + Segmented.
export function SegmentedRow<T extends string>({
  icon,
  label,
  sub,
  value,
  options,
  onChange,
}: {
  icon?: string;
  label: string;
  sub?: ReactNode;
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (v: T) => void;
}) {
  return (
    <div id={settingsAnchor(label)} className="flex w-full flex-col gap-3 px-4 py-3.5">
      <div className="flex items-start gap-3.5">
        <Lead icon={icon} />
        <RowText label={label} sub={sub} />
      </div>
      <Segmented value={value} options={options} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

// A masked secret row. The key itself never renders in the list; tapping opens
// an EditSheet with a reveal toggle, matching desktop's KeyField.
export function KeyRow({
  logo,
  icon,
  label,
  sub,
  value,
  onClick,
}: {
  logo?: string;
  icon?: string;
  label: string;
  sub?: ReactNode;
  value: string;
  onClick: () => void;
}) {
  const t = useT();
  const set = !!value.trim();
  return (
    <NavRow
      logo={logo}
      icon={icon}
      label={label}
      sub={sub}
      value={set ? "••••" : undefined}
      dot={set ? "ok" : null}
      pending={!set}
      pendingLabel={t("Add")}
      onClick={onClick}
    />
  );
}

const SHEET_MS = 260;

function useSheetMotion(onClose: () => void) {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, SHEET_MS);
  };
  return { open: entered && !leaving, dismiss };
}

function SheetFrame({
  title,
  count,
  onClose,
  open,
  children,
  footer,
}: {
  title: string;
  count?: number;
  onClose: () => void;
  open: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const t = useT();
  const keyboardInset = useKeyboardInset();
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center transition-[padding] duration-150"
      style={{ paddingBottom: keyboardInset }}
    >
      <button
        type="button"
        aria-label={t("Close")}
        onClick={onClose}
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
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink/20" />
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 font-display text-[19px] font-medium text-ink">{title}</h3>
            {count !== undefined && (
              <span className="font-mono text-[12px] tabular-nums text-ink-subtle">{count}</span>
            )}
          </div>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

// Bottom-sheet text entry. Secrets mask by default with a reveal toggle,
// matching desktop's KeyField; plain text (a relay URL, block words) shows.
export function EditSheet({
  title,
  hint,
  initial,
  placeholder,
  secret = true,
  logo,
  inputMode,
  onSave,
  onClose,
}: {
  title: string;
  hint?: ReactNode;
  initial: string;
  placeholder?: string;
  secret?: boolean;
  logo?: string;
  inputMode?: "text" | "url" | "decimal";
  onSave: (next: string) => void;
  onClose: () => void;
}) {
  useRegisterSheet(true);
  const t = useT();
  const [value, setValue] = useState(initial);
  const [reveal, setReveal] = useState(false);
  const { open, dismiss } = useSheetMotion(onClose);
  const save = () => {
    onSave(value);
    dismiss();
  };
  return (
    <SheetFrame title={title} onClose={dismiss} open={open}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-1">
        {hint && <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{hint}</p>}
        <div className="mt-4 flex min-h-[58px] items-center rounded-2xl border border-edge-soft/70 bg-canvas/70 p-1.5 transition-colors focus-within:border-accent">
          {logo && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raised/70 ring-1 ring-white/[0.06]">
              <img src={logo} alt="" draggable={false} className="max-h-8 max-w-8 object-contain" />
            </span>
          )}
          <input
            autoFocus
            type={secret && !reveal ? "password" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            inputMode={inputMode}
            className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
          {secret && (
            <button
              type="button"
              aria-label={reveal ? t("Hide") : t("Show")}
              onClick={() => setReveal((r) => !r)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-subtle transition-colors active:bg-raised/60 active:text-ink"
            >
              {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-3 px-5 pt-4">
        <button
          type="button"
          onClick={dismiss}
          className="flex-1 rounded-full border border-edge-soft/70 py-3 text-[14.5px] font-semibold text-ink-muted transition-colors active:bg-raised/60"
        >
          {t("Cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          className="flex-1 rounded-full bg-ink py-3 text-[14.5px] font-semibold text-canvas"
        >
          {t("Save")}
        </button>
      </div>
    </SheetFrame>
  );
}

export type PickOption<T extends string> = {
  value: T;
  label: string;
  sub?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
};

// Bottom-sheet single choice. Long lists (regions, TMDB languages) get a search
// field; the active row scrolls into view so the current pick is never off screen.
export function PickerSheet<T extends string>({
  title,
  value,
  options,
  searchable,
  searchPlaceholder,
  onPick,
  onClose,
}: {
  title: string;
  value: T;
  options: ReadonlyArray<PickOption<T>>;
  searchable?: boolean;
  searchPlaceholder?: string;
  onPick: (v: T) => void;
  onClose: () => void;
}) {
  useRegisterSheet(true);
  const t = useT();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<T | null>(null);
  const { open, dismiss } = useSheetMotion(onClose);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.sub ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const chosen = pending ?? value;
  const pick = (v: T) => {
    tapHaptic();
    setPending(v);
    onPick(v);
    window.setTimeout(dismiss, 120);
  };

  return (
    <SheetFrame title={title} count={searchable ? filtered.length : undefined} onClose={dismiss} open={open}>
      {searchable && (
        <div className="shrink-0 px-5 pt-3">
          <div className="relative">
            <Search
              size={16}
              strokeWidth={2.2}
              aria-hidden
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? t("Search")}
              aria-label={searchPlaceholder ?? t("Search")}
              className={`w-full rounded-xl border border-edge-soft bg-canvas/60 py-2.5 pe-3.5 ps-10 text-[16px] text-ink placeholder:text-ink-subtle ${FOCUS}`}
            />
          </div>
        </div>
      )}
      <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
        {filtered.map((o) => {
          const active = o.value === chosen;
          return (
            <button
              key={o.value}
              type="button"
              ref={active ? activeRef : undefined}
              onClick={() => pick(o.value)}
              className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-3 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
              style={{ minHeight: 52 }}
            >
              {o.leading && <span className="flex shrink-0 justify-center">{o.leading}</span>}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`truncate text-[15px] ${active ? "font-medium text-ink" : "text-ink-muted"}`}>
                  {o.label}
                </span>
                {o.sub && <span className="truncate text-[12px] text-ink-subtle">{o.sub}</span>}
              </span>
              {o.trailing}
              <span className="flex w-5 shrink-0 justify-end">
                {active && <Check size={18} strokeWidth={2.6} className="harbor-pop text-accent" />}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-8 text-center text-[13px] text-ink-subtle">{t("No matches")}</p>
        )}
      </div>
    </SheetFrame>
  );
}

// Full-page ordered multi-select for language lists, the generalized form of
// the onboarding subtitle sheet: first pick wins at playback, so the 1-based
// position doubles as the priority badge. Portaled to the body so no animated
// ancestor can become its containing block.
export function LangOrderSheet({
  title,
  value,
  options,
  onToggle,
  onClose,
}: {
  title: string;
  value: string[];
  options: readonly string[];
  onToggle: (lang: string) => void;
  onClose: () => void;
}) {
  useRegisterSheet(true);
  const t = useT();
  const keyboardInset = useKeyboardInset();
  const [query, setQuery] = useState("");
  const { open, dismiss } = useSheetMotion(onClose);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((l) => l.toLowerCase().includes(q));
  }, [options, query]);

  const order = useMemo(() => {
    const m = new Map<string, number>();
    value.forEach((lang, i) => m.set(lang, i + 1));
    return m;
  }, [value]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[120] flex flex-col bg-canvas transition-opacity duration-[260ms] ${
        open ? "opacity-100" : "opacity-0"
      }`}
      style={{ paddingTop: "max(calc(env(safe-area-inset-top, 0px) + 12px), 52px)", ...MOBILE_SAFE_X }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />
      <div
        className={`flex min-h-0 flex-1 flex-col transition-transform duration-[260ms] [transition-timing-function:var(--ease-out)] ${
          open ? "translate-y-0" : "translate-y-2"
        }`}
      >
        <header className="flex items-center gap-1 px-3 pb-2">
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("Back")}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-raised active:text-ink ${FOCUS}`}
          >
            <ChevronLeft size={22} strokeWidth={2.2} className="dir-icon" />
          </button>
          <h2 className="min-w-0 truncate font-display text-[20px] font-medium tracking-tight text-ink">
            {title}
          </h2>
          <span className="ms-auto me-2 font-mono text-[12px] tabular-nums text-ink-subtle">
            {value.length}
          </span>
        </header>
        <div className="px-5">
          <div className="relative">
            <Search
              size={16}
              strokeWidth={2.2}
              aria-hidden
              className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search languages")}
              aria-label={t("Search languages")}
              className={`w-full rounded-xl border border-edge-soft bg-canvas/60 py-3 pe-3.5 ps-10 text-[16px] text-ink placeholder:text-ink-subtle ${FOCUS}`}
            />
          </div>
        </div>
        <div
          className="mt-1 flex-1 overflow-y-auto px-3 pt-1"
          style={{ paddingBottom: keyboardInset > 0 ? keyboardInset + 16 : 8 }}
        >
          {filtered.map((lang) => {
            const idx = order.get(lang);
            const active = idx !== undefined;
            return (
              <button
                key={lang}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  tapHaptic();
                  onToggle(lang);
                }}
                className={`grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 rounded-xl px-2.5 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
                style={{ minHeight: 52 }}
              >
                <span className="flex justify-center">
                  {lang === "Original" ? (
                    <span className="rounded-md bg-raised/60 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
                      Org
                    </span>
                  ) : (
                    <Flag language={lang} code={normalizeLang(lang)} size="md" showLabel={false} />
                  )}
                </span>
                <span className={`truncate text-[15px] ${active ? "font-semibold text-ink" : "text-ink-muted"}`}>
                  {lang === "Original" ? t("Original") : lang}
                </span>
                {active ? (
                  <span className="harbor-pop inline-flex h-6 items-center gap-1 rounded-full bg-accent/15 px-2 text-accent">
                    <span className="font-mono text-[11px] font-bold tabular-nums">{idx}</span>
                    <Check size={13} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full border border-edge" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="px-2 py-8 text-center text-[13px] text-ink-subtle">
              {t("No language matches that search.")}
            </p>
          )}
        </div>
        {keyboardInset === 0 && (
          <div
            className="shrink-0 px-5 pt-2"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            <button
              type="button"
              onClick={dismiss}
              className="flex h-[52px] w-full items-center justify-center rounded-full bg-ink text-[16px] font-semibold text-canvas"
            >
              {value.length > 0 ? t("Done") : t("Close")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// The chip cloud a language-order row shows above its "Add languages" button.
export function LangChips({ value, onRemove }: { value: string[]; onRemove: (lang: string) => void }) {
  const t = useT();
  if (value.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-4 pb-3.5">
      {value.map((lang, i) => (
        <button
          key={lang}
          type="button"
          onClick={() => onRemove(lang)}
          aria-label={t("Remove {name}", { name: lang })}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-3 text-[12.5px] font-semibold text-accent transition-colors active:bg-accent/25"
        >
          <span className="font-mono text-[10.5px] tabular-nums opacity-70">{i + 1}</span>
          {lang !== "Original" && (
            <Flag language={lang} code={normalizeLang(lang)} size="sm" showLabel={false} />
          )}
          <span>{lang === "Original" ? t("Original") : lang}</span>
          <X size={11} strokeWidth={2.4} className="opacity-70" />
        </button>
      ))}
    </div>
  );
}

// Desktop settings panels draw their rows with the hset-* grid, whose sizes
// come from custom properties that only `.harbor-settings-shell` sets. Wrapping
// a desktop panel here restores those tokens at phone values, stacks anything
// that would squeeze the label column, and stands in for the two contexts the
// desktop shell provides: sub-tabs (rendered as a segmented pill above the
// panel) and page actions (rendered as pills below it).
const PHONE_HSET_VARS = {
  "--hset-row-min-h": "60px",
  "--hset-row-pad-block": "14px",
  "--hset-row-pad-inline": "0px",
  "--hset-row-gutter": "14px",
  "--hset-row-lead-gap": "12px",
  "--hset-row-text-gap": "4px",
  "--hset-row-span-gap": "12px",
  "--hset-row-radius": "10px",
  "--hset-lead-box": "22px",
  "--hset-desc-measure": "100%",
  "--hset-title-size": "15.5px",
  "--hset-title-lh": "22px",
  "--hset-desc-size": "13px",
  "--hset-desc-lh": "19px",
  "--hset-note-size": "12.5px",
  "--hset-note-lh": "18px",
  "--hset-ctl-h": "44px",
  "--hset-ctl-max": "56%",
  "--hset-hairline": "1px",
  "--hset-group-gap": "18px",
  "--hset-nav-label-h": "30px",
} as CSSProperties;

export function DesktopPanel({
  onJump,
  hideTabs,
  children,
}: {
  onJump?: (section: SectionId, tab?: string) => void;
  // Sub-tabs that only do something on the desktop build (the storage panel's
  // video-file tab talks to the desktop torrent engine) are left out of the pill.
  hideTabs?: string[];
  children: ReactNode;
}) {
  const [reg, setReg] = useState<SubTabReg>(null);
  const [actions, setActions] = useState<PageActionReg>(null);
  const subTabs = useMemo(() => ({ section: "phone", reg, setReg }), [reg]);
  const pageActions = useMemo(() => ({ reg: actions, setReg: setActions }), [actions]);
  const active = useMemo(
    () => ({
      setActive: (s: SectionId) => onJump?.(s),
      openPage: (s: SectionId, tab?: string) => onJump?.(s, tab),
    }),
    [onJump],
  );
  return (
    <SettingsActiveContext.Provider value={active}>
      <SubTabsProvider value={subTabs}>
        <PageActionsProvider value={pageActions}>
          {reg && reg.tabs.filter((tab) => !hideTabs?.includes(tab.id)).length > 1 && (
            <div className="mb-5">
              <Segmented
                value={reg.value}
                options={reg.tabs
                  .filter((tab) => !hideTabs?.includes(tab.id))
                  .map((tab) => ({ value: tab.id, label: tab.label }))}
                onChange={(id) => reg.onChange(id)}
              />
            </div>
          )}
          <div
            className="harbor-settings-shell hset-form-page mt-1 [&_.hset-brandgrid]:!grid-cols-1 [&_.hset-osslist]:!grid-cols-1 [&_.hset-row-control]:!max-w-full [&_.hset-workbench-preview]:overflow-x-auto"
            style={PHONE_HSET_VARS}
          >
            {children}
          </div>
          {actions && actions.actions.length > 0 && (
            <div className="mt-6 flex flex-col gap-2">
              {actions.note && <Note>{actions.note}</Note>}
              <div className="flex flex-wrap gap-2">
                {actions.actions.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    disabled={a.disabled}
                    onClick={a.onSelect}
                    className={`flex h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold transition-transform active:scale-95 disabled:opacity-40 ${
                      a.tone === "primary"
                        ? "bg-ink text-canvas"
                        : a.tone === "danger"
                          ? "border border-danger/40 text-danger"
                          : "border border-edge-soft text-ink"
                    } ${FOCUS}`}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </PageActionsProvider>
      </SubTabsProvider>
    </SettingsActiveContext.Provider>
  );
}
