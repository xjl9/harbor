import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Library,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import traktLogo from "@/assets/trakt.svg";
import simklLogo from "@/assets/simkl.png";
import { CalendarIcon } from "@/components/icons/calendar-icon";
import { AuthModal } from "@/components/auth-modal";
import { Poster, usePosterChain } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { useAuth } from "@/lib/auth";
import {
  applyCalendarFilter,
  groupByDate,
  todayLocalISO,
  type CalendarFilter,
  type CalendarItem,
} from "@/lib/calendar";
import { useT } from "@/lib/i18n";
import {
  clearUnseenReminders,
  removeReminder,
  useReminders,
  useUnseenReminderCount,
  type ReminderEntry,
} from "@/lib/reminders";
import { library, type LibraryItem } from "@/lib/stremio";
import { useSettings, type Settings } from "@/lib/settings";
import { useSimkl } from "@/lib/simkl/provider";
import { useTrakt } from "@/lib/trakt/provider";
import { AiringCountdown } from "@/views/calendar/airing-countdown";
import { CalendarConfigRail } from "@/views/calendar/config/config-rail";
import { buildActiveCount } from "@/views/calendar/config/rail-sources";
import { EmptyState, ErrorState, NoKeyState, NotSignedInState } from "@/views/calendar/empty-states";
import type { Cell } from "@/views/calendar/types";
import { useCalendarData } from "@/views/calendar/use-calendar-data";
import {
  buildLibraryNameSet,
  buildMonthCells,
  calendarToMeta,
  FILTERS,
  formatDateLong,
  isUpcoming,
  MONTH_NAMES,
  normalizeName,
  orderedWeekdayNames,
} from "@/views/calendar/utils";
import { MobileDetail } from "../mobile-detail";
import { requestMobileIntent } from "../mobile-intent";
import {
  BottomSheet,
  Chip,
  ChipRow,
  DestinationPage,
  IconButton,
  SectionHead,
} from "./page-shell";

type Source = Settings["calendarSource"];

// Same list as the desktop SourceSwitcher; the component itself is a single
// non-wrapping pill row that does not fit a phone, so the options are rendered
// as a scrolling chip strip here with the same labels and marks.
const SOURCES: Array<{ id: Source; label: string; icon: () => ReactNode }> = [
  { id: "library", label: "My library", icon: () => <Library size={13} strokeWidth={2.2} /> },
  { id: "all", label: "All upcoming", icon: () => <Globe size={13} strokeWidth={2.2} /> },
  { id: "trakt", label: "My Trakt", icon: () => <img src={traktLogo} alt="" className="h-3.5 w-3.5 object-contain" /> },
  {
    id: "anticipated",
    label: "Trakt anticipated",
    icon: () => <img src={traktLogo} alt="" className="h-3.5 w-3.5 object-contain" />,
  },
  { id: "simkl", label: "My Simkl", icon: () => <img src={simklLogo} alt="" className="h-3.5 w-3.5 object-contain" /> },
  {
    id: "simkl-anticipated",
    label: "Simkl premieres",
    icon: () => <img src={simklLogo} alt="" className="h-3.5 w-3.5 object-contain" />,
  },
  { id: "anime", label: "Anime", icon: () => <Sparkles size={13} strokeWidth={2.2} /> },
  { id: "custom", label: "Custom", icon: () => <Star size={13} strokeWidth={2.2} /> },
];

// The nav badge: unseen reminder count, the same source the desktop sidebar
// reads for its red dot on the Calendar item.
export const useCalendarBadge = useUnseenReminderCount;

export function CalendarBadgeIcon({ active = false }: { active?: boolean }) {
  const unseen = useUnseenReminderCount();
  return (
    <span className="relative inline-flex">
      <CalendarIcon active={active} />
      {unseen > 0 && (
        <span className="pointer-events-none absolute -end-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-0.5 text-[9px] font-bold leading-none text-white">
          {unseen > 9 ? "9+" : unseen}
        </span>
      )}
    </span>
  );
}

