import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { ShowcaseIcon } from "@/components/icons/harbor-glyphs";
import { UiIcon } from "@/components/ui-icon";
import { TogetherPopover } from "@/components/together-modal";
import { emitListToast } from "@/components/lists/list-toast";
import {
  addToList,
  createList,
  MAX_LISTS,
  toggleInList,
  useCustomLists,
  useListsContaining,
  type ListItemInput,
} from "@/lib/custom-lists";
import { useT } from "@/lib/i18n";
import {
  ensureNotifyPermission,
  playTone,
  removeReminder,
  setReminder,
  useReminder,
  type ReminderTone,
} from "@/lib/reminders";
import { useSettings } from "@/lib/settings";
import { clearShowcase, setShowcase, useShowcaseMetaId } from "@/lib/social/showcase";
import { useTogether } from "@/lib/together/provider";
import { kitsuToMal } from "@/lib/providers/anime-mapping";
import { stremioIdToSimklTarget } from "@/lib/simkl/ids";
import { addSimklRating, getCachedRatingByTarget, removeSimklRating } from "@/lib/simkl/ratings";
import type { SimklTarget } from "@/lib/simkl/types";
import { requestMobileIntent } from "../mobile-intent";
import { Group, SheetRow } from "./sheet-ui";
import { PhoneSheet, useSheetClose } from "./sheets";

// ---------------------------------------------------------------------------
// Add to list

export function ListPickerSheet({ item, onClose }: { item: ListItemInput; onClose: () => void }) {
  const t = useT();
  return (
    <PhoneSheet title={t("Add to list")} onClose={onClose}>
      <ListPickerBody item={item} />
    </PhoneSheet>
  );
}

