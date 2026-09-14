import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import {
  addToList,
  deleteList,
  MAX_ITEMS,
  removeFromList,
  renameList,
  reorderListItems,
  updateListDescription,
  useList,
  type CustomList,
  type ListItem,
} from "@/lib/custom-lists";
import { relativeTime } from "@/lib/dates";
import { useT } from "@/lib/i18n";
import { releaseText } from "@/lib/release-info";
import { searchAll, type AnimeHit, type SearchResults } from "@/lib/search";
import { useSettings } from "@/lib/settings";
import { unfeatureListByName } from "@/lib/social/featured-lists";
import { emitListToast } from "@/components/lists/list-toast";
import { Search as SearchIcon } from "@/components/icons/search-icon";
import { Poster } from "@/components/poster";
import { SetIcon } from "@/views/settings/set-icon";
import { EmptyState, GridTile, PhoneGrid, PillButton } from "./grid";
import { ConfirmDeleteListSheet, ListFormSheet } from "./list-sheets";
import { MoveBtn } from "./my-lists-tab";
import { ActionRow, PhonePage, PhoneSheet, usePhonePageClose } from "./sheet";

// Phone list page: everything list-detail.tsx and list-settings-menu.tsx offer
// (rename with description, add titles by search, remove, reorder, delete)
// laid out as a full-screen page with a settings sheet instead of a popover.

function itemToMeta(it: ListItem): Meta {
  return {
    id: it.id,
    type: it.type,
    name: it.name,
    poster: it.poster,
    addonOrigin: it.addonOrigin,
    videos: it.videos,
  };
}

function animeToMeta(a: AnimeHit): Meta {
  return {
    id: a.kitsuId ? `kitsu:${a.kitsuId}` : `mal:${a.malId}`,
    type: "series",
    name: a.name,
    poster: a.poster ?? undefined,
    releaseInfo: a.year ?? undefined,
  };
}