export function MobileCalendar({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const { authKey } = useAuth();
  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: simklConnected } = useSimkl();
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [animeDub, setAnimeDub] = useState(false);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<Meta | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    clearUnseenReminders();
  }, []);

  const source = settings.calendarSource;
  const { items, loading, error } = useCalendarData({
    source,
    authKey,
    traktConnected,
    simklConnected,
    settings,
    year,
    month,
    animeDub,
  });

  useEffect(() => {
    if (!authKey || source !== "all") {
      setLibraryItems([]);
      return;
    }
    let cancelled = false;
    library(authKey)
      .then((rows) => {
        if (!cancelled) setLibraryItems(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authKey, source]);

  const libraryNames = useMemo(() => buildLibraryNameSet(libraryItems), [libraryItems]);

  const filtered = useMemo(() => {
    const hideAnime = (list: CalendarItem[]) =>
      settings.hideContent.anime ? list.filter((i) => !i.isAnime) : list;
    if (source !== "all" && source !== "simkl-anticipated") return hideAnime(items);
    const f: CalendarFilter = source === "all" && filter === "anime" ? "all" : filter;
    let out = hideAnime(applyCalendarFilter(items, f));
    if (source === "all") out = out.filter((i) => !i.isAnime);
    if (source === "all" && watchlistOnly) {
      out = out.filter((i) => {
        const kind = i.type === "tv" ? "tv" : "movie";
        return libraryNames.has(`${normalizeName(i.name)}::${kind}`);
      });
    }
    return out;
  }, [source, items, filter, watchlistOnly, libraryNames, settings.hideContent.anime]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const cells = useMemo(
    () => buildMonthCells(year, month, settings.weekStartsMonday),
    [year, month, settings.weekStartsMonday],
  );
  const todayISO = todayLocalISO();

  const upcoming = useMemo(() => {
    const now = Date.now();
    return filtered
      .filter((i) => i.releaseDate >= todayISO && (i.releaseAtMs == null || i.releaseAtMs >= now - 3_600_000))
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || (a.releaseAtMs ?? 0) - (b.releaseAtMs ?? 0))
      .slice(0, 12);
  }, [filtered, todayISO]);

  const openItem = useCallback((item: CalendarItem) => {
    setDay(null);
    setDetail(calendarToMeta(item));
  }, []);

  const goPrev = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const goNext = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };
  const onThisMonth = year === today.getFullYear() && month === today.getMonth();
  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  const visibleSources = SOURCES.filter(
    (o) =>
      (o.id !== "trakt" || traktConnected) &&
      (o.id !== "simkl" || simklConnected) &&
      (o.id !== "simkl-anticipated" || simklConnected) &&
      (o.id !== "anime" || !settings.hideContent.anime),
  );
  const showAllControls = source === "all";
  const showPremiereFilters = source === "simkl-anticipated";
  const hideTypeTag = source === "anime";
  const filtersActiveCount = buildActiveCount(settings.customCalendar);
  const filters =
    settings.hideContent.anime || source === "all"
      ? FILTERS.filter((f) => f.id !== "anime")
      : FILTERS;
  const dayItems = day ? (grouped.get(day) ?? []) : [];

  let body: ReactNode;
  if (source === "library" && !authKey) {
    body = <NotSignedInState onSignIn={() => setShowAuth(true)} />;
  } else if (source === "all" && !settings.tmdbKey) {
    // The TMDB key lives on the profile tab of the phone; the intent switches
    // there and this page stands down.
    body = <NoKeyState onSetup={() => requestMobileIntent("debrid")} />;
  } else if (error) {
    body = <ErrorState message={error} />;
  } else if (loading && filtered.length === 0) {
    body = <MonthSkeleton weekStartsMonday={settings.weekStartsMonday} />;
  } else if (filtered.length === 0) {
    body = (
      <EmptyState source={source} filter={filter} watchlistOnly={watchlistOnly} animeDub={animeDub} />
    );
  } else {
    body = (
      <>
        <MonthGrid
          cells={cells}
          grouped={grouped}
          todayISO={todayISO}
          weekStartsMonday={settings.weekStartsMonday}
          onOpenDay={setDay}
          large={settings.calendarPosterSize === "large"}
        />
        {upcoming.length > 0 && (
          <section className="mt-7 flex flex-col gap-3">
            <SectionHead title={t("Coming up")} count={upcoming.length} />
            <div className="flex flex-col gap-2">
              {upcoming.map((item) => (
                <ReleaseRow
                  key={item.id}
                  item={item}
                  onOpen={openItem}
                  hideTypeTag={hideTypeTag}
                  showDate
                />
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <DestinationPage
      kicker={t("Releases")}
      title={t("Calendar")}
      icon={<CalendarIcon />}
      onBack={onBack}
      tint
      actions={
        <RemindersButton onClick={() => setRemindersOpen(true)} />
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex items-center gap-1">
          <IconButton label={t("Previous month")} onClick={goPrev}>
            <ChevronLeft size={22} strokeWidth={2.2} className="dir-icon" />
          </IconButton>
          <button
            type="button"
            onClick={goToday}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-edge-soft text-[15px] font-semibold text-ink"
          >
            {t(MONTH_NAMES[month])} {year}
            {!onThisMonth && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                {t("Today")}
              </span>
            )}
          </button>
          <IconButton label={t("Next month")} onClick={goNext}>
            <ChevronRight size={22} strokeWidth={2.2} className="dir-icon" />
          </IconButton>
        </div>

        <ChipRow>
          {visibleSources.map((opt) => (
            <Chip
              key={opt.id}
              label={t(opt.label)}
              icon={opt.icon()}
              active={source === opt.id}
              onClick={() => update({ calendarSource: opt.id })}
            />
          ))}
        </ChipRow>

        <ChipRow>
          {source === "anime" &&
            (["sub", "dub"] as const).map((mode) => (
              <Chip
                key={mode}
                label={mode === "sub" ? t("Sub") : t("Dub")}
                active={animeDub === (mode === "dub")}
                onClick={() => setAnimeDub(mode === "dub")}
              />
            ))}
          {source === "custom" && (
            <Chip
              label={t("Filters")}
              icon={<SlidersHorizontal size={13} strokeWidth={2.2} />}
              count={filtersActiveCount > 0 ? filtersActiveCount : undefined}
              active={configOpen}
              onClick={() => setConfigOpen(true)}
            />
          )}
          {(showAllControls || showPremiereFilters) &&
            filters.map((f) => {
              const pool = showAllControls ? items.filter((i) => !i.isAnime) : items;
              const count =
                f.id === "all"
                  ? showAllControls
                    ? filtered.length
                    : items.length
                  : applyCalendarFilter(pool, f.id).length;
              return (
                <Chip
                  key={f.id}
                  label={t(f.label)}
                  count={count}
                  active={filter === f.id}
                  onClick={() => setFilter(f.id)}
                />
              );
            })}
          {showAllControls && (
            <Chip
              label={t("Watchlist only")}
              icon={<Star size={12} strokeWidth={2.4} className={watchlistOnly ? "fill-canvas" : ""} />}
              active={watchlistOnly}
              disabled={!authKey}
              onClick={() => authKey && setWatchlistOnly((v) => !v)}
            />
          )}
          <Chip
            label={t("Display")}
            icon={<SlidersHorizontal size={13} strokeWidth={2.2} />}
            active={displayOpen}
            onClick={() => setDisplayOpen(true)}
          />
        </ChipRow>
      </div>

      <div className="pt-2">{body}</div>

      {day && dayItems.length > 0 && (
        <BottomSheet
          title={formatDateLong(day)}
          subtitle={
            dayItems.length === 1
              ? t("{n} title", { n: dayItems.length })
              : t("{n} titles", { n: dayItems.length })
          }
          onClose={() => setDay(null)}
          tall
        >
          <div className="flex flex-col gap-2">
            {dayItems.map((item) => (
              <ReleaseRow key={item.id} item={item} onOpen={openItem} hideTypeTag={hideTypeTag} />
            ))}
          </div>
        </BottomSheet>
      )}

      {displayOpen && (
        <BottomSheet title={t("Display")} onClose={() => setDisplayOpen(false)}>
          <div className="flex flex-col gap-1 px-1">
            <ToggleLine
              label={t("Start week on Monday")}
              on={settings.weekStartsMonday}
              onToggle={() => update({ weekStartsMonday: !settings.weekStartsMonday })}
            />
            <p className="px-3 pb-1 pt-4 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
              {t("Poster size")}
            </p>
            <div className="flex gap-2 px-3 pb-2">
              <Chip
                label={t("Default")}
                active={settings.calendarPosterSize === "default"}
                onClick={() => update({ calendarPosterSize: "default" })}
              />
              <Chip
                label={t("Large")}
                active={settings.calendarPosterSize === "large"}
                onClick={() => update({ calendarPosterSize: "large" })}
              />
            </div>
          </div>
        </BottomSheet>
      )}

      {remindersOpen && (
        <RemindersSheet
          onClose={() => setRemindersOpen(false)}
          onOpen={(r) => {
            setRemindersOpen(false);
            setDetail({ id: r.id, type: "series", name: r.name, poster: r.poster });
          }}
        />
      )}

      {source === "custom" && configOpen && (
        // The desktop rail already has a narrow overlay mode (a 360px drawer
        // over a relative host); this full-screen host lets it slide over the
        // page. Trakt connect lives in the phone settings sheet.
        <div className="fixed inset-0 z-[74]">
          <CalendarConfigRail
            open
            overlay
            onOpenChange={(o) => {
              if (!o) setConfigOpen(false);
            }}
            tmdbKey={settings.tmdbKey}
            traktConnected={traktConnected}
            value={settings.customCalendar}
            onChange={(next) => update({ customCalendar: next })}
            resultCount={filtered.length}
            onConnectTrakt={() => requestMobileIntent("settings")}
          />
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {detail && <MobileDetail meta={detail} onClose={() => setDetail(null)} />}
    </DestinationPage>
  );
}

function RemindersButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  const reminders = useReminders();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("Reminders")}
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-muted"
    >
      <Bell size={20} strokeWidth={2} />
      {reminders.length > 0 && (
        <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[10px] font-bold leading-none text-canvas">
          {reminders.length}
        </span>
      )}
    </button>
  );
}

function RemindersSheet({
  onClose,
  onOpen,
}: {
  onClose: () => void;
  onOpen: (r: ReminderEntry) => void;
}) {
  const t = useT();
  const reminders = useReminders();
  const summary = (entry: ReminderEntry) => {
    const parts: string[] = [];
    if (entry.episodes) parts.push(t("Episodes"));
    if (entry.seasons) parts.push(t("Seasons"));
    const tone =
      entry.tone === "chime" ? t("Chime") : entry.tone === "pulse" ? t("Pulse") : t("Silent");
    return `${parts.join(" + ")} · ${tone}`;
  };
  return (
    <BottomSheet title={t("Reminders")} onClose={onClose}>
      {reminders.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13.5px] leading-relaxed text-ink-muted">
          {t("No reminders yet. Use the clock on a show's page to get told about new episodes and seasons.")}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {reminders.map((r) => (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 active:bg-canvas/40">
              <button
                type="button"
                onClick={() => onOpen(r)}
                className="flex min-w-0 flex-1 items-center gap-3 text-start"
              >
                <span className="h-14 w-10 shrink-0 overflow-hidden rounded-md bg-canvas/50 ring-1 ring-edge-soft">
                  <Poster src={r.poster} seed={r.id} ratio="portrait" className="h-full w-full" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[14.5px] font-semibold text-ink">{r.name}</span>
                  <span className="truncate text-[12px] text-ink-subtle">{summary(r)}</span>
                </span>
              </button>
              <IconButton label={t("Remove reminder")} onClick={() => removeReminder(r.id)}>
                <Trash2 size={17} strokeWidth={2} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}

function ToggleLine({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex h-12 w-full items-center justify-between gap-4 rounded-xl px-3 text-start active:bg-canvas/40"
    >
      <span className="text-[15px] font-medium text-ink">{label}</span>
      <span
        className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-raised"}`}
      >
        <span
          className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow transition-[inset-inline-start] ${
            on ? "start-[23px]" : "start-[3px]"
          }`}
        />
      </span>
    </button>
  );
}

// Seven columns at phone width leave about 50px per day, so the cells show
// poster stubs instead of the desktop's named chips; the day sheet carries the
// names. Cells with releases are the tappables, at the 44pt floor.
function MonthGrid({
  cells,
  grouped,
  todayISO,
  weekStartsMonday,
  onOpenDay,
  large,
}: {
  cells: Cell[];
  grouped: Map<string, CalendarItem[]>;
  todayISO: string;
  weekStartsMonday: boolean;
  onOpenDay: (iso: string) => void;
  large: boolean;
}) {
  const t = useT();
  const weekdays = orderedWeekdayNames(weekStartsMonday);
  const cap = large ? 1 : 2;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            {t(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const events = grouped.get(cell.iso) ?? [];
          const isToday = cell.iso === todayISO;
          const has = events.length > 0;
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={!has}
              onClick={() => onOpenDay(cell.iso)}
              aria-label={
                has
                  ? t("{date}: {n} releases", { date: cell.date.getDate(), n: events.length })
                  : String(cell.date.getDate())
              }
              className={`flex min-h-[64px] flex-col gap-1 rounded-lg border p-1 text-start transition-colors ${
                cell.inMonth
                  ? isToday
                    ? "border-ink/60 bg-elevated/60"
                    : has
                      ? "border-edge-soft bg-elevated/35 active:bg-elevated"
                      : "border-edge-soft/60 bg-elevated/10"
                  : "border-transparent bg-canvas/30 opacity-40"
              } disabled:cursor-default`}
            >
              <span className="flex items-center justify-between leading-none">
                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    isToday ? "text-ink" : cell.inMonth ? "text-ink-muted" : "text-ink-subtle"
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                {events.length > cap && (
                  <span className="text-[9px] font-bold text-ink-subtle">+{events.length - cap}</span>
                )}
              </span>
              {has && (
                <span className="flex gap-0.5">
                  {events.slice(0, cap).map((item) => (
                    <DayStub key={item.id} item={item} large={large} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayStub({ item, large }: { item: CalendarItem; large: boolean }) {
  const { settings } = useSettings();
  const poster = usePosterChain(
    settings.rpdbKey,
    item.id,
    item.poster ?? undefined,
    item.type === "tv" ? "series" : "movie",
  );
  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-[3px] bg-canvas/60 ${large ? "h-9 w-full" : "h-7 w-5"}`}
    >
      <Poster
        src={poster.src}
        onError={poster.onError}
        seed={item.id}
        ratio="portrait"
        lazy
        className="h-full w-full"
      />
    </span>
  );
}

function MonthSkeleton({ weekStartsMonday }: { weekStartsMonday: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1.5" aria-hidden>
      <div className="grid grid-cols-7 gap-1">
        {orderedWeekdayNames(weekStartsMonday).map((d) => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
            {t(d)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="harbor-skeleton min-h-[64px] rounded-lg bg-elevated/25" />
        ))}
      </div>
    </div>
  );
}

function ReleaseRow({
  item,
  onOpen,
  hideTypeTag,
  showDate = false,
}: {
  item: CalendarItem;
  onOpen: (item: CalendarItem) => void;
  hideTypeTag: boolean;
  showDate?: boolean;
}) {
  const t = useT();
  const { settings } = useSettings();
  const poster = usePosterChain(
    settings.rpdbKey,
    item.id,
    item.poster ?? undefined,
    item.type === "tv" ? "series" : "movie",
  );
  const tag = item.isAnime ? t("Anime") : item.type === "movie" ? t("Movie") : t("TV");
  const tagClass = item.isAnime
    ? "bg-rose-400/20 text-rose-200"
    : item.type === "movie"
      ? "bg-amber-400/20 text-amber-200"
      : "bg-blue-400/20 text-blue-200";
  const large = settings.calendarPosterSize === "large";
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex items-start gap-3 rounded-xl border border-edge-soft bg-canvas/40 p-2.5 text-start active:bg-canvas/70"
    >
      <span
        className={`shrink-0 overflow-hidden rounded-md bg-elevated/50 ring-1 ring-edge-soft ${
          large ? "h-[96px] w-16" : "h-[72px] w-12"
        }`}
      >
        <Poster src={poster.src} onError={poster.onError} seed={item.id} ratio="portrait" lazy className="h-full w-full" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          {!hideTypeTag && (
            <span className={`shrink-0 rounded px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[0.12em] ${tagClass}`}>
              {tag}
            </span>
          )}
          {showDate && (
            <span className="truncate text-[11px] font-semibold text-ink-subtle">
              {formatDateLong(item.releaseDate)}
            </span>
          )}
          {item.voteAverage > 0 && (
            <span className="ms-auto shrink-0 text-[11px] text-ink-muted">
              <span className="text-amber-300">★</span> {item.voteAverage.toFixed(1)}
            </span>
          )}
        </span>
        <span className="line-clamp-2 text-[14.5px] font-semibold leading-tight text-ink">{item.name}</span>
        {item.releaseTime && (
          <span className="text-[11.5px] font-medium text-ink-subtle">
            <Clock size={11} className="me-1 inline text-rose-300" />
            {item.releaseTime}
            {isUpcoming(item) && <AiringCountdown atMs={item.releaseAtMs!} />}
          </span>
        )}
        {item.overview && (
          <span className="line-clamp-2 text-[12px] leading-relaxed text-ink-muted">{item.overview}</span>
        )}
      </span>
    </button>
  );
}
