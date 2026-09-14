import { useMemo, useState } from "react";
import { resolveAddonLogo } from "@/components/addon-logo";
import { ServiceLogo } from "@/components/service-logo";
import type { Addon } from "@/lib/addons";
import { hostOf, moveItem } from "@/lib/addons-store/reorder";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { SERVICES } from "@/lib/providers/streaming";
import { useSettings, type StreamingService, type StreamPriorityEntry } from "@/lib/settings";
import { addonKey, declaresStream } from "@/lib/streams/addon-priority";
import type { StreamMode } from "@/lib/streams/mode";
import { StreamFiltersPanel } from "@/views/settings/stream-filters-panel";
import { HomeServersTab } from "@/views/settings/streaming-sources-panel/home-servers-tab";
import type { SectionId } from "@/views/settings/shared";
import { SetIcon } from "@/views/settings/set-icon";
import { useAddons } from "@/views/play-picker/use-addons";
import { DEPT_BY_ID } from "./registry";
import {
  ChoiceRow,
  Dept,
  DesktopPanel,
  FOCUS,
  Group,
  NavRow,
  Note,
  PhonePage,
  PickerSheet,
  SegmentedRow,
  tapHaptic,
  ToggleRow,
} from "./kit";

type Sub = "home-servers" | "filters";
type Entry = { key: string; name: string; host: string; logo: string | null; muted?: boolean };

const MAX_PRIORITY = 64;
const TIMEOUT_CHOICES = [15, 30, 45, 60, 90] as const;

function entryOf(a: Addon): Entry {
  return {
    key: addonKey(a),
    name: a.manifest.name,
    host: hostOf(a.transportUrl),
    logo: resolveAddonLogo(a.manifest.logo, a.transportUrl),
  };
}

