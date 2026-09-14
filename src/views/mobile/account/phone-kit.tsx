import { ChevronLeft, ChevronRight, Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { AvatarImage } from "@/components/avatar-image";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { useKeyboardInset } from "../use-keyboard-inset";
import { FOCUS, tapHaptic } from "../onboarding/ob-shared";

export { FOCUS, tapHaptic };

// One phone kit for every account surface (profile tab, profiles, trackers,
// Stremio, Harbor account, relay, legal). The desktop settings kit assumes a
// wide two-column row with hover states; these primitives are the 402pt
// equivalents: full-width 44pt rows, a sticky header with a back chevron, and
// bottom sheets that clear the keyboard.

/* A full-screen page that slides in from the right, matching mobile-settings.
   `closing` plays the reverse slide before the parent unmounts it. */
export function PhonePage({
  kicker,
  title,
  onClose,
  trailing,
  children,
  wash,
  footer,
}: {
  kicker?: string;
  title: string;
  onClose: () => void;
  trailing?: ReactNode;
  children: ReactNode;
  /** CSS color for the ambient wash at the top; defaults to the accent. */
  wash?: string;
  /** Pinned under the scroller, clear of the home indicator (a Save bar). */
  footer?: ReactNode;
}) {
  const t = useT();
  useRegisterSheet(true);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(onClose, 300);
    return () => window.clearTimeout(id);
  }, [closing, onClose]);
  const tint = wash ?? "var(--color-accent)";
  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background: `radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, ${tint} 14%, transparent), transparent 70%)`,
        }}
      />
      <header
        className="mx-auto flex w-full max-w-[680px] items-center gap-3 px-5 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          type="button"
          onClick={() => setClosing(true)}
          aria-label={t("common.back")}
          className={`-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        <div className="min-w-0 flex-1">
          {kicker && (
            <p className="truncate text-[11px] font-sans font-semibold uppercase tracking-[0.22em] text-ink-subtle">
              {kicker}
            </p>
          )}
          <h1 className="truncate font-display text-[28px] font-medium leading-none tracking-[-0.02em] text-ink">
            {title}
          </h1>
        </div>
        {trailing}
      </header>
      <div
        className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-8 overflow-y-auto px-5 pt-4"
        style={{
          paddingBottom: footer ? 24 : "calc(env(safe-area-inset-bottom, 0px) + 40px)",
        }}
      >
        {children}
      </div>
      {footer && (
        <div
          className="mx-auto flex w-full max-w-[680px] shrink-0 gap-3 border-t border-edge-soft/60 bg-canvas/95 px-5 pt-3 backdrop-blur"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}

/* Section heading plus an optional standfirst, followed by a rounded card that
   holds the rows. The same visual grammar the profile tab already uses. */
export function Group({
  title,
  note,
  children,
  trailing,
}: {
  title?: string;
  note?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5">
      {(title || note) && (
        <div className="flex flex-col gap-1.5 px-1">
          {title && (
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                {title}
              </h2>
              {trailing}
            </div>
          )}
          {note && <p className="text-[12.5px] leading-relaxed text-ink-subtle">{note}</p>}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-elevated/40">
        {children}
      </div>
    </section>
  );
}

export function Divider() {
  return <span className="mx-4 block h-px bg-edge-soft/60" />;
}

/* Interleaves dividers between the rows a group renders. */
export function Rows({ children }: { children: ReactNode[] | ReactNode }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <>
      {items.map((child, i) => (
        <div key={i}>
          {i > 0 && <Divider />}
          {child}
        </div>
      ))}
    </>
  );
}

/* `href` renders a real anchor rather than a button calling window.open. A
   programmatic open that a mobile browser does not credit as a user gesture can
   navigate the current tab instead, which is how a viewer ends up outside
   Harbor with no way back. */
export function Row({
  icon,
  label,
  sub,
  value,
  dot,
  pending,
  pendingLabel,
  badge,
  onClick,
  href,
  danger,
  trailing,
  busy,
}: {
  icon?: ReactNode;
  label: string;
  sub?: ReactNode;
  value?: string;
  dot?: "ok" | null;
  pending?: boolean;
  pendingLabel?: string;
  badge?: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  trailing?: ReactNode;
  busy?: boolean;
}) {
  const t = useT();
  const skin = `flex w-full items-center gap-4 px-4 py-4 text-start transition-colors active:bg-raised/60 ${FOCUS}`;
  const inner = (
    <>
      {icon && (
        <span className={`shrink-0 ${danger ? "text-danger" : "text-ink-muted"}`}>{icon}</span>
      )}
      {/* The label holds its width and the value absorbs the squeeze. A truncated
          label reads as broken; a truncated value (an IP, a masked key, a handle)
          still reads as a value. With a sub line the label may wrap instead. */}
      <span className={`flex min-w-0 flex-col ${sub ? "flex-1" : "shrink-0"}`}>
        <span
          className={`text-[15px] font-medium ${sub ? "" : "whitespace-nowrap"} ${
            danger ? "text-danger" : "text-ink"
          }`}
        >
          {label}
        </span>
        {sub && <span className="text-[12.5px] leading-snug text-ink-subtle">{sub}</span>}
      </span>
      {dot === "ok" && <span className="h-2 w-2 shrink-0 rounded-full bg-success" />}
      {value ? (
        <span
          dir="auto"
          className={`min-w-0 truncate text-end text-[13.5px] text-ink-subtle ${sub ? "max-w-[38%] shrink-0" : "flex-1"}`}
        >
          {value}
        </span>
      ) : sub ? null : (
        <span aria-hidden className="min-w-0 flex-1" />
      )}
      {badge && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-canvas">
          {badge}
        </span>
      )}
      {pending && (
        <span className="shrink-0 whitespace-nowrap rounded-full bg-accent/10 px-2.5 py-1 text-[11.5px] font-semibold text-accent">
          {pendingLabel ?? t("Set up")}
        </span>
      )}
      {busy && <Loader2 size={16} className="shrink-0 animate-spin text-ink-subtle" />}
      {trailing}
      {!danger && !trailing && (onClick || href) && (
        <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle dir-icon" />
      )}
    </>
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!("__TAURI_INTERNALS__" in window)) return;
          e.preventDefault();
          openUrl(href);
        }}
        className={skin}
      >
        {inner}
      </a>
    );
  }
  if (!onClick) {
    return <div className="flex w-full items-center gap-4 px-4 py-4">{inner}</div>;
  }
  return (
    <button type="button" onClick={onClick} className={skin}>
      {inner}
    </button>
  );
}

/* The ROW is the control: a full-width role=switch button whose label is its
   accessible name, so the whole 44pt strip toggles. `lockReason` renders the
   row disabled with the reason as its sub line, matching the desktop ToggleRow. */
export function ToggleRow({
  icon,
  label,
  sub,
  on,
  onChange,
  lockReason,
}: {
  icon?: ReactNode;
  label: string;
  sub?: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
  lockReason?: string;
}) {
  const disabled = !!lockReason;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (disabled) return;
        tapHaptic();
        onChange(!on);
      }}
      className={`no-press group flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors ${
        disabled ? "opacity-55" : "active:bg-raised/50"
      } ${FOCUS}`}
    >
      {icon && <span className="shrink-0 text-ink-muted">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[15px] font-medium ${on ? "text-ink" : "text-ink-muted"}`}>
          {label}
        </span>
        {(lockReason ?? sub) && (
          <span className="text-[12.5px] leading-snug text-ink-subtle">{lockReason ?? sub}</span>
        )}
      </span>
      <span
        aria-hidden
        className={`relative flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-[220ms] [transition-timing-function:var(--ease-out)] ${
          on ? "bg-accent" : "bg-raised"
        }`}
      >
        <span
          className={`absolute start-[2px] h-[27px] w-[27px] rounded-full bg-ink shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-edge transition-all duration-[220ms] [transition-timing-function:var(--ease-out)] group-active:w-[31px] ${
            on ? "translate-x-[20px] group-active:translate-x-[16px]" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

/* Segmented control that wraps into equal columns at 402pt rather than
   overflowing. Every option is its own 44pt target. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  columns,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
  columns?: number;
}) {
  const cols = columns ?? Math.min(options.length, 3);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1.5 rounded-xl bg-canvas/60 p-1.5 ring-1 ring-edge-soft/60"
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
            className={`no-press min-h-11 rounded-lg px-2 text-[13.5px] font-semibold leading-tight transition-colors ${FOCUS} ${
              active ? "bg-ink text-canvas" : "text-ink-muted active:bg-raised/60"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* A row whose control sits underneath the label instead of beside it: a
   segmented control never fits next to its label at 402pt. */
export function ControlRow({
  icon,
  label,
  sub,
  children,
}: {
  icon?: ReactNode;
  label: string;
  sub?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <div className="flex items-start gap-3.5">
        {icon && <span className="mt-0.5 shrink-0 text-ink-muted">{icon}</span>}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium text-ink">{label}</span>
          {sub && <span className="text-[12.5px] leading-snug text-ink-subtle">{sub}</span>}
        </span>
      </div>
      {children}
    </div>
  );
}

export function PillButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  busy,
  full,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
  full?: boolean;
  type?: "button" | "submit";
}) {
  const skin =
    variant === "primary"
      ? "bg-ink text-canvas"
      : variant === "danger"
        ? "border border-danger/30 bg-danger/10 text-danger"
        : "border border-edge-soft/70 bg-elevated/60 text-ink";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-[14.5px] font-semibold transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45 ${skin} ${
        full ? "w-full" : ""
      } ${FOCUS}`}
    >
      {busy && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

/* Brand logo badge, sized to sit where a SetIcon would in a Row. */
export function LogoBadge({ src, size = 22 }: { src: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]"
      style={{ width: size, height: size }}
    >
      <img src={src} alt="" draggable={false} className="h-full w-full object-contain" />
    </span>
  );
}

/* Round avatar with the profile colour as a ring. Falls back to the Harbor cat
   like the desktop tiles, never to a generic initial. */
export function AvatarDisc({
  src,
  color,
  size,
  ring = true,
  className,
}: {
  src: string | null | undefined;
  color?: string;
  size: number;
  ring?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`relative block shrink-0 overflow-hidden rounded-full bg-elevated ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        boxShadow: ring && color ? `0 0 0 3px ${color}` : undefined,
      }}
    >
      <AvatarImage src={src} className="h-full w-full object-cover" />
    </span>
  );
}

