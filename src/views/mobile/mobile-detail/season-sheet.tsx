import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n";
import { HIDE_SCROLL, useReducedMotion, useSheetExit } from "./data";

// Mobile mirror of the desktop SeasonArcPicker / TvdbOrderPanel row data,
// rendered as a bottom sheet instead of an anchored menu.
export type SeasonSheetItem = {
  key: string;
  name: string;
  count?: number;
  year?: string;
  from?: string;
  to?: string;
  extra?: boolean;
  badge?: string;
};

function fmtMonth(d?: string): string {
  if (!d) return "";
  const date = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function isOngoing(to?: string): boolean {
  if (!to) return false;
  const d = new Date(to.length <= 10 ? `${to}T00:00:00` : to);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() > now.getFullYear() ||
    (d.getFullYear() === now.getFullYear() && d.getMonth() >= now.getMonth())
  );
}

function dateSub(item: SeasonSheetItem, ongoing: boolean, current: string): string {
  if (item.from && item.to) {
    const from = fmtMonth(item.from);
    const to = fmtMonth(item.to);
    if (from && to) {
      if (ongoing) return `${from} - ${current}`;
      return from === to ? from : `${from} - ${to}`;
    }
  }
  return item.year ?? "";
}

export function SeasonPicker({
  items,
  activeKey,
  onPick,
}: {
  items: SeasonSheetItem[];
  activeKey: string;
  onPick: (key: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const current = items.find((i) => i.key === activeKey) ?? items[0];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink ring-1 ring-edge-soft"
      >
        <span className="max-w-[42vw] truncate">{current?.name ?? t("Seasons")}</span>
        <ChevronDown size={15} strokeWidth={2.4} className="shrink-0 text-ink-subtle" />
      </button>
      {open && (
        // Picking applies immediately and the sheet dismisses itself, so the new
        // season is already rendering behind the panel on its way down.
        <SeasonSheet
          items={items}
          activeKey={activeKey}
          onPick={onPick}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function SeasonSheet({
  items,
  activeKey,
  onPick,
  onClose,
}: {
  items: SeasonSheetItem[];
  activeKey: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const reduced = useReducedMotion();
  const { leaving, close } = useSheetExit(onClose);
  const mainItems = items.filter((i) => !i.extra);
  const extraItems = items.filter((i) => i.extra);
  const pick = (key: string) => {
    onPick(key);
    close();
  };
  const sheet = (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t("Close")}
        onClick={close}
        className={`absolute inset-0 bg-black/50 ${
          reduced ? "" : leaving ? "md-sheet-fade-out" : "md-sheet-fade"
        }`}
      />
      <div
        className={`relative max-h-[70vh] overflow-y-auto rounded-t-3xl bg-canvas ${HIDE_SCROLL} ${
          reduced ? "" : leaving ? "md-sheet-out" : "md-sheet-in"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
      >
        <div className="sticky top-0 flex items-center justify-center bg-canvas pb-2 pt-3">
          <span className="h-1 w-9 rounded-full bg-edge" />
        </div>
        <div className="flex flex-col px-3 pb-2">
          <h3 className="px-3 pb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("Seasons")}
          </h3>
          {mainItems.map((item) => (
            <SheetRow key={item.key} item={item} active={item.key === activeKey} onPick={pick} />
          ))}
          {extraItems.length > 0 && (
            <p className="mt-1 border-t border-edge-soft/60 px-3 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              {t("Movies & Specials")}
            </p>
          )}
          {extraItems.map((item) => (
            <SheetRow key={item.key} item={item} active={item.key === activeKey} onPick={pick} />
          ))}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(sheet, document.body) : sheet;
}

function SheetRow({
  item,
  active,
  onPick,
}: {
  item: SeasonSheetItem;
  active: boolean;
  onPick: (key: string) => void;
}) {
  const t = useT();
  const ongoing = isOngoing(item.to);
  const sub = [
    item.count != null
      ? item.count === 1
        ? t("{n} episode", { n: item.count })
        : t("{n} episodes", { n: item.count })
      : null,
    dateSub(item, ongoing, t("Current")) || null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={() => onPick(item.key)}
      className={`flex min-h-[44px] items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start transition-colors active:bg-elevated/50 motion-reduce:transition-none ${
        active ? "text-ink" : "text-ink-muted"
      }`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className={`truncate text-[15px] ${active ? "font-semibold" : ""}`}>{item.name}</span>
          {item.badge && (
            <span className="inline-flex shrink-0 items-center rounded-[5px] border border-edge-soft bg-elevated/40 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
              {item.badge}
            </span>
          )}
          {ongoing && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {t("Ongoing")}
            </span>
          )}
        </span>
        {sub && <span className="text-[11.5px] text-ink-subtle">{sub}</span>}
      </span>
      {active && <Check size={17} strokeWidth={2.6} className="shrink-0 text-accent" />}
    </button>
  );
}
