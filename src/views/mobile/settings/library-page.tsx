import { useState } from "react";
import fanartLogo from "@/assets/addon-logos/fanarttv.svg";
import mdblistLogo from "@/assets/addon-logos/mdblist.png";
import omdbLogo from "@/assets/addon-logos/omdb.png";
import rpdbLogo from "@/assets/addon-logos/rpdb.png";
import tmdbLogo from "@/assets/addon-logos/tmdb.png";
import tvdbLogo from "@/assets/addon-logos/tvdb.svg";
import adultCatIcon from "@/assets/category/adult.svg";
import animeCatIcon from "@/assets/category/anime.svg";
import harborStyleImg from "@/assets/onboarding/harborstyle.webp";
import traditionalStyleImg from "@/assets/onboarding/traditional.webp";
import nytLogo from "@/assets/service-logos/nyt.png";
import { useT } from "@/lib/i18n";
import { hasCustomMetaAddon } from "@/lib/meta-resource";
import { useProfiles } from "@/lib/profiles";
import { useSettings, type Settings } from "@/lib/settings";
import { AiSearchSection } from "@/views/settings/ai-search-section";
import { EpisodeOrderSetting } from "@/views/settings/episode-order-setting";
import { PreviewImage } from "@/views/settings/preview-image";
import type { SectionId } from "@/views/settings/shared";
import { DEPT_BY_ID } from "./registry";
import {
  Dept,
  DesktopPanel,
  EditSheet,
  FOCUS,
  Group,
  KeyRow,
  NavRow,
  Note,
  PhonePage,
  SegmentedRow,
  tapHaptic,
  ToggleRow,
} from "./kit";

type Sub = "providers" | "ai";
type KeyId = "tmdbKey" | "omdbKey" | "tvdbKey" | "mdblistKey" | "fanartKey" | "rpdbKey" | "posterBaseUrl" | "nytKey";
type WatchlistPos = Settings["watchlistBadge"];

