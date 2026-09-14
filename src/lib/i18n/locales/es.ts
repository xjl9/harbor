import ebookSources from "./es/ebook-sources";
import settingsRefinements from "./es/settings-refinements";
import sweep from "./es/sweep";
import used from "./es/used";
import extra from "./es/extra";
import appFill from "./es/app-fill";
import profileFill from "./es/profile-fill";
import settingsFill from "./es/settings-fill";
import misc from "./es/misc";
import catalog from "./es/catalog";
import chrome from "./es/chrome";
import common from "./es/common";
import detail from "./es/detail";
import player from "./es/player";
import live from "./es/live";
import settings from "./es/settings";
import library from "./es/library";
import sync from "./es/sync";
import lists from "./es/lists";
import downloads from "./es/downloads";
import together from "./es/together";
import rails from "./es/rails";
import masthead from "./es/masthead";
import discover from "./es/discover";
import spotlights from "./es/spotlights";
import awards from "./es/awards";
import addons from "./es/addons";
import manga from "./es/manga";
import controllers from "./es/controllers";
import bpSources from "./es/bp-sources";
import coverage from "./es/coverage";
import mobilePlayer from "./es/mobile-player";
import mobilePlayerChrome from "./es/mobile-player-chrome";
import mobileDestinations from "./es/mobile-destinations";
import mobileLibrary from "./es/mobile-library";
import mobileBrowse from "./es/mobile-browse";
import mobileDetail from "./es/mobile-detail";
import mobileAddons from "./es/mobile-addons";
import mobileAccount from "./es/mobile-account";
import mobileSettings from "./es/mobile-settings";
import mobileNav from "./es/mobile-nav";
import plugins from "./es/plugins";
import brands from "./es/brands";

const es: Record<string, string> = {
  ...ebookSources,
  ...sweep,
  ...used,
  ...extra,
  ...appFill,
  ...profileFill,
  ...settingsFill,
  ...misc,
  ...catalog,
  ...chrome,
  ...common,
  ...detail,
  ...player,
  ...live,
  ...settings,
  ...library,
  ...sync,
  ...lists,
  ...downloads,
  ...together,
  ...rails,
  ...masthead,
  ...discover,
  ...spotlights,
  ...mobilePlayer,
  ...mobilePlayerChrome,
  ...mobileDestinations,
  ...mobileLibrary,
  ...mobileBrowse,
  ...mobileDetail,
  ...mobileAddons,
  ...mobileAccount,
  ...mobileSettings,
  ...mobileNav,
  ...awards,
  ...addons,
  ...manga,
  ...controllers,
  ...bpSources,
  ...coverage,
  ...settingsRefinements,
  ...plugins,
  ...brands,
};

export default es;
