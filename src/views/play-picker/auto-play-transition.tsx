import { useEffect, useState } from "react";
import { HarborLoader } from "@/components/harbor-loader";
import type { Meta } from "@/lib/cinemeta";
import { consumeRecentStubEvent } from "@/lib/dead-streams";
import { useActiveKid } from "@/lib/profiles";
import { type PlayEpisode } from "@/lib/view";
import { LogoOrText } from "./logo-or-text";
import { isPhoneShell } from "./picker-utils";
import { useT } from "@/lib/i18n";

// Indeterminate settle shimmer: signals "committing now, the escape is live"
// without faking a countdown the auto-fire grace timing cannot honor.
const SETTLE_SWEEP_CSS = `
@keyframes harbor-settle-sweep {
  from { transform: translateX(-120%); }
  to { transform: translateX(420%); }
}
.harbor-settle-sweep {
  animation: harbor-settle-sweep 1.1s var(--ease-out) infinite;
}
`;

export function AutoPlayTransition({
  meta,
  episode,
  resolving,
  attemptIdx,
  onCancel,
  download = false,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  resolving: boolean;
  attemptIdx?: number;
  onCancel: () => void;
  download?: boolean;
}) {
  const kid = useActiveKid();
  const t = useT();
  const phone = isPhoneShell();
  const backdrop = episode?.still || meta.background || meta.poster;
  const [stubNotice, setStubNotice] = useState<string | null>(null);
  useEffect(() => {
    const ev = consumeRecentStubEvent(8000);
    if (!ev) return;
    setStubNotice(t("Last source wasn't actually cached on your debrid yet. Trying another."));
    const timer = window.setTimeout(() => setStubNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [t]);
  return (
    <main className={`fixed inset-0 z-[120] overflow-hidden ${kid ? "bg-[#0c4a6e]" : "bg-black"}`}>
      <div data-tauri-drag-region className={`absolute inset-x-0 top-0 z-20 h-16${phone ? " hidden" : ""}`} />
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover saturate-150 ${
            kid ? "opacity-20 blur-[36px]" : "opacity-40 blur-[28px]"
          }`}
        />
      )}
      <div
        className={`absolute inset-0 ${
          kid
            ? "bg-gradient-to-b from-[#3aa6c4]/85 via-[#1c789f]/88 to-[#0a3d5c]/94"
            : "bg-gradient-to-b from-black/65 via-black/55 to-black/85"
        }`}
      />
      {kid && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[8, 22, 38, 55, 70, 84, 93].map((left, i) => (
            <span
              key={i}
              className="curfew-bubble absolute bottom-0 rounded-full bg-white/25"
              style={{
                left: `${left}%`,
                width: 12 + (i % 3) * 6,
                height: 12 + (i % 3) * 6,
                animationDelay: `-${(1 + ((i * 1.7) % 6)).toFixed(1)}s`,
                animationDuration: `${6 + (i % 4)}s`,
              }}
            />
          ))}
          <div className="curfew-bob absolute bottom-[14%] left-[10%]">
            <img
              src="/kids/doodles/liloctored.png"
              alt=""
              draggable={false}
              className="h-24 w-auto opacity-85"
            />
          </div>
          <img
            src="/kids/doodles/lilpurpocto.png"
            alt=""
            draggable={false}
            className="absolute bottom-[12%] right-[12%] h-20 w-auto opacity-75"
          />
          <img
            src="/kids/doodles/lilorangestar2.png"
            alt=""
            draggable={false}
            className="absolute right-[18%] top-[18%] h-10 w-auto opacity-90"
          />
        </div>
      )}
      <div
        className={`relative flex h-full flex-col items-center justify-center gap-7 px-8 text-center${phone ? " landscape:gap-5" : ""}`}
        style={{
          paddingLeft: "max(2rem, env(safe-area-inset-left))",
          paddingRight: "max(2rem, env(safe-area-inset-right))",
        }}
      >
        {phone && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/55">
            {t("Now showing")}
          </p>
        )}
        <LogoOrText
          logo={meta.logo ?? null}
          fallbackText={meta.name}
          imgClass={`max-h-44 ${phone ? "landscape:max-h-[40vh] " : ""}w-auto max-w-[72%] animate-loader-pulse object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.65)]`}
          textClass={
            phone
              ? "animate-loader-pulse font-display text-[clamp(30px,9vw,44px)] font-medium leading-[0.96] tracking-tight text-white drop-shadow-[0_18px_45px_rgba(0,0,0,0.7)]"
              : "animate-loader-pulse font-display text-[64px] font-medium leading-[0.96] tracking-tight text-white drop-shadow-[0_18px_45px_rgba(0,0,0,0.7)]"
          }
        />
        {episode && (
          <p className="text-[12.5px] font-semibold uppercase tracking-[0.32em] text-white/70">
            S{episode.imdbSeason ?? episode.season} · E
            {String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}
            {episode.name ? ` · ${episode.name}` : ""}
          </p>
        )}
        <HarborLoader
          size="md"
          caption={
            download
              ? t("Preparing download")
              : attemptIdx && attemptIdx > 0
                ? t("Trying source {n}", { n: attemptIdx + 1 })
                : t("Connecting")
          }
        />
        {stubNotice && (
          <p className="max-w-md text-[13px] leading-relaxed text-amber-200/80">
            {stubNotice}
          </p>
        )}
      </div>
      {phone && (
        <>
          <style>{SETTLE_SWEEP_CSS}</style>
          <div
            aria-hidden
            className="absolute left-1/2 z-10 h-0.5 w-[min(320px,60%)] -translate-x-1/2 overflow-hidden rounded-full bg-white/15 motion-reduce:hidden"
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" }}
          >
            <span className="harbor-settle-sweep block h-full w-1/3 rounded-full bg-accent/70" />
          </div>
        </>
      )}
      <button
        onClick={onCancel}
        className={
          phone
            ? "absolute left-1/2 z-10 flex h-12 w-[min(320px,calc(100%-80px))] -translate-x-1/2 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 bg-black/45 px-6 text-[13.5px] font-medium text-white backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/60"
            : "absolute bottom-10 left-1/2 z-10 flex h-11 -translate-x-1/2 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-black/45 px-6 text-[13.5px] font-medium text-white/75 backdrop-blur-md transition-colors hover:border-white/30 hover:bg-black/60 hover:text-white"
        }
        style={phone ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" } : undefined}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path
            d="M3.5 3.5l7 7M10.5 3.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        {phone && !resolving ? t("Choose yourself") : t("Cancel")}
      </button>
    </main>
  );
}
