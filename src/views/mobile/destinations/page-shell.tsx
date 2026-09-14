import { ChevronLeft, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { HarborLoader } from "@/components/harbor-loader";
import { Poster, usePosterChain } from "@/components/poster";
import { ScrollRootContext } from "@/components/row";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { MOBILE_INTENT_EVENT } from "../mobile-intent";
import { useRegisterSheet } from "../mobile-sheet-lock";

// Shared chrome for the desktop destinations that the phone did not have. Every
// page is a full-screen sheet that slides in from the side, carries the desktop
// bespoke icon next to its title, honours the safe areas, and publishes its own
// scroller so MobileCatalogGrid can virtualize against it. The pieces below are
// the same kit the settings and profile sheets use so the new pages read as one
// family with the rest of the phone.

export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Chips render at 36px so a row of them stays light, and grow their hit area to
// the 44pt floor through a pseudo element instead of extra height.
const HIT = "relative after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']";

// Destinations are portaled to the body so they cover the tab bar no matter
// where the navigation mounts them. The shared detail page portals there too,
// at z-50, and every destination opens titles in it, so a page has to sit below
// that layer or the detail would open behind it. 45 clears the shell (z-30) and
// stays under the detail, the status bar scrim (65), the picker and the player.
export const PAGE_LAYER = 45;

// Lets a nested page (a series screen inside Playlists, a person inside People)
// close the whole destination when it is asked to, without threading a callback
// through every level.
const PageCloseContext = createContext<() => void>(() => {});
export function usePageClose() {
  return useContext(PageCloseContext);
}

export function DestinationPage({
  kicker,
  title,
  icon,
  onBack,
  actions,
  children,
  tint = false,
  padded = true,
  scrollKey,
  layer = PAGE_LAYER,
  hidden = false,
}: {
  kicker?: string;
  title: string;
  icon?: ReactNode;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
  // A faint accent wash under the header, like the settings sheet.
  tint?: boolean;
  // Pages that lay out their own gutters (grids with px-4) turn this off.
  padded?: boolean;
  // Changing the key scrolls back to the top, used when a page swaps its body.
  scrollKey?: string;
  // Stacking layer on the body. Only the person page, which also opens on top
  // of a detail page, raises it.
  layer?: number;
  // Keeps the page mounted (scroll, loaded rails) while a detail it opened is
  // the visible screen.
  hidden?: boolean;
}) {
  const t = useT();
  useRegisterSheet(true);
  const [closing, setClosing] = useState(false);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onBack, 300);
    return () => window.clearTimeout(timer);
  }, [closing, onBack]);

  useEffect(() => {
    scrollEl?.scrollTo({ top: 0 });
  }, [scrollKey, scrollEl]);

  // A cross-surface intent ("open addons", "open settings") switches the tab
  // underneath this page. Standing down here keeps the page from sitting on top
  // of the tab the intent just opened, the same way the detail page does.
  useEffect(() => {
    const onIntent = () => setClosing(true);
    window.addEventListener(MOBILE_INTENT_EVENT, onIntent);
    return () => window.removeEventListener(MOBILE_INTENT_EVENT, onIntent);
  }, []);

  const node = (
    <PageCloseContext.Provider value={() => setClosing(true)}>
      <div
        className={`fixed inset-0 flex flex-col bg-canvas ${
          closing
            ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
            : "animate-slide-from-right"
        } ${hidden ? "pointer-events-none invisible" : ""}`}
        style={{ ...MOBILE_SAFE_X, zIndex: layer }}
        aria-hidden={hidden ? true : undefined}
      >
        {tint && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
            style={{
              background:
                "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
            }}
          />
        )}
        <header
          className="flex shrink-0 items-center gap-2 px-3 pb-2"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
        >
          <button
            type="button"
            onClick={() => setClosing(true)}
            aria-label={t("Back")}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
          >
            <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
          </button>
          {icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-ink ring-1 ring-edge-soft/60">
              {icon}
            </span>
          )}
          <div className="min-w-0 flex-1 ps-1">
            {kicker && (
              <p className="truncate text-[10.5px] font-sans font-semibold uppercase tracking-[0.22em] text-ink-subtle">
                {kicker}
              </p>
            )}
            <h1 className="truncate font-display text-[24px] font-medium leading-tight tracking-[-0.02em] text-ink">
              {title}
            </h1>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
        <div
          ref={setScrollEl}
          className={`min-h-0 flex-1 overflow-y-auto overscroll-y-contain ${padded ? "px-4" : ""}`}
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
        >
          <ScrollRootContext.Provider value={scrollEl}>{children}</ScrollRootContext.Provider>
        </div>
      </div>
    </PageCloseContext.Provider>
  );

  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

