import { useEffect, useMemo, useState } from "react";
import addonBg from "@/assets/coastline.svg";
import elfLogo from "@/assets/elfhosted.svg";
import { AddonLogo, resolveAddonLogo } from "@/components/addon-logo";
import { openInstallerViewport } from "@/components/installer-viewport";
import {
  COMET_ID,
  cometUrlFor,
  installAddon,
  manifestToConfigureUrl,
  manifestToShareUrl,
} from "@/lib/addon-store";
import { ELF_BUNDLE, elfProductFor, elfProductUrl } from "@/lib/addons-store/elfhosted";
import { relatedAddons, recommendedAddons } from "@/lib/addons-store/recommend";
import { categorizeAddon, type ResolvedAddon } from "@/lib/addons-store/store";
import { useT } from "@/lib/i18n";
import { isWeb } from "@/lib/platform";
import { addonSiteUrl, rateOnSiteUrl, risingEntryFor, useRising } from "@/lib/providers/stremio-addons";
import { useCommunity } from "@/lib/providers/stremio-addons-index";
import { useSettings } from "@/lib/settings";
import { openUrl } from "@/lib/window";
import { AddonDescription } from "@/views/addons/addon-description";
import { AddonDocumentation } from "@/views/addons/addon-documentation";
import { categoryLabel } from "@/views/addons/addons-types";
import { idOf, nameOf, resourceLabels } from "@/views/addons/addons-utils";
import { TagRow } from "@/views/addons/tag-row";
import { SetIcon } from "@/views/settings/set-icon";
import { pickDebridForAddon } from "@/views/settings/streaming-panel";
import { ConfirmSheet, FOCUS, Page, Pill } from "./kit";

