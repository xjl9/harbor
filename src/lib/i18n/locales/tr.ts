import ebookSources from "./tr/ebook-sources";
import settingsRefinements from "./tr/settings-refinements";
import miscA from "./tr/misc-a";
import miscB from "./tr/misc-b";
import miscC from "./tr/misc-c";
import common from "./tr/common";
import playback from "./tr/playback";
import settings from "./tr/settings";
import personalization from "./tr/personalization";
import library from "./tr/library";
import social from "./tr/social";
import discovery from "./tr/discovery";
import addons from "./tr/addons";
import recent from "./tr/recent";
import residual from "./tr/residual";
import finalResidual from "./tr/final";
import coverage from "./tr/coverage";
import mobilePlayer from "./tr/mobile-player";
import mobilePlayerChrome from "./tr/mobile-player-chrome";
import mobileDestinations from "./tr/mobile-destinations";
import mobileLibrary from "./tr/mobile-library";
import mobileBrowse from "./tr/mobile-browse";
import mobileDetail from "./tr/mobile-detail";
import mobileAddons from "./tr/mobile-addons";
import mobileAccount from "./tr/mobile-account";
import mobileSettings from "./tr/mobile-settings";
import mobileNav from "./tr/mobile-nav";
import plugins from "./tr/plugins";
import brands from "./tr/brands";

const tr: Record<string, string> = {
  ...ebookSources,
  ...miscA,
  ...miscB,
  ...miscC,
  ...common,
  ...playback,
  ...settings,
  ...personalization,
  ...library,
  ...social,
  ...discovery,
  ...addons,
  ...recent,
  ...residual,
  ...finalResidual,
  ...coverage,
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
  ...settingsRefinements,
  ...plugins,
  ...brands,
};

export default tr;