function ListPickerBody({ item }: { item: ListItemInput }) {
  const t = useT();
  const close = useSheetClose();
  const lists = useCustomLists();
  const containing = useListsContaining(item.id);
  const showcaseMetaId = useShowcaseMetaId();
  const isShowcase = showcaseMetaId === item.id;
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const atMax = lists.length >= MAX_LISTS;

  const toggle = (listId: string, listName: string) => {
    const nowIn = toggleInList(listId, item);
    emitListToast(
      nowIn ? t('Added to "{name}"', { name: listName }) : t('Removed from "{name}"', { name: listName }),
    );
  };

  const toggleShowcase = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isShowcase) {
        await clearShowcase();
        emitListToast(t("Removed from showcase"));
      } else {
        await setShowcase({
          metaId: item.id,
          title: item.name ?? item.id,
          posterUrl: item.poster,
          kind: "pinned",
        });
        emitListToast(t("Set as your showcase"));
      }
      close();
    } catch {
      emitListToast(t("Could not update showcase"));
    } finally {
      setBusy(false);
    }
  };

  const submitNew = () => {
    const trimmed = name.trim();
    if (!trimmed || atMax) return;
    const id = createList(trimmed, "");
    if (!id) return;
    addToList(id, item);
    emitListToast(t('Created "{name}"', { name: trimmed }));
    setName("");
    setCreating(false);
  };

  return (
    <div className="flex flex-col px-3 pb-1">
      {lists.length === 0 && !creating && (
        <p className="px-3 pb-3 pt-1 text-[13px] leading-snug text-ink-subtle">
          {t("No lists yet. Create your first one below.")}
        </p>
      )}
      {lists.map((l) => {
        const inList = containing.has(l.id);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => toggle(l.id, l.name)}
            className="flex min-h-[48px] w-full items-center gap-3.5 rounded-2xl px-3 py-2 text-start transition-colors active:bg-elevated/50 motion-reduce:transition-none"
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                inList ? "bg-accent text-canvas" : "bg-surface ring-1 ring-inset ring-edge-soft"
              }`}
            >
              {inList && <Check size={14} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-ink">{l.name}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-ink-subtle">{l.items.length}</span>
          </button>
        );
      })}
      <div className="mt-1 border-t border-edge-soft/60 pt-1">
        <SheetRow
          icon={<ShowcaseIcon size={20} className={isShowcase ? "text-accent" : undefined} />}
          label={isShowcase ? t("Remove from showcase") : t("Set as showcase")}
          active={isShowcase}
          disabled={busy}
          onClick={() => void toggleShowcase()}
        />
        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitNew();
            }}
            className="flex items-center gap-2 px-3 py-2"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("List name")}
              maxLength={60}
              className="h-12 min-w-0 flex-1 rounded-xl bg-surface px-3.5 text-[16px] text-ink outline-none ring-1 ring-inset ring-edge-soft placeholder:text-ink-subtle focus:ring-accent/50"
            />
            <button
              type="submit"
              disabled={!name.trim() || atMax}
              className="flex h-12 shrink-0 items-center justify-center rounded-xl bg-ink px-4 text-[14px] font-semibold text-canvas disabled:opacity-40"
            >
              {t("Create")}
            </button>
          </form>
        ) : (
          <SheetRow
            icon={<Plus size={20} strokeWidth={2.4} />}
            label={t("Create new list")}
            sublabel={atMax ? t("You have reached the list limit") : undefined}
            disabled={atMax}
            onClick={() => setCreating(true)}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remind me

const TONES: Array<{ id: ReminderTone; label: string }> = [
  { id: "chime", label: "Chime" },
  { id: "pulse", label: "Pulse" },
  { id: "silent", label: "Silent" },
];

export type ReminderSeed = {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
};

export function ReminderSheet({ seed, onClose }: { seed: ReminderSeed; onClose: () => void }) {
  const t = useT();
  return (
    <PhoneSheet title={t("Remind me about")} onClose={onClose}>
      <ReminderBody seed={seed} />
    </PhoneSheet>
  );
}

function ReminderBody({ seed }: { seed: ReminderSeed }) {
  const t = useT();
  const close = useSheetClose();
  const existing = useReminder(seed.id);
  const active = !!existing;
  const [episodes, setEpisodes] = useState(existing?.episodes ?? true);
  const [seasons, setSeasons] = useState(existing?.seasons ?? true);
  const [tone, setTone] = useState<ReminderTone>(existing?.tone ?? "chime");

  const save = () => {
    const now = Date.now();
    setReminder({
      id: seed.id,
      name: seed.name,
      poster: seed.poster,
      type: seed.type,
      episodes,
      seasons,
      tone,
      lastNotifiedAt: existing?.lastNotifiedAt ?? now,
      createdAt: existing?.createdAt ?? now,
      seenKeys: existing?.seenKeys,
    });
    emitListToast(active ? t("Reminder updated") : t("Reminder set"));
    void ensureNotifyPermission();
    close();
  };

  const remove = () => {
    removeReminder(seed.id);
    emitListToast(t("Reminder removed"));
    close();
  };

  const rows = [
    { key: "episodes", label: t("New episodes"), sub: t("When a new episode airs"), value: episodes, set: setEpisodes },
    { key: "seasons", label: t("New seasons"), sub: t("When a new season premieres"), value: seasons, set: setSeasons },
  ];

  return (
    <div className="flex flex-col gap-3 px-3 pb-1">
      <div className="flex flex-col">
        {rows.map((r) => (
          <SheetRow
            key={r.key}
            icon={
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-md ${
                  r.value ? "bg-accent text-canvas" : "bg-surface ring-1 ring-inset ring-edge-soft"
                }`}
              >
                {r.value && <Check size={14} strokeWidth={3} />}
              </span>
            }
            label={r.label}
            sublabel={r.sub}
            onClick={() => r.set(!r.value)}
          />
        ))}
      </div>
      <div className="px-3">
        <p className="pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
          {t("Tone")}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {TONES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setTone(o.id);
                playTone(o.id);
              }}
              aria-pressed={tone === o.id}
              className={`h-11 rounded-xl text-[13.5px] font-medium transition-colors motion-reduce:transition-none ${
                tone === o.id
                  ? "bg-ink text-canvas"
                  : "bg-surface text-ink-muted ring-1 ring-edge-soft/70"
              }`}
            >
              {t(o.label)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 px-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={!episodes && !seasons}
          className="h-12 w-full rounded-full bg-ink text-[15px] font-semibold text-canvas disabled:opacity-40"
        >
          {active ? t("Save changes") : t("Set reminder")}
        </button>
        {active && (
          <button
            type="button"
            onClick={remove}
            className="h-11 w-full rounded-full text-[14px] font-semibold text-danger"
          >
            {t("Remove reminder")}
          </button>
        )}
        <p className="pt-1 text-center text-[11.5px] leading-snug text-ink-subtle">
          {t("Harbor checks a few times a day while it's open and lets you know here.")}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watch together

export function TogetherSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { enabled } = useTogether();
  return (
    <PhoneSheet title={t("Watch together")} onClose={onClose} tall>
      {enabled ? (
        // The desktop popover is self-contained (400px, capped to the viewport)
        // and everything in it is a plain tap target, so it is hosted as is.
        <div className="flex justify-center px-4 pb-2">
          <TogetherPopover modal />
        </div>
      ) : (
        <TogetherSetupNote />
      )}
    </PhoneSheet>
  );
}

