import { Check, ChevronLeft } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getCustomThemes, subscribeCustomThemes, type CustomTheme } from "@/lib/custom-themes";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import {
  FEATURED_CUSTOM_THEMES,
  TEMPLATE_THEMES,
  THEME_PRESETS,
  getThemeById,
  type ActiveThemeId,
  type CustomColors,
  type ThemePreset,
} from "@/lib/theme";
import { nextBackgroundImage } from "@/lib/theme-background";
import { MOBILE_SAFE_X } from "./chrome-metrics";
import { useRegisterSheet } from "./mobile-sheet-lock";

// Same focus token as mobile-settings.tsx, so focus reads the same on every
// phone page whether it came from touch, a keyboard or a controller.
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// One tile per theme the desktop offers. Presets are Harbor's own, featured are
// the community themes upstream ships with the app, and the user's own imports
// come from the custom theme store. A preview screenshot leads where upstream
// drew one; the three swatches stand in where it did not.
type Tile = {
  id: ActiveThemeId;
  name: string;
  blurb: string;
  swatch: [string, string, string];
  previewImage?: string;
};

function tileOf(p: ThemePreset | CustomTheme): Tile {
  return {
    id: p.id as ActiveThemeId,
    name: p.name,
    blurb: p.blurb,
    swatch: p.swatch,
    previewImage: p.previewImage,
  };
}

function customTile(c: CustomColors, name: string, blurb: string): Tile {
  return { id: "custom", name, blurb, swatch: [c.canvas, c.raised, c.accent] };
}

export function MobileThemeSheet({ onClose }: { onClose: () => void }) {
  useRegisterSheet(true);
  const t = useT();
  const { settings, update } = useSettings();
  const [closing, setClosing] = useState(false);
  const [custom, setCustom] = useState<CustomTheme[]>(() => getCustomThemes());

  useEffect(() => subscribeCustomThemes(() => setCustom(getCustomThemes())), []);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(onClose, 300);
    return () => window.clearTimeout(timer);
  }, [closing, onClose]);

  const active = settings.theme.preset;

  const presets = useMemo(() => Object.values(THEME_PRESETS).map(tileOf), []);
  const featured = useMemo(() => [...FEATURED_CUSTOM_THEMES, ...TEMPLATE_THEMES].map(tileOf), []);
  const yours = useMemo(() => custom.map(tileOf), [custom]);
  const palette = settings.theme.customColors
    ? customTile(settings.theme.customColors, t("Custom"), t("Your palette from the theme editor"))
    : null;

  // Mirrors activateTheme in src/views/settings/theme-panel/custom-themes-section.tsx:
  // a theme that owns a wallpaper hands it over, one that owns the sidebar
  // order parks the user's own order until they leave it again, and the
  // "custom" id keeps the palette the desktop editor saved.
  const activate = (id: ActiveThemeId) => {
    if (id === active) return;
    const previous = active === "custom" ? null : getThemeById(active);
    const next = id === "custom" ? null : getThemeById(id);
    const nav = next?.navCustomization;
    const held = settings.navCustomizationOwn;
    const navPatch = nav
      ? {
          navCustomization: {
            order: nav.order ?? [],
            hidden: nav.hidden ?? [],
            renamed: nav.renamed ?? {},
          },
          navCustomizationOwn: held ?? settings.navCustomization,
        }
      : held
        ? { navCustomization: held, navCustomizationOwn: null }
        : {};
    const bg = next?.background;
    update({
      theme: {
        ...settings.theme,
        preset: id,
        backgroundImage: nextBackgroundImage(settings.theme.backgroundImage, previous, next),
        ...(bg ? { backgroundDim: bg.dim ?? settings.theme.backgroundDim } : {}),
      },
      ...navPatch,
    });
  };

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />

      <header
        className="mx-auto flex w-full max-w-[680px] items-center gap-3 px-5 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          type="button"
          onClick={() => setClosing(true)}
          aria-label={t("Back")}
          className={`-ms-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-sans font-semibold uppercase tracking-[0.22em] text-ink-subtle">
            {t("Appearance")}
          </p>
          <h1 className="truncate font-display text-[30px] font-medium leading-none tracking-[-0.02em] text-ink">
            {t("Theme")}
          </h1>
        </div>
      </header>

      <div
        className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto overscroll-y-contain px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >
        <p className="pb-4 pt-1 text-[13.5px] leading-relaxed text-ink-muted">
          {t("Pick a look. Every color and surface updates instantly.")}
        </p>

        <Group title={t("Presets")}>
          {presets.map((tile) => (
            <ThemeTile key={tile.id} tile={tile} active={tile.id === active} onPick={activate} />
          ))}
        </Group>

        <Group title={t("Featured")}>
          {featured.map((tile) => (
            <ThemeTile key={tile.id} tile={tile} active={tile.id === active} onPick={activate} />
          ))}
        </Group>

        {(yours.length > 0 || palette) && (
          <Group title={t("Your themes")}>
            {palette && (
              <ThemeTile tile={palette} active={active === "custom"} onPick={activate} />
            )}
            {yours.map((tile) => (
              <ThemeTile key={tile.id} tile={tile} active={tile.id === active} onPick={activate} />
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pb-7">
      <h2 className="pb-3 text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">{title}</h2>
      {/* Two columns at phone width: a 402pt screen gives each tile about 175pt,
          enough for the 16:10 preview to read as a screenshot rather than a
          swatch. The grid only widens on a tablet. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function ThemeTile({
  tile,
  active,
  onPick,
}: {
  tile: Tile;
  active: boolean;
  onPick: (id: ActiveThemeId) => void;
}) {
  const t = useT();
  const [c0, c1, c2] = tile.swatch;
  return (
    <button
      type="button"
      onClick={() => onPick(tile.id)}
      aria-pressed={active}
      aria-label={active ? t("{name}, applied", { name: tile.name }) : tile.name}
      className={`group relative flex flex-col overflow-hidden rounded-2xl border text-start transition-[transform,border-color] duration-200 active:scale-[0.98] ${FOCUS} ${
        active ? "border-ink" : "border-edge-soft"
      }`}
      style={{ background: c0 }}
    >
      <span className="relative block aspect-[16/10] w-full overflow-hidden">
        {tile.previewImage ? (
          <img
            src={tile.previewImage}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover object-top"
          />
        ) : (
          <span
            aria-hidden
            className="block h-full w-full"
            style={{ background: `linear-gradient(160deg, ${c1} 0%, ${c0} 62%, ${c2} 140%)` }}
          />
        )}
        <span
          aria-hidden
          className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          style={{ background: c2 }}
        >
          {active && <Check size={15} strokeWidth={3} style={{ color: c0 }} />}
        </span>
      </span>
      <span className="flex min-h-[64px] flex-col gap-0.5 px-3 pb-3 pt-2.5">
        <span className="truncate text-[14.5px] font-semibold leading-tight" style={{ color: c2 }}>
          {tile.name}
        </span>
        <span
          className="line-clamp-2 text-[12px] leading-[16px]"
          style={{ color: c2, opacity: 0.72 }}
        >
          {tile.blurb}
        </span>
      </span>
    </button>
  );
}