// Phone counterpart of views/addons/addon-detail.tsx: same manifest-driven
// stats, the same masked manifest URL with reveal, the same community links
// and ElfHosted action, and the same related / recommended rails computed by
// the desktop recommend helpers over the merged catalog.
export function AddonDetailSheet({
  resolved,
  all,
  installedIds,
  onOpen,
  onInstall,
  onUninstall,
  showToast,
  onClose,
}: {
  resolved: ResolvedAddon;
  all: ResolvedAddon[];
  installedIds: Set<string>;
  onOpen: (r: ResolvedAddon) => void;
  onInstall: (r: ResolvedAddon, force?: boolean) => Promise<void>;
  onUninstall: (r: ResolvedAddon) => Promise<void>;
  showToast: (kind: "ok" | "error", text: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const m = resolved.manifest;
  const c = resolved.curated;
  const id = idOf(resolved);
  const name = nameOf(resolved);
  const logo = resolveAddonLogo(m?.logo, resolved.transportUrl);
  const isConfigurable =
    m?.behaviorHints?.configurable === true || m?.behaviorHints?.configurationRequired === true;
  const web = isWeb();
  const configureUrl = manifestToConfigureUrl(resolved.transportUrl);
  const stremioShareUrl = manifestToShareUrl(resolved.transportUrl, "stremio");
  const community = useCommunity(m?.id);
  const rising = useRising();
  const risingEntry = community ? risingEntryFor(rising, community) : null;
  const elf = elfProductFor({ id: m?.id, name, url: resolved.transportUrl });
  // The debrid-configured one-tap install desktop's RecommendedAddonCard does:
  // only when the catalog itself surfaced the addon that has a URL builder, and
  // only once a debrid key is saved. Nothing here names the addon in copy.
  const debrid = pickDebridForAddon(settings);
  const debridBuilder = id === COMET_ID && debrid ? { label: debrid.label, url: cometUrlFor(debrid.service, debrid.key) } : null;

  const [copied, setCopied] = useState<"https" | "stremio" | null>(null);
  const [busy, setBusy] = useState<"install" | "remove" | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const [manifestVisible, setManifestVisible] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [allCatalogs, setAllCatalogs] = useState(false);

  const liveInstalled = installedIds.has(id) || resolved.installed;
  useEffect(() => {
    if (optimistic !== null && liveInstalled === optimistic) setOptimistic(null);
  }, [liveInstalled, optimistic]);
  const installed = optimistic ?? liveInstalled;

  const maskedManifestUrl = (() => {
    try {
      const u = new URL(resolved.transportUrl);
      return `${u.protocol}//${u.hostname}/…/manifest.json`;
    } catch {
      return "••••••••••••••••";
    }
  })();

  const handleInstall = async () => {
    if (busy) return;
    setBusy("install");
    setOptimistic(true);
    try {
      await onInstall(resolved, true);
    } catch {
      setOptimistic(null);
    } finally {
      setBusy(null);
    }
  };

  const handleDebridInstall = async () => {
    if (busy || !debridBuilder) return;
    setBusy("install");
    setOptimistic(true);
    try {
      await installAddon(id, debridBuilder.url);
      window.dispatchEvent(new CustomEvent("harbor:addons-changed", { detail: { id, installed: true } }));
      showToast("ok", t("Installed via {name}", { name: debridBuilder.label }));
    } catch (e) {
      setOptimistic(null);
      showToast("error", e instanceof Error ? e.message : t("Install failed."));
    } finally {
      setBusy(null);
    }
  };

  const handleUninstall = async () => {
    if (busy) return;
    setConfirmRemove(false);
    setBusy("remove");
    setOptimistic(false);
    try {
      await onUninstall(resolved);
    } catch {
      setOptimistic(null);
    } finally {
      setBusy(null);
    }
  };

  const copy = async (kind: "https" | "stremio") => {
    const text = kind === "stremio" ? stremioShareUrl : resolved.transportUrl;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
      showToast("ok", kind === "stremio" ? t("Stremio link copied") : t("Manifest URL copied"));
    } catch {
      showToast("error", t("Couldn't copy. Select the URL manually."));
    }
  };

  const openRate = () => {
    if (!community) return;
    openUrl(rateOnSiteUrl(community.slug));
    showToast("ok", t("Opening stremio-addons.net in your browser to sign in and rate"));
  };

  const humanize = (v: string) => (v ? v.charAt(0).toUpperCase() + v.slice(1) : v);
  const resources = resourceLabels(m?.resources ?? []).map(humanize).join(", ");
  const types = (m?.types ?? []).map(humanize).join(", ");
  const idPrefixes = m?.idPrefixes ?? [];
  const prefixValue =
    idPrefixes.slice(0, 3).join(", ") + (idPrefixes.length > 3 ? ` +${idPrefixes.length - 3}` : "");
  const catalogs = m?.catalogs ?? [];
  const stats: Array<[string, string, boolean?]> = [];
  if (m?.version) stats.push([t("Version"), m.version]);
  if (resources) stats.push([t("Resources"), resources]);
  if (types) stats.push([t("Types"), types]);
  if (idPrefixes.length > 0) stats.push([t("ID prefixes"), prefixValue]);
  if (catalogs.length > 0) stats.push([t("Catalogs"), String(catalogs.length)]);
  if (m?.behaviorHints?.p2p) stats.push([t("P2P"), t("Yes")]);
  if (m?.id) stats.push([t("ID"), m.id, true]);

  const recs = useMemo(() => {
    const related = relatedAddons(resolved, all, 8);
    const exclude = new Set(related.map((r) => idOf(r)));
    exclude.add(id);
    const recommended = recommendedAddons(resolved, all, installedIds, exclude, 8);
    return { related, recommended };
  }, [resolved, all, installedIds, id]);

  const shownCatalogs = allCatalogs ? catalogs : catalogs.slice(0, 6);

  return (
    <Page title={name} layer="over" onClose={onClose}>
      <header className="relative -mx-5 mt-1 overflow-hidden px-5 pb-5 pt-6">
        <Backdrop background={m?.background ?? undefined} />
        <div className="relative flex items-end gap-4">
          <AddonLogo addonId={id} addonName={name} manifestLogo={logo} size="2xl" />
          {community && (
            <button
              type="button"
              onClick={openRate}
              className={`no-press ms-auto flex h-11 items-baseline gap-1.5 self-start rounded-full px-2 leading-none ${FOCUS}`}
              aria-label={t("Rate on stremio-addons.net")}
            >
              <SetIcon name="Star" size={18} strokeWidth={2.4} fill="currentColor" className="self-center text-accent" />
              <span className="text-[24px] font-semibold tabular-nums leading-none text-ink">
                {community.stars.toLocaleString()}
              </span>
            </button>
          )}
        </div>
        <div className="relative mt-4 flex flex-col gap-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
            {c?.tags.includes("official") ? t("Official") : t("Community")} ·{" "}
            {categoryLabel(c?.category ?? categorizeAddon(resolved)) ?? t("Addon")}
          </span>
          <h2 className="font-display text-[26px] font-medium leading-tight tracking-tight text-ink">{name}</h2>
          {risingEntry && (
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-rose-500/15 px-2.5 py-1 text-[11px] font-bold text-rose-300 ring-1 ring-rose-500/40">
              <SetIcon name="TrendingUp" size={12} strokeWidth={2.6} />
              {risingEntry.recentStars === 1
                ? t("Rising · +{n} star in 24h", { n: risingEntry.recentStars })
                : t("Rising · +{n} stars in 24h", { n: risingEntry.recentStars })}
            </span>
          )}
          {m?.description && <AddonDescription text={m.description} />}
          <TagRow resolved={resolved} />
        </div>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {busy === "remove" ? (
          <Pill disabled icon={<SetIcon name="Loader2" size={14} className="animate-spin" />}>
            {t("Removing")}
          </Pill>
        ) : busy === "install" ? (
          <Pill variant="primary" disabled icon={<SetIcon name="Loader2" size={14} className="animate-spin" />}>
            {t("Installing")}
          </Pill>
        ) : installed ? (
          <>
            <Pill variant="success" icon={<SetIcon name="Check" size={14} strokeWidth={2.6} />}>
              {t("Installed")}
            </Pill>
            <Pill variant="danger" onClick={() => setConfirmRemove(true)} icon={<SetIcon name="Trash2" size={14} strokeWidth={2.2} />}>
              {t("Remove")}
            </Pill>
          </>
        ) : debridBuilder ? (
          <Pill variant="primary" onClick={() => void handleDebridInstall()} icon={<SetIcon name="Download" size={14} strokeWidth={2.2} />}>
            {t("Install with {name}", { name: debridBuilder.label })}
          </Pill>
        ) : isConfigurable ? (
          <Pill variant="primary" onClick={() => openInstallerViewport(configureUrl, name, logo)} icon={<SetIcon name="Settings2" size={14} strokeWidth={2.2} />}>
            {t("Configure & install")}
          </Pill>
        ) : (
          <Pill variant="primary" onClick={() => void handleInstall()}>
            {t("Install")}
          </Pill>
        )}
        {!installed && (isConfigurable || debridBuilder) && !busy && !web && (
          <Pill onClick={() => void handleInstall()}>{t("Install default")}</Pill>
        )}
        {installed && isConfigurable && !busy && (
          <Pill onClick={() => openInstallerViewport(configureUrl, name, logo)} icon={<SetIcon name="Settings2" size={14} strokeWidth={2.2} />}>
            {t("Reconfigure")}
          </Pill>
        )}
        <Pill onClick={() => void copy("https")} icon={<SetIcon name={copied === "https" ? "Check" : "Copy"} size={14} strokeWidth={2.2} />}>
          {copied === "https" ? t("Copied") : t("Copy URL")}
        </Pill>
        <Pill onClick={() => void copy("stremio")} icon={<SetIcon name={copied === "stremio" ? "Check" : "ExternalLink"} size={14} strokeWidth={2.2} />}>
          {copied === "stremio" ? t("Copied") : t("stremio:// link")}
        </Pill>
        {elf && (
          <button
            type="button"
            onClick={() => openUrl(elfProductUrl(elf.slug))}
            className={`no-press flex h-11 items-center gap-2 rounded-full border border-accent/40 bg-accent-soft ps-2 pe-4 text-[13.5px] font-semibold text-accent ${FOCUS}`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-canvas ring-1 ring-edge-soft">
              <img src={elfLogo} alt="" draggable={false} className="h-[18px] w-[18px] object-contain" />
            </span>
            {t("Get your own")}
            <span className="text-[12px] font-medium opacity-70">
              {t("Trial for ${n}", { n: String(ELF_BUNDLE.trialUsd) })}
            </span>
          </button>
        )}
        {community && (
          <>
            <Pill onClick={() => openUrl(addonSiteUrl(community.slug))} icon={<SetIcon name="ArrowUpRight" size={14} strokeWidth={2.2} className="dir-icon" />}>
              {t("On Stremio-Addons")}
            </Pill>
            <Pill onClick={openRate} icon={<SetIcon name="Star" size={14} strokeWidth={2.4} fill="currentColor" />} className="!bg-accent-soft !text-accent !ring-accent/40">
              {t("Rate")}
            </Pill>
          </>
        )}
      </div>

      {elf && (
        <p className="mt-3 text-[12px] leading-relaxed text-ink-subtle">
          {t("Your own private {name}, bundled with Debridge", { name: elf.label })}.{" "}
          {t("No Docker, no server, nothing to configure.")}{" "}
          {t("${n} for {days} days", { n: String(ELF_BUNDLE.trialUsd), days: String(ELF_BUNDLE.trialDays) })},{" "}
          {t("cancel anytime")}.
        </p>
      )}

      {c?.warnings && c.warnings.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-300/30 bg-amber-300/[0.06] p-4">
          <h3 className="text-[13.5px] font-semibold text-amber-200">{t("Worth knowing")}</h3>
          <ul className="mt-2 ms-1 list-disc ps-4 text-[13px] text-ink-muted">
            {c.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        {community?.slug && <AddonDocumentation slug={community.slug} />}
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-[20px] font-medium tracking-tight text-ink">{t("Project information")}</h3>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-ink-subtle">{t("Pulled from manifest")}</span>
        </div>
        {stats.length > 0 && (
          <dl className="mt-3 border-y border-edge-soft">
            {stats.map(([label, value, mono], i) => (
              <div
                key={label}
                className={`flex items-baseline justify-between gap-4 py-3 ${i < stats.length - 1 ? "border-b border-edge-soft" : ""}`}
              >
                <dt className="shrink-0 text-[11.5px] uppercase tracking-[0.14em] text-ink-subtle">{label}</dt>
                <dd
                  className={`min-w-0 truncate text-end font-medium text-ink ${
                    mono ? "font-mono text-[12px] text-ink-muted" : "text-[13.5px]"
                  }`}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {catalogs.length > 0 && (
          <div className="mt-6">
            <span className="text-[11.5px] uppercase tracking-[0.14em] text-ink-subtle">{t("Catalogs")}</span>
            <ul className="mt-2 overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/40 [&>li+li]:border-t [&>li+li]:border-edge-soft/60">
              {shownCatalogs.map((cat, i) => (
                <li key={`${cat.type}:${cat.id}:${i}`} className="flex min-h-[44px] items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{cat.name || cat.id}</span>
                  <span className="shrink-0 rounded-md bg-raised/60 px-1.5 py-0.5 font-mono text-[11px] text-ink-subtle">
                    {cat.type}
                  </span>
                </li>
              ))}
            </ul>
            {catalogs.length > 6 && (
              <button
                type="button"
                onClick={() => setAllCatalogs((v) => !v)}
                className={`no-press mt-2 h-11 px-1 text-[13px] font-semibold text-ink-muted ${FOCUS}`}
              >
                {allCatalogs ? t("Show fewer") : t("Show all {n}", { n: catalogs.length })}
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] uppercase tracking-[0.14em] text-ink-subtle">{t("Manifest URL")}</span>
            <div className="flex items-center gap-1">
              {manifestVisible && (
                <Pill small onClick={() => void copy("https")} icon={<SetIcon name={copied === "https" ? "Check" : "Copy"} size={12} strokeWidth={2.4} />}>
                  {copied === "https" ? t("Copied") : t("Copy")}
                </Pill>
              )}
              <Pill
                small
                onClick={() => setManifestVisible((v) => !v)}
                icon={<SetIcon name={manifestVisible ? "EyeOff" : "Eye"} size={12} strokeWidth={2.4} />}
                ariaLabel={
                  manifestVisible
                    ? t("Hide the full URL")
                    : t("URLs can carry debrid keys or tokens; reveal when you need to copy")
                }
              >
                {manifestVisible ? t("Hide") : t("Reveal")}
              </Pill>
            </div>
          </div>
          <div className="rounded-2xl border border-edge-soft bg-canvas/60 p-3.5">
            <p className="break-all font-mono text-[12px] leading-relaxed text-ink-muted" dir="ltr">
              {manifestVisible ? resolved.transportUrl : maskedManifestUrl}
            </p>
          </div>
          {!manifestVisible && (
            <p className="text-[11.5px] leading-relaxed text-ink-subtle">
              {t(
                "Hidden by default. Manifest paths often carry API keys (debrid tokens, OMDB keys, etc.) you don't want over a shoulder.",
              )}
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-1.5 border-t border-edge-soft pt-5 text-center">
          <p className="text-[12px] text-ink-subtle">{t("Stremio addon, packaged into Harbor's catalog.")}</p>
          <p className="text-[11.5px] leading-relaxed text-ink-subtle">
            {t("Version and capabilities come straight from the addon's manifest. Ratings and categories come from the")}{" "}
            <button
              type="button"
              onClick={() => openUrl("https://stremio-addons.net")}
              className="inline-flex items-baseline gap-1 font-semibold text-ink-muted underline-offset-2"
            >
              stremio-addons.net
            </button>{" "}
            {t("community API. Star, browse, and contribute on their site.")}
          </p>
        </div>
      </section>

      <MiniRail title={t("More like this")} items={recs.related} installedIds={installedIds} onOpen={onOpen} onInstall={onInstall} />
      <MiniRail title={t("Recommended for you")} items={recs.recommended} installedIds={installedIds} onOpen={onOpen} onInstall={onInstall} />

      {confirmRemove && (
        <ConfirmSheet
          title={t("Remove {name}?", { name })}
          body={t("Its catalogs and streams disappear from this device. You can install it again any time.")}
          confirmLabel={t("Remove")}
          onConfirm={() => void handleUninstall()}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </Page>
  );
}

function Backdrop({ background }: { background: string | undefined }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, var(--color-elevated) 0%, var(--color-canvas) 65%, var(--color-canvas) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${background ?? addonBg})`,
          backgroundSize: "cover",
          backgroundPosition: background ? "center" : "center bottom",
          opacity: background ? 0.5 : 0.55,
          filter: background ? undefined : "brightness(0.92)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklch, var(--color-canvas) 20%, transparent) 0%, color-mix(in oklch, var(--color-canvas) 78%, transparent) 70%, var(--color-canvas) 100%)",
        }}
      />
    </div>
  );
}

// Horizontal rail of small tiles for the related and recommended sets.
function MiniRail({
  title,
  items,
  installedIds,
  onOpen,
  onInstall,
}: {
  title: string;
  items: ResolvedAddon[];
  installedIds: Set<string>;
  onOpen: (r: ResolvedAddon) => void;
  onInstall: (r: ResolvedAddon) => Promise<void>;
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <section className="mt-9">
      <h3 className="mb-3 border-b border-edge-soft/70 pb-2 font-display text-[20px] font-medium tracking-tight text-ink">
        {title}
      </h3>
      <div className="-mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((r) => (
          <MiniTile
            key={idOf(r) + ":" + r.transportUrl}
            resolved={r}
            installed={installedIds.has(idOf(r))}
            onOpen={() => onOpen(r)}
            onInstall={() => onInstall(r)}
            addLabel={t("Add")}
            addedLabel={t("Added")}
          />
        ))}
      </div>
    </section>
  );
}

function MiniTile({
  resolved,
  installed,
  onOpen,
  onInstall,
  addLabel,
  addedLabel,
}: {
  resolved: ResolvedAddon;
  installed: boolean;
  onOpen: () => void;
  onInstall: () => Promise<void>;
  addLabel: string;
  addedLabel: string;
}) {
  const r = resolved;
  const name = nameOf(r);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex w-[150px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-edge-soft/70 bg-elevated/40 p-3">
      <button type="button" onClick={onOpen} className={`no-press flex flex-col items-start gap-2 text-start ${FOCUS}`}>
        <AddonLogo addonId={idOf(r)} addonName={name} manifestLogo={resolveAddonLogo(r.manifest?.logo, r.transportUrl)} size="tile" />
        <span className="line-clamp-2 min-h-[36px] text-[13.5px] font-medium leading-snug text-ink">{name}</span>
      </button>
      {installed ? (
        <span className="flex h-9 items-center gap-1 text-[12.5px] font-semibold text-success">
          <SetIcon name="Check" size={13} strokeWidth={2.6} />
          {addedLabel}
        </span>
      ) : (
        <Pill
          small
          variant="primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            Promise.resolve(onInstall()).finally(() => setBusy(false));
          }}
        >
          {busy ? <SetIcon name="Loader2" size={14} className="animate-spin" /> : addLabel}
        </Pill>
      )}
    </div>
  );
}
