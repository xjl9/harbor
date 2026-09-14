import { Activity, ChevronRight, Clock, Repeat, X } from "lucide-react";
import type { ReactNode } from "react";
import { UiIcon } from "@/components/ui-icon";
import { useT } from "@/lib/i18n";
import { haptics } from "@/lib/player/haptics";
import { useSettings } from "@/lib/settings";
import type { DownloadStatus } from "@/views/player/hooks/use-video-download";
import { fmtTime } from "./mobile-chrome";
import { MobileGlyph } from "./mobile-glyph";
import { MOBILE_GLYPH } from "./mobile-icons";
import { MobileSheet, MobileSheetEyebrow } from "./mobile-sheet";

// Everything the desktop transport carries that has no room on a phone's two
// rows: stats, the clock, A-B loop, X-Ray, Watch Together, the in-player
// download and the home-server quality switch. One sheet so the picture keeps
// its frame; each row is a control, not a link to another menu.
export function MobileMoreSheet({
  open,
  onClose,
  statsOn,
  onToggleStats,
  download,
  onDownloadStart,
  onDownloadCancel,
  onDownloadReset,
  homeServerQualityControl,
  onXray,
  onTogether,
  loop,
  onLoopA,
  onLoopB,
  onLoopClear,
}: {
  open: boolean;
  onClose: () => void;
  statsOn: boolean;
  onToggleStats: () => void;
  download?: DownloadStatus;
  onDownloadStart?: () => void;
  onDownloadCancel?: () => void;
  onDownloadReset?: () => void;
  homeServerQualityControl?: ReactNode;
  /** Absent when X-Ray is off in settings. */
  onXray?: () => void;
  onTogether: () => void;
  loop: { a: number | null; b: number | null };
  onLoopA: () => void;
  onLoopB: () => void;
  onLoopClear: () => void;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const loopSet = loop.a != null;

  return (
    <MobileSheet open={open} onClose={onClose} title={t("More")} heightClass="max-h-[80vh]">
      <div className="flex flex-col pb-4">
        <MobileSheetEyebrow>{t("Playback")}</MobileSheetEyebrow>
        <div className="flex flex-col px-3">
          <SwitchRow
            icon={<Activity size={20} strokeWidth={1.9} />}
            label={t("Stats overlay")}
            on={statsOn}
            onChange={onToggleStats}
          />
          <SwitchRow
            icon={<Clock size={20} strokeWidth={1.9} />}
            label={t("Fullscreen clock")}
            on={settings.fullscreenClockEnabled}
            onChange={() => update({ fullscreenClockEnabled: !settings.fullscreenClockEnabled })}
          />
          <div className="flex min-h-[52px] items-center gap-3 rounded-2xl px-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-muted">
              <Repeat size={20} strokeWidth={1.9} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] text-ink">{t("A-B loop")}</span>
              {loopSet && (
                <span className="font-jakarta text-[12px] tabular-nums text-accent">
                  {fmtTime(loop.a ?? 0)} → {loop.b != null ? fmtTime(loop.b) : "…"}
                </span>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <LoopButton label={t("Set loop start")} text="A" active={loop.a != null} onClick={onLoopA} />
              <LoopButton
                label={t("Set loop end")}
                text="B"
                active={loop.b != null}
                disabled={loop.a == null}
                onClick={onLoopB}
              />
              {loopSet && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.light();
                    onLoopClear();
                  }}
                  aria-label={t("Clear loop")}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-ink-subtle active:bg-raised"
                >
                  <X size={17} strokeWidth={2.4} />
                </button>
              )}
            </span>
          </div>
        </div>

        {homeServerQualityControl && (
          <>
            <MobileSheetEyebrow>{t("Quality")}</MobileSheetEyebrow>
            <div className="flex min-h-[52px] items-center px-6 [&_button]:min-h-11">{homeServerQualityControl}</div>
          </>
        )}

        <MobileSheetEyebrow>{t("More")}</MobileSheetEyebrow>
        <div className="flex flex-col px-3">
          {onXray && (
            <NavRow
              icon={<UiIcon name="xray" className="h-5 w-5 text-accent" />}
              label={t("X-Ray")}
              onClick={() => {
                haptics.select();
                onClose();
                onXray();
              }}
            />
          )}
          <NavRow
            icon={<UiIcon name="watch-together" className="h-5 w-5" />}
            label={t("Watch together")}
            onClick={() => {
              haptics.select();
              onClose();
              onTogether();
            }}
          />
          {download && onDownloadStart && (
            <DownloadRow
              status={download}
              onStart={onDownloadStart}
              onCancel={onDownloadCancel}
              onReset={onDownloadReset}
            />
          )}
        </div>
      </div>
    </MobileSheet>
  );
}

