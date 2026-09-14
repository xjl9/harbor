import { useCallback, useEffect, useMemo, useState } from "react";
import { resolveAddonLogo } from "@/components/addon-logo";
import { NavGlyph } from "@/components/icons/nav-glyph";
import { openInstallerViewport } from "@/components/installer-viewport";
import {
  COMET_ID,
  cometUrlFor,
  fetchManifestAt,
  installAddon,
  installFromUrl,
  loadInstalled,
  manifestToConfigureUrl,
  reorderInstalled,
  uninstallAddon,
} from "@/lib/addon-store";
import { getUserAddonsRaw } from "@/lib/addons";
import { recommendedAddons } from "@/lib/addons-store/recommend";
import {
  applyOrderToItems,
  loadDisplayOrder,
  moveItem,
  saveCollectionOrder,
  saveDisplayOrder,
  sequencesEqual,
} from "@/lib/addons-store/reorder";
import { useAddonsCatalog, type ResolvedAddon } from "@/lib/addons-store/store";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import type { SAAddon } from "@/lib/providers/stremio-addons";
import { useSettings } from "@/lib/settings";
import { idOf, nameOf } from "@/views/addons/addons-utils";
import { SetIcon } from "@/views/settings/set-icon";
import { pickDebridForAddon } from "@/views/settings/streaming-panel";
import { AddByUrl } from "./addons/add-by-url";
import { AddonDetailSheet } from "./addons/addon-detail-sheet";
import { AddonsFooter } from "./addons/addons-footer";
import {
  CategoryGridPhone,
  ElfHostedBundleCardPhone,
  EssentialsList,
  SuggestedList,
} from "./addons/discover-extras";
import { InstalledList } from "./addons/installed-list";
import {
  ConfirmSheet,
  Department,
  Field,
  FOCUS,
  INPUT,
  Page,
  Pill,
  Segments,
  SkeletonRows,
  ToastHost,
  useToast,
} from "./addons/kit";
import { MobileAddonDiscover } from "./mobile-addon-discover";
import { MobilePluginsSheet } from "./mobile-plugins";

// Well-known stream and catalog sources offered as one-tap installs so a fresh
// standalone install has something for the play picker to query. Exported
// because onboarding's addon step offers the same list: one source of truth,
// so the two surfaces can never drift.
export const ADDON_SUGGESTIONS: Array<{
  id: string;
  name: string;
  note: string;
  url: string;
}> = [
  {
    id: "com.linvo.cinemeta",
    name: "Cinemeta",
    note: "Official catalogs + metadata",
    url: "https://v3-cinemeta.strem.io/manifest.json",
  },
];

type Tab = "discover" | "installed";

const SYNC_NOTE_KEY = "harbor.addons.sync-nudge.dismissed.v1";

function syncNoteDismissed(): boolean {
  try {
    return localStorage.getItem(SYNC_NOTE_KEY) === "1";
  } catch {
    return false;
  }
}

