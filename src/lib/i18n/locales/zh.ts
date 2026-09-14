import ebookSources from "./zh/ebook-sources";
import settingsRefinements from "./zh/settings-refinements";
import coverage from "./zh/coverage";
import mobilePlayer from "./zh/mobile-player";
import mobilePlayerChrome from "./zh/mobile-player-chrome";
import mobileDestinations from "./zh/mobile-destinations";
import mobileLibrary from "./zh/mobile-library";
import mobileBrowse from "./zh/mobile-browse";
import mobileDetail from "./zh/mobile-detail";
import mobileAddons from "./zh/mobile-addons";
import mobileAccount from "./zh/mobile-account";
import mobileSettings from "./zh/mobile-settings";
import mobileNav from "./zh/mobile-nav";
import sweepA from "./zh/sweep-a";
import sweepB from "./zh/sweep-b";
import sweepC from "./zh/sweep-c";
import sweepD from "./zh/sweep-d";
import sweepE from "./zh/sweep-e";
import sweepF from "./zh/sweep-f";
import residual from "./zh/residual";
import core from "./zh/core";
import playback from "./zh/playback";
import discovery from "./zh/discovery";
import library from "./zh/library";
import settings from "./zh/settings";
import social from "./zh/social";
import live from "./zh/live";
import books from "./zh/books";
import system from "./zh/system";
import plugins from "./zh/plugins";
import brands from "./zh/brands";

const zh: Record<string, string> = {
  ...ebookSources,
  ...coverage,
  ...sweepA,
  ...sweepB,
  ...sweepC,
  ...sweepD,
  ...sweepE,
  ...sweepF,
  ...residual,
  ...core,
  ...playback,
  ...discovery,
  ...library,
  ...settings,
  ...social,
  ...live,
  ...books,
  ...system,
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

export default zh;