// A second-level page pushed on top of a destination (a series, a person, a
// collection). Same slide, same header, but the back chevron only pops this
// layer. It renders inside the destination's stacking context, so a detail page
// opened from here still lands above it.
export function SubPage({
  title,
  kicker,
  onBack,
  actions,
  children,
  padded = true,
  hero,
}: {
  title: string;
  kicker?: string;
  onBack: () => void;
  actions?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  // Full-bleed artwork above the gutters (a collection cover, a person's photo).
  hero?: ReactNode;
}) {
  const t = useT();
  const [closing, setClosing] = useState(false);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onBack, 300);
    return () => window.clearTimeout(timer);
  }, [closing, onBack]);
  return (
    <div
      className={`fixed inset-0 z-[72] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <header
        className="flex shrink-0 items-center gap-2 px-3 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      >
        <button
          type="button"
          onClick={() => setClosing(true)}
          aria-label={t("Back")}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        <div className="min-w-0 flex-1 ps-1">
          {kicker && (
            <p className="truncate text-[10.5px] font-sans font-semibold uppercase tracking-[0.22em] text-ink-subtle">
              {kicker}
            </p>
          )}
          <h1 className="truncate font-display text-[22px] font-medium leading-tight tracking-[-0.02em] text-ink">
            {title}
          </h1>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      <div
        ref={setScrollEl}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >
        {hero}
        <div className={padded ? "px-4" : ""}>
          <ScrollRootContext.Provider value={scrollEl}>{children}</ScrollRootContext.Provider>
        </div>
      </div>
    </div>
  );
}

// The detail page defines its own sheet keyframes inside its stylesheet, which
// is only injected while a detail is mounted, so these pages carry their own.
const SHEET_CSS = `
@keyframes hd-sheet-in { from { transform: translate3d(0, 100%, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes hd-fade-in { from { opacity: 0; } to { opacity: 1; } }
.hd-sheet-in { animation: hd-sheet-in 320ms var(--ease-out) both; }
.hd-fade-in { animation: hd-fade-in 200ms var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  .hd-sheet-in, .hd-fade-in { animation: none; }
}
`;

// Bottom sheet for pickers and day lists. Scrim tap and the grabber close it.
export function BottomSheet({
  title,
  subtitle,
  onClose,
  children,
  actions,
  tall = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  tall?: boolean;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[75] flex flex-col justify-end" role="dialog" aria-modal="true">
      <style>{SHEET_CSS}</style>
      <button
        type="button"
        aria-label={t("Close")}
        onClick={onClose}
        className="hd-fade-in absolute inset-0 bg-canvas/70 backdrop-blur-sm"
      />
      <div
        className={`hd-sheet-in relative flex ${tall ? "max-h-[88vh]" : "max-h-[72vh]"} flex-col rounded-t-[22px] border-t border-edge-soft bg-elevated shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.7)]`}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <span aria-hidden className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-ink/20" />
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3">
          <div className="min-w-0">
            <h2 className="truncate font-display text-[20px] font-medium tracking-tight text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {actions}
            <button
              type="button"
              onClick={onClose}
              aria-label={t("Close")}
              className="-me-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-subtle"
            >
              <X size={18} strokeWidth={2.2} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function Chip({
  label,
  active,
  onClick,
  icon,
  count,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: ReactNode;
  count?: number | string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      className={`${HIT} flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-40 ${
        active ? "bg-ink text-canvas" : "bg-elevated text-ink-muted ring-1 ring-edge-soft/70"
      }`}
    >
      {icon}
      {label}
      {count != null && (
        <span className={`text-[11px] tabular-nums ${active ? "text-canvas/65" : "text-ink-subtle"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// Horizontal chip strip that bleeds to the page edges so the last chip can
// scroll fully into view, with the standard 16px gutter kept at rest.
export function ChipRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ id: T; label: string; icon?: ReactNode; count?: number }>;
}) {
  return (
    <div className="flex h-11 items-center gap-0.5 rounded-xl border border-edge-soft/55 bg-elevated p-1">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={`flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold transition-colors ${
              active ? "bg-ink text-canvas" : "text-ink-muted"
            }`}
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
            {o.count != null && o.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10.5px] tabular-nums ${
                  active ? "bg-canvas/25" : "bg-canvas/70 text-ink-subtle"
                }`}
              >
                {o.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex h-11 items-center gap-2.5 rounded-xl border border-edge-soft/55 bg-elevated px-3.5">
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="h-[15px] w-[15px] shrink-0 text-ink-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        enterKeyHint="search"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink-subtle focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={t("Clear")}
          className="-me-2 flex h-11 w-11 items-center justify-center text-ink-subtle"
        >
          <X size={16} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}

export function SectionHead({
  title,
  count,
  leading,
  trailing,
}: {
  title: string;
  count?: number | string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2.5">
      {leading}
      <h2 className="min-w-0 flex-1 truncate font-display text-[19px] font-medium tracking-[-0.01em] text-ink">
        {title}
        {count != null && (
          <span className="ms-2 text-[12.5px] font-sans font-medium tabular-nums text-ink-subtle">
            {count}
          </span>
        )}
      </h2>
      {trailing}
    </div>
  );
}

export function EmptyBlock({
  icon,
  title,
  body,
  action,
  tone = "default",
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center ${
        tone === "danger"
          ? "border-rose-300/30 bg-rose-400/[0.06]"
          : "border-edge-soft bg-canvas/30"
      }`}
    >
      {icon && (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-elevated/70 text-ink-subtle ring-1 ring-edge-soft/60">
          {icon}
        </span>
      )}
      <h3 className="font-display text-[19px] font-medium leading-tight text-ink">{title}</h3>
      {body && <p className="max-w-xs text-[13.5px] leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  tone = "ink",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "ink" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`no-press flex h-11 items-center justify-center gap-2 rounded-full px-6 text-[14px] font-semibold transition-transform active:scale-95 disabled:opacity-40 ${
        tone === "accent" ? "bg-accent text-white" : "bg-ink text-canvas"
      }`}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
        active ? "text-accent" : "text-ink-muted"
      } ${FOCUS}`}
    >
      {children}
    </button>
  );
}

