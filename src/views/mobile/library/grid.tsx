import type { ReactNode } from "react";
import type { Meta } from "@/lib/cinemeta";
import { Poster, usePosterChain } from "@/components/poster";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { TILE_CULL } from "../tile-cull";

// Grid furniture shared by every library tab on the phone. One place for the
// column rules keeps the poster rhythm identical whether a grid shows the
// Stremio watchlist, a Trakt section, or a custom list.

export const GRID_COLS =
  "grid grid-cols-3 [@media(max-height:500px)]:grid-cols-6 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5 [@media(min-width:1000px)_and_(min-height:600px)]:grid-cols-6 gap-x-3 gap-y-4";

export function PhoneGrid({ children }: { children: ReactNode }) {
  return <div className={GRID_COLS}>{children}</div>;
}

export function GridTile({
  meta,
  onOpen,
  sub,
}: {
  meta: Meta;
  onOpen: (m: Meta) => void;
  sub?: string;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  return (
    <button
      type="button"
      onClick={() => onOpen(meta)}
      aria-label={t("View {title}", { title: meta.name })}
      className={`text-start ${TILE_CULL}`}
    >
      <Poster
        src={src}
        onError={onError}
        seed={meta.id}
        ratio="portrait"
        lazy
        className="rounded-[12px]"
      />
      {meta.name && (
        <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">
          {meta.name}
        </p>
      )}
      {sub && <p className="truncate text-[11px] text-ink-subtle">{sub}</p>}
    </button>
  );
}

export function SkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className={`harbor-skeleton ${GRID_COLS}`} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="w-full rounded-[12px] bg-elevated/70" style={{ paddingTop: "150%" }} />
          <div className="h-3 w-3/4 rounded bg-elevated/60" />
        </div>
      ))}
    </div>
  );
}

// Stacked this runs about 146pt tall, and a landscape phone leaves roughly 127pt
// between the sort row and the floating bars, so the art sat behind the tab bar.
// On a short viewport it lies on its side instead, which halves the height.
export function EmptyState({
  art,
  title,
  body,
  action,
}: {
  art: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-4 pt-14 text-center [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:justify-center [@media(max-height:500px)]:pt-6 [@media(max-height:500px)]:text-start">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-elevated/40 text-ink-subtle ring-1 ring-edge-soft [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:w-12">
        {art}
      </span>
      <div className="flex flex-col items-center gap-1.5 [@media(max-height:500px)]:items-start">
        <h2 className="font-display text-[18px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
        <p className="max-w-[270px] text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function SectionHeading({
  title,
  count,
  trailing,
}: {
  title: string;
  count?: number | string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-subtle">
        {title}
        {count !== undefined && <span className="ms-1.5 tabular-nums text-ink-subtle/70">{count}</span>}
      </h3>
      {trailing}
    </div>
  );
}

export function StatusNote({
  tone = "muted",
  children,
}: {
  tone?: "muted" | "error";
  children: ReactNode;
}) {
  if (tone === "error") {
    return (
      <p className="rounded-xl bg-danger/15 px-3.5 py-2.5 text-[12.5px] text-danger ring-1 ring-danger/30">
        {children}
      </p>
    );
  }
  return <p className="px-1 text-[13px] text-ink-muted">{children}</p>;
}

export function PillButton({
  active,
  onClick,
  disabled,
  children,
  ariaLabel,
}: {
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-[color,background-color,transform] active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none ${
        active ? "bg-ink text-canvas" : "bg-elevated/60 text-ink-muted ring-1 ring-edge-soft/60"
      }`}
    >
      {children}
    </button>
  );
}

// Horizontal chip row that scrolls instead of wrapping so a long status set
// never pushes the grid down on a 402pt screen.
export function ChipRow<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-[color,background-color,transform] active:scale-[0.97] motion-reduce:transition-none ${
              on ? "bg-ink text-canvas" : "bg-elevated/60 text-ink-muted ring-1 ring-edge-soft/60"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`tabular-nums ${on ? "text-canvas/70" : "text-ink-subtle"}`}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type TypeKey = "all" | "movie" | "series";

export function TypePills({
  type,
  onType,
  counts,
}: {
  type: TypeKey;
  onType: (t: TypeKey) => void;
  counts: { all: number; movie: number; series: number };
}) {
  const t = useT();
  return (
    <ChipRow
      value={type}
      onChange={onType}
      ariaLabel={t("Filter by type")}
      options={[
        { value: "all", label: t("All"), count: counts.all },
        { value: "movie", label: t("Movies"), count: counts.movie },
        { value: "series", label: t("Shows"), count: counts.series },
      ]}
    />
  );
}
