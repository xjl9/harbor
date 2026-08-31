import type { CSSProperties } from "react";
import flagBra from "@/assets/flags/flag-bra.svg";
import flagCes from "@/assets/flags/flag-ces.svg";
import flagDan from "@/assets/flags/flag-dan.svg";
import flagDeu from "@/assets/flags/flag-deu.svg";
import flagEng from "@/assets/flags/flag-eng.svg";
import flagFin from "@/assets/flags/flag-fin.svg";
import flagFra from "@/assets/flags/flag-fra.svg";
import flagHeb from "@/assets/flags/flag-heb.svg";
import flagHin from "@/assets/flags/flag-hin.svg";
import flagHun from "@/assets/flags/flag-hun.svg";
import flagIta from "@/assets/flags/flag-ita.svg";
import flagJpn from "@/assets/flags/flag-jpn.svg";
import flagKor from "@/assets/flags/flag-kor.svg";
import flagNld from "@/assets/flags/flag-nld.svg";
import flagNor from "@/assets/flags/flag-nor.svg";
import flagPol from "@/assets/flags/flag-pol.svg";
import flagPor from "@/assets/flags/flag-por.svg";
import flagRon from "@/assets/flags/flag-ron.svg";
import flagRus from "@/assets/flags/flag-rus.svg";
import flagSpa from "@/assets/flags/flag-spa.svg";
import flagSwe from "@/assets/flags/flag-swe.svg";
import flagTha from "@/assets/flags/flag-tha.svg";
import flagTur from "@/assets/flags/flag-tur.svg";
import flagUkr from "@/assets/flags/flag-ukr.svg";
import flagVie from "@/assets/flags/flag-vie.svg";
import flagZho from "@/assets/flags/flag-zho.svg";
import { bridgeFlagSrc } from "@/lib/flag-map";
import { regionFlagSrc } from "@/lib/region-flags";
import { normalizeLang } from "@/lib/subtitles/language";

const FLAG: Record<string, string> = {
  English: flagEng,
  Italian: flagIta,
  Russian: flagRus,
  Hindi: flagHin,
  Spanish: flagSpa,
  "Spanish (Latin America)": flagSpa,
  Korean: flagKor,
  Japanese: flagJpn,
  Chinese: flagZho,
  "Portuguese (Brazil)": flagBra,
  German: flagDeu,
  French: flagFra,
  Turkish: flagTur,
  Czech: flagCes,
  Danish: flagDan,
  Finnish: flagFin,
  Hebrew: flagHeb,
  Hungarian: flagHun,
  Dutch: flagNld,
  Norwegian: flagNor,
  Polish: flagPol,
  Romanian: flagRon,
  Swedish: flagSwe,
  Thai: flagTha,
  Ukrainian: flagUkr,
  Vietnamese: flagVie,
};
const FLAG_BY_CODE: Record<string, string> = {
  en: flagEng,
  it: flagIta,
  ru: flagRus,
  hi: flagHin,
  es: flagSpa,
  ko: flagKor,
  ja: flagJpn,
  zh: flagZho,
  pt: flagPor,
  "pt-br": flagBra,
  de: flagDeu,
  fr: flagFra,
  tr: flagTur,
  cs: flagCes,
  da: flagDan,
  fi: flagFin,
  he: flagHeb,
  hu: flagHun,
  nl: flagNld,
  no: flagNor,
  pl: flagPol,
  ro: flagRon,
  sv: flagSwe,
  th: flagTha,
  uk: flagUkr,
  vi: flagVie,
};

export function countryFlagSrc(code: string): string | null {
  return regionFlagSrc(code);
}

export type FlagSize = "sm" | "md" | "lg" | "xl";

// xl exists for the language picker, where a row is tall enough to give a flag
// real estate. Detailed flags stop being flags below roughly 30px: Saudi Arabia
// is mostly Shahada script and Portugal is mostly an armillary sphere, and at
// 22px both render as a smudge.
const FLAG_HEIGHT: Record<FlagSize, number> = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 30,
};

const LABEL_SIZE: Record<FlagSize, number> = {
  sm: 11,
  md: 13,
  lg: 15,
  xl: 15,
};

const FLAG_RING = "0 0 0 1px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.4)";

export function languageHasFlag(language: string): boolean {
  return language in FLAG;
}

export function flagSrc(language: string): string | null {
  return FLAG[language] ?? null;
}

