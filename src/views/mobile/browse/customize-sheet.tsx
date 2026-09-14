import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Eye, EyeOff, Pencil, RotateCcw, X } from "lucide-react";
import { SetIcon } from "@/views/settings/set-icon";
import { useT } from "@/lib/i18n";
import { MobilePageShell, portalPage } from "./page-shell";

export type CustomizeRow = {
  key: string;
  name: string;
  hidden: boolean;
  renamed: boolean;
  // Per-row switches beyond hide and rename (home: numerals, hero source).
  extras?: Array<{ id: string; label: string; on: boolean; onToggle: () => void }>;
};

export type CustomizeSection = {
  key: string;
  name: string;
  hidden: boolean;
  onToggle: () => void;
};

// Phone stand-in for the desktop CustomizeBar + RowControls edit mode: the
// desktop inlines arrows and pencils on every row while editing, which needs a
// pointer and a wide row. On the phone the same operations (hide, reorder,
// rename, reset, plus the pinned-section switches) live on one page the user
// opens from the "Customize" pill and leaves with the changes already saved.
export function CustomizeSheet({
  title,
  rows,
  sections = [],
  hasChanges,
  onMove,
  onToggleHidden,
  onRename,
  onReset,
  onClose,
}: {
  title: string;
  rows: CustomizeRow[];
  sections?: CustomizeSection[];
  hasChanges: boolean;
  onMove: (key: string, delta: -1 | 1) => void;
  onToggleHidden: (key: string) => void;
  onRename?: (key: string, label: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);

  const commitRename = () => {
    if (!editing || !onRename) return;
    onRename(editing.key, editing.value);
    setEditing(null);
  };

  return portalPage(
    <MobilePageShell title={title} onBack={onClose}>
      <div className="flex flex-col gap-5 px-4 pt-2">
        {sections.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{t("Sections")}</h2>
            <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-edge-soft">
              {sections.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={s.onToggle}
                  aria-pressed={!s.hidden}
                  className={`flex min-h-[52px] w-full items-center gap-3 px-4 text-start ${i > 0 ? "border-t border-edge-soft/70" : ""}`}
                >
                  <span className={`text-[15px] font-medium ${s.hidden ? "text-ink-subtle line-through" : "text-ink"}`}>{s.name}</span>
                  <span className="ms-auto text-ink-subtle">
                    {s.hidden ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} className="text-accent" />}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        <section className="flex flex-col gap-2">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">{t("Rows")}</h2>
          {rows.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-5 text-center text-[13px] text-ink-subtle ring-1 ring-edge-soft">
              {t("Nothing to show here right now.")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-edge-soft">
              {rows.map((row, i) => {
                const isEditing = editing?.key === row.key;
                return (
                  <div key={row.key} className={`flex flex-col ${i > 0 ? "border-t border-edge-soft/70" : ""}`}>
                    <div className="flex min-h-[56px] items-center gap-2 py-1.5 pe-2 ps-4">
                      {isEditing ? (
                        <>
                          <input
                            autoFocus
                            value={editing.value}
                            onChange={(e) => setEditing({ key: row.key, value: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename();
                              if (e.key === "Escape") setEditing(null);
                            }}
                            placeholder={row.name}
                            className="h-10 min-w-0 flex-1 rounded-xl bg-elevated px-3 text-[15px] text-ink outline-none ring-1 ring-edge-soft focus:ring-accent"
                          />
                          <button type="button" onClick={commitRename} aria-label={t("Save")} className="grid h-11 w-11 place-items-center rounded-full text-accent">
                            <Check size={20} strokeWidth={2.4} />
                          </button>
                          <button type="button" onClick={() => setEditing(null)} aria-label={t("Cancel")} className="grid h-11 w-11 place-items-center rounded-full text-ink-subtle">
                            <X size={19} strokeWidth={2.2} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className={`truncate text-[15px] font-medium ${row.hidden ? "text-ink-subtle line-through" : "text-ink"}`}>
                              {row.name}
                            </span>
                            {row.renamed && <span className="text-[11px] text-ink-subtle">{t("Renamed")}</span>}
                          </span>
                          <div className="flex shrink-0 items-center">
                            <button
                              type="button"
                              onClick={() => onMove(row.key, -1)}
                              disabled={i === 0}
                              aria-label={t("Move up")}
                              className="grid h-11 w-10 place-items-center rounded-full text-ink-muted disabled:opacity-30"
                            >
                              <ChevronUp size={20} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMove(row.key, 1)}
                              disabled={i === rows.length - 1}
                              aria-label={t("Move down")}
                              className="grid h-11 w-10 place-items-center rounded-full text-ink-muted disabled:opacity-30"
                            >
                              <ChevronDown size={20} strokeWidth={2.2} />
                            </button>
                            {onRename && (
                              <button
                                type="button"
                                onClick={() => setEditing({ key: row.key, value: row.renamed ? row.name : "" })}
                                aria-label={t("Rename")}
                                className="grid h-11 w-10 place-items-center rounded-full text-ink-muted"
                              >
                                <Pencil size={17} strokeWidth={2.2} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onToggleHidden(row.key)}
                              aria-label={row.hidden ? t("Show row") : t("Hide row")}
                              aria-pressed={!row.hidden}
                              className="grid h-11 w-10 place-items-center rounded-full"
                            >
                              {row.hidden ? (
                                <EyeOff size={19} strokeWidth={2} className="text-ink-subtle" />
                              ) : (
                                <Eye size={19} strokeWidth={2} className="text-accent" />
                              )}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {!isEditing && row.extras && row.extras.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-4 pb-3">
                        {row.extras.map((x) => (
                          <button
                            key={x.id}
                            type="button"
                            onClick={x.onToggle}
                            aria-pressed={x.on}
                            className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium ring-1 ${
                              x.on ? "bg-accent/15 text-accent ring-accent/40" : "bg-elevated/60 text-ink-muted ring-edge-soft"
                            }`}
                          >
                            {x.on && <Check size={13} strokeWidth={3} />}
                            {x.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <button
          type="button"
          onClick={onReset}
          disabled={!hasChanges}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface text-[14.5px] font-semibold text-ink ring-1 ring-edge-soft disabled:opacity-40"
        >
          <RotateCcw size={16} strokeWidth={2.2} />
          {t("Reset")}
        </button>
      </div>
    </MobilePageShell>,
  );
}

// The pill that opens the sheet, matching the desktop "Customize" affordance
// that sits at the hero's trailing edge.
export function CustomizePill({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-1.5 rounded-full bg-elevated/70 py-0 pe-3.5 ps-2.5 text-[12.5px] font-medium text-ink-muted ring-1 ring-edge-soft/70 backdrop-blur-md"
    >
      <SetIcon name="Pencil" size={14} />
      {label}
    </button>
  );
}
