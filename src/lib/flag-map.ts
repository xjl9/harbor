import flagAm from "@/assets/regions/am.svg";
import flagAz from "@/assets/regions/az.svg";
import flagBa from "@/assets/regions/ba.svg";
import flagBd from "@/assets/regions/bd.svg";
import flagBg from "@/assets/regions/bg.svg";
import flagBy from "@/assets/regions/by.svg";
import flagEe from "@/assets/regions/ee.svg";
import flagEt from "@/assets/regions/et.svg";
import flagGe from "@/assets/regions/ge.svg";
import flagGr from "@/assets/regions/gr.svg";
import flagHr from "@/assets/regions/hr.svg";
import flagIr from "@/assets/regions/ir.svg";
import flagIs from "@/assets/regions/is.svg";
import flagKh from "@/assets/regions/kh.svg";
import flagKz from "@/assets/regions/kz.svg";
import flagLa from "@/assets/regions/la.svg";
import flagLt from "@/assets/regions/lt.svg";
import flagLv from "@/assets/regions/lv.svg";
import flagMk from "@/assets/regions/mk.svg";
import flagMm from "@/assets/regions/mm.svg";
import flagMt from "@/assets/regions/mt.svg";
import flagNg from "@/assets/regions/ng.svg";
import flagPk from "@/assets/regions/pk.svg";
import flagRs from "@/assets/regions/rs.svg";
import flagSi from "@/assets/regions/si.svg";
import flagSk from "@/assets/regions/sk.svg";
import flagTz from "@/assets/regions/tz.svg";
import flagUz from "@/assets/regions/uz.svg";
import { regionFlagSrc } from "@/lib/region-flags";
import { normalizeLang } from "@/lib/subtitles/language";

// Bridge from a subtitle language (English name or code) to the country whose
// flag best represents it, so every language in the picker shows a real flag
// instead of a blank column. Keys are the normalized two-letter language codes
// produced by normalizeLang; values are ISO-2 country codes.
//
// Some countries here are not registered in region-flags.ts (that module is not
// touched by this task), so this file imports those SVGs itself and layers them
// over regionFlagSrc via EXTRA_REGION_FLAGS below.
const LANG_CODE_TO_COUNTRY: Record<string, string> = {
  en: "GB",
  es: "ES",
  "es-419": "MX",
  fr: "FR",
  de: "DE",
  it: "IT",
  ja: "JP",
  ko: "KR",
  zh: "CN",
  ru: "RU",
  pt: "PT",
  "pt-br": "BR",
  ar: "SA",
  hi: "IN",
  th: "TH",
  vi: "VN",
  tr: "TR",
  pl: "PL",
  nl: "NL",
  sv: "SE",
  no: "NO",
  da: "DK",
  fi: "FI",
  he: "IL",
  id: "ID",
  cs: "CZ",
  el: "GR",
  hu: "HU",
  ro: "RO",
  uk: "UA",
  ta: "IN",
  te: "IN",
  ml: "IN",
  kn: "IN",
  bn: "BD",
  mr: "IN",
  gu: "IN",
  pa: "IN",
  ur: "PK",
  or: "IN",
  as: "IN",
  ne: "NP",
  si: "LK",
  ms: "MY",
  tl: "PH",
  my: "MM",
  km: "KH",
  lo: "LA",
  fa: "IR",
  ps: "AF",
  az: "AZ",
  ka: "GE",
  hy: "AM",
  kk: "KZ",
  uz: "UZ",
  bg: "BG",
  sr: "RS",
  hr: "HR",
  bs: "BA",
  sk: "SK",
  sl: "SI",
  lt: "LT",
  lv: "LV",
  et: "EE",
  is: "IS",
  ga: "IE",
  ca: "ES",
  eu: "ES",
  gl: "ES",
  cy: "GB",
  mt: "MT",
  sq: "AL",
  mk: "MK",
  be: "BY",
  sw: "TZ",
  am: "ET",
  af: "ZA",
  ha: "NG",
  yo: "NG",
  ig: "NG",
  zu: "ZA",
};

// Country flags authored for this task and not present in region-flags.ts.
const EXTRA_REGION_FLAGS: Record<string, string> = {
  AM: flagAm,
  AZ: flagAz,
  BA: flagBa,
  BD: flagBd,
  BG: flagBg,
  BY: flagBy,
  EE: flagEe,
  ET: flagEt,
  GE: flagGe,
  GR: flagGr,
  HR: flagHr,
  IR: flagIr,
  IS: flagIs,
  KH: flagKh,
  KZ: flagKz,
  LA: flagLa,
  LT: flagLt,
  LV: flagLv,
  MK: flagMk,
  MM: flagMm,
  MT: flagMt,
  NG: flagNg,
  PK: flagPk,
  RS: flagRs,
  SI: flagSi,
  SK: flagSk,
  TZ: flagTz,
  UZ: flagUz,
};

function countryFlag(code: string): string | null {
  const up = (code || "").toUpperCase();
  return regionFlagSrc(up) ?? EXTRA_REGION_FLAGS[up] ?? null;
}

// Resolve a language (name or code) to a country flag SVG, or null when no
// sensible country flag exists (stateless or complex-emblem languages fall back
// to a monogram chip in the Flag component).
export function bridgeFlagSrc(language: string): string | null {
  const country = LANG_CODE_TO_COUNTRY[normalizeLang(language)];
  return country ? countryFlag(country) : null;
}
