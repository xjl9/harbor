import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { SetIcon } from "@/views/settings/set-icon";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { useKeyboardInset } from "../use-keyboard-inset";

// Shared phone kit for the addons and plugins surfaces. The settings and profile
// pages keep their own private copies of these primitives; this file exists so
// every addon sheet reads the same way without reaching into files other areas
// own. Every tappable is at least 44pt tall, every page is safe-area aware.

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Light-impact feedback, gated: navigator.vibrate is a no-op on desktop and iOS
// (no vibration API in WKWebView) and fires on Android touch surfaces.
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

// Plays the slide-out before unmounting so the back gesture feels like a page
// leaving rather than a switch flipping.
export function useCloseAnim(onClose: () => void): { closing: boolean; close: () => void } {
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(onClose, 300);
    return () => window.clearTimeout(id);
  }, [closing, onClose]);
  return { closing, close: () => setClosing(true) };
}

// Full-screen phone page: sticky header with a back chevron, optional art beside
// the title, optional trailing control, scrolling body. `layer` picks the
// z-index so a detail page can stack above the addons page it came from.
export function Page({
  kicker,
  title,
  art,
  trailing,
  layer = "base",
  onClose,
  children,
}: {
  kicker?: string;
  title: string;
  art?: ReactNode;
  trailing?: ReactNode;
  layer?: "base" | "over";
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useT();
  useRegisterSheet(true);
  const { closing, close } = useCloseAnim(onClose);
  return (
    <div
      className={`fixed inset-0 flex flex-col bg-canvas ${layer === "over" ? "z-[72]" : "z-[70]"} ${
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
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />
      <header
        className="mx-auto flex w-full max-w-[680px] items-center gap-2 px-5 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("Back")}
          className={`-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <SetIcon name="ChevronLeft" size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        {art && <span className="flex h-9 w-9 shrink-0 items-center justify-center text-ink">{art}</span>}
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
        {trailing && <div className="flex shrink-0 items-center gap-1">{trailing}</div>}
      </header>
      <div
        className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto overscroll-contain px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >
        {children}
      </div>
    </div>
  );
}

// The department headline idiom the phone settings page uses: kicker, serif
// title on a hairline rule, mono folio, standfirst. Repeating it here keeps the
// addons page in the same family instead of inventing a second grammar.
export function Department({
  index,
  first,
  kicker,
  folio,
  title,
  standfirst,
  trailing,
  children,
}: {
  index: number;
  first?: boolean;
  kicker: string;
  folio: string;
  title: string;
  standfirst?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={`harbor-rise ${first ? "mt-2" : "mt-10"}`}
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
        <h2 className="min-w-0 shrink font-display text-[21px] font-medium tracking-[-0.01em] text-ink">
          {title}
        </h2>
        <span className="h-px min-w-4 flex-1 bg-edge-soft" />
        {trailing}
      </div>
      {standfirst && (
        <p className="mt-3 max-w-[38ch] text-[13px] leading-relaxed text-ink-muted">{standfirst}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Bordered list container. Children are separated by inset hairlines.
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/40 [&>*+*]:border-t [&>*+*]:border-edge-soft/60 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

// Label-and-control row that navigates or performs an action.
export function Row({
  icon,
  label,
  sub,
  value,
  badge,
  onClick,
  chevron = true,
  danger,
  disabled,
}: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  value?: string;
  badge?: string;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`no-press flex min-h-[52px] w-full items-center gap-3.5 px-4 py-3 text-start transition-colors active:bg-raised/60 disabled:opacity-50 ${FOCUS}`}
    >
      {icon && <span className={`shrink-0 ${danger ? "text-danger" : "text-ink-muted"}`}>{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-[15px] font-medium ${danger ? "text-danger" : "text-ink"}`}>
          {label}
        </span>
        {sub && <span className="text-[12.5px] leading-snug text-ink-subtle">{sub}</span>}
      </span>
      {value && <span className="max-w-[45%] shrink-0 truncate text-end text-[13.5px] text-ink-subtle">{value}</span>}
      {badge && (
        <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold tabular-nums text-canvas">
          {badge}
        </span>
      )}
      {chevron && !danger && (
        <SetIcon name="ChevronRight" size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle dir-icon" />
      )}
    </button>
  );
}

// The whole row is the switch, so the label is its accessible name and there is
// no dead area between the text and the knob.
export function ToggleRow({
  label,
  sub,
  on,
  onChange,
  locked,
  icon,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
  icon?: ReactNode;
}) {
  const effective = on && !locked;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={effective}
      aria-label={label}
      disabled={locked}
      onClick={() => {
        if (locked) return;
        tapHaptic();
        onChange(!on);
      }}
      className={`no-press group flex min-h-[52px] w-full items-center gap-3.5 px-4 py-3 text-start transition-colors active:bg-raised/50 disabled:opacity-60 ${FOCUS}`}
    >
      {icon && <span className="shrink-0 text-ink-muted">{icon}</span>}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`text-[15px] font-medium ${effective ? "text-ink" : "text-ink-muted"}`}>{label}</span>
        {sub && <span className="mt-0.5 text-[12.5px] leading-snug text-ink-subtle">{sub}</span>}
      </span>
      <Knob on={effective} />
    </button>
  );
}

export function Knob({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-[220ms] [transition-timing-function:var(--ease-out)] ${
        on ? "bg-accent" : "bg-raised"
      }`}
    >
      <span
        className={`absolute start-[2px] h-[27px] w-[27px] rounded-full bg-ink shadow-[0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-edge transition-all duration-[220ms] [transition-timing-function:var(--ease-out)] group-active:w-[31px] ${
          on ? "translate-x-[20px] group-active:translate-x-[16px] rtl:-translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </span>
  );
}

export function Chip({ accent, children }: { accent?: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[20px] shrink-0 items-center rounded-[6px] px-1.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.06em] ${
        accent ? "bg-accent-soft text-accent" : "bg-raised text-ink-subtle"
      }`}
    >
      {children}
    </span>
  );
}

type PillVariant = "primary" | "ghost" | "danger" | "success";

export function Pill({
  variant = "ghost",
  small,
  disabled,
  onClick,
  icon,
  children,
  className,
  ariaLabel,
}: {
  variant?: PillVariant;
  small?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const skin =
    variant === "primary"
      ? "bg-ink text-canvas"
      : variant === "danger"
        ? "bg-danger/12 text-danger ring-1 ring-danger/30"
        : variant === "success"
          ? "bg-transparent text-success"
          : "bg-elevated/70 text-ink-muted ring-1 ring-edge-soft";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`no-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold transition-transform active:scale-95 disabled:opacity-40 ${
        small ? "h-9 px-3.5 text-[13px]" : "h-11 px-4 text-[13.5px]"
      } ${skin} ${FOCUS} ${className ?? ""}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  name,
  label,
  onClick,
  disabled,
  danger,
  spin,
  size = 19,
}: {
  name: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  spin?: boolean;
  size?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`no-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors active:bg-raised/60 disabled:opacity-40 ${
        danger ? "text-danger/80" : "text-ink-subtle"
      } ${FOCUS}`}
    >
      <SetIcon name={spin ? "Loader2" : name} size={size} strokeWidth={2} className={spin ? "animate-spin" : undefined} />
    </button>
  );
}

// Segmented control for two or three peer views.
export function Segments<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ id: T; label: string; count?: number }>;
}) {
  return (
    <div role="tablist" className="flex gap-1 rounded-full border border-edge-soft bg-canvas/40 p-1">
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (active) return;
              tapHaptic();
              onChange(it.id);
            }}
            className={`no-press flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold transition-colors ${
              active ? "bg-ink text-canvas" : "text-ink-muted"
            } ${FOCUS}`}
          >
            <span className="truncate">{it.label}</span>
            {it.count != null && (
              <span
                className={`min-w-[1.4rem] rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                  active ? "bg-canvas/15 text-canvas" : "bg-edge text-ink-muted"
                }`}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  icon,
  children,
  focused,
}: {
  icon?: ReactNode;
  children: ReactNode;
  focused?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[48px] items-center gap-2.5 rounded-2xl border bg-elevated/40 px-3.5 transition-colors ${
        focused ? "border-ink-subtle" : "border-edge-soft/70"
      }`}
    >
      {icon && <span className="shrink-0 text-ink-subtle">{icon}</span>}
      {children}
    </div>
  );
}

export const INPUT =
  "min-w-0 flex-1 bg-transparent py-2 text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none";

export function SkeletonRows({ n = 4, h = 64 }: { n?: number; h?: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="harbor-skeleton w-full rounded-2xl border border-edge-soft/60 bg-elevated/30"
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

export function EmptyCard({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-6 py-8 text-center">
      {icon && <span className="mb-1 text-ink-subtle">{icon}</span>}
      <p className="font-display text-[17px] font-medium text-ink">{title}</p>
      {body && <p className="max-w-[34ch] text-[13px] leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Note({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "danger" | "accent" }) {
  const color = tone === "danger" ? "text-danger" : tone === "accent" ? "text-accent" : "text-ink-muted";
  return <p className={`px-1 text-[12.5px] leading-relaxed ${color}`}>{children}</p>;
}

// Bottom sheet for confirmations, action lists and short forms. Bound against
// the keyboard inset so a focused field never hides the actions.
export function BottomSheet({
  title,
  sub,
  onClose,
  actions,
  children,
}: {
  title?: string;
  sub?: string;
  onClose: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const t = useT();
  useRegisterSheet(true);
  const keyboardInset = useKeyboardInset();
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 280);
  }, [onClose]);
  const open = entered && !leaving;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center transition-[padding] duration-150"
      style={{ paddingBottom: keyboardInset }}
    >
      <button
        type="button"
        aria-label={t("Close")}
        onClick={dismiss}
        className={`no-press absolute inset-0 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        style={{ background: "oklch(0.12 0.006 48 / 0.62)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative z-10 flex max-h-[calc(100%-env(safe-area-inset-top,0px)-12px)] w-full max-w-md flex-col rounded-t-3xl border border-edge bg-elevated shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)] transition-transform duration-300 [transition-timing-function:var(--ease-out)] ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink/20" />
          {title && <h3 className="font-display text-[19px] font-medium text-ink">{title}</h3>}
          {sub && <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{sub}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3">{children}</div>
        {actions && <div className="flex shrink-0 flex-wrap justify-end gap-2 px-5 pt-4">{actions}</div>}
      </div>
    </div>
  );
}

// Two-step destructive confirm as a sheet, so a thumb slip on a row never
// removes anything.
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  busy,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  busy?: boolean;
}) {
  const t = useT();
  return (
    <BottomSheet
      title={title}
      sub={body}
      onClose={onClose}
      actions={
        <>
          <Pill onClick={onClose} disabled={busy}>
            {t("Cancel")}
          </Pill>
          <Pill variant="danger" onClick={onConfirm} disabled={busy} icon={busy ? <SetIcon name="Loader2" size={15} className="animate-spin" /> : undefined}>
            {confirmLabel}
          </Pill>
        </>
      }
    />
  );
}

export type ToastInfo = { kind: "ok" | "error"; text: string };

export function useToast(): { toast: ToastInfo | null; show: (kind: "ok" | "error", text: string) => void } {
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );
  const show = useCallback((kind: "ok" | "error", text: string) => {
    if (timer.current != null) window.clearTimeout(timer.current);
    setToast({ kind, text });
    timer.current = window.setTimeout(() => setToast(null), kind === "error" ? 5000 : 2600);
  }, []);
  return { toast, show };
}

export function ToastHost({ toast }: { toast: ToastInfo | null }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-5"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
    >
      <div
        className={`harbor-pop flex max-w-full items-center gap-2 rounded-full border px-4 py-2.5 text-[13.5px] font-medium shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md ${
          toast.kind === "error"
            ? "border-danger/30 bg-danger/15 text-danger"
            : "border-edge-soft bg-elevated/95 text-ink"
        }`}
      >
        <SetIcon name={toast.kind === "error" ? "AlertCircle" : "Check"} size={15} strokeWidth={2.4} />
        <span className="truncate">{toast.text}</span>
      </div>
    </div>
  );
}
