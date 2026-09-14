import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useBrandRanking } from "@/components/brand-tiles";
import { GENRE_PALETTE } from "@/components/genre-tiles";
import { AwardLogo, laurelColorFor } from "@/components/icons/award-logo";
import { Laurel } from "@/components/icons/laurel";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { fetchGenreSample } from "@/lib/feed";
import { MOVIE_GENRES } from "@/lib/feed/tags";
import { useT } from "@/lib/i18n";
import { rpdbPoster } from "@/lib/providers/rpdb";
import { tmdbDiscover } from "@/lib/providers/tmdb";
import type { BrandKind, BrandSummary } from "@/lib/providers/tmdb/tmdb-brands";
import type { AwardType } from "@/lib/providers/wikidata";
import { useSettings } from "@/lib/settings";
import { claimUniqueArt, releaseUniqueArt } from "@/lib/unique-art";

// Phone versions of the desktop Discover tile rows (genre-tiles.tsx,
// language-tiles.tsx, award-tiles.tsx, brand-tiles.tsx). Same 5:4 tile, same
// palettes, same collage art, laid out as a swipeable rail of 196px tiles
// instead of the desktop grid row, and handing the tap back to the caller
// because the phone shell has no nav frames for openFilter/openAward/openBrands.

const RAIL_CULL = "[content-visibility:auto] [contain-intrinsic-size:auto_220px]";
const TILE_W = "w-[196px] [@media(min-width:700px)_and_(min-height:600px)]:w-[240px]";

export type GenreRef = { name: string; id: number };
export type LanguageRef = { iso: string; name: string; endonym: string; hue: number };
export type AwardRef = { type: AwardType; name: string; sub: string };

// The desktop lists live as module constants in the tile files and are not
// exported, so they are mirrored here. Keep in step with language-tiles.tsx and
// award-tiles.tsx.
export const LANGUAGE_TILES: LanguageRef[] = [
  { iso: "ko", name: "Korean", endonym: "한국어", hue: 25 },
  { iso: "ja", name: "Japanese", endonym: "日本語", hue: 350 },
  { iso: "es", name: "Spanish", endonym: "Español", hue: 60 },
  { iso: "fr", name: "French", endonym: "Français", hue: 260 },
  { iso: "zh", name: "Chinese", endonym: "中文", hue: 10 },
  { iso: "hi", name: "Hindi", endonym: "हिन्दी", hue: 300 },
  { iso: "de", name: "German", endonym: "Deutsch", hue: 40 },
  { iso: "it", name: "Italian", endonym: "Italiano", hue: 145 },
  { iso: "pt", name: "Portuguese", endonym: "Português", hue: 130 },
  { iso: "tr", name: "Turkish", endonym: "Türkçe", hue: 200 },
  { iso: "sv", name: "Swedish", endonym: "Svenska", hue: 230 },
  { iso: "da", name: "Danish", endonym: "Dansk", hue: 0 },
  { iso: "no", name: "Norwegian", endonym: "Norsk", hue: 250 },
  { iso: "ru", name: "Russian", endonym: "Русский", hue: 340 },
  { iso: "pl", name: "Polish", endonym: "Polski", hue: 170 },
  { iso: "th", name: "Thai", endonym: "ไทย", hue: 320 },
  { iso: "nl", name: "Dutch", endonym: "Nederlands", hue: 80 },
  { iso: "ar", name: "Arabic", endonym: "العربية", hue: 165 },
];