export function MobileListDetail({
  listId,
  onBack,
  onOpenDetail,
}: {
  listId: string;
  onBack: () => void;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const live = useList(listId);
  // Deleting empties the store before the exit slide finishes; hold the last
  // snapshot so the page keeps its shape while it leaves.
  const lastRef = useRef<CustomList | null>(live);
  if (live) lastRef.current = live;
  const list = live ?? lastRef.current;
  const { closing, requestClose } = usePhonePageClose(onBack);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchAll(settings.tmdbKey ?? "", q)
        .then((r) => {
          if (cancelled) return;
          setResults(r);
          setSearching(false);
        })
        .catch(() => {
          if (!cancelled) setSearching(false);
        });
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, settings.tmdbKey]);

  if (!list) return null;

  const memberIds = new Set(list.items.map((it) => it.id));
  const atMax = list.items.length >= MAX_ITEMS;
  const hits: Meta[] = [
    ...(results?.movies ?? []),
    ...(results?.series ?? []),
    ...(results?.anime ?? []).map(animeToMeta),
  ].slice(0, 24);

  const add = (m: Meta) => {
    if (atMax) {
      emitListToast(t("This list is full ({max} items)", { max: MAX_ITEMS }));
      return;
    }
    addToList(list.id, {
      id: m.id,
      type: m.type,
      name: m.name,
      poster: m.poster,
      addonOrigin: m.addonOrigin,
      videos: m.videos,
    });
    emitListToast(t('Added to "{name}"', { name: list.name }));
  };

  const move = (id: string, dir: -1 | 1) => {
    const ids = list.items.map((it) => it.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderListItems(list.id, ids);
  };

  const rename = (name: string, description: string) => {
    renameList(list.id, name);
    updateListDescription(list.id, description);
    emitListToast(t("List renamed"));
    setRenaming(false);
  };

  const remove = () => {
    deleteList(list.id);
    void unfeatureListByName(list.name);
    emitListToast(t('Deleted "{name}"', { name: list.name }));
    setConfirming(false);
    requestClose();
  };

  return (
    <PhonePage
      closing={closing}
      onBack={requestClose}
      eyebrow={t("My Lists")}
      title={list.name}
      trailing={
        <button
          type="button"
          aria-label={t("List settings")}
          onClick={() => setMenuOpen(true)}
          className="-me-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevated/60 text-ink-muted transition-transform active:scale-90"
        >
          <MoreHorizontal size={20} strokeWidth={2} />
        </button>
      }
    >
      <div className="flex flex-col gap-1.5">
        {list.description && (
          <p className="text-[14px] leading-relaxed text-ink-muted">{list.description}</p>
        )}
        <p className="text-[12.5px] tabular-nums text-ink-subtle">
          {t("{n} / {max} items", { n: list.items.length, max: MAX_ITEMS })}
          {list.updatedAt > 0 && ` · ${t("Updated {when}", { when: relativeTime(list.updatedAt) })}`}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon
            size={17}
            className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Add a movie or show to this list...")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-12 w-full rounded-full bg-elevated/50 pe-12 ps-11 text-[16px] text-ink outline-none ring-1 ring-edge-soft/60 transition-shadow placeholder:text-ink-subtle focus:ring-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("Clear")}
              className="absolute end-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-ink-subtle active:bg-raised/60"
            >
              <SetIcon name="X" size={16} strokeWidth={2.3} />
            </button>
          )}
        </div>

        {query.trim() && (
          <div className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-surface">
            {searching && hits.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-muted">{t("Searching...")}</p>
            ) : hits.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-ink-muted">
                {t("No matches. Try another title.")}
              </p>
            ) : (
              <ul className="max-h-[360px] overflow-y-auto py-1">
                {hits.map((m) => {
                  const inList = memberIds.has(m.id);
                  const year = releaseText(m.releaseInfo);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        disabled={inList}
                        onClick={() => add(m)}
                        className="flex min-h-[56px] w-full items-center gap-3 px-3 py-1.5 text-start transition-colors active:bg-raised/60 disabled:cursor-default"
                      >
                        <span className="w-9 shrink-0 overflow-hidden rounded-md">
                          <Poster src={m.poster} seed={m.id} ratio="portrait" className="!rounded-md" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[14px] font-medium text-ink">{m.name}</span>
                          <span className="text-[11.5px] text-ink-subtle">
                            {m.type === "movie" ? t("Movie") : t("Series")}
                            {year ? ` · ${year.slice(0, 4)}` : ""}
                          </span>
                        </span>
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                            inList ? "text-accent" : "border border-edge text-ink-muted"
                          }`}
                        >
                          <SetIcon name={inList ? "Check" : "Plus"} size={16} strokeWidth={2.4} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {list.items.length === 0 ? (
        <EmptyState
          art={<SetIcon name="Layers" size={26} strokeWidth={1.7} />}
          title={t("Nothing here yet")}
          body={t(
            'Add titles with the search above, or hit "Add to list" on any movie or show\'s page.',
          )}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-subtle">
              {t("Titles")}
            </span>
            <PillButton active={arranging} onClick={() => setArranging((v) => !v)}>
              <SetIcon name="ArrowUpDown" size={15} strokeWidth={2.2} />
              {arranging ? t("Done") : t("Arrange")}
            </PillButton>
          </div>
          {arranging ? (
            <ul className="flex flex-col gap-2">
              {list.items.map((it, i) => (
                <li
                  key={it.id}
                  className="flex items-center gap-3 rounded-2xl border border-edge-soft/70 bg-elevated/40 p-2"
                >
                  <span className="w-10 shrink-0 overflow-hidden rounded-md">
                    <Poster src={it.poster} seed={it.id} ratio="portrait" className="!rounded-md" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                    {it.name || it.id}
                  </span>
                  <MoveBtn label={t("Move up")} disabled={i === 0} onClick={() => move(it.id, -1)} up />
                  <MoveBtn
                    label={t("Move down")}
                    disabled={i === list.items.length - 1}
                    onClick={() => move(it.id, 1)}
                  />
                  <button
                    type="button"
                    aria-label={t("Remove from list")}
                    onClick={() => removeFromList(list.id, it.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-subtle transition-colors active:bg-danger/10 active:text-danger"
                  >
                    <SetIcon name="X" size={18} strokeWidth={2.3} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <PhoneGrid>
              {list.items.map((it) => (
                <GridTile key={it.id} meta={itemToMeta(it)} onOpen={onOpenDetail} />
              ))}
            </PhoneGrid>
          )}
        </div>
      )}

      <PhoneSheet open={menuOpen} onClose={() => setMenuOpen(false)} title={t("List settings")}>
        <ActionRow
          icon={<SetIcon name="Pencil" size={18} strokeWidth={2} />}
          label={t("Rename list")}
          note={t("Name and description")}
          onClick={() => {
            setMenuOpen(false);
            setRenaming(true);
          }}
        />
        {list.items.length > 1 && (
          <ActionRow
            icon={<SetIcon name="ArrowUpDown" size={18} strokeWidth={2} />}
            label={t("Reorder items")}
            onClick={() => {
              setMenuOpen(false);
              setArranging(true);
            }}
          />
        )}
        <ActionRow
          icon={<SetIcon name="Trash2" size={18} strokeWidth={2} />}
          label={t("Delete list")}
          danger
          onClick={() => {
            setMenuOpen(false);
            setConfirming(true);
          }}
        />
      </PhoneSheet>
      <ListFormSheet
        open={renaming}
        mode="rename"
        initialName={list.name}
        initialDescription={list.description ?? ""}
        onClose={() => setRenaming(false)}
        onSubmit={rename}
      />
      <ConfirmDeleteListSheet
        open={confirming}
        name={list.name}
        onClose={() => setConfirming(false)}
        onConfirm={remove}
      />
    </PhonePage>
  );
}
