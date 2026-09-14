import { ArrowRight, Check, Clock, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { confirmDialog } from "@/lib/dialog";
import { useT } from "@/lib/i18n";
import type { IptvPlaylistSource } from "@/lib/iptv/types";
import {
  EMPTY_PLAYLIST_FORM,
  type PlaylistFormValue,
} from "@/lib/iptv/playlist-entry";
import { PlaylistForm } from "@/views/live/source-picker/playlist-form";
import { BottomSheet, IconButton } from "./page-shell";

// Shared between Live TV and Playlists: the first-run connect surface, the
// add/edit form sheet, and the source picker sheet. The desktop versions are a
// 60px display heading over a two-column feature grid and a hover dropdown;
// this is the same content laid out for one thumb.

export function ConnectIntro({
  kicker,
  onSave,
}: {
  kicker: string;
  onSave: (entry: PlaylistFormValue) => void;
}) {
  const t = useT();
  const [formOpen, setFormOpen] = useState(false);
  return (
    <div className="flex flex-col gap-8 pt-6">
      <header className="flex flex-col gap-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.42em] text-ink-subtle">{kicker}</span>
        <h2 className="font-display text-[36px] font-medium leading-[1.05] tracking-tight text-ink">
          {t("Connect a playlist to get started.")}
        </h2>
        <p className="text-[15px] leading-relaxed text-ink-muted">
          {t("Connect any IPTV provider. Channels are sorted by category and the guide is pulled automatically when your provider supplies it.")}
        </p>
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex h-12 items-center gap-2.5 rounded-full bg-ink ps-6 pe-5 text-[14.5px] font-semibold text-canvas active:scale-[0.97]"
          >
            {t("Connect a provider")}
            <ArrowRight size={16} strokeWidth={2.4} className="dir-icon" />
          </button>
        </div>
      </header>
      <div className="flex flex-col gap-6 border-t border-edge-soft/40 pt-7">
        <Feature
          icon={<Clock size={17} strokeWidth={1.9} />}
          title={t("Live EPG")}
          body={t("Now-playing and a seven-day guide when your provider supplies it.")}
        />
        <Feature
          icon={<ShieldCheck size={17} strokeWidth={1.9} />}
          title={t("Local only")}
          body={t("Credentials stored on this device. Nothing leaves your machine.")}
        />
      </div>
      {formOpen && (
        <PlaylistFormSheet
          title={t("Connect your provider.")}
          initial={EMPTY_PLAYLIST_FORM}
          submitLabel={t("Save and continue")}
          onClose={() => setFormOpen(false)}
          onSubmit={(v) => {
            setFormOpen(false);
            onSave(v);
          }}
        />
      )}
    </div>
  );
}

function Feature({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-elevated text-ink-muted">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="text-[14.5px] font-semibold text-ink">{title}</h3>
        <p className="text-[13px] leading-relaxed text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

export function PlaylistFormSheet({
  title,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: PlaylistFormValue;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (v: PlaylistFormValue) => void;
}) {
  const t = useT();
  return (
    <BottomSheet title={title} subtitle={t("Pick how you authenticate. Everything is stored locally.")} onClose={onClose} tall>
      <PlaylistForm initial={initial} submitLabel={submitLabel} onCancel={onClose} onSubmit={onSubmit} />
    </BottomSheet>
  );
}

function formFromSource(s: IptvPlaylistSource): PlaylistFormValue {
  return {
    name: s.name,
    kind: s.kind ?? "m3u",
    url: s.url,
    epgUrl: s.epgUrl ?? "",
    xtream: s.xtream ?? EMPTY_PLAYLIST_FORM.xtream,
  };
}

export function SourceButton({
  source,
  count,
  onClick,
}: {
  source: IptvPlaylistSource | null;
  count: number | null;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 max-w-[46vw] items-center gap-2 rounded-full bg-elevated ps-3 pe-3.5 text-[13px] font-semibold text-ink ring-1 ring-edge-soft/70"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-danger" />
      <span className="truncate">{source?.name ?? t("No playlist")}</span>
      {count != null && (
        <span className="shrink-0 rounded-full bg-canvas/70 px-1.5 text-[10.5px] tabular-nums text-ink-muted">
          {count.toLocaleString()}
        </span>
      )}
    </button>
  );
}

export function SourceSheet({
  sources,
  activeId,
  fetchedAt,
  loading,
  onClose,
  onSelect,
  onAdd,
  onEdit,
  onRemove,
  onRefresh,
}: {
  sources: IptvPlaylistSource[];
  activeId: string | null;
  fetchedAt: number | null;
  loading: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onAdd: (v: PlaylistFormValue) => void;
  onEdit: (id: string, v: PlaylistFormValue) => void;
  onRemove: (id: string) => void;
  onRefresh: () => void;
}) {
  const t = useT();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IptvPlaylistSource | null>(null);
  const ago = fetchedAt ? formatAgo(Date.now() - fetchedAt, t) : null;

  const kindLabel = (s: IptvPlaylistSource) =>
    s.kind === "xtream" ? t("Xtream") : s.kind === "epg" ? t("EPG") : t("M3U URL");

  return (
    <>
      <BottomSheet
        title={t("Playlists")}
        subtitle={ago ? t("Updated {ago}", { ago }) : undefined}
        onClose={onClose}
        actions={
          <IconButton label={t("Refresh")} onClick={onRefresh} disabled={loading}>
            <RefreshCw size={18} strokeWidth={2} className={loading ? "animate-spin" : ""} />
          </IconButton>
        }
      >
        <div className="flex flex-col gap-1">
          {sources.map((s) => {
            const active = s.id === activeId;
            return (
              <div key={s.id} className="flex items-center gap-1 rounded-2xl px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(s.id);
                    onClose();
                  }}
                  className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-start active:bg-canvas/40"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      active ? "bg-accent text-canvas" : "bg-canvas/60 text-transparent ring-1 ring-edge-soft"
                    }`}
                  >
                    <Check size={14} strokeWidth={3} />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-medium text-ink">{s.name}</span>
                    <span className="truncate text-[12px] text-ink-subtle">{kindLabel(s)}</span>
                  </span>
                </button>
                <IconButton label={t("Edit")} onClick={() => setEditing(s)}>
                  <Pencil size={16} strokeWidth={2} />
                </IconButton>
                <IconButton
                  label={t("Delete")}
                  onClick={() => {
                    void confirmDialog(t("Remove {name}?", { name: s.name })).then((ok) => {
                      if (ok) onRemove(s.id);
                    });
                  }}
                >
                  <Trash2 size={16} strokeWidth={2} />
                </IconButton>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-edge-soft text-[14px] font-semibold text-ink-muted"
          >
            <Plus size={16} strokeWidth={2.4} />
            {t("Add playlist")}
          </button>
        </div>
      </BottomSheet>
      {adding && (
        <PlaylistFormSheet
          title={t("Add playlist")}
          initial={EMPTY_PLAYLIST_FORM}
          submitLabel={t("Add")}
          onClose={() => setAdding(false)}
          onSubmit={(v) => {
            setAdding(false);
            onAdd(v);
            onClose();
          }}
        />
      )}
      {editing && (
        <PlaylistFormSheet
          title={t("Edit playlist")}
          initial={formFromSource(editing)}
          submitLabel={t("Save")}
          onClose={() => setEditing(null)}
          onSubmit={(v) => {
            onEdit(editing.id, v);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function formatAgo(ms: number, t: ReturnType<typeof useT>): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return t("just now");
  if (m < 60) return t("{n}m ago", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("{n}h ago", { n: h });
  return t("{n}d ago", { n: Math.floor(h / 24) });
}
