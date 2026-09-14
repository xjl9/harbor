import ebookSources from "./ar/ebook-sources";
import settingsRefinements from "./ar/settings-refinements";
import uiFallback from "./ui-fallback";
import experimentalUpdates from "./ar/experimental-updates";
import coverage from "./ar/coverage";
import mobilePlayer from "./ar/mobile-player";
import mobilePlayerChrome from "./ar/mobile-player-chrome";
import mobileDestinations from "./ar/mobile-destinations";
import mobileLibrary from "./ar/mobile-library";
import mobileBrowse from "./ar/mobile-browse";
import mobileDetail from "./ar/mobile-detail";
import mobileAddons from "./ar/mobile-addons";
import mobileAccount from "./ar/mobile-account";
import mobileSettings from "./ar/mobile-settings";
import mobileNav from "./ar/mobile-nav";
import settingsFill from "./ar/settings-fill";
import profileFill from "./ar/profile-fill";
import appFill from "./ar/app-fill";
import used from "./ar/used";
import sweep from "./ar/sweep";
import wired from "./ar/wired";

import chrome from "./ar/chrome";
import common from "./ar/common";
import catalog from "./ar/catalog";
import detail from "./ar/detail";
import player from "./ar/player";
import live from "./ar/live";
import settings from "./ar/settings";
import library from "./ar/library";
import manga from "./ar/manga";
import sync from "./ar/sync";
import lists from "./ar/lists";
import downloads from "./ar/downloads";
import together from "./ar/together";
import rails from "./ar/rails";
import masthead from "./ar/masthead";
import discover from "./ar/discover";
import spotlights from "./ar/spotlights";
import misc from "./ar/misc";
import awards from "./ar/awards";
import addons from "./ar/addons";
import controllers from "./ar/controllers";
import bpSources from "./ar/bp-sources";
import ageGate from "./ar/age-gate";
import dynamic from "./ar/dynamic";
import plurals from "./ar/plurals";
import audit from "./ar/audit";
import plugins from "./ar/plugins";
import brands from "./ar/brands";

const ar: Record<string, string> = {
  ...ebookSources,
  ...uiFallback,
  ...coverage,
  ...settingsFill,
  ...profileFill,
  ...appFill,
  ...used,
  ...sweep,
  ...wired,

  ...chrome,
  ...common,
  ...catalog,
  ...detail,
  ...player,
  ...live,
  ...settings,
  ...library,
  ...manga,
  ...sync,
  ...lists,
  ...downloads,
  ...together,
  ...rails,
  ...masthead,
  ...discover,
  ...spotlights,
  ...misc,
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
  ...controllers,
  ...bpSources,
  ...ageGate,
  ...dynamic,
  ...plurals,
  ...audit,
  ...experimentalUpdates,
  ...settingsRefinements,
  ...plugins,
  ...brands,
};

export default ar;