// Desktop's StreamPriorityCard is a drag list. Dragging inside a scrolling phone
// page fights the scroll gesture, so the phone gets explicit up and down
// buttons over the same ordering and the same streamPriority value.
function PriorityList() {
  const t = useT();
  const { authKey } = useAuth();
  const { settings, update } = useSettings();
  const { addons } = useAddons(authKey, settings);
  const prefs = settings.streamPriority;
  const streamAddons = useMemo(() => (addons ?? []).filter(declaresStream), [addons]);

  const entries = useMemo<Entry[]>(() => {
    const byKey = new Map(streamAddons.map((a) => [addonKey(a), a] as const));
    const used = new Set<string>();
    const out: Entry[] = [];
    for (const p of prefs) {
      if (used.has(p.key)) continue;
      used.add(p.key);
      const live = byKey.get(p.key);
      out.push(live ? entryOf(live) : { key: p.key, name: p.name, host: t("Not installed"), logo: null, muted: true });
    }
    for (const a of streamAddons) {
      const k = addonKey(a);
      if (used.has(k)) continue;
      used.add(k);
      out.push(entryOf(a));
    }
    return out;
  }, [streamAddons, prefs, t]);

  const commit = (next: Entry[]) => {
    const value: StreamPriorityEntry[] = next.slice(0, MAX_PRIORITY).map((e) => ({ key: e.key, name: e.name }));
    update({ streamPriority: value });
  };
  const move = (from: number, to: number) => {
    const clamped = Math.max(0, Math.min(entries.length - 1, to));
    if (clamped === from) return;
    tapHaptic();
    commit(moveItem(entries, from, clamped));
  };

  const custom = prefs.length > 0;
  const loading = addons == null;
  const tooFew = !loading && streamAddons.length < 2;

  return (
    <Group
      label={t("Stream priority")}
      note={t("Results from addons higher in this list come first. If one finds nothing, the next fills in.")}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
          {custom ? t("Custom") : t("Following addon order")}
        </span>
        {custom && (
          <button
            type="button"
            onClick={() => update({ streamPriority: [] })}
            className={`flex h-9 shrink-0 items-center rounded-full border border-edge-soft px-3.5 text-[13px] font-semibold text-ink ${FOCUS}`}
          >
            {t("Use addon order")}
          </button>
        )}
      </div>
      {loading ? (
        <div className="flex flex-col gap-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-raised/40 motion-reduce:animate-none" />
          ))}
        </div>
      ) : tooFew ? (
        <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink-subtle">
          {t("Priority applies once you have two or more stream addons.")}
        </p>
      ) : (
        entries.map((e, i) => (
          <div key={e.key} className="flex items-center gap-3 py-2 pe-2 ps-4">
            <span className="w-4 shrink-0 text-center font-mono text-[12px] tabular-nums text-ink-subtle">{i + 1}</span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-raised/60">
              {e.logo ? (
                <img src={e.logo} alt="" draggable={false} className="h-full w-full object-contain" />
              ) : (
                <SetIcon name="Puzzle" size={16} className="text-ink-subtle" />
              )}
            </span>
            <span className={`flex min-w-0 flex-1 flex-col ${e.muted ? "opacity-60" : ""}`}>
              <span className="truncate text-[14.5px] font-medium text-ink">{e.name}</span>
              <span className="truncate text-[12px] text-ink-subtle">{e.host}</span>
            </span>
            {e.muted ? (
              <button
                type="button"
                aria-label={t("Remove from list")}
                onClick={() => commit(entries.filter((_, n) => n !== i))}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-subtle active:bg-raised/60 ${FOCUS}`}
              >
                <SetIcon name="X" size={18} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={t("Move up")}
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted active:bg-raised/60 disabled:opacity-25 ${FOCUS}`}
                >
                  <SetIcon name="ChevronUp" size={18} />
                </button>
                <button
                  type="button"
                  aria-label={t("Move down")}
                  disabled={i === entries.length - 1}
                  onClick={() => move(i, i + 1)}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ink-muted active:bg-raised/60 disabled:opacity-25 ${FOCUS}`}
                >
                  <SetIcon name="ChevronDown" size={18} />
                </button>
              </>
            )}
          </div>
        ))
      )}
    </Group>
  );
}

export function SourcesPage({
  onBack,
  onJump,
  initialSub,
  anchor,
}: {
  onBack: () => void;
  onJump: (section: SectionId, tab?: string) => void;
  initialSub?: string | null;
  anchor?: string | null;
}) {
  const t = useT();
  const { settings, update, toggleStreaming } = useSettings();
  const [sub, setSub] = useState<Sub | null>(
    initialSub === "home-servers" || initialSub === "filters" ? initialSub : null,
  );
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const dept = DEPT_BY_ID.sources;

  const filters = settings.customStreamFilters ?? [];
  const activeFilter = filters.find((f) => f.id === settings.activeStreamFilterId);
  const rawTimeout = settings.addonTimeoutSec ?? 30;
  const timeout = Number.isFinite(rawTimeout) ? Math.max(8, Math.min(120, rawTimeout)) : 30;
  const timeoutLabel = (s: number) => (s === 30 ? t("30 seconds (default)") : t("{seconds} seconds", { seconds: s }));

  return (
    <>
      <PhonePage title={t(dept.label)} kicker={t("Settings")} icon={dept.icon} onBack={onBack} anchor={anchor}>
        <Dept
          index={0}
          icon="Tv"
          title={t("Streaming catalogs")}
          standfirst={t("Top titles per service. Toggle off the ones you don't pay for.")}
        >
          <div className="grid grid-cols-3 gap-2.5">
            {(Object.keys(SERVICES) as StreamingService[]).map((svc) => {
              const on = settings.streaming[svc];
              return (
                <button
                  key={svc}
                  type="button"
                  onClick={() => {
                    tapHaptic();
                    toggleStreaming(svc);
                  }}
                  aria-pressed={on}
                  aria-label={SERVICES[svc].name}
                  className={`relative flex h-[64px] items-center justify-center overflow-hidden rounded-xl border px-2 transition-all ${
                    on ? "border-ink-subtle/50 bg-raised opacity-100" : "border-edge-soft bg-canvas opacity-55"
                  } ${FOCUS}`}
                >
                  <ServiceLogo service={svc} height={22} />
                  {on && (
                    <span className="absolute end-1.5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink">
                      <SetIcon name="Check" size={9} strokeWidth={3} className="text-canvas" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {!settings.tmdbKey && (
            <Group>
              <NavRow
                icon="AlertTriangle"
                label={t("Streaming catalogs need a TMDB key")}
                sub={t("Save a TMDB key in Library & metadata to turn on streaming catalogs.")}
                onClick={() => onJump("library", "providers")}
              />
            </Group>
          )}
        </Dept>

        <Dept index={1} icon="Server" title={t("Home servers")}>
          <Group>
            <NavRow
              icon="Server"
              label={t("Home servers")}
              sub={t("Personal media servers Harbor can play from.")}
              onClick={() => setSub("home-servers")}
            />
          </Group>
        </Dept>

        <Dept
          index={2}
          icon="SourcePreferences"
          title={t("Stream safety filter")}
          standfirst={t("Choose which addon results appear when you pick a stream.")}
        >
          <Group>
            <ChoiceRow
              label={t("Strict")}
              tag={t("Default")}
              sub={t("Hide suspicious files, mismatched releases, likely camera recordings and trailers. Also check file sizes and season packs.")}
              selected={settings.streamFilterLevel === "strict"}
              onClick={() => update({ streamFilterLevel: "strict" })}
            />
            <ChoiceRow
              label={t("Balanced")}
              sub={t("Keep the suspicious-file and release checks, but allow more results, including larger files and season packs.")}
              selected={settings.streamFilterLevel === "balanced"}
              onClick={() => update({ streamFilterLevel: "balanced" })}
            />
            <ChoiceRow
              label={t("Off")}
              sub={t("Show all results returned by addons, including releases that do not match or may be suspicious.")}
              selected={settings.streamFilterLevel === "off"}
              onClick={() => update({ streamFilterLevel: "off" })}
            />
          </Group>
          <Group>
            <NavRow
              icon="Filter"
              label={t("Saved stream filters")}
              sub={t("Save the stream quality you prefer. Streams must match every category you set; leave a category blank to accept any value. If nothing matches, Harbor uses the next best available source.")}
              value={activeFilter ? activeFilter.name.trim() || t("Untitled filter") : t("No filter")}
              onClick={() => setSub("filters")}
            />
            <NavRow
              icon="Timer"
              label={t("Addon wait time")}
              sub={t("How long Harbor waits for each addon to return results.")}
              value={timeoutLabel(timeout)}
              onClick={() => setTimeoutOpen(true)}
            />
          </Group>
        </Dept>

        <Dept
          index={3}
          icon="ArrowDownUp"
          title={t("Result order")}
          standfirst={t("Harbor ranking puts the best-scoring sources first. Addon order keeps each addon's results in the order it returned them, like the Stremio and Vidi apps. Stream priority below decides which addon leads, in both modes.")}
        >
          <Group>
            <ChoiceRow
              label={t("Harbor ranking")}
              sub={t("Default. Harbor parses and scores every source and surfaces the best quality first.")}
              selected={settings.streamSort === "harbor"}
              onClick={() => update({ streamSort: "harbor" })}
            />
            <ChoiceRow
              label={t("Addon order")}
              sub={t("Show each addon's results in the order it returned them, grouped by your addon list. Matches the Stremio and Vidi apps.")}
              selected={settings.streamSort === "addon"}
              onClick={() => update({ streamSort: "addon" })}
            />
          </Group>
          <PriorityList />
        </Dept>

        <Dept
          index={4}
          icon="MousePointerClick"
          title={t("Picker layout")}
          standfirst={t("Condensed shows a top pick, quality tiles, and a drawer. Stremio is a flat list grouped by addon, no scoring.")}
        >
          <Group>
            <ChoiceRow
              label={t("Condensed")}
              selected={settings.pickerLayout === "condensed"}
              onClick={() => update({ pickerLayout: "condensed" })}
            />
            <ChoiceRow
              label={t("Stremio")}
              selected={settings.pickerLayout === "stremio"}
              onClick={() => update({ pickerLayout: "stremio" })}
            />
          </Group>
          <Group label={t("Source mode")}>
            <SegmentedRow<StreamMode>
              icon="Waypoints"
              label={t("Prefer these sources")}
              sub={t("Both shows direct, debrid, and peer-to-peer results together. Direct/debrid keeps P2P results out of the way unless nothing else is available. P2P puts them first.")}
              value={settings.streamMode}
              options={[
                { value: "both", label: t("Both") },
                { value: "addons", label: t("Direct/debrid") },
                { value: "p2p", label: t("P2P") },
              ]}
              onChange={(mode) => update({ streamMode: mode })}
            />
          </Group>
          <Group label={t("Picker details")}>
            <ToggleRow
              icon="RefreshCw"
              label={t("Move Refresh next to Back")}
              sub={t("Groups Refresh beside Back at the start of the picker header. Off keeps it at the far end, across from Back.")}
              on={settings.pickerRefreshNextToBack}
              onChange={(v) => update({ pickerRefreshNextToBack: v })}
            />
            <ToggleRow
              icon="FileText"
              label={t("Show release name")}
              sub={t("Show release filenames in the Condensed picker and Big Picture.")}
              on={settings.pickerShowFilename}
              onChange={(v) => update({ pickerShowFilename: v })}
            />
            <ToggleRow
              icon="AlignLeft"
              label={t("Show full descriptions")}
              sub={t("Show complete addon descriptions in the Stremio picker, downloads, and Big Picture.")}
              on={settings.fullStreamDescription}
              onChange={(v) => update({ fullStreamDescription: v })}
            />
            <ToggleRow
              icon="Shield"
              label={t("Show adult addons")}
              on={settings.showAdultAddons}
              onChange={(v) => update({ showAdultAddons: v })}
            />
          </Group>
          <Note>{t("Results appear as they arrive. Increase the wait time if an addon often needs a refresh before its results appear.")}</Note>
        </Dept>
      </PhonePage>

      {sub === "home-servers" && (
        <PhonePage title={t("Home servers")} kicker={t(dept.label)} icon="Server" depth={2} onBack={() => setSub(null)}>
          <DesktopPanel onJump={onJump}>
            <HomeServersTab />
          </DesktopPanel>
        </PhonePage>
      )}
      {sub === "filters" && (
        <PhonePage title={t("Stream filters")} kicker={t(dept.label)} icon="Filter" depth={2} onBack={() => setSub(null)}>
          <DesktopPanel onJump={onJump}>
            <StreamFiltersPanel />
          </DesktopPanel>
        </PhonePage>
      )}
      {timeoutOpen && (
        <PickerSheet
          title={t("Addon wait time")}
          value={String(timeout)}
          options={[...new Set<number>([...TIMEOUT_CHOICES, timeout])]
            .sort((a, b) => a - b)
            .map((s) => ({ value: String(s), label: timeoutLabel(s) }))}
          onPick={(v) => update({ addonTimeoutSec: Number(v) })}
          onClose={() => setTimeoutOpen(false)}
        />
      )}
    </>
  );
}