function TogetherSetupNote() {
  const t = useT();
  const close = useSheetClose();
  return (
    <div className="flex flex-col gap-4 px-6 pb-2 pt-1">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface text-ink">
          <UiIcon name="watch-together" className="h-5 w-5" />
        </span>
        <p className="text-[15px] font-medium text-ink">{t("Watch Together needs a relay.")}</p>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        {t(
          "A relay is a tiny Cloudflare Worker that passes play/pause/seek messages between you and your friends. No video data ever touches it. Deploy your own in one click (free tier is plenty), or paste a friend's invite link to use theirs.",
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          requestMobileIntent("settings");
          close();
        }}
        className="h-12 w-full rounded-full bg-ink text-[15px] font-semibold text-canvas"
      >
        {t("Open Settings")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tracker status (AniList, MyAnimeList, Simkl)

export type TrackerOption<S extends string> = { value: S; label: string };

export function TrackerSheet<S extends string>({
  title,
  logo,
  status,
  options,
  busy,
  onSet,
  onRemove,
  extra,
  onClose,
}: {
  title: string;
  logo: string;
  status: S | null;
  options: TrackerOption<S>[];
  busy: boolean;
  onSet: (s: S) => void;
  onRemove: () => void;
  extra?: ReactNode;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <PhoneSheet title={title} onClose={onClose}>
      <TrackerBody
        logo={logo}
        status={status}
        options={options}
        busy={busy}
        onSet={onSet}
        onRemove={onRemove}
        extra={extra}
        removeLabel={t("Remove from list")}
      />
    </PhoneSheet>
  );
}

function TrackerBody<S extends string>({
  logo,
  status,
  options,
  busy,
  onSet,
  onRemove,
  extra,
  removeLabel,
}: {
  logo: string;
  status: S | null;
  options: TrackerOption<S>[];
  busy: boolean;
  onSet: (s: S) => void;
  onRemove: () => void;
  extra?: ReactNode;
  removeLabel: string;
}) {
  const close = useSheetClose();
  return (
    <div className="flex flex-col px-3 pb-1">
      {options.map((o) => (
        <SheetRow
          key={o.value}
          icon={<img src={logo} alt="" className="h-5 w-5 rounded-[4px] object-contain" />}
          label={o.label}
          active={o.value === status}
          disabled={busy}
          trailing={
            o.value === status ? <Check size={18} strokeWidth={2.6} className="text-accent" /> : undefined
          }
          onClick={() => {
            onSet(o.value);
            close();
          }}
        />
      ))}
      {extra}
      {status != null && (
        <SheetRow
          icon={<Trash2 size={20} strokeWidth={2} className="text-danger" />}
          label={removeLabel}
          disabled={busy}
          onClick={() => {
            onRemove();
            close();
          }}
        />
      )}
    </div>
  );
}

/**
 * Simkl's 1-10 rating as five stars with half steps. Each star is a 44pt
 * target split down the middle; the left half is the odd score.
 */
export function SimklRatingRow({ harborId, type }: { harborId: string; type: "movie" | "series" }) {
  const t = useT();
  const { settings } = useSettings();
  const [target, setTarget] = useState<SimklTarget | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setTarget(null);
    void (async () => {
      let tgt: SimklTarget | null = null;
      const resolution = stremioIdToSimklTarget(harborId);
      if (resolution.ok) tgt = resolution.target;
      else if (harborId.startsWith("kitsu:")) {
        const n = Number(harborId.split(":")[1]);
        const mal = Number.isFinite(n) ? await kitsuToMal(n).catch(() => null) : null;
        if (mal != null) tgt = { kind: "show", ids: { mal } };
      }
      if (cancelled || !tgt) return;
      if (type === "series" && tgt.kind === "movie") tgt = { kind: "show", ids: tgt.ids };
      if (type === "movie" && (tgt.kind === "show" || tgt.kind === "anime")) {
        tgt = { kind: "movie", ids: tgt.ids };
      }
      setTarget(tgt);
      setCurrent(getCachedRatingByTarget(tgt));
    })();
    return () => {
      cancelled = true;
    };
  }, [harborId, type]);

  if (!settings.simklEnableUserRatings || !target) return null;

  const rate = async (val: number) => {
    if (loading) return;
    setLoading(true);
    if (current === val) {
      if (await removeSimklRating(target)) setCurrent(null);
    } else if (await addSimklRating(target, val)) {
      setCurrent(val);
    }
    setLoading(false);
  };

  const shown = current ?? 0;
  return (
    <Group label={t("Your rating")}>
      <div className="flex items-center gap-3 px-3 pb-2">
        <div className="flex items-center" role="group" aria-label={t("SIMKL rating picker")}>
          {[1, 2, 3, 4, 5].map((n) => {
            const full = 2 * n <= shown;
            const half = 2 * n - 1 === shown;
            return (
              <span key={n} className="relative flex h-11 w-11 items-center justify-center">
                <Star size={26} className="text-ink-muted/30" />
                {(full || half) && (
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
                    style={half ? { clipPath: "inset(0 50% 0 0)" } : undefined}
                  >
                    <Star size={26} className="fill-amber-400 text-amber-400" />
                  </span>
                )}
                <button
                  type="button"
                  aria-label={t("Rate {n}", { n: 2 * n - 1 })}
                  onClick={() => void rate(2 * n - 1)}
                  className="absolute inset-y-0 start-0 w-1/2"
                />
                <button
                  type="button"
                  aria-label={t("Rate {n}", { n: 2 * n })}
                  onClick={() => void rate(2 * n)}
                  className="absolute inset-y-0 end-0 w-1/2"
                />
              </span>
            );
          })}
        </div>
        <span className="text-[13px] font-semibold text-ink-muted">
          {loading ? (
            <Loader2 size={14} className="animate-spin text-ink-subtle" />
          ) : current != null ? (
            <span className="font-bold text-amber-400">{current}/10</span>
          ) : (
            <span className="text-ink-subtle">{t("Rate on SIMKL")}</span>
          )}
        </span>
      </div>
    </Group>
  );
}