export function LoaderBlock({ caption }: { caption?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <HarborLoader size="md" />
      {caption && <p className="text-[13px] text-ink-subtle">{caption}</p>}
    </div>
  );
}

export function PosterGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="harbor-skeleton aspect-[2/3] rounded-lg bg-elevated/40" />
      ))}
    </div>
  );
}

export function RailSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="h-5 w-40 animate-pulse rounded-full bg-elevated/60" />
      <div className="-mx-4 flex gap-3 overflow-hidden px-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-[2/3] w-[124px] shrink-0 animate-pulse rounded-lg bg-elevated/40" />
        ))}
      </div>
    </div>
  );
}

// Grid cell for a title: poster through the RPDB/localized chain, two-line name.
export function MetaTile({
  meta,
  onOpen,
  badge,
  caption,
}: {
  meta: Meta;
  onOpen?: (m: Meta) => void;
  badge?: ReactNode;
  caption?: string;
}) {
  const { settings } = useSettings();
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  const body = (
    <>
      <Poster
        src={src}
        onError={onError}
        seed={meta.id}
        ratio="portrait"
        lazy="release"
        className="rounded-lg ring-1 ring-white/[0.06]"
      >
        {badge}
      </Poster>
      <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">{meta.name}</p>
      {caption && <p className="line-clamp-1 text-[11px] text-ink-subtle">{caption}</p>}
    </>
  );
  if (!onOpen) return <div className="w-full min-w-0">{body}</div>;
  return (
    <button type="button" onClick={() => onOpen(meta)} className="w-full min-w-0 text-start">
      {body}
    </button>
  );
}

// Horizontal rail of grid tiles, for sections that are not plain Meta rails.
export function TileRail({ title, children, trailing }: { title: string; children: ReactNode; trailing?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 [content-visibility:auto] [contain-intrinsic-size:auto_260px]">
      <SectionHead title={title} trailing={trailing} />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

// Fires once when the sentinel scrolls near, for paged lists.
export function LoadMoreSentinel({ onLoadMore }: { onLoadMore: () => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const root = useContext(ScrollRootContext);
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { root: root ?? null, rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, root, onLoadMore]);
  return <div ref={setEl} aria-hidden className="h-1 w-full" />;
}
