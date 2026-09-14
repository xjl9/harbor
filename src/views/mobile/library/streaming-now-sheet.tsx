import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
  torrentEnginePause,
  torrentEngineRemove,
  torrentEngineResume,
  type TorrentListItem,
} from "@/lib/torrent/local-engine";
import { fmtBytes, fmtSpeed } from "@/views/downloads/downloads-format";
import { SetIcon } from "@/views/settings/set-icon";
import { PhoneSheet } from "./sheet";

// "Streaming now" for the phone: the sources the local torrent engine is
// caching for streams in progress, with the desktop row's pause, resume and
// armed delete-all controls at 44pt.

export function StreamingNowSheet({
  open,
  onClose,
  items,
  onRun,
}: {
  open: boolean;
  onClose: () => void;
  items: TorrentListItem[];
  onRun: (p: Promise<void>) => void;
}) {
  const t = useT();
  return (
    <PhoneSheet
      open={open}
      onClose={onClose}
      tall
      title={t("Streaming now")}
      description={t("Sources cached in the background for the streams you are watching")}
    >
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-[13px] text-ink-muted">
          {t("Nothing is streaming right now.")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 pt-1">
          {items.map((it) => (
            <TorrentRow key={it.infoHash} item={it} onRun={onRun} />
          ))}
        </ul>
      )}
    </PhoneSheet>
  );
}

function TorrentRow({
  item,
  onRun,
}: {
  item: TorrentListItem;
  onRun: (p: Promise<void>) => void;
}) {
  const t = useT();
  const pct = item.total > 0 ? Math.min(100, Math.round((item.downloaded / item.total) * 100)) : 0;
  const done = item.finished || pct >= 100;
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  return (
    <li className="flex items-center gap-3 rounded-2xl border border-edge-soft/70 bg-elevated/40 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="truncate text-[14px] font-medium text-ink">{item.name}</span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className={`h-full rounded-full transition-[width] duration-500 ease-out ${done ? "bg-success" : "bg-accent"}`}
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-ink-muted">
          <span>{pct}%</span>
          {item.total > 0 && (
            <span className="text-ink-subtle">
              {fmtBytes(item.downloaded)} / {fmtBytes(item.total)}
            </span>
          )}
          {done ? (
            <span className="text-ink-subtle">· {t("Downloaded")}</span>
          ) : item.paused ? (
            <span>· {t("Paused")}</span>
          ) : (
            item.downloadSpeed > 0 && <span>· {fmtSpeed(item.downloadSpeed)}</span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {!done &&
          (item.paused ? (
            <IconBtn label={t("Resume")} onClick={() => onRun(torrentEngineResume(item.infoHash))}>
              <SetIcon name="Play" size={17} strokeWidth={2.2} />
            </IconBtn>
          ) : (
            <IconBtn label={t("Pause")} onClick={() => onRun(torrentEnginePause(item.infoHash))}>
              <SetIcon name="Pause" size={17} strokeWidth={2.2} />
            </IconBtn>
          ))}
        {armed ? (
          <button
            type="button"
            onClick={() => {
              window.clearTimeout(armTimer.current);
              setArmed(false);
              onRun(torrentEngineRemove(item.infoHash, true));
            }}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-danger/15 px-3 text-[12px] font-semibold text-danger active:scale-95"
          >
            <SetIcon name="Trash2" size={15} strokeWidth={2.2} />
            {t("Delete all")}
          </button>
        ) : (
          <IconBtn
            label={t("Remove cached source (all episodes)")}
            onClick={() => {
              setArmed(true);
              armTimer.current = window.setTimeout(() => setArmed(false), 3200);
            }}
          >
            <SetIcon name="Trash2" size={17} strokeWidth={2} />
          </IconBtn>
        )}
      </div>
    </li>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-subtle transition-[color,background-color,transform] active:scale-[0.92] active:bg-ink/10 active:text-ink motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}
