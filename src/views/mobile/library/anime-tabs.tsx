import { useCallback, useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { fetchMediaListCollection, readCachedCollection } from "@/lib/anilist/lists";
import {
  deleteListEntry as anilistDelete,
  saveListEntry as anilistSave,
} from "@/lib/anilist/mutations";
import { useAnilist } from "@/lib/anilist/provider";
import { anilistMediaToMeta } from "@/lib/anilist/to-meta";
import type { AnilistMediaEntry, MediaListStatus } from "@/lib/anilist/types";
import { useT } from "@/lib/i18n";
import { fetchMalList, readCachedMalList } from "@/lib/mal/lists";
import { deleteListEntry as malDelete, saveListEntry as malSave } from "@/lib/mal/mutations";
import { useMal } from "@/lib/mal/provider";
import { malAnimeToMeta } from "@/lib/mal/to-meta";
import type { MalListEntry, MalListStatus } from "@/lib/mal/types";
import { useSettings } from "@/lib/settings";
import { RAIL_ORDER } from "@/lib/use-anilist-anime-rails";
import { Poster, usePosterChain } from "@/components/poster";
import { SetIcon } from "@/views/settings/set-icon";
import { EmptyState, SectionHeading, SkeletonGrid, StatusNote, TypePills, type TypeKey } from "./grid";
import { ActionRow, PhoneSheet } from "./sheet";

// AniList and MyAnimeList library tabs. The desktop entry cards edit status
// through an anchored popover; on the phone the status opens a bottom sheet
// that also carries the remove action, and the progress stepper grows to 44pt.
// Optimistic edits and rollbacks mirror anilist-tab.tsx and mal-tab.tsx.

const ANILIST_STATUS_LABELS: Record<MediaListStatus, string> = {
  CURRENT: "Watching",
  PLANNING: "Plan to Watch",
  COMPLETED: "Completed",
  REPEATING: "Rewatching",
  PAUSED: "On Hold",
  DROPPED: "Dropped",
};
const ANILIST_STATUS_ORDER: MediaListStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "REPEATING",
  "PAUSED",
  "DROPPED",
];

const MAL_STATUS_LABELS: Record<MalListStatus, string> = {
  watching: "Watching",
  completed: "Completed",
  on_hold: "On Hold",
  dropped: "Dropped",
  plan_to_watch: "Plan to Watch",
};
const MAL_STATUS_ORDER: MalListStatus[] = [
  "watching",
  "completed",
  "on_hold",
  "dropped",
  "plan_to_watch",
];
const MAL_RAIL_ORDER: Array<{ key: string; title: string; statuses: MalListStatus[] }> = [
  { key: "watching", title: "Watching", statuses: ["watching"] },
  { key: "planning", title: "Plan to Watch", statuses: ["plan_to_watch"] },
  { key: "completed", title: "Completed", statuses: ["completed"] },
  { key: "paused", title: "On Hold", statuses: ["on_hold"] },
  { key: "dropped", title: "Dropped", statuses: ["dropped"] },
];

type Status = "loading" | "ready" | "error";

