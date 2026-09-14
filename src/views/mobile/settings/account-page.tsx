import stremioLogo from "@/assets/stremio.png";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { isPublicRelay } from "@/lib/together/relay-version";
import { SECTION_TABS } from "@/views/settings/tab-registry";
import { DEPT_BY_ID } from "./registry";
import { Dept, Group, NavRow, Note, PhonePage } from "./kit";

// Account & setup stays thin on purpose. Sign-in, profiles, the trackers and
// the relay each have a full page on the Profile tab, which is the page this
// settings sheet sits on top of. Every row here names the setting with the
// desktop label, shows its current state, and tapping it closes settings so
// the user lands where it is actually managed. Duplicating those pages here
// would give two places to edit one value.
export function AccountPage({
  onBack,
  onOpenProfile,
  anchor,
}: {
  onBack: () => void;
  onOpenProfile: () => void;
  anchor?: string | null;
}) {
  const t = useT();
  const { user } = useAuth();
  const { profiles } = useProfiles();
  const { settings } = useSettings();
  const dept = DEPT_BY_ID.account;
  const relayUrl = settings.togetherRelayUrl;

  return (
    <PhonePage title={t(dept.label)} kicker={t("Settings")} icon={dept.icon} onBack={onBack} anchor={anchor}>
      <Dept index={0} icon="UserRound" title={t("Account")} standfirst={t("Managed on the Profile tab. Tap a row to go there.")}>
        <Group>
          <NavRow
            icon="UserRound"
            label={t("Your profile")}
            sub={t("Your avatar, name, and handle across Harbor.")}
            onClick={onOpenProfile}
          />
          <NavRow
            icon="Users"
            label={t("Profiles")}
            value={profiles.length > 0 ? String(profiles.length) : undefined}
            onClick={onOpenProfile}
          />
          <NavRow icon="Harbor" label={t("Harbor account")} onClick={onOpenProfile} />
          <NavRow
            logo={stremioLogo}
            label={t("Stremio")}
            sub={
              user
                ? t("Your Stremio sign-in. Library, watch progress, and addons sync from here.")
                : t("Sign in to sync your library, add-ons and watch history with Stremio.")
            }
            dot={user ? "ok" : null}
            onClick={onOpenProfile}
          />
        </Group>
      </Dept>

      <Dept
        index={1}
        icon="Activity"
        title={t("Trackers")}
        standfirst={t("Services that record what you watch. Connect the ones you use and tune what each one sends.")}
      >
        <Group>
          {(SECTION_TABS.trackers ?? []).map((tab) => (
            <NavRow key={tab.id} logo={tab.img} icon={tab.icon} label={tab.label} onClick={onOpenProfile} />
          ))}
        </Group>
      </Dept>

      <Dept
        index={2}
        icon="Radio"
        title={t("Harbor Relay")}
        standfirst={t("Watch Together rooms are routed through Harbor's hosted relay.")}
      >
        <Group>
          <NavRow
            icon="RelaySettings"
            label={t("Harbor Relay")}
            value={!relayUrl ? undefined : isPublicRelay(relayUrl) ? t("Harbor's public relay") : relayUrl}
            dot={relayUrl ? "ok" : null}
            onClick={onOpenProfile}
          />
        </Group>
        <Note>{t("Managed on the Profile tab. Tap a row to go there.")}</Note>
      </Dept>
    </PhonePage>
  );
}