export const AWARD_TILES: AwardRef[] = [
  { type: "oscar", name: "Academy Awards", sub: "Best Picture and beyond" },
  { type: "golden_globe", name: "Golden Globes", sub: "Film and television" },
  { type: "bafta", name: "BAFTA", sub: "The British Academy" },
  { type: "emmy", name: "Emmys", sub: "Television's finest" },
  { type: "sag", name: "SAG Awards", sub: "Chosen by actors" },
  { type: "critics_choice", name: "Critics' Choice", sub: "The critics' cut" },
  { type: "bafta_tv", name: "BAFTA Television", sub: "British TV's biggest night" },
  { type: "annie", name: "Annie Awards", sub: "Animation's finest" },
  { type: "spirit", name: "Spirit Awards", sub: "Independent film" },
  { type: "saturn", name: "Saturn Awards", sub: "Sci-fi, fantasy & horror" },
  { type: "cannes", name: "Cannes", sub: "Palme d'Or" },
  { type: "venice", name: "Venice", sub: "Golden Lion" },
  { type: "berlin", name: "Berlinale", sub: "Golden Bear" },
  { type: "cesar", name: "César Awards", sub: "French cinema" },
  { type: "goya", name: "Goya Awards", sub: "Spanish cinema" },
  { type: "blue_dragon", name: "Blue Dragon", sub: "Korean cinema" },
  { type: "baeksang", name: "Baeksang", sub: "Korean film & drama" },
  { type: "bifa", name: "BIFA", sub: "British independent film" },
];

const GENRE_TILES = [
  "Action", "Adventure", "Thriller", "Crime", "Drama", "Romance", "Mystery", "Sci-Fi", "Fantasy",
  "Horror", "Comedy", "Family", "Animation", "Western", "War", "History", "Documentary", "Music",
];

export function TileRail({
  title,
  onSeeAll,
  children,
}: {
  title: string;
  onSeeAll?: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-3 ${RAIL_CULL}`}>
      <button
        type="button"
        onClick={onSeeAll}
        disabled={!onSeeAll}
        className="flex items-center gap-1 px-4 text-start disabled:cursor-default"
      >
        <h2 className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink">{title}</h2>
        {onSeeAll && <ChevronRight size={19} strokeWidth={2.4} className="dir-icon text-ink-subtle" />}
      </button>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

function Collage({ backdrops, rpdbKey }: { backdrops: Meta[]; rpdbKey: string }) {
  if (backdrops.length === 0) return null;
  return (
    <div className="absolute inset-0 grid grid-cols-3">
      {backdrops.slice(0, 3).map((m, i) => (
        <div key={m.id} className="relative overflow-hidden" style={{ transform: `skewX(-8deg) translateX(${(i - 1) * 6}px)` }}>
          <Poster
            src={rpdbPoster(rpdbKey, m.id, m.background ?? m.poster)}
            seed={m.id}
            ratio="landscape"
            lazy
            className="h-full rounded-none [transform:skewX(8deg)_scale(1.4)]"
          />
        </div>
      ))}
    </div>
  );
}

function TileFrame({
  onClick,
  label,
  style,
  children,
}: {
  onClick: () => void;
  label: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`relative aspect-[5/4] ${TILE_W} shrink-0 overflow-hidden rounded-2xl border border-edge-soft text-start [content-visibility:auto]`}
      style={style}
    >
      {children}
    </button>
  );
}

export function MobileGenreTiles({ title, onOpen }: { title?: string; onOpen: (g: GenreRef) => void }) {
  const t = useT();
  return (
    <TileRail title={title ?? t("Browse by Genre")}>
      {GENRE_TILES.map((g) => (
        <GenreTile key={g} genre={g} onOpen={onOpen} />
      ))}
    </TileRail>
  );
}

function GenreTile({ genre, onOpen }: { genre: string; onOpen: (g: GenreRef) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [backdrops, setBackdrops] = useState<Meta[]>([]);
  const palette = GENRE_PALETTE[genre] ?? GENRE_PALETTE.Drama;
  useEffect(() => {
    let cancelled = false;
    const key = `m-genre:${genre}`;
    fetchGenreSample(settings.tmdbKey, genre)
      .then((list) => {
        if (cancelled) return;
        setBackdrops(claimUniqueArt(key, list.filter((m) => m.background), (m) => m.id, 3));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      releaseUniqueArt(key);
    };
  }, [genre, settings.tmdbKey]);
  const id = MOVIE_GENRES[genre];
  return (
    <TileFrame
      label={t(genre)}
      onClick={() => id != null && onOpen({ name: genre, id })}
      style={{ background: `linear-gradient(150deg, ${palette.from}, ${palette.to})` }}
    >
      <Collage backdrops={backdrops} rpdbKey={settings.rpdbKey} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(150deg, ${palette.from} 0%, oklch(from ${palette.from} l c h / 0.55) 65%, oklch(from ${palette.to} l c h / 0.85) 100%)`,
          mixBlendMode: "multiply",
        }}
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/5" style={{ background: `linear-gradient(to bottom, transparent, ${palette.to})` }} />
      <div className="absolute inset-x-4 bottom-3.5 flex items-end justify-between">
        <h3 className="font-display text-[21px] font-medium leading-tight tracking-tight [text-shadow:0_2px_18px_rgba(0,0,0,0.4)]" style={{ color: palette.ink }}>
          {t(genre)}
        </h3>
        <span className="dir-icon text-[18px]" style={{ color: palette.ink }} aria-hidden>
          ›
        </span>
      </div>
    </TileFrame>
  );
}

