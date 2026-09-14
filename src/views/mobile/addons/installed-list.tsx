import { useState } from "react";
import { AddonLogo, resolveAddonLogo } from "@/components/addon-logo";
import { isAddonEnabled, setAddonEnabled } from "@/lib/addon-store";
import type { ResolvedAddon } from "@/lib/addons-store/store";
import { useT } from "@/lib/i18n";
import { addonKey, idOf, nameOf, subtitleFromManifest } from "@/views/addons/addons-utils";
import { SetIcon } from "@/views/settings/set-icon";
import { BottomSheet, EmptyCard, FOCUS, Knob, Row, tapHaptic } from "./kit";

// Phone counterpart of the desktop installed pane. Same data (the merged
// account + device collection), same position numbers, same enable switch
// backed by setAddonEnabled, same "Off · catalogs and streams hidden" state.
// Reconfigure and remove live behind a per-row action sheet because a 362px row
// cannot carry a switch, a Manage pill and an Installed pill without clipping.
export function InstalledList({
  installed,
  search,
  reordering,
  onOpen,
  onManage,
  onRemove,
  onMove,
}: {
  installed: ResolvedAddon[];
  search: string;
  reordering: boolean;
  onOpen: (r: ResolvedAddon) => void;
  onManage: (r: ResolvedAddon) => void;
  onRemove: (r: ResolvedAddon) => void;
  onMove: (from: number, to: number) => void;
}) {
  const t = useT();
  const q = search.trim().toLowerCase();
  const filtered = q
    ? installed.filter((r) => {
        const name = (r.manifest?.name ?? "").toLowerCase();
        const desc = (r.manifest?.description ?? "").toLowerCase();
        const id = (r.manifest?.id ?? r.curated?.id ?? "").toLowerCase();
        return name.includes(q) || desc.includes(q) || id.includes(q);
      })
    : installed;
  const positions = new Map(installed.map((r, i) => [addonKey(r), i]));

  if (installed.length === 0) {
    return (
      <EmptyCard
        icon={<SetIcon name="Puzzle" size={26} strokeWidth={1.8} />}
        title={t("No addons installed yet")}
        body={t("Head to Discover to add catalogs, subtitles and stream sources.")}
      />
    );
  }
  if (filtered.length === 0) {
    return (
      <EmptyCard
        title={t("No installed addon matches that.")}
        body={t("Clear the search to see all {n} installed.", { n: installed.length })}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {filtered.map((r) => {
        const index = positions.get(addonKey(r)) ?? 0;
        return (
          <InstalledRow
            key={addonKey(r)}
            resolved={r}
            position={index + 1}
            reordering={reordering && !q}
            first={index === 0}
            last={index === installed.length - 1}
            onOpen={() => onOpen(r)}
            onManage={() => onManage(r)}
            onRemove={() => onRemove(r)}
            onUp={() => onMove(index, index - 1)}
            onDown={() => onMove(index, index + 1)}
          />
        );
      })}
    </div>
  );
}

function InstalledRow({
  resolved,
  position,
  reordering,
  first,
  last,
  onOpen,
  onManage,
  onRemove,
  onUp,
  onDown,
}: {
  resolved: ResolvedAddon;
  position: number;
  reordering: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onManage: () => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const t = useT();
  const r = resolved;
  const [enabled, setEnabled] = useState(() => isAddonEnabled(r.transportUrl));
  const [menu, setMenu] = useState(false);
  const isConfigurable =
    r.manifest?.behaviorHints?.configurable === true ||
    r.manifest?.behaviorHints?.configurationRequired === true;
  const name = nameOf(r);

  const toggle = () => {
    const next = !enabled;
    tapHaptic();
    setEnabled(next);
    setAddonEnabled(r.transportUrl, next);
    window.dispatchEvent(
      new CustomEvent("harbor:addons-changed", { detail: { id: idOf(r), enabled: next } }),
    );
  };

  return (
    <div className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-edge-soft/70 bg-elevated/40 ps-3.5 pe-1.5">
      <span className="min-w-5 shrink-0 text-center font-display text-[15px] font-medium tabular-nums text-ink-subtle">
        {position}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className={`no-press flex min-h-[56px] min-w-0 flex-1 items-center gap-3 py-2 text-start ${FOCUS}`}
      >
        <span className={enabled ? "" : "opacity-45 transition-opacity"}>
          <AddonLogo
            addonId={idOf(r)}
            addonName={name}
            manifestLogo={resolveAddonLogo(r.manifest?.logo, r.transportUrl)}
            size="lg"
          />
        </span>
        <span className={`flex min-w-0 flex-1 flex-col gap-0.5 ${enabled ? "" : "opacity-55"}`}>
          <span className="truncate text-[15px] font-medium text-ink">{name}</span>
          <span className="truncate text-[12px] text-ink-subtle">
            {enabled ? subtitleFromManifest(r) : t("Off · catalogs and streams hidden")}
          </span>
        </span>
      </button>
      {reordering ? (
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onUp}
            disabled={first}
            aria-label={t("Move up")}
            className={`no-press flex h-11 w-11 items-center justify-center rounded-full text-ink-muted active:bg-raised/60 disabled:opacity-30 ${FOCUS}`}
          >
            <SetIcon name="ArrowUp" size={19} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            onClick={onDown}
            disabled={last}
            aria-label={t("Move down")}
            className={`no-press flex h-11 w-11 items-center justify-center rounded-full text-ink-muted active:bg-raised/60 disabled:opacity-30 ${FOCUS}`}
          >
            <SetIcon name="ArrowDown" size={19} strokeWidth={2.2} />
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={enabled ? t("Turn {name} off", { name }) : t("Turn {name} on", { name })}
            onClick={toggle}
            className={`no-press group flex h-11 shrink-0 items-center px-1 ${FOCUS}`}
          >
            <Knob on={enabled} />
          </button>
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label={t("More options for {name}", { name })}
            className={`no-press flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-ink-subtle active:bg-raised/60 ${FOCUS}`}
          >
            <SetIcon name="EllipsisVertical" size={19} strokeWidth={2.2} />
          </button>
        </>
      )}
      {menu && (
        <BottomSheet title={name} onClose={() => setMenu(false)}>
          <div className="-mx-1 flex flex-col">
            <Row
              icon={<SetIcon name="Info" size={19} strokeWidth={2} />}
              label={t("Details")}
              onClick={() => {
                setMenu(false);
                onOpen();
              }}
            />
            {isConfigurable && (
              <Row
                icon={<SetIcon name="Settings2" size={19} strokeWidth={2} />}
                label={t("Reconfigure")}
                sub={t("Re-configure this addon and apply the updated link")}
                onClick={() => {
                  setMenu(false);
                  onManage();
                }}
              />
            )}
            <Row
              icon={<SetIcon name="Trash2" size={19} strokeWidth={2} />}
              label={t("Remove")}
              danger
              chevron={false}
              onClick={() => {
                setMenu(false);
                onRemove();
              }}
            />
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
