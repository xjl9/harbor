import { useEffect, useMemo, useState } from "react";
import animeIcon from "@/assets/category/anime.svg";
import catalogsIcon from "@/assets/category/catalogs.svg";
import livetvIcon from "@/assets/category/livetv.svg";
import sportsIcon from "@/assets/category/sports.svg";
import streamsIcon from "@/assets/category/streams.svg";
import subtitlesIcon from "@/assets/category/subtitles.svg";
import elfLogo from "@/assets/elfhosted.svg";
import { AddonLogo, resolveAddonLogo } from "@/components/addon-logo";
import { loadInstalled } from "@/lib/addon-store";
import { ELF_BUNDLE, elfProductFor } from "@/lib/addons-store/elfhosted";
import type { ResolvedAddon } from "@/lib/addons-store/store";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { idOf, nameOf, subtitleFromManifest } from "@/views/addons/addons-utils";
import { SetIcon } from "@/views/settings/set-icon";
import { FOCUS, Pill, tapHaptic } from "./kit";

// ---------------------------------------------------------------------------
// ElfHosted bundle. Same data, copy and 30-day snooze key as the desktop card;
// stacked instead of a single truncating line because 402pt cannot carry the
// logo, two sentences and two buttons side by side.
const DISMISS_KEY = "harbor.elfhosted.bundle.dismissedUntil";
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 30;

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch {
    return false;
  }
}

function snooze(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + SNOOZE_MS));
  } catch {
    /* storage blocked */
  }
}