export function MobileLanguageTiles({ title, onOpen }: { title?: string; onOpen: (l: LanguageRef) => void }) {
  const t = useT();
  return (
    <TileRail title={title ?? t("Browse by Language")}>
      {LANGUAGE_TILES.map((l) => (
        <LanguageTile key={l.iso} lang={l} onOpen={onOpen} />
      ))}
    </TileRail>
  );
}

function LanguageTile({ lang, onOpen }: { lang: LanguageRef; onOpen: (l: LanguageRef) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [backdrops, setBackdrops] = useState<Meta[]>([]);
  const from = `oklch(0.42 0.13 ${lang.hue})`;
  const to = `oklch(0.17 0.07 ${lang.hue})`;
  const ink = `oklch(0.96 0.02 ${lang.hue})`;
  useEffect(() => {
    let cancelled = false;
    const key = `m-lang:${lang.iso}`;
    if (!settings.tmdbKey) return;
    tmdbDiscover(settings.tmdbKey, "tv", {
      with_original_language: lang.iso,
      sort_by: "popularity.desc",
      "vote_count.gte": "150",
    })
      .then((list) => {
        if (cancelled) return;
        setBackdrops(claimUniqueArt(key, list.filter((m) => m.background), (m) => m.id, 3));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      releaseUniqueArt(key);
    };
  }, [lang.iso, settings.tmdbKey]);
  return (
    <TileFrame label={t(lang.name)} onClick={() => onOpen(lang)} style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}>
      <Collage backdrops={backdrops} rpdbKey={settings.rpdbKey} />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(150deg, ${from} 0%, oklch(from ${from} l c h / 0.55) 60%, oklch(from ${to} l c h / 0.9) 100%)`,
          mixBlendMode: "multiply",
        }}
      />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2" style={{ background: `linear-gradient(to bottom, transparent, ${to})` }} />
      <span className="pointer-events-none absolute end-3.5 top-2.5 select-none font-display text-[28px] font-medium leading-none opacity-25" style={{ color: ink }} aria-hidden>
        {lang.endonym}
      </span>
      <div className="absolute inset-x-4 bottom-3.5 flex items-end justify-between">
        <h3 className="font-display text-[21px] font-medium leading-tight tracking-tight [text-shadow:0_2px_18px_rgba(0,0,0,0.4)]" style={{ color: ink }}>
          {t(lang.name)}
        </h3>
        <span className="dir-icon text-[18px]" style={{ color: ink }} aria-hidden>
          ›
        </span>
      </div>
    </TileFrame>
  );
}

export function MobileAwardTiles({ title, onOpen }: { title?: string; onOpen: (a: AwardRef) => void }) {
  const t = useT();
  return (
    <TileRail title={title ?? t("Browse by Award")}>
      {AWARD_TILES.map((a) => (
        <AwardTile key={a.type} award={a} onOpen={onOpen} />
      ))}
    </TileRail>
  );
}

function AwardTile({ award, onOpen }: { award: AwardRef; onOpen: (a: AwardRef) => void }) {
  const t = useT();
  const tint = laurelColorFor(award.type);
  return (
    <TileFrame
      label={t(award.name)}
      onClick={() => onOpen(award)}
      style={{
        background: `linear-gradient(150deg, oklch(from ${tint} 0.26 calc(c * 0.45) h), oklch(from ${tint} 0.11 calc(c * 0.3) h))`,
      }}
    >
      <div aria-hidden className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 32%, oklch(from ${tint} 0.5 calc(c * 0.7) h / 0.22), transparent 62%)` }} />
      <div className="absolute inset-x-0 top-0 flex h-[62%] items-center justify-center" style={{ color: tint }}>
        <span className="opacity-95 drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)]">
          <Laurel size={78}>
            <AwardLogo type={award.type} size={26} />
          </Laurel>
        </span>
      </div>
      <div className="absolute inset-x-4 bottom-3.5 flex items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 className="truncate font-display text-[18px] font-medium leading-tight tracking-tight text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.5)]">
            {t(award.name)}
          </h3>
          <span className="truncate text-[11px] font-medium text-white/65">{t(award.sub)}</span>
        </div>
        <span className="dir-icon shrink-0 text-[18px] text-white/80" aria-hidden>
          ›
        </span>
      </div>
    </TileFrame>
  );
}