/* Bottom sheet shell: scrim, rounded top, clears the keyboard and the home
   indicator. Children scroll inside; `footer` stays pinned. */
export function BottomSheet({
  title,
  onClose,
  children,
  footer,
  ariaLabel,
}: {
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  ariaLabel?: string;
}) {
  const t = useT();
  const keyboardInset = useKeyboardInset();
  useRegisterSheet(true);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-[80] flex items-end justify-center transition-[padding] duration-150"
      style={{ paddingBottom: keyboardInset }}
    >
      <button
        type="button"
        aria-label={t("common.close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
      />
      <div
        className="relative z-10 flex min-h-0 w-full max-w-md flex-col rounded-t-[30px] border border-edge-soft/70 bg-elevated shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)]"
        style={{
          maxHeight: "calc(100% - env(safe-area-inset-top, 0px) - 16px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        {title && (
          <h3 className="shrink-0 px-6 pt-6 text-[18px] font-semibold text-ink">{title}</h3>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-1 pt-2">
          {children}
        </div>
        {footer && <div className="flex shrink-0 gap-3 px-6 pt-5">{footer}</div>}
      </div>
    </div>
  );
}

/* Cancel / confirm sheet for destructive or irreversible actions. */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  busy,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const t = useT();
  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      ariaLabel={title}
      footer={
        <>
          <PillButton full onClick={onClose}>
            {t("Cancel")}
          </PillButton>
          <PillButton full variant={danger ? "danger" : "primary"} onClick={onConfirm} busy={busy}>
            {confirmLabel}
          </PillButton>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-ink-muted">{message}</p>
    </BottomSheet>
  );
}

/* Single text field sheet: names, URLs, tokens. `secret` masks with a reveal
   toggle, matching the desktop KeyField. */
export function InputSheet({
  title,
  hint,
  logo,
  initial,
  placeholder,
  secret,
  inputMode,
  type,
  multiline,
  saveLabel,
  onSave,
  onClose,
  error,
  busy,
  autoComplete,
}: {
  title: string;
  hint?: ReactNode;
  logo?: string;
  initial: string;
  placeholder?: string;
  secret?: boolean;
  inputMode?: "text" | "decimal" | "url" | "email" | "numeric";
  type?: string;
  multiline?: boolean;
  saveLabel?: string;
  onSave: (next: string) => void;
  onClose: () => void;
  error?: string | null;
  busy?: boolean;
  autoComplete?: string;
}) {
  const t = useT();
  const [value, setValue] = useState(initial);
  const [reveal, setReveal] = useState(false);
  const field =
    "min-w-0 flex-1 bg-transparent px-3 py-3 text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none";
  return (
    <BottomSheet
      title={title}
      onClose={onClose}
      ariaLabel={title}
      footer={
        <>
          <PillButton full onClick={onClose}>
            {t("Cancel")}
          </PillButton>
          <PillButton full variant="primary" onClick={() => onSave(value)} busy={busy}>
            {saveLabel ?? t("Save")}
          </PillButton>
        </>
      }
    >
      {hint && <p className="text-[13px] leading-relaxed text-ink-muted">{hint}</p>}
      <div
        className={`mt-4 flex min-h-[58px] rounded-2xl border bg-canvas/70 p-1.5 transition-colors focus-within:border-accent ${
          error ? "border-danger/60" : "border-edge-soft/70"
        } ${multiline ? "items-start" : "items-center"}`}
      >
        {logo && (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-raised/70 ring-1 ring-white/[0.06]">
            <img src={logo} alt="" draggable={false} className="max-h-8 max-w-8 object-contain" />
          </span>
        )}
        {multiline ? (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            rows={4}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            className={`${field} resize-none font-mono text-[13.5px] leading-relaxed`}
          />
        ) : (
          <input
            autoFocus
            type={type ?? (secret && !reveal ? "password" : "text")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete={autoComplete ?? "off"}
            spellCheck={false}
            inputMode={inputMode ?? "text"}
            className={field}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave(value);
            }}
          />
        )}
        {secret && !multiline && (
          <button
            type="button"
            aria-label={reveal ? t("Hide") : t("Reveal")}
            onClick={() => setReveal((r) => !r)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-subtle transition-colors active:bg-raised/60 active:text-ink"
          >
            {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12.5px] font-medium text-danger">{error}</p>}
    </BottomSheet>
  );
}

/* Field styling for inline forms (sign-in, Letterboxd). 16px keeps iOS from
   zooming the page on focus. */
export const FIELD =
  "h-12 w-full min-w-0 rounded-xl border border-edge bg-canvas px-4 text-[16px] text-ink outline-none transition-colors focus:border-ink-subtle disabled:opacity-50";

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] leading-snug text-ink-subtle">{hint}</span>}
    </label>
  );
}

/* Inline notice inside a card, for errors and results. */
export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "ok" | "danger";
  children: ReactNode;
}) {
  const skin =
    tone === "ok"
      ? "bg-success/10 text-success"
      : tone === "danger"
        ? "bg-danger/12 text-danger"
        : "bg-raised/60 text-ink-muted";
  return (
    <p className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${skin}`}>{children}</p>
  );
}

/* "Authorized 3 days ago" style relative age, shared by the tracker pages.
   Trakt stores seconds, the others milliseconds; callers normalise. */
export function sessionAge(
  t: (key: string, vars?: Record<string, string | number>) => string,
  createdAtMs?: number,
): string {
  if (!createdAtMs) return "";
  const days = Math.floor((Date.now() - createdAtMs) / 86400000);
  if (days < 1) return t("today");
  if (days < 30) return days === 1 ? t("{n} day ago", { n: days }) : t("{n} days ago", { n: days });
  const months = Math.floor(days / 30);
  return months === 1 ? t("{n} month ago", { n: months }) : t("{n} months ago", { n: months });
}
