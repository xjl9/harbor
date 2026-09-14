import { useState } from "react";
import harborWordmark from "@/assets/harbor-wordmark.svg";
import { APP_VERSION } from "@/lib/build-info";
import { useT } from "@/lib/i18n";
import { LicensesPanel } from "@/views/settings/licenses-panel";
import { SetIcon } from "@/views/settings/set-icon";
import { Group, PhonePage, Row } from "./phone-kit";

// The Legal row on the Profile tab used to be dead. This is the About > Legal
// block from desktop settings (advanced-panel/about-tab.tsx) with the licences
// and credits panel behind a second page.
export function LegalPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [licensesOpen, setLicensesOpen] = useState(false);
  const trademarkNames =
    '"Stremio", "Cinemeta", "OpenSubtitles", "Real-Debrid", "Premiumize", "AllDebrid", "TorBox", "DebridLink", "TMDB", "Trakt", "IMDb", "Netflix", "Disney+"';

  if (licensesOpen) {
    return (
      <PhonePage kicker={t("Legal")} title={t("Licences & credits")} onClose={() => setLicensesOpen(false)}>
        <div className="hset-phone-docs">
          <LicensesPanel />
        </div>
      </PhonePage>
    );
  }

  return (
    <PhonePage kicker={t("About")} title={t("Legal")} onClose={onClose}>
      <section className="flex items-center gap-4">
        <img src={harborWordmark} alt="Harbor" draggable={false} className="h-7" />
        <span className="rounded-full bg-elevated px-2.5 py-1 font-mono text-[12px] text-ink-muted">
          {APP_VERSION}
        </span>
      </section>
      <p className="text-[13.5px] leading-relaxed text-ink-muted">
        {t("Harbor is free and open source software, released under the MIT License.")}
      </p>

      <Group title={t("Legal")}>
        <div className="flex flex-col gap-3 px-4 py-4 text-[13.5px] leading-relaxed text-ink-muted">
          <p>
            {t("{app} is an independent, open-source desktop and web client.", { app: "Harbor" })}{" "}
            <span className="font-semibold text-ink">
              {t("It is not affiliated with, endorsed by, sponsored by, or in any way associated with {company}.", {
                company: "Stremio Ltd.",
              })}
            </span>{" "}
            {t("It is not affiliated with the maker of {product}, or with any company, addon author, or trademark holder referenced inside the app.", {
              product: "Stremio",
            })}{" "}
            {t("{names}, and all other names, logos, and brand references are property of their respective owners and are used here only for compatibility and identification.", {
              names: trademarkNames,
            })}
          </p>
          <p>
            {t("{app} itself does not host, distribute, or index any media. All streams come from third-party addons, debrid services, or your own {service} account that you configure yourself. You are responsible for what you choose to play and for complying with the laws of your jurisdiction.", {
              app: "Harbor",
              service: "Stremio",
            })}
          </p>
        </div>
      </Group>

      <Group>
        <Row
          icon={<SetIcon name="Scale" size={20} />}
          label={t("Licences & credits")}
          sub={t("The full text of every licence covering software distributed with Harbor. Select any entry to save a copy.")}
          onClick={() => setLicensesOpen(true)}
        />
      </Group>
    </PhonePage>
  );
}
