import { ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { Diagnostics } from "@/lib/bug-report";

/**
 * Collapsed disclosure of everything the report carries besides the answers.
 * Field names match the payload one for one so nothing rides along unnamed.
 */
export function WhatGetsSent({ diag }: { diag: Diagnostics | null }) {
  const [open, setOpen] = useState(false);
  if (!diag) {
    return (
      <div className="rounded-2xl border border-edge-soft/70 bg-elevated/40 px-4 py-3.5 text-[12.5px] text-ink-subtle">
        Reading device details
      </div>
    );
  }
  const compact = `Harbor ${diag.appVersion} · ${diag.os}${diag.osVersion ? ` ${diag.osVersion}` : ""} · ${diag.viewport}`;
  return (
    <div className="overflow-hidden rounded-2xl border border-edge-soft/70 bg-elevated/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors active:bg-raised/60"
      >
        <ShieldCheck size={18} strokeWidth={2} className="shrink-0 text-ink-muted" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-medium text-ink">What gets sent</span>
          <span className="truncate text-[12px] text-ink-subtle">{compact}</span>
        </span>
        {open ? (
          <ChevronUp size={18} strokeWidth={2.2} className="text-ink-subtle" />
        ) : (
          <ChevronDown size={18} strokeWidth={2.2} className="text-ink-subtle" />
        )}
      </button>
      {open && (
        <div className="border-t border-edge-soft/60 px-4 py-3.5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11.5px]">
            <Pair k="App version" v={diag.appVersion} />
            <Pair k="OS" v={`${diag.os} ${diag.osVersion}`.trim()} />
            <Pair k="Browser engine" v={diag.ua} />
            <Pair k="Viewport" v={diag.viewport} />
            <Pair k="Locale" v={diag.locale} />
            <Pair k="Player" v={diag.flags.playerEngine} />
            <Pair k="Region" v={diag.flags.region} />
            <Pair k="TMDB key set" v={diag.flags.hasTmdb ? "yes" : "no"} />
            <Pair k="RPDB key set" v={diag.flags.hasRpdb ? "yes" : "no"} />
            <Pair k="Trakt linked" v={diag.flags.hasTrakt ? "yes" : "no"} />
            <Pair k="Stremio" v={diag.flags.hasStremio ? "signed in" : "guest"} />
            <Pair k="Debrid keys" v={String(diag.flags.debridCount)} />
            <Pair k="Addons" v={String(diag.flags.addonCount)} />
            <Pair k="IPTV lists" v={String(diag.flags.iptvCount)} />
            <Pair k="Recent errors" v={String(diag.recentErrors.length)} />
          </div>
          <p className="mt-3 text-[12px] leading-snug text-ink-subtle">
            Counts and yes or no only, never the keys themselves. Links, file
            names, paths, emails and anything token shaped are stripped from
            your answers and from the error log before sending.
          </p>
        </div>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-ink-subtle">{k}</span>
      <span className="truncate text-ink">{v || "n/a"}</span>
    </>
  );
}