// A short monogram chip used when no flag image exists for a language, so a row
// never renders a blank flag column.
function MonogramChip({ language, size }: { language: string; size: FlagSize }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[3px] bg-canvas/70 px-1 font-bold uppercase tracking-[0.14em] text-ink-subtle ring-1 ring-edge-soft"
      style={{ height: FLAG_HEIGHT[size] + 2, fontSize: 9, lineHeight: 1 }}
    >
      {language.slice(0, 2)}
    </span>
  );
}
function FlagImage({
  language,
  src,
  size,
  splitPortuguese,
}: {
  language: string;
  src: string;
  size: FlagSize;
  splitPortuguese: boolean;
}) {
  const h = FLAG_HEIGHT[size];
  const frame: CSSProperties = {
    height: h,
    width: h * 1.5,
    display: "block",
    borderRadius: 2,
    objectFit: "cover",
    boxShadow: FLAG_RING,
  };
  if (!splitPortuguese) {
    return <img src={src} alt={language} style={frame} draggable={false} />;
  }

  return (
    <span
      role="img"
      aria-label={language}
      style={{ ...frame, position: "relative", overflow: "hidden" }}
    >
      <img
        src={flagPor}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      <img
        src={flagBra}
        alt=""
        aria-hidden
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          clipPath: "polygon(0 0, 100% 0, 100% 100%)",
        }}
      />
    </span>
  );
}

export function Flag({
  language,
  code,
  size = "md",
  showLabel = true,
}: {
  language: string;
  code?: string;
  size?: FlagSize;
  showLabel?: boolean;
}) {
  if (language === "Multi") {
    return (
      <span
        className="inline-flex items-center gap-0 rounded-[3px] bg-accent/15 px-1.5 text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-accent ring-1 ring-accent/35"
        style={{ height: FLAG_HEIGHT[size] + 4, lineHeight: 1 }}
      >
        Multi
      </span>
    );
  }

  const normalizedCode = normalizeLang(code ?? language);
  const src =
    FLAG_BY_CODE[normalizedCode] ?? FLAG[language] ?? bridgeFlagSrc(normalizedCode || language);

  if (!src) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <MonogramChip language={language} size={size} />
        {showLabel && (
          <span
            className="font-semibold tracking-[0.01em] text-ink-muted"
            style={{ fontSize: LABEL_SIZE[size] }}
          >
            {language}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <FlagImage
        language={language}
        src={src}
        size={size}
        splitPortuguese={normalizedCode === "pt"}
      />
      {showLabel && (
        <span
          className="font-semibold tracking-[0.01em] text-ink-muted"
          style={{ fontSize: LABEL_SIZE[size] }}
        >
          {language}
        </span>
      )}
    </span>
  );
}

export function FlagStack({
  languages,
  max = 4,
  size = "md",
}: {
  languages: string[];
  max?: number;
  size?: FlagSize;
}) {
  if (languages.length === 0) return null;
  const shown = languages.slice(0, max);
  const extra = languages.length - shown.length;
  const h = FLAG_HEIGHT[size];

  return (
    <span className="inline-flex items-center gap-1">
      {shown.map((lang) => {
        if (lang === "Multi") {
          return (
            <span
              key={lang}
              className="inline-flex items-center justify-center rounded-[3px] bg-accent/15 px-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-accent ring-1 ring-accent/35"
              style={{ height: h + 2, lineHeight: 1 }}
            >
              M
            </span>
          );
        }
        const src = FLAG[lang];
        if (!src) {
          return (
            <span
              key={lang}
              className="inline-flex items-center justify-center rounded-[3px] bg-canvas/70 px-1 text-[9px] font-bold uppercase tracking-[0.14em] text-ink-subtle ring-1 ring-edge-soft"
              style={{ height: h + 2, lineHeight: 1 }}
            >
              {lang.slice(0, 2)}
            </span>
          );
        }
        return (
          <img
            key={lang}
            src={src}
            alt={lang}
            title={lang}
            style={{
              height: h,
              width: h * 1.5,
              display: "block",
              borderRadius: 2,
              objectFit: "cover",
              boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.4)",
            }}
            draggable={false}
          />
        );
      })}
      {extra > 0 && (
        <span
          className="text-[10px] font-semibold tracking-[0.04em] text-ink-subtle"
          style={{ lineHeight: 1 }}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
