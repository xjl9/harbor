import allDebridLogo from "@/assets/addon-logos/alldebrid.webp";
import debridLinkLogo from "@/assets/addon-logos/debridlink.png";
import premiumizeLogo from "@/assets/addon-logos/premiumize.png";
import realDebridLogo from "@/assets/addon-logos/realdebrid.png";
import torboxLogo from "@/assets/addon-logos/torbox.png";
import type { DebridProvider } from "./mobile-debrid-sheet";

// Single source of truth for the five debrid providers, shared by the profile
// Debrid section and the onboarding debrid step so both feed the same DebridSheet
// (and never drift). Settings keys match the stream picker's useDebridClients();
// order and copy mirror the desktop "Debrid services" section.
export const DEBRID_PROVIDERS: DebridProvider[] = [
  {
    key: "rdKey",
    label: "Real-Debrid",
    logo: realDebridLogo,
    placeholder: "API token",
    hint: "Get your token at real-debrid.com/apitoken. Cached streams play direct.",
    apiKeyUrl: "https://real-debrid.com/apitoken",
  },
  {
    key: "tbKey",
    label: "TorBox",
    logo: torboxLogo,
    placeholder: "API key",
    hint: "Get your key at torbox.app/settings. Cached streams play direct.",
    apiKeyUrl: "https://torbox.app/settings",
  },
  {
    key: "adKey",
    label: "AllDebrid",
    logo: allDebridLogo,
    placeholder: "API key",
    hint: "Get your key at alldebrid.com/apikeys. Cache shows as unknown until you hit Play.",
    apiKeyUrl: "https://alldebrid.com/apikeys",
  },
  {
    key: "pmKey",
    label: "Premiumize",
    logo: premiumizeLogo,
    placeholder: "API key",
    hint: "Get your key at premiumize.me/account. Skips queueing for cached files.",
    apiKeyUrl: "https://www.premiumize.me/account",
  },
  {
    key: "dlKey",
    label: "Debrid-Link",
    logo: debridLinkLogo,
    placeholder: "API key",
    hint: "Get your key at debrid-link.com/webapp/apikey. Fast EU-hosted cache check.",
    apiKeyUrl: "https://debrid-link.com/webapp/apikey",
  },
];
