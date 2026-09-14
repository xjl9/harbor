import { useEffect, useMemo, useState } from "react";
import opensubtitlesLogo from "@/assets/opensubtitles.png";
import subdlLogo from "@/assets/service-logos/subdl.png";
import subsourceLogo from "@/assets/service-logos/subsource.png";
import wyzieLogo from "@/assets/wyzie.png";
import { Flag } from "@/components/flag";
import { useAuth } from "@/lib/auth";
import { LANGUAGES, setUiLanguage, useT, useUiLanguage, type UiLanguage } from "@/lib/i18n";
import { regionFlagSrc } from "@/lib/region-flags";
import { useSettings } from "@/lib/settings";
import { gatherSubtitleAddons } from "@/lib/subtitles/addon-source";
import { ALL_LANGUAGE_NAMES, normalizeLang } from "@/lib/subtitles/language";
import { SubLangsSheet } from "../onboarding/sub-langs-sheet";
import { DEPT_BY_ID } from "./registry";
import {
  Dept,
  EditSheet,
  Group,
  KeyRow,
  LangOrderSheet,
  NavRow,
  PhonePage,
  PickerSheet,
  ToggleRow,
} from "./kit";

// Desktop's list from views/settings/region-picker.tsx, where it is module
// private. Kept in the same order so both pickers read the same.
const REGIONS: Array<{ code: string; label: string }> = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "GB", label: "United Kingdom" },
  { code: "IE", label: "Ireland" },
  { code: "AU", label: "Australia" },
  { code: "NZ", label: "New Zealand" },
  { code: "DE", label: "Germany" },
  { code: "FR", label: "France" },
  { code: "ES", label: "Spain" },
  { code: "IT", label: "Italy" },
  { code: "NL", label: "Netherlands" },
  { code: "SE", label: "Sweden" },
  { code: "NO", label: "Norway" },
  { code: "DK", label: "Denmark" },
  { code: "FI", label: "Finland" },
  { code: "PL", label: "Poland" },
  { code: "PT", label: "Portugal" },
  { code: "BR", label: "Brazil" },
  { code: "MX", label: "Mexico" },
  { code: "AR", label: "Argentina" },
  { code: "CL", label: "Chile" },
  { code: "CO", label: "Colombia" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
  { code: "IN", label: "India" },
  { code: "ID", label: "Indonesia" },
  { code: "TH", label: "Thailand" },
  { code: "PH", label: "Philippines" },
  { code: "SG", label: "Singapore" },
  { code: "MY", label: "Malaysia" },
  { code: "TW", label: "Taiwan" },
  { code: "HK", label: "Hong Kong" },
  { code: "TR", label: "Türkiye" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "ZA", label: "South Africa" },
];

// Desktop's TMDB language list from language-panel/app-tab.tsx. Native names,
// so they are deliberately not passed through t().
const TMDB_LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "es-ES", label: "Español (España)" },
  { value: "es-MX", label: "Español (Latinoamérica)" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "pt-PT", label: "Português (Portugal)" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
  { value: "zh-CN", label: "中文 (简体)" },
  { value: "ar-SA", label: "العربية" },
  { value: "tr-TR", label: "Türkçe" },
  { value: "ru-RU", label: "Русский" },
  { value: "hi-IN", label: "हिन्दी" },
  { value: "pl-PL", label: "Polski" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "uk-UA", label: "Українська" },
];

const IMAGE_LANG_OPTIONS = ["Original", ...ALL_LANGUAGE_NAMES];

type Sheet =
  | "ui"
  | "region"
  | "tmdb"
  | "img"
  | "pref"
  | "audio"
  | "subs"
  | "block"
  | "os-key"
  | "subdl-key"
  | "subsource-key"
  | null;

function toggleIn(list: string[], lang: string): string[] {
  return list.includes(lang) ? list.filter((l) => l !== lang) : [...list, lang];
}

function RegionFlag({ code }: { code: string }) {
  const src = regionFlagSrc(code);
  if (!src) {
    return (
      <span className="inline-flex h-[18px] w-6 items-center justify-center rounded-sm bg-canvas font-mono text-[10px] font-bold text-ink-subtle ring-1 ring-edge-soft">
        {code}
      </span>
    );
  }
  return (
    <span className="inline-block h-[18px] w-6 overflow-hidden rounded-sm ring-1 ring-edge-soft">
      <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
    </span>
  );
}

