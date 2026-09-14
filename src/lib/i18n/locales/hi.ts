import ebookSources from "./hi/ebook-sources";
import settingsRefinements from "./hi/settings-refinements";
import catalogSymbols from "./hi/catalog-symbols";
import catalogAC from "./hi/catalog-a-c";
import catalogDF from "./hi/catalog-d-f";
import catalogGI from "./hi/catalog-g-i";
import catalogJL from "./hi/catalog-j-l";
import catalogMO from "./hi/catalog-m-o";
import catalogPR from "./hi/catalog-p-r";
import catalogSU from "./hi/catalog-s-u";
import catalogVZ from "./hi/catalog-v-z";
import coverage from "./hi/coverage";
import mobilePlayer from "./hi/mobile-player";
import mobilePlayerChrome from "./hi/mobile-player-chrome";
import mobileDestinations from "./hi/mobile-destinations";
import mobileLibrary from "./hi/mobile-library";
import mobileBrowse from "./hi/mobile-browse";
import mobileDetail from "./hi/mobile-detail";
import mobileAddons from "./hi/mobile-addons";
import mobileAccount from "./hi/mobile-account";
import mobileSettings from "./hi/mobile-settings";
import mobileNav from "./hi/mobile-nav";
import plugins from "./hi/plugins";
import brands from "./hi/brands";

const hi: Record<string, string> = {
  ...ebookSources,
  ...catalogSymbols,
  ...catalogAC,
  ...catalogDF,
  ...catalogGI,
  ...catalogJL,
  ...catalogMO,
  ...catalogPR,
  ...catalogSU,
  ...catalogVZ,
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

export default hi;