// Phone addons page. Same data as desktop's AddonsView: useAddonsCatalog merges
// the signed-in Stremio account's collection with this device's installs, the
// installed order comes from the same display-order store, reorder writes back
// through reorderInstalled and (when signed in) saveCollectionOrder, and the
// recommendations come from the desktop recommend helper.
export function MobileAddons({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const { byId, installedIds, loading, refetch } = useAddonsCatalog(settings.showAdultAddons);
  const { toast, show } = useToast();
  const [tab, setTab] = useState<Tab>(() => (loadInstalled().length > 0 ? "installed" : "discover"));
  const [query, setQuery] = useState("");
  const [queryFocused, setQueryFocused] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [detail, setDetail] = useState<ResolvedAddon | null>(null);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [removing, setRemoving] = useState<ResolvedAddon | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderTick, setOrderTick] = useState(0);
  const [essentialBusy, setEssentialBusy] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<string | null>(null);
  const [syncNoteHidden, setSyncNoteHidden] = useState(syncNoteDismissed);

  // Enable toggles and reorders from other surfaces only announce themselves
  // through this event, so refetch on any flavour of it.
  useEffect(() => {
    const onChanged = () => refetch();
    window.addEventListener("harbor:addons-changed", onChanged);
    return () => window.removeEventListener("harbor:addons-changed", onChanged);
    // refetch is a fresh closure each render but always bumps the same tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // stremio:// install links opened while the app runs, or the one that
  // launched it, land in the add-by-URL confirm sheet like desktop's modal.
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void import("@/lib/deep-link").then(({ onDeepLinkInstall, consumePendingDeepLink, clearPendingDeepLink }) => {
      if (cancelled) return;
      const pending = consumePendingDeepLink();
      if (pending && !window.__harborInstallerOpen) setIncoming(pending);
      unlisten = onDeepLinkInstall((rawUrl) => {
        if (window.__harborInstallerOpen) return;
        clearPendingDeepLink();
        setIncoming(rawUrl);
      });
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const all = useMemo(() => [...byId.values()], [byId]);

  const installed = useMemo(() => {
    const seq = [...loadDisplayOrder(), ...loadInstalled().map((e) => e.transportUrl)];
    const rank = new Map<string, number>();
    seq.forEach((url, i) => {
      if (!rank.has(url)) rank.set(url, i);
    });
    return all
      .filter((r) => r.installed)
      .sort(
        (a, b) =>
          (rank.get(a.transportUrl) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.transportUrl) ?? Number.MAX_SAFE_INTEGER),
      );
    // orderTick re-reads the persisted order after a save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, orderTick]);

  const shownInstalled = order ? applyOrderToItems(installed, order) : installed;

  const installedUrls = useMemo(() => {
    const set = new Set(loadInstalled().map((a) => a.transportUrl.replace(/\/$/, "")));
    for (const r of installed) set.add(r.transportUrl.replace(/\/$/, ""));
    return set;
  }, [installed]);

  const recommended = useMemo(() => {
    // No single addon to be "like", so rank against an empty target: the
    // helper then scores by the categories the reader already installed.
    const target: ResolvedAddon = { manifest: null, transportUrl: "", source: "community", installed: false };
    return recommendedAddons(target, all, installedIds, new Set(), 6);
  }, [all, installedIds]);

  const debrid = pickDebridForAddon(settings);
  const debridBuilderFor = useCallback(
    (r: ResolvedAddon) =>
      idOf(r) === COMET_ID && debrid ? { label: debrid.label, url: cometUrlFor(debrid.service, debrid.key) } : null,
    [debrid],
  );

  const notify = (id: string, installedNow: boolean) =>
    window.dispatchEvent(new CustomEvent("harbor:addons-changed", { detail: { id, installed: installedNow } }));

  // Returns true only when an addon actually got installed, so the detail
  // sheet can roll back its optimistic state when a configure page opened
  // instead or the install failed.
  const install = useCallback(
    async (r: ResolvedAddon, opts: { debridUrl?: string; force?: boolean } = {}): Promise<boolean> => {
      try {
        let id = idOf(r);
        if (opts.debridUrl) {
          const addon = await installAddon(id, opts.debridUrl);
          id = addon.manifest.id;
        } else {
          let manifest = r.manifest ?? null;
          if (!opts.force) {
            if (!manifest?.behaviorHints) manifest = await fetchManifestAt(r.transportUrl).catch(() => manifest);
            const hints = manifest?.behaviorHints;
            if (hints?.configurable === true || hints?.configurationRequired === true) {
              openInstallerViewport(
                manifestToConfigureUrl(r.transportUrl),
                nameOf(r),
                resolveAddonLogo(manifest?.logo, r.transportUrl),
              );
              return false;
            }
          }
          const addon = await installAddon(manifest?.id ?? id, r.transportUrl);
          id = addon.manifest.id;
        }
        notify(id, true);
        refetch();
        show("ok", t("Installed"));
        return true;
      } catch (e) {
        show("error", e instanceof Error ? e.message : t("Install failed."));
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show, t],
  );

  const uninstall = useCallback(
    async (r: ResolvedAddon): Promise<boolean> => {
      const id = r.manifest?.id ?? r.curated?.id;
      if (!id) return false;
      try {
        await uninstallAddon(id, r.transportUrl);
        notify(id, false);
        refetch();
        show("ok", t("Removed"));
        return true;
      } catch {
        show("error", t("Couldn't remove. Try again."));
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show, t],
  );

  const addEssential = async (url: string) => {
    if (essentialBusy) return;
    setEssentialBusy(url);
    try {
      const result = await installFromUrl(url);
      refetch();
      show("ok", result.syncedToStremio ? t("Installed") : t("Installed locally"));
    } catch (e) {
      show("error", e instanceof Error ? e.message : t("Install failed."));
    } finally {
      setEssentialBusy(null);
    }
  };

  const openCommunity = (a: SAAddon) => {
    const id = a.manifest?.id;
    const local = id ? byId.get(id) : undefined;
    setDetail(
      local ?? {
        manifest: a.manifest,
        transportUrl: a.manifestUrl,
        source: "community",
        installed: !!id && installedIds.has(id),
      },
    );
  };

  const manage = (r: ResolvedAddon) =>
    openInstallerViewport(
      manifestToConfigureUrl(r.transportUrl),
      nameOf(r),
      resolveAddonLogo(r.manifest?.logo, r.transportUrl),
    );

  const startReorder = () => {
    setQuery("");
    setOrder(installed.map((r) => r.transportUrl));
    setReordering(true);
  };

  const cancelReorder = () => {
    setOrder(null);
    setReordering(false);
  };

  // Mirrors the organize page: the device order is always written, and when a
  // Stremio account is signed in its collection is reordered the same way,
  // through the validated, backed-up, read-back-verified save.
  const finishReorder = async () => {
    const urls = order;
    if (!urls || sequencesEqual(urls, installed.map((r) => r.transportUrl))) {
      cancelReorder();
      return;
    }
    setSavingOrder(true);
    let message: { kind: "ok" | "error"; text: string } = { kind: "ok", text: t("Addon order saved on this device") };
    try {
      saveDisplayOrder(urls);
      reorderInstalled(urls);
      if (authKey) {
        const baseline = await getUserAddonsRaw(authKey);
        if (baseline && baseline.length > 1) {
          const next = applyOrderToItems(baseline, urls);
          const changed = !sequencesEqual(
            baseline.map((a) => a.transportUrl),
            next.map((a) => a.transportUrl),
          );
          if (!changed) {
            message = { kind: "ok", text: t("Addon order synced to your Stremio account") };
          } else {
            const res = await saveCollectionOrder(authKey, baseline, next, false);
            message = res.ok
              ? { kind: "ok", text: t("Addon order synced to your Stremio account") }
              : { kind: "error", text: t("Couldn't sync the order to your Stremio account. It is saved on this device.") };
          }
        }
      }
      window.dispatchEvent(new CustomEvent("harbor:addons-changed", { detail: { reordered: true } }));
    } catch {
      message = { kind: "error", text: t("Couldn't sync the order to your Stremio account. It is saved on this device.") };
    } finally {
      setSavingOrder(false);
      setReordering(false);
      setOrder(null);
      setOrderTick((n) => n + 1);
      refetch();
      show(message.kind, message.text);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    await uninstall(removing);
    setRemoveBusy(false);
    setRemoving(null);
  };

  const pendingEssentials = ADDON_SUGGESTIONS.filter((s) => !installedUrls.has(s.url.replace(/\/$/, "")));
  const catalogLoading = loading && all.length === 0;

  return (
    <Page
      kicker={t("Sources")}
      title={t("Addons")}
      art={<NavGlyph name="addons" className="h-[26px] w-[26px] p-[2px]" />}
      onClose={onClose}
    >
      <div className="mt-2">
        <AddByUrl
          incoming={incoming}
          onIncomingHandled={() => setIncoming(null)}
          showToast={show}
          onInstalled={() => {
            refetch();
            setTab("installed");
          }}
        />
      </div>

      <div className="sticky top-0 z-10 -mx-5 mt-4 bg-canvas/90 px-5 pb-3 pt-1 backdrop-blur-md">
        <Segments
          value={tab}
          onChange={(v) => {
            if (reordering) cancelReorder();
            setTab(v);
          }}
          items={[
            { id: "discover", label: t("Discover") },
            { id: "installed", label: t("Installed"), count: installedIds.size },
          ]}
        />
      </div>

      {tab === "discover" ? (
        <div key="discover">
          <Department
            index={0}
            first
            kicker={t("Discover")}
            folio="01"
            title={t("Recommended for you")}
            standfirst={t("Picked from the community index and what you already use.")}
          >
            <div className="flex flex-col gap-2.5">
              {pendingEssentials.length > 0 && (
                <EssentialsList
                  suggestions={pendingEssentials}
                  installedUrls={installedUrls}
                  busyUrl={essentialBusy}
                  onAdd={(url) => void addEssential(url)}
                />
              )}
              {catalogLoading ? (
                <SkeletonRows n={4} h={64} />
              ) : (
                <SuggestedList
                  items={recommended}
                  installedIds={installedIds}
                  onOpen={setDetail}
                  onInstall={async (r, debridUrl) => {
                    await install(r, { debridUrl });
                  }}
                  debridBuilderFor={debridBuilderFor}
                />
              )}
            </div>
          </Department>

          <div className="mt-6">
            <ElfHostedBundleCardPhone />
          </div>

          <div className="mt-10">
            <CategoryGridPhone active={category} onSelect={setCategory} />
          </div>

          <MobileAddonDiscover
            index={1}
            installedIds={installedIds}
            allowAdult={settings.showAdultAddons}
            category={category}
            onClearCategory={() => setCategory(null)}
            onOpen={openCommunity}
            onChange={refetch}
          />

          <AddonsFooter index={2} onOpenPlugins={() => setPluginsOpen(true)} />
        </div>
      ) : (
        <div key="installed">
          <Department
            index={0}
            first
            kicker={t("Installed")}
            folio="01"
            title={t("Your addons")}
            standfirst={
              reordering
                ? t("Change the order addons are tried in")
                : authKey
                  ? t("Synced with your Stremio account. Changes here apply everywhere you sign in.")
                  : undefined
            }
            trailing={
              installed.length > 1 ? (
                reordering ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Pill small onClick={cancelReorder} disabled={savingOrder}>
                      {t("Cancel")}
                    </Pill>
                    <Pill
                      small
                      variant="primary"
                      onClick={() => void finishReorder()}
                      disabled={savingOrder}
                      icon={savingOrder ? <SetIcon name="Loader2" size={13} className="animate-spin" /> : undefined}
                    >
                      {t("Done")}
                    </Pill>
                  </div>
                ) : (
                  <Pill small onClick={startReorder} icon={<SetIcon name="ArrowUpDown" size={13} strokeWidth={2.4} />}>
                    {t("Reorder")}
                  </Pill>
                )
              ) : undefined
            }
          >
            <div className="flex flex-col gap-3">
              {!authKey && !syncNoteHidden && (
                <div className="relative rounded-2xl border border-edge-soft/70 bg-elevated/40 py-3 ps-4 pe-11">
                  <p className="text-[14px] font-semibold text-ink">{t("On this device only")}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted">
                    {t("Addons you add here stay on this phone. Sign in to Stremio from Profile to keep them in sync with your account.")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.setItem(SYNC_NOTE_KEY, "1");
                      } catch {
                        /* storage blocked */
                      }
                      setSyncNoteHidden(true);
                    }}
                    aria-label={t("Dismiss")}
                    className={`no-press absolute end-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-subtle ${FOCUS}`}
                  >
                    <SetIcon name="X" size={15} strokeWidth={2.2} />
                  </button>
                </div>
              )}

              {installed.length > 5 && !reordering && (
                <Field icon={<SetIcon name="Search" size={17} strokeWidth={2.2} />} focused={queryFocused}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setQueryFocused(true)}
                    onBlur={() => setQueryFocused(false)}
                    placeholder={t("Search installed addons")}
                    aria-label={t("Search installed addons")}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className={INPUT}
                  />
                </Field>
              )}

              {catalogLoading ? (
                <SkeletonRows n={4} h={64} />
              ) : (
                <InstalledList
                  installed={shownInstalled}
                  search={query}
                  reordering={reordering}
                  onOpen={setDetail}
                  onManage={manage}
                  onRemove={setRemoving}
                  onMove={(from, to) => setOrder(moveItem(shownInstalled.map((r) => r.transportUrl), from, to))}
                />
              )}
            </div>
          </Department>

          <AddonsFooter index={1} onOpenPlugins={() => setPluginsOpen(true)} />
        </div>
      )}

      {detail && (
        <AddonDetailSheet
          resolved={detail}
          all={all}
          installedIds={installedIds}
          onOpen={setDetail}
          onInstall={async (r, force) => {
            const ok = await install(r, { force });
            if (!ok) throw new Error("not installed");
          }}
          onUninstall={async (r) => {
            const ok = await uninstall(r);
            if (!ok) throw new Error("not removed");
          }}
          showToast={show}
          onClose={() => setDetail(null)}
        />
      )}

      {removing && (
        <ConfirmSheet
          title={t("Remove {name}?", { name: nameOf(removing) })}
          body={t("Its catalogs and streams disappear from this device. You can install it again any time.")}
          confirmLabel={t("Remove")}
          busy={removeBusy}
          onConfirm={() => void confirmRemove()}
          onClose={() => setRemoving(null)}
        />
      )}

      {pluginsOpen && <MobilePluginsSheet onClose={() => setPluginsOpen(false)} />}

      <ToastHost toast={toast} />
    </Page>
  );
}