function SwitchRow({
  icon,
  label,
  on,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => {
        haptics.light();
        onChange();
      }}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-start active:bg-raised/60"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-muted">{icon}</span>
      <span className={`min-w-0 flex-1 truncate text-[15px] ${on ? "text-ink" : "text-ink-muted"}`}>{label}</span>
      <span
        aria-hidden
        className={`relative flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 ${
          on ? "bg-accent" : "bg-raised"
        }`}
      >
        <span
          className={`absolute h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200 ${
            on ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-[2px] rtl:-translate-x-[2px]"
          }`}
        />
      </span>
    </button>
  );
}

function NavRow({
  icon,
  label,
  detail,
  onClick,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3 text-start active:bg-raised/60"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-ink">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] text-ink">{label}</span>
        {detail && <span className="truncate text-[12.5px] text-ink-subtle">{detail}</span>}
      </span>
      {trailing ?? <ChevronRight size={18} strokeWidth={2.2} className="dir-icon shrink-0 text-ink-subtle" />}
    </button>
  );
}

function LoopButton({
  label,
  text,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  text: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        haptics.select();
        onClick();
      }}
      className={`flex h-11 w-11 items-center justify-center rounded-full font-jakarta text-[14px] font-bold transition-colors disabled:opacity-35 ${
        active ? "bg-ink text-canvas" : "bg-raised text-ink"
      }`}
    >
      {text}
    </button>
  );
}

// The in-player download, the desktop DownloadButton's states as one row. The
// desktop "show in folder" has no phone equivalent (saved files live in
// Downloads), so a finished download simply reads as saved.
function DownloadRow({
  status,
  onStart,
  onCancel,
  onReset,
}: {
  status: DownloadStatus;
  onStart: () => void;
  onCancel?: () => void;
  onReset?: () => void;
}) {
  const t = useT();
  if (status.kind === "downloading") {
    const pct = Math.round(status.ratio * 100);
    return (
      <NavRow
        icon={<MobileGlyph url={MOBILE_GLYPH.downloadActive} size={22} />}
        label={status.totalBytes ? t("Downloading {pct}%", { pct }) : t("Download video")}
        onClick={() => onCancel?.()}
        trailing={
          <span className="flex h-11 shrink-0 items-center rounded-full bg-raised px-3.5 text-[13px] font-semibold text-ink">
            {t("Cancel download")}
          </span>
        }
      />
    );
  }
  if (status.kind === "preparing") {
    return (
      <NavRow
        icon={<MobileGlyph url={MOBILE_GLYPH.downloadActive} size={22} />}
        label={t("Preparing download")}
        onClick={() => {}}
        trailing={<span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-ink-muted border-t-transparent" />}
      />
    );
  }
  if (status.kind === "done") {
    return (
      <NavRow
        icon={<MobileGlyph url={MOBILE_GLYPH.downloadDone} size={22} />}
        label={t("Saved")}
        onClick={() => onReset?.()}
        trailing={<span />}
      />
    );
  }
  if (status.kind === "error") {
    return (
      <NavRow
        icon={<MobileGlyph url={MOBILE_GLYPH.downloadError} size={22} />}
        label={t("Download failed")}
        detail={status.message}
        onClick={() => onReset?.()}
        trailing={<span />}
      />
    );
  }
  return (
    <NavRow
      icon={<MobileGlyph url={MOBILE_GLYPH.downloadIdle} size={22} />}
      label={t("Download video")}
      onClick={() => {
        haptics.select();
        onStart();
      }}
    />
  );
}