export function MobileBrandTiles({
  kind,
  title,
  onOpen,
  onSeeAll,
}: {
  kind: BrandKind;
  title?: string;
  onOpen: (b: BrandSummary) => void;
  onSeeAll?: () => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { brands } = useBrandRanking(kind);
  if (!settings.tmdbKey || brands.length === 0) return null;
  return (
    <TileRail title={title ?? (kind === "studio" ? t("Top studios") : t("Top networks"))} onSeeAll={onSeeAll}>
      {brands.slice(0, 18).map((b) => (
        <MobileBrandTile key={b.id} brand={b} onOpen={onOpen} />
      ))}
    </TileRail>
  );
}

// Same tile the desktop BrandTile draws: a strip of the brand's top backdrops
// under a scrim, the logo on a white plate, the name and a title count.
export function MobileBrandTile({
  brand,
  facts,
  onOpen,
  fill = false,
}: {
  brand: BrandSummary;
  facts?: string;
  onOpen: (b: BrandSummary) => void;
  fill?: boolean;
}) {
  const t = useT();
  const [logoBroken, setLogoBroken] = useState(false);
  const line = facts ?? (brand.count > 0 ? t("{n} titles", { n: brand.count.toLocaleString() }) : "");
  const showLogo = !!brand.logo && !logoBroken;
  return (
    <button
      type="button"
      onClick={() => onOpen(brand)}
      aria-label={brand.name}
      className={`relative aspect-[5/4] ${fill ? "w-full" : `${TILE_W} shrink-0`} overflow-hidden rounded-2xl border border-edge-soft bg-elevated text-start [content-visibility:auto]`}
    >
      <div aria-hidden className="absolute inset-0 flex">
        {brand.art.map((src) => (
          <span key={src} className="relative min-w-0 flex-1">
            <img src={src} alt="" draggable={false} loading="lazy" decoding="async" className="h-full w-full object-cover opacity-40" />
          </span>
        ))}
      </div>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(8,10,14,0.30) 0%, rgba(8,10,14,0.50) 55%, rgba(8,10,14,0.92) 100%)" }}
      />
      <div className="absolute inset-x-4 top-3 bottom-[50px] flex items-center justify-center">
        {showLogo ? (
          <span className="inline-flex max-h-full max-w-[82%] items-center justify-center rounded-xl bg-white/[0.94] px-3 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.45)]">
            <img
              src={brand.logo ?? undefined}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
              onError={() => setLogoBroken(true)}
              className="max-h-[34px] max-w-full object-contain"
            />
          </span>
        ) : (
          <span className="line-clamp-2 text-center font-display text-[21px] font-medium leading-tight tracking-tight text-white [text-shadow:0_2px_18px_rgba(0,0,0,0.5)]">
            {brand.name}
          </span>
        )}
      </div>
      <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-white/95">{brand.name}</span>
          {line && <span className="block truncate text-[11px] text-white/65">{line}</span>}
        </span>
        <span className="dir-icon text-[18px] text-white/80" aria-hidden>
          ›
        </span>
      </div>
    </button>
  );
}
