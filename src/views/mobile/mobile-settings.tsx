import { ChevronLeft, ChevronRight, Search, X } from "@/views/settings/icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_VERSION } from "@/lib/build-info";
import { useT } from "@/lib/i18n";
import { useNavSearch } from "@/views/settings/nav";
import { PreviewImage } from "@/views/settings/preview-image";
import { matchesSettingsSearch } from "@/views/settings/search-match";
import { SECTION_ICONS } from "@/views/settings/section-icons";
import { SetIcon } from "@/views/settings/set-icon";
import { settingsAnchor, type SectionId } from "@/views/settings/shared";
import { MOBILE_SAFE_X } from "./chrome-metrics";
import { useRegisterSheet } from "./mobile-sheet-lock";
import { AccountPage } from "./settings/account-page";
import { AdvancedPage } from "./settings/advanced-page";
import { AppearancePage } from "./settings/appearance-page";
import { FOCUS } from "./settings/kit";
import { LanguagesPage } from "./settings/languages-page";
import { LibraryPage } from "./settings/library-page";
import { PlaybackPage } from "./settings/playback-page";
import {
  DEPARTMENTS,
  DEPT_BY_ID,
  destinationFor,
  optionDestination,
  stillAccount,
  stillAdvanced,
  stillAppearance,
  stillLanguages,
  stillLibrary,
  stillPlayback,
  stillSources,
  type DeptId,
  type Destination,
} from "./settings/registry";
import { SourcesPage } from "./settings/sources-page";

// The phone Settings landing. It mirrors desktop's settings shell: one search
// field over the same keyword index desktop uses (views/settings/nav.tsx), then
// one card per department in desktop's sidebar order. Each department is its
// own page under ./settings, built from the desktop panels' labels and copy so
// a setting reads the same on both.

const STILLS: Record<DeptId, string> = {
  account: stillAccount,
  playback: stillPlayback,
  languages: stillLanguages,
  sources: stillSources,
  library: stillLibrary,
  appearance: stillAppearance,
  advanced: stillAdvanced,
};

type Open = Destination & { anchor?: string; nonce: number };

type Result = {
  key: string;
  label: string;
  icon: string;
  trail: string;
  dest: Destination;
  anchor?: string;
};

const MAX_RESULTS = 60;