export function ElfHostedBundleCardPhone() {
  const t = useT();
  const [hidden, setHidden] = useState(() => snoozed());
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    try {
      setIds(loadInstalled().map((e) => e.id ?? ""));
    } catch {
      setIds([]);
    }
  }, []);

  const yours = useMemo(() => {
    for (const id of ids) {
      const p = elfProductFor({ id, name: id });
      if (p) return p.label;
    }
    return null;
  }, [ids]);

  if (hidden) return null;

  return (
    <div className="relative flex flex-col gap-2.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 p-4">
      <button
        type="button"
        onClick={() => {
          snooze();
          setHidden(true);
        }}
        aria-label={t("Hide this")}
        className={`no-press absolute end-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-full text-ink-subtle ${FOCUS}`}
      >
        <SetIcon name="X" size={15} strokeWidth={2.2} />
      </button>
      <div className="flex items-center gap-2.5 pe-10">
        <img src={elfLogo} alt="" draggable={false} className="h-6 w-6 shrink-0 object-contain" />
        <p className="text-[14.5px] font-semibold leading-snug text-ink">
          {yours
            ? t("Get {name} hosted, plus {n} more addons.", { name: yours, n: String(ELF_BUNDLE.addonCount - 1) })
            : t("Rather not set any of this up?")}
        </p>
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-muted">
        {t(
          "{n} addons run for you, with Debridge included: TorBox and Usenet accounts, so there is no debrid service to buy separately.",
          { n: String(ELF_BUNDLE.addonCount) },
        )}
      </p>
      <div>
        <Pill
          variant="primary"
          small
          onClick={() => openUrl(ELF_BUNDLE.url)}
          icon={<SetIcon name="ArrowUpRight" size={12} strokeWidth={2.4} className="dir-icon" />}
        >
          {t("Try it for ${n}", { n: String(ELF_BUNDLE.trialUsd) })}
        </Pill>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category grid: the six desktop tiles with the same category art and slugs.
// Selecting one filters the community list below instead of jumping to a
// separate Browse tab, which the phone does not have.
export const CATEGORY_TILES: Array<{ cat: string; title: string; blurb: string; accent: string; icon: string }> = [
  { cat: "http+streams", title: "Streaming", blurb: "Where your video comes from", accent: "from-amber-500/40 to-orange-600/30", icon: streamsIcon },
  { cat: "metadata", title: "Catalogs", blurb: "Posters, ratings, lists", accent: "from-blue-500/40 to-indigo-600/30", icon: catalogsIcon },
  { cat: "subtitles", title: "Subtitles", blurb: "Captions in your language", accent: "from-violet-500/40 to-fuchsia-600/30", icon: subtitlesIcon },
  { cat: "anime", title: "Anime", blurb: "Kitsu, MAL, season-aware", accent: "from-rose-500/40 to-pink-600/30", icon: animeIcon },
  { cat: "torrents", title: "Torrents", blurb: "P2P sources, debrid-ready", accent: "from-emerald-500/40 to-teal-600/30", icon: sportsIcon },
  { cat: "live+tv", title: "Live TV", blurb: "OTA channels + IPTV", accent: "from-cyan-500/40 to-sky-600/30", icon: livetvIcon },
];

export function CategoryGridPhone({
  active,
  onSelect,
}: {
  active: string | null;
  onSelect: (cat: string | null) => void;
}) {
  const t = useT();
  return (
    <section>
      <div className="mb-3">
        <h3 className="font-display text-[21px] font-medium tracking-tight text-ink">{t("Browse by category")}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {t("Six places to start. Tap one and we'll filter the catalog for you.")}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {CATEGORY_TILES.map((tile) => {
          const selected = active === tile.cat;
          return (
            <button
              key={tile.cat}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                tapHaptic();
                onSelect(selected ? null : tile.cat);
              }}
              className={`no-press relative flex h-[104px] overflow-hidden rounded-2xl border text-start transition-colors ${
                selected ? "border-accent ring-1 ring-accent" : "border-edge-soft"
              } ${FOCUS}`}
            >
              <span className={`absolute inset-0 bg-gradient-to-br ${tile.accent}`} />
              <span className="absolute inset-0 bg-gradient-to-t from-canvas/85 via-canvas/30 to-transparent" />
              <img
                src={tile.icon}
                alt=""
                aria-hidden
                draggable={false}
                className="pointer-events-none absolute end-3 top-3 h-12 w-12 select-none opacity-55"
              />
              <span className="relative flex flex-1 flex-col justify-end p-3.5">
                <span className="font-display text-[17px] font-medium tracking-tight text-ink">{t(tile.title)}</span>
                <span className="text-[11.5px] text-ink-muted">{t(tile.blurb)}</span>
              </span>
              {selected && (
                <span className="harbor-pop absolute end-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-canvas">
                  <SetIcon name="Check" size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Recommended rows. The set comes from the desktop recommend helper over the
// merged catalog; a debrid builder is attached by the parent only when the
// catalog surfaced the addon that has one and a debrid key is saved.
export function SuggestedList({
  items,
  installedIds,
  onOpen,
  onInstall,
  debridBuilderFor,
}: {
  items: ResolvedAddon[];
  installedIds: Set<string>;
  onOpen: (r: ResolvedAddon) => void;
  onInstall: (r: ResolvedAddon, debridUrl?: string) => Promise<void>;
  debridBuilderFor: (r: ResolvedAddon) => { label: string; url: string } | null;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((r) => {
        const id = idOf(r);
        const name = nameOf(r);
        const installed = installedIds.has(id) || r.installed;
        const configurable =
          r.manifest?.behaviorHints?.configurable === true ||
          r.manifest?.behaviorHints?.configurationRequired === true;
        const debrid = debridBuilderFor(r);
        const working = busy === id;
        const run = async (debridUrl?: string) => {
          if (working) return;
          setBusy(id);
          try {
            await onInstall(r, debridUrl);
          } finally {
            setBusy(null);
          }
        };
        return (
          <div key={id + ":" + r.transportUrl} className="flex items-center gap-3 rounded-2xl border border-edge-soft/70 bg-elevated/40 py-2 ps-3.5 pe-2">
            <button type="button" onClick={() => onOpen(r)} className={`no-press flex min-h-[48px] min-w-0 flex-1 items-center gap-3 text-start ${FOCUS}`}>
              <AddonLogo addonId={id} addonName={name} manifestLogo={resolveAddonLogo(r.manifest?.logo, r.transportUrl)} size="xl" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-medium text-ink">{name}</span>
                <span className="line-clamp-1 text-[12px] text-ink-subtle">{subtitleFromManifest(r)}</span>
              </span>
            </button>
            {installed ? (
              <Pill small variant="success" icon={<SetIcon name="Check" size={13} strokeWidth={2.6} />}>
                {t("Added")}
              </Pill>
            ) : debrid ? (
              <Pill small variant="primary" disabled={working} onClick={() => void run(debrid.url)} ariaLabel={t("Install with {name}", { name: debrid.label })}>
                {working ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : t("Install with {name}", { name: debrid.label })}
              </Pill>
            ) : configurable ? (
              <Pill small variant="primary" disabled={working} onClick={() => void run()} icon={<SetIcon name="Settings2" size={13} strokeWidth={2.2} />}>
                {t("Configure")}
              </Pill>
            ) : (
              <Pill small variant="primary" disabled={working} onClick={() => void run()} icon={working ? undefined : <SetIcon name="Plus" size={13} strokeWidth={2.6} />}>
                {working ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : t("Add")}
              </Pill>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The onboarding essentials (Cinemeta today). Shown until installed so a fresh
// device always has a catalog source one tap away.
export function EssentialsList({
  suggestions,
  installedUrls,
  busyUrl,
  onAdd,
}: {
  suggestions: Array<{ id: string; name: string; note: string; url: string }>;
  installedUrls: Set<string>;
  busyUrl: string | null;
  onAdd: (url: string) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2.5">
      {suggestions.map((s) => {
        const done = installedUrls.has(s.url.replace(/\/$/, ""));
        const working = busyUrl === s.url;
        return (
          <div key={s.id} className="flex min-h-[64px] items-center gap-3.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 py-2 ps-3.5 pe-2">
            <AddonLogo addonId={s.id} addonName={s.name} size="xl" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-ink">{s.name}</p>
              <p className="truncate text-[12px] text-ink-subtle">{t(s.note)}</p>
            </div>
            {done ? (
              <Pill small variant="success" icon={<SetIcon name="Check" size={13} strokeWidth={2.6} />}>
                {t("Added")}
              </Pill>
            ) : (
              <Pill small variant="primary" disabled={working} onClick={() => onAdd(s.url)} ariaLabel={t("Add {name}", { name: s.name })}>
                {working ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : t("Add")}
              </Pill>
            )}
          </div>
        );
      })}
    </div>
  );
}