export function LanguagesPage({ onBack, anchor }: { onBack: () => void; anchor?: string | null }) {
  const t = useT();
  const { settings, update } = useSettings();
  const { authKey } = useAuth();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [subAddons, setSubAddons] = useState<number | null>(null);
  const dept = DEPT_BY_ID.languages;

  useEffect(() => {
    let cancelled = false;
    gatherSubtitleAddons(authKey)
      .then((a) => !cancelled && setSubAddons(a.length))
      .catch(() => !cancelled && setSubAddons(0));
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  const uiLang = LANGUAGES.find((l) => l.code === settings.uiLanguage) ?? LANGUAGES[0];
  const region = REGIONS.find((r) => r.code === settings.region) ?? null;

  // Country names come from the platform's own locale data rather than t():
  // the catalogs only carry a handful of them, so most rendered in English on
  // every language. Intl knows all 36 in all 16 interface languages.
  const uiLanguage = useUiLanguage();
  const regionName = useMemo(() => {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([uiLanguage], { type: "region" });
    } catch {
      names = null;
    }
    return (r: { code: string; label: string }) => names?.of(r.code) ?? r.label;
  }, [uiLanguage]);
  const tmdbLang = TMDB_LANGUAGES.find((l) => l.value === settings.tmdbLanguage);

  const listValue = (list: string[]) =>
    list.length === 0
      ? t("Any")
      : list.length === 1
        ? list[0] === "Original"
          ? t("Original")
          : list[0]
        : t("{n} languages", { n: list.length });
  const listLead = (list: string[]) =>
    list[0] && list[0] !== "Original" ? (
      <Flag language={list[0]} code={normalizeLang(list[0])} size="sm" showLabel={false} />
    ) : undefined;

  const enabled = settings.subProvidersEnabled ?? {};
  const osOn = enabled.opensubtitles ?? true;
  const wyzieOn = enabled.wyzie ?? false;
  const addonsOn = enabled.addons ?? true;
  const subdlOn = enabled.subdl === true;
  const subsourceOn = enabled.subsource === true;
  const setProv = (key: "opensubtitles" | "wyzie" | "addons" | "subdl" | "subsource", v: boolean) =>
    update({ subProvidersEnabled: { ...enabled, [key]: v } });

  const addonSub =
    subAddons === null
      ? t("Any Stremio subtitle addons you have installed are searched here too.")
      : subAddons > 0
        ? t("{count} installed. Their results are merged in with everything else.", { count: subAddons })
        : t("No subtitle addons installed yet.");

  return (
    <PhonePage title={t(dept.label)} kicker={t("Settings")} icon={dept.icon} onBack={onBack} anchor={anchor}>
      <Dept
        index={0}
        icon="AppLanguage"
        title={t("Region & language")}
        standfirst={t("The language of Harbor's menus, buttons, and labels. Audio, subtitles, and title information have their own language settings.")}
      >
        <Group>
          <NavRow
            icon="AppLanguage"
            label={t("Display language")}
            valueLead={<Flag language={uiLang.label} code={uiLang.code} size="sm" showLabel={false} />}
            value={uiLang.nativeLabel}
            onClick={() => setSheet("ui")}
          />
          <NavRow
            icon="Globe"
            label={t("Where you watch from")}
            sub={t("Sets streaming availability and the Now Playing release window. Pick a country and Harbor offers to match the interface, metadata, subtitle, and audio languages to it.")}
            valueLead={region ? <RegionFlag code={region.code} /> : undefined}
            value={region ? regionName(region) : settings.region || t("Default")}
            onClick={() => setSheet("region")}
          />
          <NavRow
            icon="Languages"
            label={t("Preferred languages")}
            sub={t("Harbor puts streams, audio tracks and subtitles in these languages first. Leave it empty to accept anything.")}
            valueLead={listLead(settings.preferredLanguages)}
            value={listValue(settings.preferredLanguages)}
            onClick={() => setSheet("pref")}
          />
        </Group>
      </Dept>

      <Dept
        index={1}
        icon="Type"
        title={t("Titles and descriptions")}
        standfirst={t("The language TMDB serves show and film text in. Separate from the interface language above.")}
      >
        <Group>
          <NavRow
            icon="Languages"
            label={t("Language")}
            sub={t("Untranslated text stays in English. Choose a language, then select Apply and reload.")}
            value={tmdbLang ? tmdbLang.label : t("English (default)")}
            onClick={() => setSheet("tmdb")}
          />
          <ToggleRow
            icon="Type"
            label={t("Translate titles")}
            sub={t("Show translated names in the language selected above. Turn off to keep original titles.")}
            on={settings.translateTitles}
            onChange={(v) => update({ translateTitles: v })}
          />
          <ToggleRow
            icon="AlignLeft"
            label={t("Translate overviews")}
            sub={t("Translate plot descriptions and taglines into the language above. Turn off to keep English overviews.")}
            lockReason={
              settings.tmdbLanguage === ""
                ? t("Pick a metadata language above to translate overviews.")
                : undefined
            }
            on={settings.translateDescriptions}
            onChange={(v) => update({ translateDescriptions: v })}
          />
          <NavRow
            icon="Image"
            label={t("Artwork")}
            sub={t("Posters, logos, and title art load in the first available language from this list. \"Original\" uses the title's own language. Needs a TMDB key.")}
            valueLead={listLead(settings.tmdbImageLangs)}
            value={listValue(settings.tmdbImageLangs)}
            onClick={() => setSheet("img")}
          />
        </Group>
      </Dept>

      <Dept
        index={2}
        icon="AudioLines"
        title={t("Audio languages")}
        standfirst={t("When a release ships multiple audio tracks, Harbor selects the first match from this list.")}
      >
        <Group>
          <NavRow
            icon="AudioLines"
            label={t("Audio languages")}
            valueLead={listLead(settings.preferredAudioLangs)}
            value={listValue(settings.preferredAudioLangs)}
            onClick={() => setSheet("audio")}
          />
          <NavRow
            icon="Ban"
            label={t("Never auto-select tracks containing")}
            sub={t("Applies to both audio and subtitle tracks. You can still pick a skipped track by hand in the player.")}
            value={settings.trackBlockWords.length > 0 ? settings.trackBlockWords.join(", ") : undefined}
            onClick={() => setSheet("block")}
          />
        </Group>
      </Dept>

      <Dept
        index={3}
        icon="SubtitleLanguages"
        title={t("Subtitle languages")}
        standfirst={t("Harbor looks for subtitles in this order. Put your preferred language first.")}
      >
        <Group>
          <NavRow
            icon="SubtitleLanguages"
            label={t("Subtitle language order")}
            sub={t("Pick which languages Harbor looks for first, and which ones it falls back to.")}
            valueLead={listLead(settings.preferredSubLangs)}
            value={listValue(settings.preferredSubLangs)}
            onClick={() => setSheet("subs")}
          />
        </Group>
        <Group label={t("Choosing a track")}>
          <ToggleRow
            icon="Captions"
            label={t("Prefer embedded subtitles")}
            sub={t("Keep the subtitle track included in the video file instead of switching to a downloaded one.")}
            on={settings.preferEmbeddedSubs}
            onChange={(v) => update({ preferEmbeddedSubs: v })}
          />
          <ToggleRow
            icon="AudioLines"
            label={t("Forced subs with native audio")}
            sub={t("When the audio already matches your subtitle language, pick a forced track (foreign dialogue and signs only) instead of full subtitles. If the file has no forced track, subtitles stay off.")}
            on={settings.forcedSubsWhenNativeAudio}
            onChange={(v) => update({ forcedSubsWhenNativeAudio: v })}
          />
          <ToggleRow
            icon="RefreshCw"
            label={t("Upgrade subtitles when better ones load")}
            sub={t("Switch to a better language match if it arrives after playback starts. Leave off to keep the current track.")}
            on={settings.subtitleAutoUpgrade}
            onChange={(v) => update({ subtitleAutoUpgrade: v })}
          />
        </Group>
        <Group label={t("Turning them on")}>
          <ToggleRow
            icon="EyeOff"
            label={t("Start with subtitles off")}
            sub={t("Find subtitles without showing them automatically. You can turn them on in the player.")}
            on={settings.subtitlesOffByDefault}
            onChange={(v) => update({ subtitlesOffByDefault: v })}
          />
          <ToggleRow
            icon="ListVideo"
            label={t("Choose subtitles before playback")}
            sub={t("Choose the exact track and language after picking a source, before the video starts.")}
            on={settings.subtitlePreselect}
            onChange={(v) => update({ subtitlePreselect: v })}
          />
          <ToggleRow
            icon="Captions"
            label={t("Subtitle indicator dot")}
            sub={t("Show a green dot on the player's subtitle button when subtitles are active.")}
            on={settings.showSubtitleIndicator}
            onChange={(v) => update({ showSubtitleIndicator: v })}
          />
        </Group>
      </Dept>

      <Dept
        index={4}
        icon="Download"
        title={t("Subtitle sources")}
        standfirst={t("Choose where Harbor searches for subtitles. Results from enabled sources appear together, with duplicates removed.")}
      >
        <Group label={t("Built into Harbor")}>
          <ToggleRow
            logo={opensubtitlesLogo}
            label={t("OpenSubtitles")}
            sub={t("Harbor's built-in OpenSubtitles search, on by default. If you install an OpenSubtitles addon, this steps aside automatically so your results are never duplicated.")}
            on={osOn}
            onChange={(v) => setProv("opensubtitles", v)}
          />
          {osOn && (
            <KeyRow
              logo={opensubtitlesLogo}
              label={t("OpenSubtitles API key")}
              sub={t("Searching works without a key. Adding one lets Harbor line subtitles up with the audio on its own.")}
              value={settings.opensubtitlesApiKey ?? ""}
              onClick={() => setSheet("os-key")}
            />
          )}
          <ToggleRow
            logo={wyzieLogo}
            label={t("Wyzie")}
            sub={t("A fast community subtitle index. Off by default; turn it on for extra coverage on newer or niche releases.")}
            on={wyzieOn}
            onChange={(v) => setProv("wyzie", v)}
          />
        </Group>
        <Group label={t("From your addons")}>
          <ToggleRow
            icon="Puzzle"
            label={t("Subtitle addons")}
            sub={addonSub}
            on={addonsOn}
            onChange={(v) => setProv("addons", v)}
          />
        </Group>
        <Group label={t("Needs an API key")}>
          <ToggleRow
            logo={subdlLogo}
            label={t("SUBDL")}
            sub={t("Search SUBDL for subtitles in multiple languages. Requires an API key.")}
            on={subdlOn}
            onChange={(v) => setProv("subdl", v)}
            warn={subdlOn && !(settings.subdlApiKey ?? "").trim() ? t("Add an API key to use this source.") : undefined}
          />
          {subdlOn && (
            <KeyRow
              logo={subdlLogo}
              label={t("SUBDL API key")}
              sub={t("SUBDL returns nothing until a key is saved here.")}
              value={settings.subdlApiKey ?? ""}
              onClick={() => setSheet("subdl-key")}
            />
          )}
          <ToggleRow
            logo={subsourceLogo}
            label={t("Subsource")}
            sub={t("Search the Subsource community database. Requires an API key.")}
            on={subsourceOn}
            onChange={(v) => setProv("subsource", v)}
            warn={
              subsourceOn && !(settings.subsourceApiKey ?? "").trim()
                ? t("Add an API key to use this source.")
                : undefined
            }
          />
          {subsourceOn && (
            <KeyRow
              logo={subsourceLogo}
              label={t("Subsource API key")}
              sub={t("Subsource returns nothing until a key is saved here.")}
              value={settings.subsourceApiKey ?? ""}
              onClick={() => setSheet("subsource-key")}
            />
          )}
        </Group>
      </Dept>

      {sheet === "ui" && (
        <PickerSheet<UiLanguage>
          title={t("Display language")}
          value={settings.uiLanguage}
          options={LANGUAGES.map((l) => ({
            value: l.code,
            label: l.nativeLabel,
            sub: l.rtl ? `${t(l.label)} · ${t("Right to left")}` : t(l.label),
            leading: <Flag language={l.label} code={l.code} size="md" showLabel={false} />,
          }))}
          onPick={(code) => {
            setUiLanguage(code);
            update({ uiLanguage: code });
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "region" && (
        <PickerSheet
          title={t("Where you watch from")}
          value={settings.region}
          searchable
          searchPlaceholder={t("Search regions")}
          options={REGIONS.map((r) => ({
            value: r.code,
            label: regionName(r),
            // The English name stays searchable under a localized one.
            sub: regionName(r) !== r.label ? r.label : undefined,
            leading: <RegionFlag code={r.code} />,
            trailing: (
              <span className="shrink-0 rounded-md bg-raised/50 px-1.5 py-0.5 font-mono text-[12px] tracking-[0.06em] text-ink-subtle">
                {r.code}
              </span>
            ),
          }))}
          onPick={(code) => update({ region: code })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "tmdb" && (
        <PickerSheet
          title={t("Language")}
          value={settings.tmdbLanguage}
          searchable
          searchPlaceholder={t("Search languages")}
          options={[{ value: "", label: t("English (default)") }, ...TMDB_LANGUAGES]}
          onPick={(v) => update({ tmdbLanguage: v })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "img" && (
        <LangOrderSheet
          title={t("Artwork")}
          value={settings.tmdbImageLangs}
          options={IMAGE_LANG_OPTIONS}
          onToggle={(lang) => update({ tmdbImageLangs: toggleIn(settings.tmdbImageLangs, lang) })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "pref" && (
        <LangOrderSheet
          title={t("Preferred languages")}
          value={settings.preferredLanguages}
          options={ALL_LANGUAGE_NAMES}
          onToggle={(lang) => update({ preferredLanguages: toggleIn(settings.preferredLanguages, lang) })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "audio" && (
        <LangOrderSheet
          title={t("Audio languages")}
          value={settings.preferredAudioLangs}
          options={ALL_LANGUAGE_NAMES}
          onToggle={(lang) => update({ preferredAudioLangs: toggleIn(settings.preferredAudioLangs, lang) })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "subs" && (
        <SubLangsSheet
          value={settings.preferredSubLangs}
          onToggle={(lang) => update({ preferredSubLangs: toggleIn(settings.preferredSubLangs, lang) })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "block" && (
        <EditSheet
          title={t("Never auto-select tracks containing")}
          hint={t("Comma-separated words. Audio or subtitle tracks whose name matches any of these are skipped during automatic selection. You can still pick them by hand in the player.")}
          initial={settings.trackBlockWords.join(", ")}
          placeholder={t("commentary, descriptive")}
          secret={false}
          onSave={(next) =>
            update({
              trackBlockWords: [...new Set(next.split(",").map((w) => w.trim()).filter(Boolean))],
            })
          }
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "os-key" && (
        <EditSheet
          title={t("OpenSubtitles API key")}
          logo={opensubtitlesLogo}
          hint={<>{t("Searching works without a key. Adding one lets Harbor line subtitles up with the audio on its own.")} {t("Get a free key at opensubtitles.com")}</>}
          initial={settings.opensubtitlesApiKey ?? ""}
          placeholder={t("Paste your OpenSubtitles API key")}
          onSave={(v) => update({ opensubtitlesApiKey: v.trim() })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "subdl-key" && (
        <EditSheet
          title={t("SUBDL API key")}
          logo={subdlLogo}
          hint={<>{t("SUBDL returns nothing until a key is saved here.")} {t("Get a free key at subdl.com")}</>}
          initial={settings.subdlApiKey ?? ""}
          placeholder={t("Paste your SUBDL API key")}
          onSave={(v) => update({ subdlApiKey: v.trim() })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "subsource-key" && (
        <EditSheet
          title={t("Subsource API key")}
          logo={subsourceLogo}
          hint={<>{t("Subsource returns nothing until a key is saved here.")} {t("Get your key at subsource.net")}</>}
          initial={settings.subsourceApiKey ?? ""}
          placeholder={t("Paste your Subsource API key")}
          onSave={(v) => update({ subsourceApiKey: v.trim() })}
          onClose={() => setSheet(null)}
        />
      )}
    </PhonePage>
  );
}