function useBusySet() {
  const [busy, setBusy] = useState<Set<number>>(() => new Set());
  const setBusyFor = useCallback((id: number, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  return { busy, setBusyFor };
}

function AnimeEntryCard<S extends string>({
  metaId,
  poster,
  name,
  isMovie,
  status,
  statusLabel,
  statusOptions,
  progress,
  total,
  busy,
  removeLabel,
  onOpen,
  onStatus,
  onProgress,
  onRemove,
}: {
  metaId: string;
  poster?: string;
  name: string;
  isMovie: boolean;
  status: S;
  statusLabel: string;
  statusOptions: Array<{ value: S; label: string }>;
  progress: number;
  total: number | null;
  busy: boolean;
  removeLabel: string;
  onOpen: () => void;
  onStatus: (s: S) => void;
  onProgress: (p: number) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [sheet, setSheet] = useState(false);
  const art = usePosterChain(settings.rpdbKey, metaId, poster, isMovie ? "movie" : "series");
  const atCeiling = total != null && progress >= total;
  return (
    <div className={`flex flex-col gap-2 ${busy ? "opacity-70" : ""}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("View {title}", { title: name })}
        className="relative aspect-[2/3] overflow-hidden rounded-xl bg-elevated"
      >
        <Poster src={art.src} onError={art.onError} seed={metaId} className="h-full w-full" lazy />
      </button>
      <p className="line-clamp-2 min-h-[2.4em] text-[13px] font-medium leading-snug text-ink">{name}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => setSheet(true)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-xl bg-elevated/60 px-3 text-[12.5px] font-medium text-ink ring-1 ring-edge-soft/60 disabled:opacity-60"
      >
        <span className="truncate">{statusLabel}</span>
        <SetIcon name="ChevronDown" size={14} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
      </button>
      <div className="flex h-11 items-center rounded-xl bg-elevated/60 ring-1 ring-edge-soft/60">
        <button
          type="button"
          aria-label={t("Decrease progress")}
          disabled={busy || progress <= 0}
          onClick={() => onProgress(progress - 1)}
          className="flex h-11 w-11 items-center justify-center rounded-s-xl text-ink-muted active:bg-raised disabled:opacity-40"
        >
          <SetIcon name="Minus" size={15} strokeWidth={2.4} />
        </button>
        <span className="flex-1 text-center text-[12.5px] tabular-nums text-ink">
          {progress}
          {total != null ? ` / ${total}` : ""}
        </span>
        <button
          type="button"
          aria-label={t("Increase progress")}
          disabled={busy || atCeiling}
          onClick={() => onProgress(progress + 1)}
          className="flex h-11 w-11 items-center justify-center rounded-e-xl text-ink-muted active:bg-raised disabled:opacity-40"
        >
          <SetIcon name="Plus" size={15} strokeWidth={2.4} />
        </button>
      </div>
      <PhoneSheet open={sheet} onClose={() => setSheet(false)} title={name}>
        {statusOptions.map((o) => (
          <ActionRow
            key={o.value}
            label={o.label}
            selected={o.value === status}
            onClick={() => {
              setSheet(false);
              if (o.value !== status) onStatus(o.value);
            }}
          />
        ))}
        <span className="mx-3 my-1 block h-px bg-edge-soft/60" />
        <ActionRow
          icon={<SetIcon name="Trash2" size={18} strokeWidth={2} />}
          label={removeLabel}
          danger
          onClick={() => {
            setSheet(false);
            onRemove();
          }}
        />
      </PhoneSheet>
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 [@media(min-width:700px)]:grid-cols-4">
      {children}
    </div>
  );
}

function anilistName(e: AnilistMediaEntry): string {
  return e.media.title.userPreferred || e.media.title.english || e.media.title.romaji || "";
}
function anilistIsMovie(e: AnilistMediaEntry): boolean {
  return e.media.format === "MOVIE";
}

export function MobileAnilistTab({ onOpenDetail }: { onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const { session } = useAnilist();
  const userId = session?.userId;
  const [entries, setEntries] = useState<AnilistMediaEntry[]>(() =>
    userId != null ? (readCachedCollection(userId)?.flatMap((g) => g.entries) ?? []) : [],
  );
  const [status, setStatus] = useState<Status>(() =>
    userId != null && readCachedCollection(userId) != null ? "ready" : "loading",
  );
  const [type, setType] = useState<TypeKey>("all");
  const { busy, setBusyFor } = useBusySet();

  useEffect(() => {
    if (userId == null) return;
    let cancelled = false;
    const cached = readCachedCollection(userId);
    if (cached) {
      setEntries(cached.flatMap((g) => g.entries));
      setStatus("ready");
    } else setStatus("loading");
    fetchMediaListCollection(userId)
      .then((groups) => {
        if (cancelled) return;
        setEntries(groups.flatMap((g) => g.entries));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled && readCachedCollection(userId) == null) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const applyLocal = useCallback((id: number, patch: Partial<AnilistMediaEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const commitStatus = async (entry: AnilistMediaEntry, next: MediaListStatus) => {
    setBusyFor(entry.id, true);
    const total = entry.media.episodes;
    const completing = next === "COMPLETED" && total != null;
    applyLocal(entry.id, { status: next, ...(completing ? { progress: total } : {}) });
    try {
      const saved = await anilistSave({
        mediaId: entry.media.id,
        status: next,
        ...(completing ? { progress: total } : {}),
      });
      applyLocal(entry.id, { status: saved.status, progress: saved.progress });
    } catch {
      applyLocal(entry.id, { status: entry.status, progress: entry.progress });
    } finally {
      setBusyFor(entry.id, false);
    }
  };

  const commitProgress = async (entry: AnilistMediaEntry, next: number) => {
    setBusyFor(entry.id, true);
    applyLocal(entry.id, { progress: next });
    try {
      const saved = await anilistSave({ mediaId: entry.media.id, progress: next });
      applyLocal(entry.id, { status: saved.status, progress: saved.progress });
    } catch {
      applyLocal(entry.id, { progress: entry.progress });
    } finally {
      setBusyFor(entry.id, false);
    }
  };

  const commitRemove = async (entry: AnilistMediaEntry) => {
    setBusyFor(entry.id, true);
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    try {
      await anilistDelete(entry.id);
    } catch {
      setEntries((prev) => (prev.some((e) => e.id === entry.id) ? prev : [...prev, entry]));
    } finally {
      setBusyFor(entry.id, false);
    }
  };

  const visible = useMemo(
    () =>
      entries.filter((e) => type === "all" || (anilistIsMovie(e) ? "movie" : "series") === type),
    [entries, type],
  );
  const counts = useMemo(
    () => ({
      all: entries.length,
      movie: entries.filter(anilistIsMovie).length,
      series: entries.filter((e) => !anilistIsMovie(e)).length,
    }),
    [entries],
  );
  const options = ANILIST_STATUS_ORDER.map((s) => ({ value: s, label: t(ANILIST_STATUS_LABELS[s]) }));

  if (status === "loading") return <SkeletonGrid count={6} />;
  if (status === "error") {
    return <StatusNote tone="error">{t("Couldn't reach AniList. Try refreshing.")}</StatusNote>;
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        art={<SetIcon name="Tv" size={26} strokeWidth={1.7} />}
        title={t("Your AniList is empty")}
        body={t("Add anime to your AniList and they show up here, grouped by status and ready to edit.")}
      />
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <TypePills type={type} onType={setType} counts={counts} />
      {RAIL_ORDER.map((section) => {
        const items = visible.filter((e) => section.statuses.includes(e.status));
        if (items.length === 0) return null;
        return (
          <div key={section.key} className="flex flex-col gap-3">
            <SectionHeading title={t(section.title)} count={items.length} />
            <CardGrid>
              {items.map((entry) => {
                const m = entry.media;
                return (
                  <AnimeEntryCard
                    key={entry.id}
                    metaId={m.idMal != null ? `mal:${m.idMal}` : `anilist:${m.id}`}
                    poster={m.coverImage.extraLarge ?? m.coverImage.large ?? undefined}
                    name={anilistName(entry) || t("Untitled")}
                    isMovie={anilistIsMovie(entry)}
                    status={entry.status}
                    statusLabel={t(ANILIST_STATUS_LABELS[entry.status])}
                    statusOptions={options}
                    progress={entry.progress}
                    total={m.episodes ?? null}
                    busy={busy.has(entry.id)}
                    removeLabel={t("Remove from AniList")}
                    onOpen={() => {
                      const meta = anilistMediaToMeta(m);
                      if (meta) onOpenDetail(meta);
                    }}
                    onStatus={(s) => void commitStatus(entry, s)}
                    onProgress={(p) => void commitProgress(entry, p)}
                    onRemove={() => void commitRemove(entry)}
                  />
                );
              })}
            </CardGrid>
          </div>
        );
      })}
    </section>
  );
}

function malIsMovie(e: MalListEntry): boolean {
  return e.anime.mediaType === "movie";
}

export function MobileMalTab({ onOpenDetail }: { onOpenDetail: (m: Meta) => void }) {
  const t = useT();
  const { isConnected } = useMal();
  const [entries, setEntries] = useState<MalListEntry[]>(() =>
    isConnected ? (readCachedMalList()?.flatMap((g) => g.entries) ?? []) : [],
  );
  const [status, setStatus] = useState<Status>(() =>
    isConnected && readCachedMalList() != null ? "ready" : "loading",
  );
  const [type, setType] = useState<TypeKey>("all");
  const { busy, setBusyFor } = useBusySet();

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const cached = readCachedMalList();
    if (cached) {
      setEntries(cached.flatMap((g) => g.entries));
      setStatus("ready");
    } else setStatus("loading");
    fetchMalList()
      .then((groups) => {
        if (cancelled) return;
        setEntries(groups.flatMap((g) => g.entries));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled && readCachedMalList() == null) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  const applyLocal = useCallback((id: number, patch: Partial<MalListEntry>) => {
    setEntries((prev) => prev.map((e) => (e.anime.id === id ? { ...e, ...patch } : e)));
  }, []);

  const commitStatus = async (entry: MalListEntry, next: MalListStatus) => {
    setBusyFor(entry.anime.id, true);
    const total = entry.anime.numEpisodes;
    const completing = next === "completed" && total != null;
    applyLocal(entry.anime.id, {
      status: next,
      ...(completing ? { numEpisodesWatched: total } : {}),
    } as Partial<MalListEntry>);
    try {
      const saved = await malSave({
        malId: entry.anime.id,
        status: next,
        ...(completing ? { numEpisodesWatched: total } : {}),
      });
      applyLocal(entry.anime.id, {
        status: saved.status,
        numEpisodesWatched: saved.numEpisodesWatched,
      } as Partial<MalListEntry>);
    } catch {
      applyLocal(entry.anime.id, {
        status: entry.status,
        numEpisodesWatched: entry.numEpisodesWatched,
      } as Partial<MalListEntry>);
    } finally {
      setBusyFor(entry.anime.id, false);
    }
  };

  const commitProgress = async (entry: MalListEntry, next: number) => {
    setBusyFor(entry.anime.id, true);
    applyLocal(entry.anime.id, { numEpisodesWatched: next } as Partial<MalListEntry>);
    try {
      const saved = await malSave({ malId: entry.anime.id, numEpisodesWatched: next });
      applyLocal(entry.anime.id, {
        status: saved.status,
        numEpisodesWatched: saved.numEpisodesWatched,
      } as Partial<MalListEntry>);
    } catch {
      applyLocal(entry.anime.id, {
        numEpisodesWatched: entry.numEpisodesWatched,
      } as Partial<MalListEntry>);
    } finally {
      setBusyFor(entry.anime.id, false);
    }
  };

  const commitRemove = async (entry: MalListEntry) => {
    setBusyFor(entry.anime.id, true);
    setEntries((prev) => prev.filter((e) => e.anime.id !== entry.anime.id));
    try {
      await malDelete(entry.anime.id);
    } catch {
      setEntries((prev) =>
        prev.some((e) => e.anime.id === entry.anime.id) ? prev : [...prev, entry],
      );
    } finally {
      setBusyFor(entry.anime.id, false);
    }
  };

  const visible = useMemo(
    () => entries.filter((e) => type === "all" || (malIsMovie(e) ? "movie" : "series") === type),
    [entries, type],
  );
  const counts = useMemo(
    () => ({
      all: entries.length,
      movie: entries.filter(malIsMovie).length,
      series: entries.filter((e) => !malIsMovie(e)).length,
    }),
    [entries],
  );
  const options = MAL_STATUS_ORDER.map((s) => ({ value: s, label: t(MAL_STATUS_LABELS[s]) }));

  if (status === "loading") return <SkeletonGrid count={6} />;
  if (status === "error") {
    return <StatusNote tone="error">{t("Couldn't reach MyAnimeList. Try refreshing.")}</StatusNote>;
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        art={<SetIcon name="Tv" size={26} strokeWidth={1.7} />}
        title={t("Your MyAnimeList is empty")}
        body={t("Add anime to your MyAnimeList and they show up here, grouped by status and ready to edit.")}
      />
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <TypePills type={type} onType={setType} counts={counts} />
      {MAL_RAIL_ORDER.map((section) => {
        const items = visible.filter((e) => section.statuses.includes(e.status));
        if (items.length === 0) return null;
        return (
          <div key={section.key} className="flex flex-col gap-3">
            <SectionHeading title={t(section.title)} count={items.length} />
            <CardGrid>
              {items.map((entry) => {
                const m = entry.anime;
                return (
                  <AnimeEntryCard
                    key={m.id}
                    metaId={`mal:${m.id}`}
                    poster={m.mainPicture ?? undefined}
                    name={m.title || t("Untitled")}
                    isMovie={malIsMovie(entry)}
                    status={entry.status}
                    statusLabel={t(MAL_STATUS_LABELS[entry.status])}
                    statusOptions={options}
                    progress={entry.numEpisodesWatched}
                    total={m.numEpisodes ?? null}
                    busy={busy.has(m.id)}
                    removeLabel={t("Remove from MyAnimeList")}
                    onOpen={() => {
                      const meta = malAnimeToMeta(m);
                      if (meta) onOpenDetail(meta);
                    }}
                    onStatus={(s) => void commitStatus(entry, s)}
                    onProgress={(p) => void commitProgress(entry, p)}
                    onRemove={() => void commitRemove(entry)}
                  />
                );
              })}
            </CardGrid>
          </div>
        );
      })}
    </section>
  );
}
