import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { SHEET_EXIT_CSS, useSheetPresence } from "../remote-extras";
import { useKeyboardInset } from "../use-keyboard-inset";

// Phone page and sheet primitives for the library and downloads surfaces. They
// follow the Settings page (fixed root, back chevron, capped centred column) and
// the renderer sheet (scrim, grabber, slide-up panel) so every new surface in
// this area reads like the rest of the shell instead of like a desktop modal.

const SHEET_IN_CSS = `
@keyframes ml-sheet-in {
  from { transform: translateY(24px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
.ml-sheet-in { animation: ml-sheet-in 300ms var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  .ml-sheet-in { animation: none; }
}
`;

// A page unmounts only after its exit transition has played, otherwise the
// screen underneath pops in mid-slide. The callback lives in a ref so an inline
// arrow from the parent does not restart the timer on every render.
export function usePhonePageClose(onClosed: () => void): {
  closing: boolean;
  requestClose: () => void;
} {
  const [closing, setClosing] = useState(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(() => onClosedRef.current(), 300);
    return () => window.clearTimeout(id);
  }, [closing]);
  return { closing, requestClose: () => setClosing(true) };
}

export function PhonePage({
  closing,
  onBack,
  eyebrow,
  title,
  trailing,
  z = "z-50",
  children,
}: {
  closing: boolean;
  onBack: () => void;
  eyebrow?: string;
  title: string;
  trailing?: ReactNode;
  // MobileDetail sits at z-50, so a page that can open a title must sit at the
  // same level and rely on DOM order; sheets hosted under Profile use z-[70].
  z?: string;
  children: ReactNode;
}) {
  useRegisterSheet(true);
  const t = useT();
  return (
    <div
      className={`fixed inset-0 ${z} flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <header
        className="mx-auto flex w-full max-w-[680px] items-center gap-2 px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label={t("Back")}
          className="-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors active:bg-raised/60"
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-subtle">
              {eyebrow}
            </p>
          )}
          <h1 className="truncate font-display text-[26px] font-medium leading-tight tracking-[-0.02em] text-ink">
            {title}
          </h1>
        </div>
        {trailing}
      </header>
      <div
        className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-5 overflow-y-auto overscroll-y-contain px-5 pt-1"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >
        {children}
      </div>
    </div>
  );
}

export function PhoneSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  z = "z-[80]",
  keyboard = false,
  tall = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  z?: string;
  // Sheets with text fields shrink above the keyboard so the title and the
  // action row stay reachable on a short screen.
  keyboard?: boolean;
  tall?: boolean;
}) {
  const { render, leaving } = useSheetPresence(open);
  const inset = useKeyboardInset();
  useRegisterSheet(render);
  if (!render) return null;
  return (
    <div
      className={`fixed inset-0 ${z} flex flex-col justify-end bg-black/60 backdrop-blur-sm ${
        leaving ? "harbor-sheet-scrim-out" : "animate-fade-in"
      }`}
      style={{ paddingBottom: keyboard ? inset : 0 }}
      onClick={onClose}
    >
      <style>{SHEET_EXIT_CSS + SHEET_IN_CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`mx-auto flex min-h-0 w-full max-w-md flex-col rounded-t-[28px] border-t border-edge-soft/60 bg-elevated shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.7)] ${
          leaving ? "harbor-sheet-panel-out" : "ml-sheet-in"
        }`}
        style={{
          maxHeight: tall ? "calc(100% - env(safe-area-inset-top, 0px) - 12px)" : "80%",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)",
        }}
      >
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-ink/20" />
        <div className="shrink-0 px-6 pb-2 pt-4">
          <h3 className="text-[18px] font-semibold text-ink">{title}</h3>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{description}</p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-1">
          {children}
        </div>
        {footer && <div className="shrink-0 px-6 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ActionRow({
  icon,
  label,
  note,
  value,
  danger,
  selected,
  disabled,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  note?: string;
  value?: string;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      role={selected === undefined ? undefined : "radio"}
      aria-checked={selected}
      className={`flex min-h-[52px] w-full items-center gap-3.5 rounded-2xl px-3 py-2 text-start transition-colors active:bg-raised/60 disabled:opacity-50 ${
        danger ? "text-danger" : selected ? "text-accent" : "text-ink"
      }`}
    >
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            danger ? "bg-danger/10 text-danger" : "bg-raised text-ink-muted"
          }`}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold">{label}</span>
        {note && <span className="truncate text-[12px] text-ink-subtle">{note}</span>}
      </span>
      {value && <span className="shrink-0 text-[13px] text-ink-subtle">{value}</span>}
      {selected && <Check size={19} strokeWidth={2.6} className="shrink-0 text-accent" />}
    </button>
  );
}

export function SheetActions({
  onCancel,
  cancelLabel,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  danger,
}: {
  onCancel: () => void;
  cancelLabel: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={onCancel}
        className="h-12 flex-1 rounded-full border border-edge-soft/70 text-[14.5px] font-semibold text-ink-muted transition-colors active:bg-raised/60"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled}
        className={`h-12 flex-1 rounded-full text-[14.5px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-50 ${
          danger ? "bg-danger/15 text-danger ring-1 ring-danger/40" : "bg-ink text-canvas"
        }`}
      >
        {primaryLabel}
      </button>
    </div>
  );
}

// 16px text keeps iOS Safari from zooming the page when a field takes focus.
export function SheetField({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
  autoFocus,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const cls =
    "w-full rounded-2xl border border-edge-soft/70 bg-canvas/70 px-4 text-[16px] text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent";
  return (
    <label className="flex flex-col gap-1.5 px-3">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          rows={3}
          className={`${cls} resize-none py-3`}
        />
      ) : (
        <input
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSubmit?.();
          }}
          className={`${cls} h-12`}
        />
      )}
    </label>
  );
}