export function LibraryPage({
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
  const { activeProfile, updateProfile } = useProfiles();
  const [sub, setSub] = useState<Sub | null>(initialSub === "providers" || initialSub === "ai" ? initialSub : null);
  const [editing, setEditing] = useState<KeyId | null>(null);
  const [lastCorner, setLastCorner] = useState<Exclude<WatchlistPos, "off">>(
    settings.watchlistBadge !== "off" ? settings.watchlistBadge : "topEnd",
  );
  const dept = DEPT_BY_ID.library;

  // Same write as desktop library-tab: the filter is stored on settings and
  // mirrored onto the active profile so a profile switch keeps its own filters.
  const setHidden = (key: "anime" | "adult", value: boolean) => {
    const next = { ...settings.hideContent, [key]: value };
    update({ hideContent: next });
    if (activeProfile) updateProfile(activeProfile.id, { hideContent: next });
  };

  const keys: Array<{
    id: KeyId;
    name: string;
    desc: string;
    title: string;
    logo?: string;
    placeholder: string;
    hint: string;
    secret?: boolean;
  }> = [
    {
      id: "tmdbKey",
      name: t("TMDB"),
      desc: t("Trending, Popular, In Theaters, and the per service rails."),
      title: t("TMDB · catalogs and rails"),
      logo: tmdbLogo,
      placeholder: t("v3 API key"),
      hint: `${t("Highly recommended. This is what gives you the full Harbor experience: Popular, Trending, In Theaters, and per-service rails. Free at")} themoviedb.org/settings/api. ${t("Use the v3 key, not the read access token.")}`,
    },
    {
      id: "omdbKey",
      name: t("OMDb"),
      desc: t("Real IMDb and Rotten Tomatoes scores."),
      title: t("OMDb · Rotten Tomatoes scores"),
      logo: omdbLogo,
      placeholder: t("8-character key"),
      hint: `${t("Free at")} omdbapi.com/apikey.aspx. ${t("They email an activation link the first time. Click it, then come back and save.")}`,
    },
    {
      id: "tvdbKey",
      name: t("TheTVDB"),
      desc: t("Episode titles, network info, and the alternate orderings."),
      title: t("TheTVDB · episode data"),
      logo: tvdbLogo,
      placeholder: t("subscriber API key"),
      hint: `${t("Episode titles, alternate names, network info, and the arc/DVD/absolute orderings. Layered on TMDB so the better source wins per field. Free for personal use at")} thetvdb.com/api-information. ${t('Choose the "Less than $50k per year" tier.')}`,
    },
    {
      id: "mdblistKey",
      name: t("MDBList"),
      desc: t("Letterboxd, Trakt, Metacritic, and audience scores."),
      title: t("MDBList · Letterboxd and Trakt scores"),
      logo: mdblistLogo,
      placeholder: t("mdblist api key"),
      hint: `${t("Free key at")} mdblist.com. ${t("Adds Letterboxd and Trakt community ratings to detail pages, covering what OMDb misses.")}`,
    },
    {
      id: "fanartKey",
      name: t("Fanart.tv"),
      desc: t("Logos and backdrops where TMDB comes up empty."),
      title: t("Fanart.tv · logos and backdrops"),
      logo: fanartLogo,
      placeholder: t("personal key"),
      hint: `${t("Fills in where TMDB comes up empty (anime, older catalog). Free at")} fanart.tv/get-an-api-key. ${t('Use the "personal" key, not the project one.')}`,
    },
    {
      id: "rpdbKey",
      name: t("RPDB"),
      desc: t("Paid. Bakes scores into the poster image itself."),
      title: t("RPDB · scores baked into posters"),
      logo: rpdbLogo,
      placeholder: t("rpdb key"),
      hint: `${t("Paid plan at")} ratingposterdb.com. ${t("Once saved, every poster gets re-rendered with IMDb, Rotten Tomatoes, and Metacritic stamped on it.")}`,
    },
    {
      id: "posterBaseUrl",
      name: t("Custom poster service"),
      desc: t("Swap in Better Posters, PostersPlus, or your own URL template."),
      title: t("Custom poster service"),
      placeholder: "https://btttr.cc",
      hint: t("Swap in Better Posters, PostersPlus, or your own URL template."),
      secret: false,
    },
    {
      id: "nytKey",
      name: t("New York Times"),
      desc: t("Bestseller lists in the eBook section."),
      title: t("New York Times · bestseller lists"),
      logo: nytLogo,
      placeholder: t("NYT Books API key"),
      hint: `${t("Adds the New York Times bestseller lists to the eBook page, on the hero and as a row, with rank and weeks on the list. Free key at")} developer.nytimes.com. ${t("Enable the Books API on your app. Lists refresh weekly.")}`,
    },
  ];
  const editingKey = keys.find((k) => k.id === editing);
  const keysSet = keys.filter((k) => k.id !== "posterBaseUrl" && !!String(settings[k.id] ?? "").trim()).length;

  const corners: Array<{ value: Exclude<WatchlistPos, "off">; label: string }> = [
    { value: "topStart", label: t("Top left") },
    { value: "topEnd", label: t("Top right") },
    { value: "bottomStart", label: t("Bottom left") },
    { value: "bottomEnd", label: t("Bottom right") },
  ];

  const homeModes = [
    {
      id: "harbor" as const,
      label: t("Harbor curated"),
      sub: t("Hero carousel, Top 10, Trending, In Theaters, per-service rails. Addon catalogs append underneath, deduped."),
      img: harborStyleImg,
    },
    {
      id: "classic" as const,
      label: t("Classic Stremio"),
      sub: t("Continue Watching, then your installed addons. Every catalog renders as its own row, install order, no dedup, no hero."),
      img: traditionalStyleImg,
    },
  ];
  const activeMode = homeModes.find((m) => m.id === settings.homeMode) ?? homeModes[0];

  const cwLock = settings.cwPerProfile
    ? t("Unavailable while Continue Watching is kept private to each profile.")
    : undefined;

  return (
    <>
      <PhonePage title={t(dept.label)} kicker={t("Settings")} icon={dept.icon} onBack={onBack} anchor={anchor}>
        <Dept index={0} icon="Database" title={t("Metadata providers")}>
          <Group>
            <NavRow
              icon="Database"
              label={t("Metadata providers")}
              sub={t("TMDB, Fanart, TVDB, OMDb and RPDB supply posters, artwork and ratings. Adding your own free keys makes artwork load faster and more completely.")}
              value={t("{n} of {total}", { n: keysSet, total: keys.length - 1 })}
              onClick={() => setSub("providers")}
            />
            <NavRow
              icon="DiscoverySearch"
              label={t("AI search")}
              sub={t("Type what you want in plain language and let a model find it. Bring your own API key from either service.")}
              dot={settings.aiSearchKey || settings.aiGroqKey ? "ok" : null}
              onClick={() => setSub("ai")}
            />
          </Group>
        </Dept>

        <Dept index={1} icon="House" title={t("Home")} standfirst={t("How the Home page assembles its rails.")}>
          <div role="radiogroup" aria-label={t("Home style")} className="grid grid-cols-2 gap-3">
            {homeModes.map((m) => {
              const selected = settings.homeMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => {
                    if (selected) return;
                    tapHaptic();
                    update({ homeMode: m.id });
                  }}
                  className={`no-press relative flex flex-col gap-2 rounded-2xl border bg-surface/50 p-2 text-start transition-colors ${
                    selected ? "border-accent ring-1 ring-accent" : "border-edge-soft"
                  } ${FOCUS}`}
                >
                  <span className="block overflow-hidden rounded-xl">
                    <PreviewImage src={m.img} className="block aspect-[16/10] w-full select-none object-cover object-top" />
                  </span>
                  <span className={`px-1 pb-1 text-[14px] font-semibold leading-tight ${selected ? "text-ink" : "text-ink-muted"}`}>
                    {m.label}
                  </span>
                </button>
              );
            })}
          </div>
          <Note>{activeMode.sub}</Note>
          <Group label={t("Home hero")}>
            <SegmentedRow
              icon="LayoutTemplate"
              label={t("Featured source")}
              sub={t("What fills the hero. Trending is a fresh top list from Harbor, refreshed through the day. Classic uses your own Home rows.")}
              value={settings.heroFeed}
              options={[
                { value: "trending", label: t("Trending") },
                { value: "trakt", label: t("Trakt") },
                { value: "simkl", label: t("Simkl") },
                { value: "classic", label: t("Classic") },
              ]}
              onChange={(v) => update({ heroFeed: v })}
            />
          </Group>
          <Group label={t("Rows")}>
            <ToggleRow
              icon="ListVideo"
              label={t("New Episodes row")}
              sub={t("Adds a row under Continue Watching listing episodes that aired recently for shows you were already watching. Dismiss them one at a time or clear the whole row. Off by default.")}
              on={settings.homeNewEpisodes}
              onChange={(v) => update({ homeNewEpisodes: v })}
            />
            <ToggleRow
              icon="Layers"
              label={t("Show every addon row")}
              sub={t("By default, addon rails that duplicate the built-in ones (Trending, Popular, Top Rated, etc.) are merged so you don't see the same row twice. Turn this on to show every one, duplicates and all.")}
              on={settings.homeShowAllAddonRows}
              onChange={(v) => update({ homeShowAllAddonRows: v })}
            />
            <ToggleRow
              icon="EyeOff"
              label={t("Hide watched titles in catalogs")}
              sub={t("Movies you've watched and shows you've made progress on stop appearing in the built-in catalog rows, using your local watch history (and Trakt if connected). Continue Watching is never touched.")}
              on={settings.hideWatchedInCatalogs}
              onChange={(v) => update({ hideWatchedInCatalogs: v })}
            />
            <ToggleRow
              icon="Clock"
              label={t("Hide unreleased titles")}
              sub={t("Movies and shows with a future release date stop appearing in the built-in home catalog rows, so Home only shows what you can watch right now.")}
              on={settings.hideUnreleased}
              onChange={(v) => update({ hideUnreleased: v })}
            />
            <ToggleRow
              icon="Bookmark"
              label={t("Watchlist shows only saved titles")}
              sub={t("Keep the Library Watchlist tab limited to titles you added in Stremio. Turn this off to also include anything Stremio auto-added when you pressed play.")}
              on={settings.libraryBookmarkedOnly}
              onChange={(v) => update({ libraryBookmarkedOnly: v })}
            />
          </Group>
          <Group label={t("Continue Watching")}>
            <ToggleRow
              icon="SkipForward"
              label={t("Advance Continue Watching to the next episode")}
              sub={t("When you finish an episode, the Home Continue Watching card moves on to the next episode instead of sitting at 0 minutes left.")}
              on={settings.cwAdvanceNext}
              onChange={(v) => update({ cwAdvanceNext: v })}
            />
            <ToggleRow
              icon="Check"
              label={t("Remove shows once you're caught up")}
              sub={t("On by default: once you've watched every episode that has aired, the show leaves Continue Watching and returns when a new episode drops. Turn it off to keep caught-up shows on the row.")}
              on={settings.cwHideCaughtUp}
              onChange={(v) => update({ cwHideCaughtUp: v })}
            />
            <ToggleRow
              icon="Lock"
              label={t("Keep Continue Watching private to each profile")}
              sub={t("Only show Continue Watching for the profile that's active. Each profile sees just its own progress, so what you watch stays hidden from the other profiles that share this Stremio account.")}
              on={settings.cwPerProfile}
              onChange={(v) => update({ cwPerProfile: v })}
            />
          </Group>
          <Group
            label={t("Continue Watching sources")}
            note={t("Choose which services feed your Continue Watching row. Turn on as many as you like and Harbor merges them, keeping the most recent progress for each title. What you watch is still scrobbled to every connected service regardless of what you pick here.")}
          >
            <ToggleRow
              icon="SavedLibrary"
              label={t("Harbor library")}
              sub={t("Your own Harbor account progress. The primary source for almost everyone.")}
              on={settings.cwSources.library}
              onChange={(v) => update({ cwSources: { ...settings.cwSources, library: v } })}
              lockReason={cwLock}
            />
            <ToggleRow
              icon="Download"
              label={t("Downloads")}
              sub={t("Titles you are part-way through in your local downloads, even offline.")}
              on={settings.cwSources.local}
              onChange={(v) => update({ cwSources: { ...settings.cwSources, local: v } })}
            />
            <ToggleRow
              icon="CircleUser"
              label={t("Trakt progress")}
              sub={t("Pulls what you have part-watched on Trakt into the row, marked with the Trakt logo. Requires a connected Trakt account.")}
              on={settings.cwSources.trakt}
              onChange={(v) => update({ cwSources: { ...settings.cwSources, trakt: v } })}
              lockReason={
                settings.cwPerProfile
                  ? t("Unavailable while Continue Watching is kept private to each profile, because Trakt progress is shared across every profile on this account.")
                  : undefined
              }
            />
            <ToggleRow
              icon="RefreshCw"
              label={t("Simkl progress")}
              sub={t("Pulls what you have part-watched on Simkl into the row, marked with the Simkl logo. Requires a connected Simkl account.")}
              on={settings.cwSources.simkl}
              onChange={(v) => update({ cwSources: { ...settings.cwSources, simkl: v } })}
              lockReason={
                settings.cwPerProfile
                  ? t("Unavailable while Continue Watching is kept private to each profile, because Simkl progress is shared across every profile on this account.")
                  : undefined
              }
            />
          </Group>
        </Dept>

        <Dept index={2} icon="LayoutGrid" title={t("Poster cards")}>
          <Group label={t("On the poster")}>
            <ToggleRow
              icon="Tag"
              label={t("Show tags on cards")}
              sub={t("The New, In Cinema, Rerun, and Awards chips. Turn off for a cleaner grid. Score chips are separate, below.")}
              on={settings.showCardBadges}
              onChange={(v) => update({ showCardBadges: v })}
            />
            <ToggleRow
              icon="Award"
              label={t("Award tab on cards")}
              sub={t("Show a laurel tab on award-winning titles. Choose its position below.")}
              on={settings.awardTabs}
              onChange={(v) => update({ awardTabs: v })}
            />
            <ToggleRow
              icon="Trophy"
              label={t("Top 10 ribbon")}
              sub={t("Mark Top 10 titles with a corner ribbon. Bookmarks move down when they share its corner.")}
              on={settings.top10Ribbon}
              onChange={(v) => update({ top10Ribbon: v })}
            />
            <ToggleRow
              icon="Bookmark"
              label={t("Watchlist bookmark")}
              sub={t("Puts a small bookmark on posters you have already saved.")}
              on={settings.watchlistBadge !== "off"}
              onChange={(v) => update({ watchlistBadge: v ? lastCorner : "off" })}
            />
            {settings.watchlistBadge !== "off" && (
              <SegmentedRow
                label={t("Bookmark corner")}
                sub={t("Pick which corner of the poster the bookmark sits in.")}
                value={settings.watchlistBadge}
                options={corners}
                onChange={(v) => {
                  const c = v as Exclude<WatchlistPos, "off">;
                  setLastCorner(c);
                  update({ watchlistBadge: c });
                }}
              />
            )}
            <ToggleRow
              icon="Check"
              label={t("Watched badge")}
              sub={t("Puts a check on titles you have already finished.")}
              on={settings.showWatchedBadge}
              onChange={(v) => update({ showWatchedBadge: v })}
            />
            <ToggleRow
              icon="Captions"
              label={t("Show DUB badge on anime cards")}
              sub={t("Flags anime with an English dub. Also tags dub / sub / dual on stream sources.")}
              on={settings.showDubBadge}
              onChange={(v) => update({ showDubBadge: v })}
            />
            <ToggleRow
              icon="BadgeCheck"
              label={t("Show format chips on stream rows")}
              sub={t("The picker tags each stream with resolution, HDR flavor, codec, and audio format. Off hides them all.")}
              on={settings.showQualityBadge}
              onChange={(v) => update({ showQualityBadge: v })}
            />
          </Group>
          <Group label={t("Scores")}>
            <SegmentedRow
              icon="Star"
              label={t("Anime card rating source")}
              sub={t("Pick which score anime cards show. IMDb falls back to MAL when a title has no IMDb rating yet.")}
              value={settings.animeCardRating}
              options={[
                { value: "mal", label: t("MAL") },
                { value: "imdb", label: t("IMDb") },
              ]}
              onChange={(v) => update({ animeCardRating: v })}
            />
          </Group>
          <Group label={t("Titles")}>
            <ToggleRow
              icon="Type"
              label={t("Hide titles under posters")}
              sub={t("Cleaner grid when your poster service already prints the title on the artwork.")}
              on={settings.hidePosterTitles}
              onChange={(v) => update({ hidePosterTitles: v })}
            />
          </Group>
        </Dept>

        <Dept
          index={3}
          icon="FileText"
          title={t("Detail pages")}
          standfirst={t("How a show or movie detail page behaves when you open it.")}
        >
          <Group>
            <ToggleRow
              icon="Check"
              label={t("Mark watched button")}
              sub={t("Show a button on the detail page to mark a title or episode as watched. Syncs to Trakt and Simkl if connected.")}
              on={settings.showWatchedButton}
              onChange={(v) => update({ showWatchedButton: v })}
            />
            <ToggleRow
              icon="Droplet"
              label={t("Blur stream backdrop")}
              sub={t("Soften the artwork behind the stream picker.")}
              on={settings.streamBackdropBlur}
              onChange={(v) => update({ streamBackdropBlur: v })}
            />
          </Group>
          <Group label={t("Spoilers")}>
            <ToggleRow
              icon="EyeOff"
              label={t("Blur spoilers")}
              sub={t("Hides spoiler-prone episode details in episode lists until you have watched them.")}
              on={settings.hideSpoilers}
              onChange={(v) => update({ hideSpoilers: v })}
            />
            {settings.hideSpoilers && (
              <>
                <ToggleRow
                  icon="Image"
                  label={t("Blur thumbnails")}
                  sub={t("Frosts the still image on each unwatched episode in the list.")}
                  on={settings.spoilerHideThumbnails}
                  onChange={(v) => update({ spoilerHideThumbnails: v })}
                />
                <ToggleRow
                  icon="Type"
                  label={t("Blur titles")}
                  sub={t("Hides the episode name, which often gives the twist away on its own.")}
                  on={settings.spoilerHideTitles}
                  onChange={(v) => update({ spoilerHideTitles: v })}
                />
                <ToggleRow
                  icon="AlignLeft"
                  label={t("Blur descriptions")}
                  sub={t("Hides the synopsis text under each unwatched episode.")}
                  on={settings.spoilerHideDescriptions}
                  onChange={(v) => update({ spoilerHideDescriptions: v })}
                />
                <ToggleRow
                  icon="Images"
                  label={t("Blur episode images on detail page")}
                  sub={t("Blurs the hero image and stills on the episode detail page until you click reveal.")}
                  on={!!settings.blurEpisodes}
                  onChange={(v) => update({ blurEpisodes: v })}
                />
                <ToggleRow
                  icon="Eye"
                  label={t("Keep the next episode visible")}
                  sub={t("Leave the episode you are up to clear and only blur the ones after it.")}
                  on={settings.spoilerSkipNext}
                  onChange={(v) => update({ spoilerSkipNext: v })}
                />
              </>
            )}
          </Group>
          <Group label={t("Episode cards")}>
            <ToggleRow
              icon="Star"
              label={t("Show IMDb rating on episodes")}
              sub={t("Shows each episode's rating. Add your free OMDb API key for real IMDb scores; without it, ratings fall back to TMDB.")}
              on={settings.showEpisodeRating}
              onChange={(v) => update({ showEpisodeRating: v })}
            />
            <ToggleRow
              icon="AlignLeft"
              label={t("Show episode description")}
              sub={t("Shows the episode synopsis on the cards. Turn it off to hide it.")}
              on={settings.showEpisodeDescription}
              onChange={(v) => update({ showEpisodeDescription: v })}
            />
            <ToggleRow
              icon="ImageDown"
              label={t("High-quality episode images")}
              sub={t("Use sharper artwork for large cards. Uses more data and may load more slowly.")}
              on={settings.hdEpisodeImages}
              onChange={(v) => update({ hdEpisodeImages: v })}
            />
          </Group>
        </Dept>

        <Dept
          index={4}
          icon="SavedLibrary"
          title={t("Content filters")}
          standfirst={t("Hide entire categories. Toggling these also removes the matching sidebar entries and rails.")}
        >
          <Group>
            <ToggleRow
              logo={animeCatIcon}
              label={t("Hide anime")}
              sub={t("Removes the Anime tab and every anime title from all rows everywhere: Home, Discover, Top 10, and catalogs. Western animation like Pixar is kept, and you can still find anime by searching.")}
              on={settings.hideContent.anime}
              onChange={(v) => setHidden("anime", v)}
            />
            <ToggleRow
              logo={adultCatIcon}
              label={t("Hide adult content")}
              sub={t("Filters out streams from adult catalogs and addons. On by default.")}
              on={settings.hideContent.adult}
              onChange={(v) => setHidden("adult", v)}
            />
          </Group>
        </Dept>
      </PhonePage>

      {sub === "providers" && (
        <PhonePage title={t("Metadata providers")} kicker={t(dept.label)} icon="Database" depth={2} onBack={() => setSub(null)}>
          <Dept
            index={0}
            icon="KeyRound"
            title={t("Metadata providers")}
            standfirst={t("Add TMDB for more catalogs and artwork. Other providers add the features listed below. You can use Harbor with Cinemeta without adding a key.")}
          >
            <Group>
              {keys.map((k) => (
                <KeyRow
                  key={k.id}
                  logo={k.logo}
                  icon={k.logo ? undefined : "Image"}
                  label={k.name}
                  sub={k.desc}
                  value={String(settings[k.id] ?? "")}
                  onClick={() => setEditing(k.id)}
                />
              ))}
            </Group>
          </Dept>
          <Dept index={1} icon="Type" title={t("Titles and descriptions")}>
            <Group>
              <ToggleRow
                icon="Database"
                label={t("Use Cinemeta for title metadata")}
                sub={t("Cinemeta supplies titles and descriptions. Turn it off when an installed metadata addon supplies them instead.")}
                on={settings.cinemetaEnabled}
                onChange={(v) => update({ cinemetaEnabled: v })}
                warn={
                  !settings.cinemetaEnabled && !hasCustomMetaAddon()
                    ? t("No metadata addon detected. Harbor is falling back to Cinemeta so titles still load, but turn this back on unless you are installing one.")
                    : undefined
                }
              />
              <ToggleRow
                icon="Puzzle"
                label={t("Prefer my installed metadata addon")}
                sub={t("Try your addon first for titles and descriptions. Use Cinemeta when the addon has no result.")}
                on={settings.preferCustomMetaAddon}
                onChange={(v) => update({ preferCustomMetaAddon: v })}
              />
              <ToggleRow
                icon="Globe"
                label={t("Use free IMDb data without a TMDB key")}
                sub={t("With no TMDB key, the About panel pulls cast, crew, and title info from a free IMDb source. TMDB is still used whenever a key is set.")}
                on={settings.imdbApiFallback}
                onChange={(v) => update({ imdbApiFallback: v })}
              />
            </Group>
          </Dept>
          <Dept index={2} icon="ListVideo" title={t("Episode order")}>
            <DesktopPanel onJump={onJump}>
              <EpisodeOrderSetting />
            </DesktopPanel>
          </Dept>
        </PhonePage>
      )}
      {sub === "ai" && (
        <PhonePage title={t("AI search")} kicker={t(dept.label)} icon="DiscoverySearch" depth={2} onBack={() => setSub(null)}>
          <DesktopPanel onJump={onJump}>
            <AiSearchSection />
          </DesktopPanel>
        </PhonePage>
      )}
      {editingKey && (
        <EditSheet
          title={editingKey.title}
          logo={editingKey.logo}
          hint={editingKey.hint}
          initial={String(settings[editingKey.id] ?? "")}
          placeholder={editingKey.placeholder}
          secret={editingKey.secret ?? true}
          inputMode={editingKey.secret === false ? "url" : undefined}
          onSave={(next) => {
            // A computed key widens the patch to a string index, which Settings
            // rejects, so the patch is built per key and cast once here.
            update({ [editingKey.id]: next.trim() } as Partial<Settings>);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
