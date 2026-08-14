import { AlignCenter, AlignLeft, AlignRight, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { ColorPopoverTrigger } from "@/views/settings/color-picker";
import { useSettings } from "@/lib/settings";
import { useT } from "@/lib/i18n";
import { MobileSheet } from "./mobile-sheet";

// Touch-first subtitle appearance controls. Writes ONLY the existing sub* style
// settings via update(); both shared renderers (CSS SubtitleOverlay + mpv
// applySubStyle) already read these fields, so there is no rendering code here.
// A tighter subset of the desktop SubtitleStylePanel, sized for a bottom sheet.

const TEXT_PRESETS = ["#FFFFFF", "#000000", "#FFE86B", "#7DD3FC", "#A3E635", "#F472B6"];
const SHADE_PRESETS = ["#000000", "#FFFFFF", "#1F2937", "#0B1E3D", "#3B0A0A"];

const SUB_STYLE_DEFAULTS = {
  subStyle: "shadow",
  subFontFamily: "inter",
  subFontSize: 32,
  subFontColor: "#FFFFFF",
  subBorderColor: "#000000",
  subBorderSize: 0,
  subMarginY: 12,
  subAlignX: "center",
  subBoxOpacity: 0.6,
  subBoxColor: "#000000",
  subOpacity: 1,
  subBold: false,
} as const;

export function MobileSubStyleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();

  const styleModes: Array<{ id: "shadow" | "outline" | "box"; label: string }> = [
    { id: "shadow", label: t("Shadow") },
    { id: "outline", label: t("Outline") },
    { id: "box", label: t("Box") },
  ];

  return (
    <MobileSheet open={open} onClose={onClose} title={t("Subtitle style")} heightClass="h-[72vh]">
      <div className="flex flex-col gap-5 px-4 pb-5">
        <StylePreview />

        <Segmented
          label={t("Background")}
          options={styleModes}
          value={settings.subStyle}
          onChange={(id) => update({ subStyle: id })}
        />

        <Slider
          label={t("Size")}
          value={`${settings.subFontSize}px`}
          min={16}
          max={120}
          step={1}
          current={settings.subFontSize}
          onChange={(v) => update({ subFontSize: Math.round(v) })}
        />

        <ColorRow
          label={t("Text color")}
          presets={TEXT_PRESETS}
          value={settings.subFontColor}
          onChange={(hex) => update({ subFontColor: hex })}
        />

        {settings.subStyle === "box" && (
          <>
            <Slider
              label={t("Background opacity")}
              value={`${Math.round(settings.subBoxOpacity * 100)}%`}
              min={0.2}
              max={1}
              step={0.05}
              current={settings.subBoxOpacity}
              onChange={(v) => update({ subBoxOpacity: Math.max(0, Math.min(1, v)) })}
            />
            <ColorRow
              label={t("Box color")}
              presets={SHADE_PRESETS}
              value={settings.subBoxColor || "#000000"}
              onChange={(hex) => update({ subBoxColor: hex })}
            />
          </>
        )}

        {settings.subStyle === "outline" && (
          <>
            <Slider
              label={t("Outline thickness")}
              value={`${settings.subBorderSize}px`}
              min={1}
              max={6}
              step={0.5}
              current={Math.max(1, settings.subBorderSize)}
              onChange={(v) => update({ subBorderSize: Math.min(6, Math.max(1, v)) })}
            />
            <ColorRow
              label={t("Outline color")}
              presets={SHADE_PRESETS}
              value={settings.subBorderColor}
              onChange={(hex) => update({ subBorderColor: hex })}
            />
          </>
        )}

        <Slider
          label={t("Opacity")}
          value={`${Math.round((settings.subOpacity ?? 1) * 100)}%`}
          min={0.2}
          max={1}
          step={0.05}
          current={settings.subOpacity ?? 1}
          onChange={(v) => update({ subOpacity: Math.max(0.2, Math.min(1, v)) })}
        />

        <Slider
          label={t("Distance from bottom")}
          value={`${settings.subMarginY}%`}
          min={0}
          max={100}
          step={1}
          current={settings.subMarginY}
          onChange={(v) => update({ subMarginY: Math.round(v) })}
        />

        <Segmented
          label={t("Alignment")}
          options={[
            { id: "left", label: t("Left"), icon: <AlignLeft size={17} strokeWidth={2} /> },
            { id: "center", label: t("Center"), icon: <AlignCenter size={17} strokeWidth={2} /> },
            { id: "right", label: t("Right"), icon: <AlignRight size={17} strokeWidth={2} /> },
          ]}
          value={settings.subAlignX}
          onChange={(id) => update({ subAlignX: id })}
        />

        <ToggleRow
          label={t("Bold text")}
          value={settings.subBold}
          onChange={(v) => update({ subBold: v })}
        />

        <button
          type="button"
          onClick={() => update({ ...SUB_STYLE_DEFAULTS })}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-edge-soft text-[13px] font-semibold text-ink-muted transition-colors active:bg-white/5"
        >
          <RotateCcw size={15} strokeWidth={2.2} />
          {t("Reset to defaults")}
        </button>
      </div>
    </MobileSheet>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-subtle">
      {children}
    </span>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-mono text-[12px] tabular-nums text-ink-muted">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
        className="h-1.5 w-full appearance-none rounded-full bg-edge-soft accent-ink"
      />
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: T; label: string; icon?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <Label>{label}</Label>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => {
          const sel = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition-colors ${
                sel
                  ? "border-ink bg-elevated text-ink"
                  : "border-edge-soft bg-canvas/40 text-ink-muted active:border-edge active:text-ink"
              }`}
            >
              {o.icon}
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ColorRow({
  label,
  presets,
  value,
  onChange,
}: {
  label: string;
  presets: string[];
  value: string;
  onChange: (hex: string) => void;
}) {
  const lower = value.toLowerCase();
  const isPreset = presets.some((p) => p.toLowerCase() === lower);
  return (
    <div className="flex flex-col gap-2.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap items-center gap-2.5">
        {presets.map((hex) => {
          const sel = hex.toLowerCase() === lower;
          return (
            <button
              key={hex}
              type="button"
              aria-label={hex}
              onClick={() => onChange(hex)}
              className={`h-8 w-8 rounded-full ring-1 ring-black/30 transition-transform ${
                sel ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-elevated" : "active:scale-105"
              }`}
              style={{ background: hex }}
            />
          );
        })}
        <ColorPopoverTrigger
          value={value}
          onChange={onChange}
          label={isPreset ? "Custom" : value.toUpperCase()}
          highlighted={!isPreset}
          direction="up"
          portal
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="flex items-center justify-between"
    >
      <span className="text-[15px] font-medium text-ink">{label}</span>
      <span
        className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
          value ? "bg-accent" : "bg-edge-soft"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            value ? "translate-x-[1.125rem]" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function StylePreview() {
  const { settings } = useSettings();
  const size = Math.max(16, Math.min(120, settings.subFontSize));
  const previewSize = Math.max(11, Math.round(size * 0.3));

  let textShadow: string | undefined;
  if (settings.subStyle === "outline") {
    const sz = Math.max(1, settings.subBorderSize) || 2;
    const c = settings.subBorderColor || "#000000";
    const offsets: Array<[number, number]> = [];
    for (let dx = -sz; dx <= sz; dx++) {
      for (let dy = -sz; dy <= sz; dy++) {
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > sz + 0.1 || r < 0.1) continue;
        offsets.push([dx, dy]);
      }
    }
    textShadow = offsets.map(([dx, dy]) => `${dx * 0.4}px ${dy * 0.4}px 0 ${c}`).join(", ");
  } else if (settings.subStyle === "shadow") {
    textShadow = "0 1px 2px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.85)";
  }

  const boxRgb = hexToRgb(settings.subBoxColor || "#000000");
  const boxStyle: React.CSSProperties | undefined =
    settings.subStyle === "box"
      ? {
          backgroundColor: `rgba(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b}, ${settings.subBoxOpacity})`,
          padding: `${Math.round(previewSize * 0.18)}px ${Math.round(previewSize * 0.5)}px`,
          borderRadius: `${Math.round(previewSize * 0.25)}px`,
        }
      : undefined;

  const align = settings.subAlignX || "center";
  const justify = align === "left" ? "justify-start" : align === "right" ? "justify-end" : "justify-center";

  const t = useT();
  return (
    // Fixed dark gradient stands in for a video frame so subtitle contrast reads
    // truthfully regardless of theme; intentionally not theme tokens.
    <div className="relative h-24 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1b2432] to-[#0a0e15]">
      <div
        className={`absolute inset-x-0 flex ${justify} px-[6%]`}
        style={{ bottom: `${Math.min(70, settings.subMarginY)}%`, opacity: settings.subOpacity ?? 1 }}
      >
        <div style={boxStyle}>
          <div
            style={{
              color: settings.subFontColor,
              fontWeight: settings.subBold ? 700 : 400,
              fontSize: `${previewSize}px`,
              lineHeight: 1.2,
              textShadow,
              textAlign: align,
            }}
          >
            {t("The quick brown fox")}
          </div>
        </div>
      </div>
    </div>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace(/^#/, "");
  if (m.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m.slice(0, 2), 16) || 0,
    g: parseInt(m.slice(2, 4), 16) || 0,
    b: parseInt(m.slice(4, 6), 16) || 0,
  };
}
