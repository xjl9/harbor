import { useEffect, useState } from "react";
import simklLogo from "@/assets/simkl.png";
import { clearCalendarSourceCache } from "@/lib/calendar-sources";
import { useT } from "@/lib/i18n";
import { useProfiles } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { clearAnimeGroupingCache } from "@/lib/simkl/anime-grouping";
import { clearCalendarCache } from "@/lib/simkl/calendar";
import { clearHomeRailsCache } from "@/lib/simkl/home-rails";
import { listPendingWatches } from "@/lib/simkl/pending-sync";
import { fetchSimklAvatar } from "@/lib/simkl/profile";
import { useSimkl } from "@/lib/simkl/provider";
import { SetIcon } from "@/views/settings/set-icon";
import {
  ConfirmSheet,
  ControlRow,
  Group,
  Notice,
  PhonePage,
  Rows,
  Segmented,
  ToggleRow,
} from "./phone-kit";
import { DeviceCodeSheet, PendingSyncRow, TrackerHero, TrackerIdentityCard } from "./tracker-shared";

type TitleLang = "english" | "romaji" | "native";

// Trackers > Simkl from desktop settings (views/settings/simkl-panel.tsx):
// PIN connect, scrobbling, ratings, anime title language, the Home rails and
// their per-type filters, and the disconnect that resets all of it.
export function SimklPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { isConnected, username, disconnect, connectState, beginConnect, cancelConnect } = useSimkl();
  const { settings, update } = useSettings();
  const { activeProfile, updateProfile } = useProfiles();
  const [connectOpen, setConnectOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pending, setPending] = useState(() => listPendingWatches().length);

  useEffect(() => {
    setPending(listPendingWatches().length);
    if (!isConnected) {
      setAvatar(null);
      return;
    }
    let live = true;
    fetchSimklAvatar().then((url) => {
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
    if (settings.useSimklAvatar && avatar && settings.harborAvatar !== avatar) pushAvatar(avatar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.useSimklAvatar, avatar]);

  const toggleAvatar = (on: boolean) => {
    if (on) {
      if (avatar) pushAvatar(avatar);
      update({ useSimklAvatar: true });
    } else {
      update({ useSimklAvatar: false });
      if (settings.harborAvatar === avatar) pushAvatar(null);
    }
  };

  const filters = settings.simklGranularFilters;
  const railsOn = settings.simklHomeRailsEnabled;
  const setFilters = (next: typeof filters) => update({ simklGranularFilters: next });

  const state =
    connectState.kind === "awaiting"
      ? {
          kind: "awaiting" as const,
          userCode: connectState.pin.userCode,
          verificationUrl: connectState.pin.verificationUrl,
          openUrl: connectState.pin.deepLinkUrl,
        }
      : connectState.kind === "success"
        ? { kind: "success" as const, username: connectState.session.username }
        : connectState;

  return (
    <PhonePage kicker={t("Trackers")} title="Simkl" onClose={onClose} wash="#8a8a8a">
      {!isConnected ? (
        <TrackerHero
          logo={simklLogo}
          service="Simkl"
          website="https://simkl.com"
          blurb={t("Keep your movie, show, and anime lists in sync. Connect with a short code to update Simkl as you watch.")}
          onConnect={() => setConnectOpen(true)}
        />
      ) : (
        <>
          <Group note={t("Harbor will mark what you finish as watched on Simkl and sync your plan-to-watch list.")}>
            <Rows>
              <TrackerIdentityCard
                logo={simklLogo}
                service="Simkl"
                handle={username}
                avatar={avatar}
                profileUrl={username ? `https://simkl.com/${encodeURIComponent(username)}` : undefined}
                onDisconnect={() => setConfirmOut(true)}
              />
              {avatar && (
                <ToggleRow
                  icon={<img src={avatar} alt="" draggable={false} className="h-6 w-6 rounded-full object-cover" />}
                  label={t("Use my Simkl avatar as my Harbor avatar")}
                  sub={t("Wear your Simkl profile picture across Harbor instead of the default.")}
                  on={settings.useSimklAvatar}
                  onChange={toggleAvatar}
                />
              )}
              <ToggleRow
                icon={<SetIcon name="Radio" size={20} />}
                label={t("Scrobble to Simkl")}
                sub={t("Automatically track what you are playing and save watch progress in real-time.")}
                on={settings.simklScrobbleEnabled}
                onChange={(v) => update({ simklScrobbleEnabled: v })}
              />
              <ToggleRow
                icon={<SetIcon name="Star" size={20} />}
                label={t("Display Simkl Community Ratings")}
                sub={t("Display SIMKL community score badge on details pages.")}
                on={settings.showSimklBadge}
                onChange={(v) => update({ showSimklBadge: v, simklShowCommunityRatings: v })}
              />
              <ToggleRow
                icon={<SetIcon name="PenLine" size={20} />}
                label={t("Enable User Ratings")}
                sub={t("Allow rating movies, shows, and anime directly using the star picker.")}
                on={settings.simklEnableUserRatings}
                onChange={(v) => update({ simklEnableUserRatings: v })}
              />
              <ControlRow
                icon={<SetIcon name="Languages" size={20} />}
                label={t("Anime Title Language")}
                sub={t("Preferred language for anime titles displayed on poster cards.")}
              >
                <Segmented<TitleLang>
                  label={t("Anime Title Language")}
                  value={settings.simklAnimeTitleLanguage}
                  options={[
                    { value: "english", label: t("English") },
                    { value: "romaji", label: t("Romaji") },
                    { value: "native", label: t("Native/Japanese") },
                  ]}
                  onChange={(v) => update({ simklAnimeTitleLanguage: v })}
                />
              </ControlRow>
              <PendingSyncRow count={pending} />
            </Rows>
          </Group>

          <Group title={t("Home Rail Settings")} note={t("Choose which Simkl rails appear on your home screen.")}>
            <Rows>
              <ToggleRow
                label={t("Show Simkl rails on Home")}
                sub={t("Display your Watching, Plan to Watch, Up Next, and Trending rows on the home screen.")}
                on={settings.simklHomeRailsEnabled}
                onChange={(v) => update({ simklHomeRailsEnabled: v })}
              />
              <ToggleRow
                label={t("Show Up Next on Simkl rail")}
                sub={t("Display upcoming episodes from your watching and plan-to-watch lists.")}
                on={settings.simklUpNextRailEnabled}
                onChange={(v) => update({ simklUpNextRailEnabled: v })}
              />
              <ToggleRow
                label={t("Show Simkl Trending Today rail")}
                sub={t("Display today's trending movies, TV shows, and anime from Simkl.")}
                on={settings.simklTrendingRailEnabled}
                onChange={(v) => update({ simklTrendingRailEnabled: v })}
              />
            </Rows>
          </Group>

          {!railsOn && (
            <Notice>{t("Simkl rails are turned off, so none of the rows below appear on Home yet.")}</Notice>
          )}

          <Group title={t("Movies")}>
            <ToggleRow
              label={t("Plan to Watch")}
              sub={t("Show a row of the movies on your Simkl plan-to-watch list.")}
              on={filters.movies.plantowatch}
              onChange={(v) => setFilters({ ...filters, movies: { ...filters.movies, plantowatch: v } })}
            />
          </Group>
          <Group title={t("TV Shows")}>
            <Rows>
              <ToggleRow
                label={t("Watching")}
                sub={t("Show a row of the shows you are part way through.")}
                on={filters.shows.watching}
                onChange={(v) => setFilters({ ...filters, shows: { ...filters.shows, watching: v } })}
              />
              <ToggleRow
                label={t("Plan to Watch")}
                sub={t("Show a row of the shows on your Simkl plan-to-watch list.")}
                on={filters.shows.plantowatch}
                onChange={(v) => setFilters({ ...filters, shows: { ...filters.shows, plantowatch: v } })}
              />
            </Rows>
          </Group>
          <Group title={t("Anime")}>
            <Rows>
              <ToggleRow
                label={t("Watching")}
                sub={t("Show a row of the anime you are part way through.")}
                on={filters.anime.watching}
                onChange={(v) => setFilters({ ...filters, anime: { ...filters.anime, watching: v } })}
              />
              <ToggleRow
                label={t("Plan to Watch")}
                sub={t("Show a row of the anime on your Simkl plan-to-watch list.")}
                on={filters.anime.plantowatch}
                onChange={(v) => setFilters({ ...filters, anime: { ...filters.anime, plantowatch: v } })}
              />
            </Rows>
          </Group>
        </>
      )}

      {connectOpen && (
        <DeviceCodeSheet
          service="Simkl"
          host="simkl.com"
          state={state}
          beginConnect={() => void beginConnect()}
          cancelConnect={cancelConnect}
          onClose={() => setConnectOpen(false)}
        />
      )}
      {confirmOut && (
        <ConfirmSheet
          title={t("Disconnect from Simkl")}
          message={t("Disconnect Simkl? Syncing will stop until you reconnect.")}
          confirmLabel={t("Disconnect")}
          danger
          onClose={() => setConfirmOut(false)}
          onConfirm={() => {
            if (settings.useSimklAvatar && settings.harborAvatar === avatar) pushAvatar(null);
            // Same reset the desktop panel applies so a reconnect starts clean.
            update({
              useSimklAvatar: false,
              simklScrobbleEnabled: true,
              simklShowCommunityRatings: true,
              simklEnableUserRatings: true,
              simklHomeRailsEnabled: false,
              simklUpNextRailEnabled: false,
              simklTrendingRailEnabled: false,
              showSimklBadge: true,
              simklAnimeTitleLanguage: "english",
              simklGranularFilters: {
                movies: { plantowatch: true },
                shows: { watching: true, plantowatch: true },
                anime: { watching: true, plantowatch: true },
              },
            });
            clearCalendarCache();
            clearHomeRailsCache();
            clearCalendarSourceCache();
            clearAnimeGroupingCache();
            disconnect();
            setConfirmOut(false);
          }}
        />
      )}
    </PhonePage>
  );
}
