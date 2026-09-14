import { useState } from "react";
import anilistLogo from "@/assets/anilist.png";
import { useAnilist } from "@/lib/anilist/provider";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { SetIcon } from "@/views/settings/set-icon";
import { ConfirmSheet, Group, PhonePage, Rows, ToggleRow, sessionAge } from "./phone-kit";
import { SyncIndicatorGroup } from "./sync-indicator";
import { PasteCodeSheet, TrackerHero, TrackerIdentityCard } from "./tracker-shared";

// Trackers > AniList from desktop settings (views/settings/anilist-panel.tsx).
export function AnilistPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { isConnected, userName, avatar, session, disconnect, connectState, beginConnect, submitCode, cancelConnect } =
    useAnilist();
  const { settings, update } = useSettings();
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const commentsOn = settings.showAnilistComments === true;

  const state =
    connectState.kind === "success"
      ? { kind: "success" as const, username: connectState.session.userName || null }
      : connectState;

  return (
    <PhonePage kicker={t("Trackers")} title="AniList" onClose={onClose} wash="#02a9ff">
      {!isConnected ? (
        <TrackerHero
          logo={anilistLogo}
          service="AniList"
          website="https://anilist.co"
          blurb={t("Browse your anime lists in Harbor and update your episode progress as you watch. Sign in to AniList to connect.")}
          onConnect={() => setConnectOpen(true)}
        />
      ) : (
        <>
          <Group note={t("Harbor shows your AniList lists on the Anime page and keeps your progress in sync.")}>
            <TrackerIdentityCard
              logo={anilistLogo}
              service="AniList"
              handle={userName}
              avatar={avatar}
              meta={t("Authorized {when}", { when: sessionAge(t, session?.createdAt) })}
              profileUrl={userName ? `https://anilist.co/user/${encodeURIComponent(userName)}` : undefined}
              onDisconnect={() => setConfirmOut(true)}
            />
          </Group>

          <Group title={t("Tracking what you watch")}>
            <Rows>
              <ToggleRow
                icon={<SetIcon name="RefreshCw" size={20} />}
                label={t("Sync watch progress")}
                sub={t("Finishing an anime episode updates your AniList progress. Forward only: it never lowers a count you already have.")}
                on={settings.anilistAutoSync}
                onChange={(v) => update({ anilistAutoSync: v })}
              />
              <ToggleRow
                icon={
                  avatar ? (
                    <img src={avatar} alt="" draggable={false} className="h-6 w-6 rounded-full object-cover" />
                  ) : (
                    <SetIcon name="CircleUser" size={20} />
                  )
                }
                label={t("Use my AniList avatar as my Harbor avatar")}
                sub={t("Show your AniList profile picture as your Harbor avatar.")}
                on={settings.useAnilistAvatar}
                onChange={(v) => update({ useAnilistAvatar: v })}
              />
            </Rows>
          </Group>

          <Group title={t("Comments")}>
            <Rows>
              <ToggleRow
                icon={<SetIcon name="MessageSquare" size={20} />}
                label={t("Show AniList comments")}
                sub={t("Show forum threads and comments from AniList on anime detail pages.")}
                on={commentsOn}
                onChange={(v) => update({ showAnilistComments: v })}
              />
              <ToggleRow
                icon={<SetIcon name="EyeOff" size={20} />}
                label={t("Blur comments by default")}
                sub={t("Comments on anime pages are blurred until you reveal them, even if they are not tagged as spoilers.")}
                on={!!settings.anilistBlurComments}
                onChange={(on) => update({ anilistBlurComments: on })}
                lockReason={commentsOn ? undefined : t("Turn on AniList comments first.")}
              />
            </Rows>
          </Group>

          <SyncIndicatorGroup />
        </>
      )}

      {connectOpen && (
        <PasteCodeSheet
          service="AniList"
          hint={t("A browser tab opened on AniList. Approve Harbor there, then copy the text it shows and paste it below.")}
          placeholder={t("Paste the text from AniList")}
          state={state}
          beginConnect={beginConnect}
          submitCode={submitCode}
          cancelConnect={cancelConnect}
          onClose={() => setConnectOpen(false)}
        />
      )}
      {confirmOut && (
        <ConfirmSheet
          title={t("Disconnect from AniList")}
          message={t("Disconnect AniList? Your lists will stop showing on the Anime page until you reconnect.")}
          confirmLabel={t("Disconnect")}
          danger
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            disconnect();
            setConfirmOut(false);
          }}
        />
      )}
    </PhonePage>
  );
}
