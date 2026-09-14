import { useEffect, useState } from "react";
import introdbLogo from "@/assets/service-logos/theintrodb.png";
import { useT } from "@/lib/i18n";
import {
  mediaServerConnections,
  subscribeMediaServerConnections,
} from "@/lib/media-server/connections";
import { osClass } from "@/lib/platform";
import { STALL_WAIT_OPTIONS, stallWaitSec } from "@/lib/player/stall-wait";
import { useSettings } from "@/lib/settings";
import {
  readTheIntroDbKey,
  setTheIntroDbApiKey,
  theIntroDbKeyPatch,
} from "@/lib/skip-intro/theintrodb";
import { AutoSyncPanel } from "@/views/settings/autosync-panel";
import { SubtitleStylePanel } from "@/views/settings/player-panel/subtitle-section";
import type { SectionId } from "@/views/settings/shared";
import { DEPT_BY_ID } from "./registry";
import {
  ChoiceRow,
  Dept,
  DesktopPanel,
  EditSheet,
  Group,
  KeyRow,
  NavRow,
  Note,
  PhonePage,
  PickerSheet,
  SegmentedRow,
  ToggleRow,
} from "./kit";

type Sub = "sub-style" | "sub-sync";
type Sheet = "source" | "server" | "trailer-quality" | "introdb" | null;

const NEXT_EP_LEADS = [
  { value: "auto", label: "Auto", sec: -1 },
  { value: "off", label: "Off", sec: 0 },
  { value: "30", label: "30s", sec: 30 },
  { value: "45", label: "45s", sec: 45 },
  { value: "60", label: "1 min", sec: 60 },
  { value: "90", label: "1.5 min", sec: 90 },
  { value: "120", label: "2 min", sec: 120 },
] as const;

function nextEpLeadKey(sec: number): string {
  return NEXT_EP_LEADS.find((o) => o.sec === sec)?.value ?? "auto";
}

