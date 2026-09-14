import { useEffect, useState } from "react";
import traktLogo from "@/assets/trakt.svg";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { listPendingStops } from "@/lib/trakt/pending-sync";
import { fetchTraktAvatar } from "@/lib/trakt/profile";
import { useTrakt } from "@/lib/trakt/provider";
import { SetIcon } from "@/views/settings/set-icon";
import { ConfirmSheet, Group, PhonePage, Rows, ToggleRow, sessionAge } from "./phone-kit";
import { DeviceCodeSheet, PendingSyncRow, TrackerHero, TrackerIdentityCard } from "./tracker-shared";

// Trackers > Trakt from desktop settings (views/settings/trakt-panel.tsx).
// Watchlist import/export stays on desktop for now; everything else is here.
export function TraktPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { isConnected, username, session, disconnect, connectState, beginConnect, cancelConnect } =
    useTrakt();
  const { settings, update } = useSettings();
  const { activeProfile, updateProfile } = useProfiles();
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pending, setPending] = useState(() => listPendingStops().length);

  useEffect(() => {
    setPending(listPendingStops().length);
    if (!isConnected) {
      setAvatar(null);
      return;
    }
    let live = true;
    fetchTraktAvatar().then((url) => {
      if (live) setAvatar(url);
    });
    return () => {
      live = false;
    };
  }, [isConnected]);

  const pushAvatar = (url: string | null) => {
    if (activeProfile) updateProfile(activeProfile.id, { avatar: url });
  };

  useEffect(() => {
    if (settings.useTraktAvatar && avatar && settings.harborAvatar !== avatar) pushAvatar(avatar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.useTraktAvatar, avatar]);

  const toggleAvatar = (on: boolean) => {
    if (on) {
      if (avatar) pushAvatar(avatar);
      update({ useTraktAvatar: true });
    } else {
      update({ useTraktAvatar: false });
      if (settings.harborAvatar === avatar) pushAvatar(null);
    }
  };

  const state =
    connectState.kind === "awaiting"
      ? {
          kind: "awaiting" as const,
          userCode: connectState.device.userCode,
          verificationUrl: connectState.device.verificationUrl,
          openUrl: connectState.device.verificationUrl,
        }
      : connectState.kind === "success"
        ? { kind: "success" as const, username: connectState.session.username }
        : connectState;

  return (
    <PhonePage kicker={t("Trackers")} title="Trakt" onClose={onClose} wash="#ed1c24">
      {!isConnected ? (
        <TrackerHero
          logo={traktLogo}
          service="Trakt"
          website="https://trakt.tv"
          blurb={t("Track what you watch, bring in your watchlist, and see recommendations on Home. Connect with a short code at trakt.tv.")}
          onConnect={() => setConnectOpen(true)}
        />
      ) : (
        <Group note={t("Harbor scrobbles your playback to Trakt and keeps your watchlist in sync.")}>
          <Rows>
            <TrackerIdentityCard
              logo={traktLogo}
              service="Trakt"
              handle={username}
              avatar={avatar}
              meta={t("Authorized {when}", {
                when: sessionAge(t, session?.createdAt ? session.createdAt * 1000 : undefined),
              })}
              profileUrl={username ? `https://trakt.tv/users/${encodeURIComponent(username)}` : undefined}
              onDisconnect={() => setConfirmOut(true)}
            />
            {avatar && (
              <ToggleRow
                icon={<img src={avatar} alt="" draggable={false} className="h-6 w-6 rounded-full object-cover" />}
                label={t("Use my Trakt avatar as my Harbor avatar")}
                sub={t("Wear your Trakt profile picture across Harbor instead of the default.")}
                on={settings.useTraktAvatar}
                onChange={toggleAvatar}
              />
            )}
            <PendingSyncRow count={pending} />
          </Rows>
        </Group>
      )}

      <Group title={t("Comments")} note={t("Comments and reviews posted by other Trakt members.")}>
        <Rows>
          <ToggleRow
            icon={<SetIcon name="MessageSquare" size={20} />}
            label={t("Show comments on detail pages")}
            sub={t("Adds a comments section to movie, show, and episode pages. No Trakt account needed to read them.")}
            on={settings.showTraktComments === true}
            onChange={(on) => update({ showTraktComments: on })}
          />
          <ToggleRow
            icon={<SetIcon name="EyeOff" size={20} />}
            label={t("Blur comments and reviews by default")}
            sub={t("Comments and reviews on detail pages stay blurred until you reveal them, even when they are not tagged as spoilers. This one switch covers Trakt and Letterboxd.")}
            on={!!settings.blurComments}
            onChange={(on) => update({ blurComments: on })}
          />
        </Rows>
      </Group>

      {connectOpen && (
        <DeviceCodeSheet
          service="Trakt"
          host="trakt.tv"
          state={state}
          beginConnect={() => void beginConnect()}
          cancelConnect={cancelConnect}
          onClose={() => setConnectOpen(false)}
        />
      )}
      {confirmOut && (
        <ConfirmSheet
          title={t("Disconnect from Trakt")}
          message={t("Disconnect Trakt? Scrobbles and syncs will stop until you reconnect.")}
          confirmLabel={t("Disconnect")}
          danger
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            if (settings.useTraktAvatar && settings.harborAvatar === avatar) pushAvatar(null);
            update({ useTraktAvatar: false });
            disconnect();
            setConfirmOut(false);
          }}
        />
      )}
    </PhonePage>
  );
}
