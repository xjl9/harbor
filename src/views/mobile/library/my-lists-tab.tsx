import { useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import {
  createList,
  MAX_LISTS,
  reorderLists,
  useCustomLists,
  type CustomList,
} from "@/lib/custom-lists";
import { relativeTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { emitListToast } from "@/components/lists/list-toast";
import { Poster, posterPlate } from "@/components/poster";
import { SetIcon } from "@/views/settings/set-icon";
import { EmptyState, PillButton } from "./grid";
import { MobileListDetail } from "./list-detail";
import { ListFormSheet } from "./list-sheets";

// Phone My Lists tab over the same custom-lists store as desktop. Desktop
// reorders lists by dragging cards; on a touch screen a drag fights the page
// scroll, so ordering is an explicit Arrange mode with 44pt up and down
// buttons on every row.

export function MobileMyListsTab({ onOpenDetail }: { onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const lists = useCustomLists();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [arranging, setArranging] = useState(false);
  const atMax = lists.length >= MAX_LISTS;

  const move = (id: string, dir: -1 | 1) => {
    const ids = lists.map((l) => l.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderLists(ids);
  };

  const create = (name: string, description: string) => {
    const id = createList(name, description);
    if (!id) return;
    emitListToast(t('Created "{name}"', { name }));
    setCreating(false);
    setOpenId(id);
  };

  return (
    <section className="flex flex-col gap-4">
      {lists.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] tabular-nums text-ink-muted">
            {t("{n} / {max} lists", { n: lists.length, max: MAX_LISTS })}
          </span>
          <div className="flex items-center gap-2">
            {lists.length > 1 && (
              <PillButton active={arranging} onClick={() => setArranging((v) => !v)}>
                <SetIcon name="ArrowUpDown" size={15} strokeWidth={2.2} />
                {arranging ? t("Done") : t("Arrange")}
              </PillButton>
            )}
            <PillButton disabled={atMax} onClick={() => setCreating(true)}>
              <SetIcon name="Plus" size={15} strokeWidth={2.4} />
              {t("New list")}
            </PillButton>
          </div>
        </div>
      )}

      {lists.length === 0 ? (
        <EmptyState
          art={<SetIcon name="Layers" size={26} strokeWidth={1.7} />}
          title={t("Create your first list")}
          body={t(
            "Group the movies and shows you love. Rewatch shelf, weekend picks, whatever keeps them close.",
          )}
          action={
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex h-11 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-semibold text-canvas shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] transition-transform active:scale-[0.98]"
            >
              <SetIcon name="Plus" size={17} strokeWidth={2.4} />
              {t("New list")}
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lists.map((l, i) => (
            <ListRow
              key={l.id}
              list={l}
              arranging={arranging}
              first={i === 0}
              last={i === lists.length - 1}
              onOpen={() => setOpenId(l.id)}
              onMove={(dir) => move(l.id, dir)}
            />
          ))}
        </ul>
      )}

      <ListFormSheet
        open={creating}
        mode="create"
        atMax={atMax}
        onClose={() => setCreating(false)}
        onSubmit={create}
      />
      {openId && (
        <MobileListDetail
          listId={openId}
          onBack={() => setOpenId(null)}
          onOpenDetail={onOpenDetail}
        />
      )}
    </section>
  );
}

function ListRow({
  list,
  arranging,
  first,
  last,
  onOpen,
  onMove,
}: {
  list: CustomList;
  arranging: boolean;
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const t = useT();
  const count = list.items.length;
  const body = (
    <>
      <ListCovers list={list} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-display text-[16px] font-medium leading-tight text-ink">
          {list.name}
        </span>
        {list.description && (
          <span className="line-clamp-1 text-[12.5px] leading-snug text-ink-muted">
            {list.description}
          </span>
        )}
        <span className="truncate text-[12px] text-ink-subtle">
          {count === 1 ? t("1 item") : t("{n} items", { n: count })}
          {list.updatedAt > 0 && ` · ${t("Updated {when}", { when: relativeTime(list.updatedAt) })}`}
        </span>
      </span>
    </>
  );
  const skin =
    "flex w-full items-center gap-3.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 p-2.5 text-start";
  if (arranging) {
    return (
      <li className={skin}>
        {body}
        <span className="flex shrink-0 items-center gap-0.5">
          <MoveBtn label={t("Move up")} disabled={first} onClick={() => onMove(-1)} up />
          <MoveBtn label={t("Move down")} disabled={last} onClick={() => onMove(1)} />
        </span>
      </li>
    );
  }
  return (
    <li>
      <button type="button" onClick={onOpen} className={`${skin} transition-colors active:bg-raised/60`}>
        {body}
        <SetIcon name="ChevronRight" size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
      </button>
    </li>
  );
}

export function MoveBtn({
  label,
  disabled,
  onClick,
  up,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  up?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-[color,background-color,transform] active:scale-[0.92] active:bg-ink/10 active:text-ink disabled:opacity-30 motion-reduce:transition-none"
    >
      <SetIcon name={up ? "ChevronUp" : "ChevronDown"} size={20} strokeWidth={2.4} />
    </button>
  );
}

// Three fanned covers in a square, echoing the desktop ListCard, sized for a row.
function ListCovers({ list }: { list: CustomList }) {
  const covers = list.items.slice(0, 3);
  return (
    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-canvas ring-1 ring-edge-soft/60">
      {covers.length === 0 ? (
        <span
          className="flex h-full w-full items-center justify-center text-ink-subtle"
          style={{ background: posterPlate(list.id) }}
        >
          <SetIcon name="Layers" size={20} strokeWidth={1.7} />
        </span>
      ) : (
        covers.map((it, i) => (
          <span
            key={it.id}
            className="absolute left-1/2 top-1/2 w-[34px] overflow-hidden rounded-md shadow-[0_6px_14px_-6px_rgba(0,0,0,0.8)] ring-1 ring-black/25"
            style={{
              transform: `translate(-50%, -50%) translateX(${(i - (covers.length - 1) / 2) * 12}px) rotate(${(i - (covers.length - 1) / 2) * 8}deg)`,
              zIndex: i,
            }}
          >
            <Poster src={it.poster} seed={it.id} ratio="portrait" className="!rounded-md" />
          </span>
        ))
      )}
    </span>
  );
}