export function PlaybackPage({
  onBack,
  onJump,
  initialSub,
  anchor,
}: {
  onBack: () => void;
  onJump: (section: SectionId, tab?: string) => void;
  initialSub?: string | null;
  anchor?: string | null;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const [sub, setSub] = useState<Sub | null>(
    initialSub === "sub-style" || initialSub === "sub-sync" ? initialSub : null,
  );
  const [sheet, setSheet] = useState<Sheet>(null);
  const [serverTick, setServerTick] = useState(0);
  useEffect(() => subscribeMediaServerConnections(() => setServerTick((v) => v + 1)), []);
  const servers = mediaServerConnections().filter((c) => c.enabled);
  void serverTick;
  const dept = DEPT_BY_ID.playback;

  // The in-webview player is only reachable on iOS: pickBridge() honors an html5
  // engine setting solely on iOS (Android always takes the native surface), so
  // the engine choice and everything that only the in-app player reads would be
  // dead rows anywhere else. Read the raw OS, not isMobileNative().
  const isIos = osClass() === "ios";
  const inApp = isIos && settings.playerEngine === "html5";

  const sourceLabel: Record<typeof settings.playbackSourcePreference, string> = {
    ask: t("Ask every time"),
    online: t("Prefer online streams"),
    local: t("Prefer this device"),
    "home-server": t("Prefer a home server"),
  };
  const serverName =
    servers.find((c) => c.id === settings.preferredMediaServerId)?.name ?? t("Ask which server");

  const trailerLabel: Record<typeof settings.trailerQuality, string> = {
    auto: t("Auto"),
    "360p": "360p",
    "720p": "720p",
    "1080p": "1080p",
    best: t("Best"),
  };

  const introKey = readTheIntroDbKey(settings);

  let index = 0;
  const next = () => index++;

  return (
    <>
      <PhonePage
        title={t(dept.label)}
        kicker={t("Settings")}
        icon={dept.icon}
        onBack={onBack}
        anchor={anchor}
      >
        <Dept
          index={next()}
          icon="PlayStart"
          title={t("When you press Play")}
          standfirst={t("Pick one. You can change it any time.")}
        >
          <Group>
            <ChoiceRow
              label={t("Instant")}
              sub={t("Harbor picks the best stream it can find and starts playing straight away.")}
              selected={settings.instantPlay}
              onClick={() => update({ instantPlay: true })}
            />
            <ChoiceRow
              label={t("Pick a source")}
              sub={t("Harbor shows the full list of streams every time so you choose one yourself.")}
              selected={!settings.instantPlay}
              onClick={() => update({ instantPlay: false })}
            />
          </Group>
        </Dept>

        <Dept index={next()} icon="Play" title={t("Playback")}>
          <Group>
            <NavRow
              icon="Waypoints"
              label={t("Where Play looks first")}
              sub={t("Choose whether Play asks you, prefers this device, prefers online sources, or goes straight to one of your home servers.")}
              value={sourceLabel[settings.playbackSourcePreference]}
              onClick={() => setSheet("source")}
            />
            {settings.playbackSourcePreference === "home-server" && (
              <NavRow
                icon="Server"
                label={t("Preferred home server")}
                sub={t("Ask when more than one server has a copy, or always prefer a specific server.")}
                value={serverName}
                onClick={() => setSheet("server")}
              />
            )}
            <ToggleRow
              icon="Lock"
              label={t("Stay on one source for a season")}
              sub={t("For series and anime, keep playing the rest of the season from the release you first picked. Applies whether Play is instant or manual.")}
              on={settings.seasonSourceLock}
              onChange={(v) => update({ seasonSourceLock: v })}
            />
            <ToggleRow
              icon="History"
              label={t("Remember last stream")}
              sub={t("When you resume something you were watching, replay the exact stream you last used (same addon and source) instead of opening the picker again. Turn off to always choose fresh.")}
              on={settings.rememberLastStream}
              onChange={(v) => update({ rememberLastStream: v })}
            />
          </Group>

          <Group label={t("Resume")}>
            <ToggleRow
              icon="RotateCcw"
              label={t("Resume where you left off")}
              sub={t("Pick up partly-watched episodes and movies at your saved spot. Anything watched past 80% always restarts. Turn this off to always start from the beginning, handy if you rewatch shows.")}
              on={settings.resumePlayback}
              onChange={(v) => update({ resumePlayback: v })}
            />
            <ToggleRow
              icon="MessageSquare"
              label={t("Ask to resume or start over")}
              sub={t("When you hit Play on something you've partly watched, show a prompt to resume from where you left off or start over. Also covers items synced from Stremio or Trakt.")}
              on={settings.resumePrompt}
              onChange={(v) => update({ resumePrompt: v })}
            />
          </Group>

          <Group label={t("Streams")}>
            <ToggleRow
              icon="SkipForward"
              label={t("Auto-skip stalled streams")}
              sub={t("If a stream hasn't started playing in time (a dead source or an addon that's down), automatically try the next available stream. Off by default.")}
              on={settings.autoNextStreamOnStall}
              onChange={(v) => update({ autoNextStreamOnStall: v })}
            />
            {settings.autoNextStreamOnStall && (
              <SegmentedRow
                icon="Timer"
                label={t("How long to wait first")}
                sub={t("Slow addons and P2P sources often need more than 10 seconds to start. Raise this if streams are being skipped before they get a fair chance.")}
                value={String(stallWaitSec(settings.autoNextStreamOnStallSec))}
                options={STALL_WAIT_OPTIONS.map((sec) => ({
                  value: String(sec),
                  label: sec >= 60 ? t("1 min") : t("{n} sec", { n: sec }),
                }))}
                onChange={(v) => update({ autoNextStreamOnStallSec: Number(v) })}
              />
            )}
            <ToggleRow
              icon="ListVideo"
              label={t("Keep same source on next episode")}
              sub={t("When auto-playing the next episode, keep the same release/source you were just watching instead of Harbor's top-ranked stream. Falls back to the best stream if that source isn't available.")}
              on={settings.keepSourceNextEpisode}
              onChange={(v) => update({ keepSourceNextEpisode: v })}
            />
          </Group>
        </Dept>

        {isIos && (
          <Dept
            index={next()}
            icon="Cpu"
            title={t("Player engine")}
            standfirst={t("Auto uses mpv when Harbor can reach it and falls back to the built in player. Pick one yourself if playback misbehaves.")}
          >
            <Group>
              <ChoiceRow
                label={t("Auto")}
                tag={t("Recommended")}
                sub={t("The native player is the default and plays every format.")}
                selected={settings.playerEngine !== "html5"}
                onClick={() => update({ playerEngine: "auto" })}
              />
              <ChoiceRow
                label={t("In-app player")}
                sub={t("Harbor's touch controls on direct and HLS streams. Anything the webview cannot decode, MKV most of all, switches back to the native player on its own.")}
                selected={settings.playerEngine === "html5"}
                onClick={() => update({ playerEngine: "html5" })}
              />
            </Group>
            {!inApp && (
              <Note>
                {t("Turn on the in-app player to unlock on-screen controls, X-Ray, skipping, up next, trailers and subtitle style.")}
              </Note>
            )}
          </Dept>
        )}

        {inApp && (
          <>
            <Dept index={next()} icon="OnscreenControls" title={t("On-screen controls")}>
              <Group label={t("Stream quality in player")}>
                <ToggleRow
                  icon="BadgeCheck"
                  label={t("Show stream quality under the title")}
                  sub={t("See the resolution, HDR format and audio while you watch.")}
                  on={settings.showQualityInfo}
                  onChange={(v) => update({ showQualityInfo: v })}
                />
                {settings.showQualityInfo && (
                  <SegmentedRow
                    label={t("Quality badge style")}
                    value={settings.qualityBadgeStyle}
                    options={[
                      { value: "bar", label: t("Bar") },
                      { value: "chips", label: t("Chips") },
                    ]}
                    onChange={(v) => update({ qualityBadgeStyle: v })}
                  />
                )}
              </Group>
            </Dept>

            <Dept
              index={next()}
              icon="ScanEye"
              title={t("X-Ray (experimental)")}
              standfirst={t("Open the cast while you watch and tap anyone for their bio and other titles. You can also enable on-device face matching to show who is on screen. Off by default.")}
            >
              <Group>
                <ToggleRow
                  icon="ScanEye"
                  label={t("Enable X-Ray")}
                  sub={t("Adds an X-Ray button in the player to see the full cast with photos and tap through to any actor. Needs a TMDB key for photos and filmographies.")}
                  on={settings.xrayEnabled}
                  onChange={(v) => update({ xrayEnabled: v })}
                />
                {settings.xrayEnabled && (
                  <ToggleRow
                    icon="Eye"
                    label={t("Scan who is on screen while playing")}
                    sub={t("Periodically match faces in the current frame against the cast to show who is on screen now. On-device, nothing leaves your machine. Uses a little more CPU while playing.")}
                    on={settings.xrayLiveScan}
                    onChange={(v) => update({ xrayLiveScan: v })}
                    warn={
                      settings.xrayLiveScan
                        ? t("Live face scanning loads on-device AI models and can significantly increase RAM, CPU, and GPU usage while playback is active. Turn it off if Harbor slows down or your device gets hot.")
                        : undefined
                    }
                  />
                )}
                {settings.xrayEnabled && !settings.tmdbKey.trim() && (
                  <NavRow
                    icon="AlertTriangle"
                    label={t("X-Ray needs a TMDB key")}
                    sub={t("X-Ray reads the cast and their photos from TMDB. Without a TMDB key there is no cast to match against. Add your free key under Library & metadata.")}
                    value={t("Library & metadata")}
                    onClick={() => onJump("library", "providers")}
                  />
                )}
              </Group>
            </Dept>

            <Dept
              index={next()}
              icon="SkipForward"
              title={t("Injected ad skip (experimental)")}
              standfirst={t("Some cam and new-release rips have ads spliced into the video itself. When the community has marked one, a Skip button appears. You can also report ads you spot for review. Off by default.")}
            >
              <Group>
                <ToggleRow
                  icon="SkipForward"
                  label={t("Enable injected ad skip")}
                  sub={t("Show a Skip button when a known injected ad plays, and a small report button on new releases so you can mark ads for review.")}
                  on={settings.adSkipEnabled}
                  onChange={(v) => update({ adSkipEnabled: v })}
                />
                {settings.adSkipEnabled && (
                  <ToggleRow
                    icon="Flag"
                    label={t("Always show the report button")}
                    sub={t("Show the report button on every P2P stream, not just likely new releases.")}
                    on={settings.adReportAlwaysShow}
                    onChange={(v) => update({ adReportAlwaysShow: v })}
                  />
                )}
                {settings.adSkipEnabled && (
                  <ToggleRow
                    icon="FastForward"
                    label={t("Skip injected ads automatically")}
                    sub={t("Jump past a known injected ad on its own instead of showing the Skip button.")}
                    on={settings.autoSkipAd}
                    onChange={(v) => update({ autoSkipAd: v })}
                  />
                )}
              </Group>
            </Dept>

            <Dept
              index={next()}
              icon="FastForward"
              title={t("Skip intros & credits")}
              standfirst={t("Harbor finds intro and credits timing from AniSkip, TheIntroDB, and the file's own chapters, then shows a Skip button at the right moment.")}
            >
              <Group>
                <ToggleRow
                  icon="SkipForward"
                  label={t("Show the Skip button")}
                  sub={t("Show a Skip Intro / Skip Credits button when Harbor detects one. Turn this off to never show it. You can also tap the X on the button to dismiss a wrong one for the rest of the episode.")}
                  on={settings.showSkipButton}
                  onChange={(v) => update({ showSkipButton: v })}
                />
                <ToggleRow
                  icon="FastForward"
                  label={t("Auto-skip intros")}
                  sub={t("Jump past openings automatically the moment one starts. Seeking back into an intro replays it without skipping again. The Skip button follows the setting above.")}
                  on={settings.autoSkipIntro}
                  onChange={(v) => update({ autoSkipIntro: v })}
                />
                <ToggleRow
                  icon="History"
                  label={t("Auto-skip recaps")}
                  sub={t("Automatically jump past recap segments.")}
                  on={settings.autoSkipRecap}
                  onChange={(v) => update({ autoSkipRecap: v })}
                />
                <ToggleRow
                  icon="ListVideo"
                  label={t("Auto-skip credit outros")}
                  sub={t("Automatically skip ending credits and trigger the next episode countdown immediately.")}
                  on={settings.autoSkipOutro}
                  onChange={(v) => update({ autoSkipOutro: v })}
                />
                {settings.showSkipButton && (
                  <SegmentedRow
                    icon="Timer"
                    label={t("Auto-hide the Skip button after")}
                    sub={t("Hides the button on its own after a few seconds so a wrong one doesn't sit there the whole episode.")}
                    value={String(settings.skipButtonHideSec)}
                    options={[
                      { value: "0", label: t("Off") },
                      { value: "5", label: t("5s") },
                      { value: "10", label: t("10s") },
                      { value: "15", label: t("15s") },
                      { value: "30", label: t("30s") },
                    ]}
                    onChange={(v) => update({ skipButtonHideSec: Number(v) })}
                  />
                )}
                <KeyRow
                  logo={introdbLogo}
                  label={t("TheIntroDB · intro and credits timing")}
                  sub={t("Optional. TheIntroDB answers without a key, but a key raises your rate limit so timing keeps arriving when you binge. Get one at")}
                  value={introKey}
                  onClick={() => setSheet("introdb")}
                />
              </Group>
            </Dept>

            <Dept
              index={next()}
              icon="ListVideo"
              title={t("Next episode prompt")}
              standfirst={t("When the Up Next pill appears before an episode ends. Auto scales to the episode length, so short episodes stop prompting so early. Off hides it.")}
            >
              <Group>
                <SegmentedRow
                  icon="Timer"
                  label={t("Up next")}
                  value={nextEpLeadKey(settings.nextEpisodeLeadSec)}
                  options={NEXT_EP_LEADS.map((o) => ({ value: o.value, label: t(o.label) }))}
                  onChange={(v) =>
                    update({ nextEpisodeLeadSec: NEXT_EP_LEADS.find((o) => o.value === v)?.sec ?? -1 })
                  }
                />
                <ToggleRow
                  icon="Play"
                  label={t("Auto-play next episode")}
                  sub={t("When an episode ends, automatically start the next one. Off lets the episode finish and stop.")}
                  on={settings.autoPlayNextEpisode}
                  onChange={(v) => update({ autoPlayNextEpisode: v })}
                />
                {settings.autoPlayNextEpisode && (
                  <ToggleRow
                    icon="Hourglass"
                    label={t("Ask if you're still watching")}
                    sub={t("After several episodes auto-play in a row with no input, pause and check you're still there before continuing. Off by default.")}
                    on={settings.stillWatching}
                    onChange={(v) => update({ stillWatching: v })}
                  />
                )}
                {settings.autoPlayNextEpisode && settings.stillWatching && (
                  <SegmentedRow
                    label={t("Still watching check-in")}
                    sub={t("How many episodes auto-play back to back before Harbor pauses to ask.")}
                    value={String(settings.stillWatchingAfter)}
                    options={[
                      { value: "2", label: t("After 2") },
                      { value: "3", label: t("After 3") },
                      { value: "4", label: t("After 4") },
                      { value: "5", label: t("After 5") },
                    ]}
                    onChange={(v) => update({ stillWatchingAfter: Number(v) })}
                  />
                )}
                <ToggleRow
                  icon="ListVideo"
                  label={t("Queue drives Next/Previous")}
                  sub={t("After the current show's episodes, Next flows into your queue. Off keeps Next/Previous within the current show only.")}
                  on={settings.queueDrivesNav}
                  onChange={(v) => update({ queueDrivesNav: v })}
                />
              </Group>
            </Dept>

            <Dept
              index={next()}
              icon="Clapperboard"
              title={t("Trailer quality")}
              standfirst={t("How sharp trailers play, and when they start on their own.")}
            >
              <Group>
                <NavRow
                  icon="Film"
                  label={t("Playback quality")}
                  sub={t("Auto follows your connection speed.")}
                  value={trailerLabel[settings.trailerQuality]}
                  onClick={() => setSheet("trailer-quality")}
                />
                <ToggleRow
                  icon="PlayCircle"
                  label={t("Auto-play trailer on detail pages")}
                  sub={t("Plays a muted trailer in the backdrop when you open a title. Click the speaker to unmute. Falls back to the image when no trailer is available.")}
                  on={settings.detailTrailerAutoplay}
                  onChange={(v) => update({ detailTrailerAutoplay: v })}
                />
                {settings.detailTrailerAutoplay && (
                  <ToggleRow
                    icon="Volume2"
                    label={t("Start trailers with audio")}
                    sub={t("Detail page trailers begin unmuted. Falls back to muted if the browser blocks sound until you interact.")}
                    on={settings.detailTrailerAudio}
                    onChange={(v) => update({ detailTrailerAudio: v })}
                  />
                )}
              </Group>
            </Dept>

            <Dept
              index={next()}
              icon="Captions"
              title={t("Subtitles")}
              standfirst={t("Which languages, where they come from, how they sync, and how they look.")}
            >
              <Group>
                <NavRow
                  icon="SubtitleStyle"
                  label={t("Subtitle style")}
                  sub={t("Size, color, outline and the background behind the text.")}
                  onClick={() => setSub("sub-style")}
                />
                <NavRow
                  icon="Timer"
                  label={t("Subtitle timing")}
                  sub={t("Match downloaded subtitles to the audio in the mpv player. Embedded subtitle tracks keep their existing timing.")}
                  onClick={() => setSub("sub-sync")}
                />
                <NavRow
                  icon="SubtitleLanguages"
                  label={t("Subtitle languages")}
                  sub={t("Harbor looks for subtitles in this order. Put your preferred language first.")}
                  onClick={() => onJump("subtitles", "languages")}
                />
              </Group>
            </Dept>
          </>
        )}
      </PhonePage>

      {sub === "sub-style" && (
        <PhonePage
          title={t("Subtitle style")}
          kicker={t(dept.label)}
          icon="SubtitleStyle"
          depth={2}
          onBack={() => setSub(null)}
        >
          <DesktopPanel onJump={onJump}>
            <SubtitleStylePanel />
          </DesktopPanel>
        </PhonePage>
      )}
      {sub === "sub-sync" && (
        <PhonePage
          title={t("Subtitle timing")}
          kicker={t(dept.label)}
          icon="Timer"
          depth={2}
          onBack={() => setSub(null)}
        >
          <DesktopPanel onJump={onJump}>
            <AutoSyncPanel />
          </DesktopPanel>
        </PhonePage>
      )}

      {sheet === "source" && (
        <PickerSheet
          title={t("Where Play looks first")}
          value={settings.playbackSourcePreference}
          options={(["ask", "online", "local", "home-server"] as const).map((v) => ({
            value: v,
            label: sourceLabel[v],
          }))}
          onPick={(v) => update({ playbackSourcePreference: v })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "server" && (
        <PickerSheet
          title={t("Preferred home server")}
          value={settings.preferredMediaServerId ?? ""}
          options={[
            { value: "", label: t("Ask which server") },
            ...servers.map((c) => ({ value: c.id, label: c.name })),
          ]}
          onPick={(v) => update({ preferredMediaServerId: v || null })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "trailer-quality" && (
        <PickerSheet
          title={t("Playback quality")}
          value={settings.trailerQuality}
          options={(["auto", "360p", "720p", "1080p", "best"] as const).map((v) => ({
            value: v,
            label: trailerLabel[v],
          }))}
          onPick={(v) => update({ trailerQuality: v })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "introdb" && (
        <EditSheet
          title={t("TheIntroDB · intro and credits timing")}
          logo={introdbLogo}
          hint={
            <>
              {t("Optional. TheIntroDB answers without a key, but a key raises your rate limit so timing keeps arriving when you binge. Get one at")}{" "}
              theintrodb.org
            </>
          }
          initial={introKey}
          placeholder={t("Paste your TheIntroDB API key")}
          onSave={(next) => {
            const v = next.trim();
            update(theIntroDbKeyPatch(v));
            setTheIntroDbApiKey(v);
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
