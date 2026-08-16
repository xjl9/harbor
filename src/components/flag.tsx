import flagAra from "@/assets/flags/flag-ara.svg";
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
import flagPrt from "@/assets/flags/flag-prt.svg";
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
  Portuguese: flagPrt,
  "Portuguese (Brazil)": flagBra,
  German: flagDeu,
  French: flagFra,
  Turkish: flagTur,
  Arabic: flagAra,
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

// Generic Portuguese is not tied to one country, so it renders as a single tile
// split on the top-left/bottom-right diagonal: Brazil in the top-right, Portugal
// in the bottom-left. Regional variants (pt-br / "Portuguese (Brazil)") keep the
// plain Brazil flag from the FLAG map.
function isGenericPortuguese(language: string): boolean {
  return language === "Portuguese" || language === "pt";
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

export function Flag({
  language,
  size = "md",
  showLabel = true,
}: {
  language: string;
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

  const h = FLAG_HEIGHT[size];

  if (isGenericPortuguese(language)) {
    return <DiagonalFlag size={size} showLabel={showLabel} label={language} />;
  }

  const src = FLAG[language] ?? bridgeFlagSrc(language);

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
      <img
        src={src}
        alt={language}
        height={h}
        style={{
          height: h,
          width: h * 1.5,
          display: "block",
          borderRadius: 2,
          objectFit: "cover",
          boxShadow: FLAG_RING,
        }}
        draggable={false}
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

// Two triangles clipped from the existing Brazil and Portugal tiles, meeting on
// the top-left/bottom-right diagonal, with a hairline seam drawn corner to
// corner (an SVG line so it tracks the non-square tile exactly).
function DiagonalFlag({
  size,
  showLabel,
  label,
}: {
  size: FlagSize;
  showLabel: boolean;
  label: string;
}) {
  const h = FLAG_HEIGHT[size];
  const w = h * 1.5;
  const tile: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    height: "100%",
    width: "100%",
    objectFit: "cover",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="relative block overflow-hidden"
        style={{ height: h, width: w, borderRadius: 2, boxShadow: FLAG_RING }}
      >
        <img
          src={flagPrt}
          alt=""
          aria-hidden
          draggable={false}
          style={{ ...tile, clipPath: "polygon(0 0, 100% 100%, 0 100%)" }}
        />
        <img
          src={flagBra}
          alt=""
          aria-hidden
          draggable={false}
          style={{ ...tile, clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
        />
        <svg
          viewBox="0 0 3 2"
          preserveAspectRatio="none"
          aria-hidden
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        >
          <line
            x1="0"
            y1="0"
            x2="3"
            y2="2"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </span>
      {showLabel && (
        <span
          className="font-semibold tracking-[0.01em] text-ink-muted"
          style={{ fontSize: LABEL_SIZE[size] }}
        >
          {label}
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
