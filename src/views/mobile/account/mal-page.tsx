import { useEffect, useState } from "react";
import malLogo from "@/assets/mal.png";
import { useT } from "@/lib/i18n";
import { fetchMalAvatar } from "@/lib/mal/profile";
import { useMal } from "@/lib/mal/provider";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { SetIcon } from "@/views/settings/set-icon";
import { ConfirmSheet, Group, PhonePage, Rows, ToggleRow, sessionAge } from "./phone-kit";
import { SyncIndicatorGroup } from "./sync-indicator";
import { PasteCodeSheet, TrackerHero, TrackerIdentityCard } from "./tracker-shared";

// Trackers > MyAnimeList from desktop settings (views/settings/mal-panel.tsx).
export function MalPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { isConnected, userName, session, disconnect, connectState, beginConnect, submitCode, cancelConnect } =
    useMal();
  const { settings, update } = useSettings();
  const { activeProfile, updateProfile } = useProfiles();
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      setAvatar(null);
      return;
    }
    let live = true;
    fetchMalAvatar().then((url) => {
      if (live) setAvatar(url);
    });
    return () => {
      live = false;
    };
  }, [isConnected]);

  const pushAvatar = (url: string | null) => {
    update({ harborAvatar: url });
    if (activeProfile) updateProfile(activeProfile.id, { avatar: url });
  };

  useEffect(() => {
    if (settings.useMalAvatar && avatar && settings.harborAvatar !== avatar) pushAvatar(avatar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.useMalAvatar, avatar]);

  const toggleAvatar = (on: boolean) => {
    if (on) {
      if (avatar) pushAvatar(avatar);
      update({ useMalAvatar: true });
    } else {
      update({ useMalAvatar: false });
      if (settings.harborAvatar === avatar) pushAvatar(null);
    }
  };

  const state =
    connectState.kind === "success"
      ? { kind: "success" as const, username: connectState.session.userName || null }
      : connectState;

  return (
    <PhonePage kicker={t("Trackers")} title="MyAnimeList" onClose={onClose} wash="#2e51a2">
      {!isConnected ? (
        <TrackerHero
          logo={malLogo}
          service="MyAnimeList"
          website="https://myanimelist.net"
          blurb={t("Bring your anime list into Harbor and update your episode count as you watch. Your existing progress is kept.")}
          onConnect={() => setConnectOpen(true)}
        />
      ) : (
        <>
          <Group note={t("Harbor keeps your MyAnimeList watch progress in sync.")}>
            <Rows>
              <TrackerIdentityCard
                logo={malLogo}
                service="MyAnimeList"
                handle={userName}
                avatar={avatar}
                meta={
                  session?.createdAt
                    ? t("Authorized {when}", { when: sessionAge(t, session.createdAt) })
                    : undefined
                }
                profileUrl={userName ? `https://myanimelist.net/profile/${encodeURIComponent(userName)}` : undefined}
                onDisconnect={() => setConfirmOut(true)}
              />
              <ToggleRow
                icon={<SetIcon name="RefreshCw" size={20} />}
                label={t("Sync watch progress")}
                sub={t("Finishing an anime episode updates your MyAnimeList progress. Forward only: it never lowers a count you already have.")}
                on={settings.malAutoSync}
                onChange={(v) => update({ malAutoSync: v })}
              />
              {avatar && (
                <ToggleRow
                  icon={<img src={avatar} alt="" draggable={false} className="h-6 w-6 rounded-full object-cover" />}
                  label={t("Use MyAnimeList avatar")}
                  sub={t("Set your MyAnimeList profile picture as your Harbor avatar.")}
                  on={settings.useMalAvatar}
                  onChange={toggleAvatar}
                />
              )}
            </Rows>
          </Group>

          <SyncIndicatorGroup />
        </>
      )}

      {connectOpen && (
        <PasteCodeSheet
          service="MyAnimeList"
          hint={t("A browser tab opened on MyAnimeList. Approve Harbor there, then copy the code or the page URL and paste it below.")}
          placeholder={t("Paste the code or page URL")}
          state={state}
          beginConnect={beginConnect}
          submitCode={submitCode}
          cancelConnect={cancelConnect}
          onClose={() => setConnectOpen(false)}
        />
      )}
      {confirmOut && (
        <ConfirmSheet
          title={t("Disconnect from MyAnimeList")}
          message={t("Disconnect MyAnimeList? Your progress will stop syncing until you reconnect.")}
          confirmLabel={t("Disconnect")}
          danger
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            if (settings.useMalAvatar && settings.harborAvatar === avatar) pushAvatar(null);
            update({ useMalAvatar: false });
            disconnect();
            setConfirmOut(false);
          }}
        />
      )}
    </PhonePage>
  );
}
