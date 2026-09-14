import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { getThemeById } from "@/lib/theme";
import { POSTER_RADII, radiusKey } from "@/views/settings/theme-panel/display/poster-options";
import { MobileThemeSheet } from "../mobile-theme-sheet";
import { DEPT_BY_ID } from "./registry";
import { Dept, Group, NavRow, PhonePage, SegmentedRow, ToggleRow } from "./kit";

const THEME_SWATCH = ["var(--color-surface)", "var(--color-raised)", "var(--color-accent)"];

// Appearance keeps only what the phone shell actually renders: the theme
// tokens (the whole shell paints from them) and the animated tab bar icons
// (bottom-tab-bar.tsx plays NavLottie, which reads navIconAnimations). Window,
// typography, logo, liquid glass and interface scale drive desktop chrome or
// the desktop webview zoom and are left out rather than shown as dead rows.
export function AppearancePage({ onBack, anchor }: { onBack: () => void; anchor?: string | null }) {
  const t = useT();
  const { settings, update } = useSettings();
  const [themeOpen, setThemeOpen] = useState(false);
  const dept = DEPT_BY_ID.appearance;
  const themeName = getThemeById(settings.theme.preset)?.name ?? t("Custom theme");

  return (
    <PhonePage title={t(dept.label)} kicker={t("Settings")} icon={dept.icon} onBack={onBack} anchor={anchor}>
      <Dept index={0} icon="ThemeSwatches" title={t("Theme")} standfirst={t("Colors, posters, fonts and wallpaper.")}>
        <Group>
          <NavRow
            icon="ThemeSwatches"
            label={t("Theme and appearance")}
            sub={t("Currently using {name}. Pick another preset or build your own.", { name: themeName })}
            valueLead={
              <span className="flex h-6 w-11 shrink-0 overflow-hidden rounded-md ring-1 ring-edge-soft">
                {THEME_SWATCH.map((c) => (
                  <span key={c} className="h-full flex-1" style={{ background: c }} />
                ))}
              </span>
            }
            onClick={() => setThemeOpen(true)}
          />
        </Group>
      </Dept>

      <Dept index={1} icon="AppInterface" title={t("Interface")}>
        <Group>
          {/* Phone browse tiles draw through components/poster, which reads the
              --poster-radius token this setting writes. Desktop's slider steps
              in 2px; the phone offers its named stops, which fit a thumb. */}
          <SegmentedRow
            icon="Square"
            label={t("Corner radius")}
            sub={t("How rounded the corners of every poster card are.")}
            value={radiusKey(settings.posterRadius)}
            options={POSTER_RADII.map((p) => ({ value: p.value, label: t(p.label) }))}
            onChange={(v) => update({ posterRadius: POSTER_RADII.find((p) => p.value === v)?.px ?? 12 })}
          />
          <ToggleRow
            icon="Sparkles"
            label={t("Animated tab bar icons")}
            sub={t("Tab bar icons play a short animation when you tap them. Turn this off to keep them as plain static icons.")}
            on={settings.navIconAnimations}
            onChange={(v) => update({ navIconAnimations: v })}
          />
        </Group>
      </Dept>

      {/* Rendered inside the page so it stacks above it: the theme sheet sits at
          the shell's sheet layer, which is below a department page. */}
      {themeOpen && <MobileThemeSheet onClose={() => setThemeOpen(false)} />}
    </PhonePage>
  );
}