export function MobileSettings({ onClose }: { onClose: () => void }) {
  useRegisterSheet(true);
  const t = useT();
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open | null>(null);

  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(onClose, 300);
    return () => window.clearTimeout(id);
  }, [closing, onClose]);

  const trimmed = query.trim().toLowerCase();
  const { matches, optionMatches } = useNavSearch(trimmed);

  const results = useMemo<Result[]>(() => {
    if (!trimmed) return [];
    const out: Result[] = [];
    const seen = new Set<string>();
    const push = (r: Result) => {
      if (seen.has(r.key)) return;
      seen.add(r.key);
      out.push(r);
    };
    for (const d of DEPARTMENTS) {
      if (matchesSettingsSearch(trimmed, [d.label, d.sub], t)) {
        push({ key: `dept:${d.id}`, label: t(d.label), icon: d.icon, trail: t("Settings"), dest: { dept: d.id } });
      }
    }
    for (const m of matches ?? []) {
      const dest = destinationFor(m.id);
      if (!dest) continue;
      push({
        key: `section:${m.id}`,
        label: t(m.label),
        icon: SECTION_ICONS[m.id],
        trail: t(DEPT_BY_ID[dest.dept].label),
        dest,
      });
    }
    for (const o of optionMatches ?? []) {
      const dest = optionDestination(o.section, o.tab);
      if (!dest) continue;
      push({
        key: `option:${o.section}:${o.tab ?? ""}:${o.label}`,
        label: t(o.label),
        icon: SECTION_ICONS[o.section],
        trail: t(DEPT_BY_ID[dest.dept].label),
        dest,
        anchor: settingsAnchor(o.anchorTitle ?? o.label),
      });
    }
    return out.slice(0, MAX_RESULTS);
  }, [trimmed, matches, optionMatches, t]);

  const go = useCallback((dest: Destination, anchor?: string) => {
    setOpen({ ...dest, anchor, nonce: Date.now() });
  }, []);

  // Desktop panels rendered on the phone call setActive/openPage to cross-link
  // (for example "Add your TMDB key under Library & metadata"). Those land on
  // the phone page that holds the target, or nowhere when it is desktop-only.
  const jump = useCallback(
    (section: SectionId, tab?: string) => {
      const dest = destinationFor(section, tab);
      if (dest) go(dest);
    },
    [go],
  );
  const back = useCallback(() => setOpen(null), []);

  const pageProps = open
    ? { key: open.nonce, onBack: back, anchor: open.anchor ?? null }
    : null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      {/* Ambient amber wash. Settings has no identity colour, so it whispers (~14%). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />

      {/* A settings row only reads as one thing while its two ends stay near
          each other, so the column is capped and centred on a tablet; a phone
          never reaches the cap. The header shares it so the title lines up. */}
      <header
        className="mx-auto flex w-full max-w-[680px] flex-col gap-3 px-5 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <div className="flex items-center gap-3">
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
              {t("Preferences")}
            </p>
            <h1 className="font-display text-[30px] font-medium leading-none tracking-[-0.02em] text-ink">
              {t("Settings")}
            </h1>
          </div>
        </div>
        <div className="relative">
          <Search
            size={17}
            strokeWidth={2.2}
            aria-hidden
            className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search settings")}
            aria-label={t("Search settings")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                (e.target as HTMLInputElement).blur();
                go(results[0].dest, results[0].anchor);
              }
            }}
            className={`h-12 w-full rounded-xl border border-edge-soft bg-elevated/60 pe-12 ps-10 text-[16px] text-ink placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden ${FOCUS}`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("Clear")}
              className={`absolute end-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-ink-subtle ${FOCUS}`}
            >
              <X size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </header>

      <div
        className="mx-auto w-full max-w-[680px] flex-1 overflow-y-auto overscroll-contain px-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 40px)" }}
      >
        {trimmed ? (
          results.length > 0 ? (
            <div className="mt-1 overflow-hidden rounded-2xl border border-edge-soft bg-elevated/40 [&>*+*]:border-t [&>*+*]:border-edge-soft/60">
              {results.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => go(r.dest, r.anchor)}
                  className={`flex w-full items-start gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-raised/60 ${FOCUS}`}
                >
                  <span className="mt-[2px] shrink-0 text-ink-muted">
                    <SetIcon name={r.icon} size={20} strokeWidth={1.9} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15.5px] font-medium leading-snug text-ink">{r.label}</span>
                    <span className="text-[12.5px] text-ink-subtle">{r.trail}</span>
                  </span>
                  <ChevronRight size={18} strokeWidth={2.2} className="mt-[3px] shrink-0 text-ink-subtle rtl:-scale-x-100" />
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-12 text-center text-[14px] text-ink-subtle">{t("No matches")}</p>
          )
        ) : (
          <nav aria-label={t("Settings")} className="mt-1 flex flex-col gap-2.5">
            {DEPARTMENTS.map((d, i) => (
              <button
                key={d.id}
                type="button"
                onClick={() => go({ dept: d.id })}
                className={`harbor-rise flex w-full items-center gap-3.5 rounded-2xl border border-edge-soft bg-elevated/40 p-2.5 pe-3.5 text-start transition-colors active:bg-raised/50 ${FOCUS}`}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl bg-raised">
                  <PreviewImage src={STILLS[d.id]} className="h-full w-full select-none object-cover" />
                  <span
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to top, rgba(0,0,0,0.72), rgba(0,0,0,0.28))" }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-white">
                    <SetIcon name={d.icon} size={24} strokeWidth={1.9} />
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[16px] font-medium leading-snug text-ink">{t(d.label)}</span>
                  <span className="text-[12.5px] leading-snug text-ink-subtle">{t(d.sub)}</span>
                </span>
                <ChevronRight size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle rtl:-scale-x-100" />
              </button>
            ))}
            <p className="mt-6 text-center font-mono text-[11.5px] tabular-nums tracking-[0.05em] text-ink-subtle/60">
              Harbor {APP_VERSION}
            </p>
          </nav>
        )}
      </div>

      {open && pageProps && open.dept === "account" && (
        <AccountPage {...pageProps} onOpenProfile={() => setClosing(true)} />
      )}
      {open && pageProps && open.dept === "playback" && (
        <PlaybackPage {...pageProps} onJump={jump} initialSub={open.sub} />
      )}
      {open && pageProps && open.dept === "languages" && <LanguagesPage {...pageProps} />}
      {open && pageProps && open.dept === "sources" && (
        <SourcesPage {...pageProps} onJump={jump} initialSub={open.sub} />
      )}
      {open && pageProps && open.dept === "library" && (
        <LibraryPage {...pageProps} onJump={jump} initialSub={open.sub} />
      )}
      {open && pageProps && open.dept === "appearance" && <AppearancePage {...pageProps} />}
      {open && pageProps && open.dept === "advanced" && (
        <AdvancedPage {...pageProps} onJump={jump} initialSub={open.sub} />
      )}
    </div>
  );
}
