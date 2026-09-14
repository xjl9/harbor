import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { loadPluginKinds } from "@/lib/plugins";
import { schedulePluginAutoCheck } from "@/lib/plugins/auto-check";
import { useSettings } from "@/lib/settings";
import { SetIcon } from "@/views/settings/set-icon";
import { Department, Page, Segments } from "./addons/kit";
import { InstalledPluginsPhone } from "./addons/plugins-installed";
import { RepositoriesPhone } from "./addons/plugins-repos";

type Tab = "plugins" | "repositories";

// Same gate desktop's plugins-panel.tsx uses. Plugins run as Blob workers whose
// network goes back through safeFetch; inside the native iOS build that is the
// Tauri HTTP plugin, so they behave like desktop. On mobile web it would be
// browser fetch and CORS-bound, so the web build shows desktop's note instead.
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function MobilePluginsSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>("plugins");

  useEffect(() => {
    if (!isTauri) return;
    void loadPluginKinds();
    schedulePluginAutoCheck(settings.pluginsAutoCheck);
  }, [settings.pluginsAutoCheck]);

  return (
    <Page
      kicker={t("Sources")}
      title={t("Plugins")}
      art={<SetIcon name="Blocks" size={26} strokeWidth={1.9} />}
      onClose={onClose}
    >
      {!isTauri ? (
        <Department index={0} first kicker={t("Plugins")} folio="01" title={t("Desktop only")}>
          <div className="flex items-start gap-2.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-4 py-3.5">
            <SetIcon name="Info" size={18} strokeWidth={2.2} className="mt-[2px] shrink-0 text-ink-subtle" />
            <p className="text-[14.5px] leading-[21px] text-ink-muted">
              {t("Plugins run in the desktop app. Open Harbor on your computer to add and manage them.")}
            </p>
          </div>
        </Department>
      ) : (
        <>
          <div className="sticky top-0 z-10 -mx-5 bg-canvas/90 px-5 pb-3 pt-1 backdrop-blur-md">
            <Segments
              value={tab}
              onChange={setTab}
              items={[
                { id: "plugins", label: t("Plugins") },
                { id: "repositories", label: t("Repositories") },
              ]}
            />
          </div>
          <div key={tab} className="harbor-cascade">
            {tab === "plugins" ? (
              <InstalledPluginsPhone onAddRepository={() => setTab("repositories")} />
            ) : (
              <RepositoriesPhone />
            )}
          </div>
        </>
      )}
    </Page>
  );
}
