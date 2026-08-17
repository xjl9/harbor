import { ArrowRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { TASTE_MAX } from "@/components/onboarding/taste-step";
import type { Meta } from "@/lib/cinemeta";
import { setVote } from "@/lib/feed/preferences";
import { useT } from "@/lib/i18n";
import { useOnboarding } from "@/lib/onboarding";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { useKeyboardInset } from "../use-keyboard-inset";
import { ObAddons } from "./ob-addons";
import { ObDone } from "./ob-done";
import { ObLanguage } from "./ob-language";
import { ObLayout } from "./ob-layout";
import { ObSplash } from "./ob-splash";
import { ObDebrid } from "./ob-debrid";
import { ObStreaming } from "./ob-streaming";
import { ObStremio } from "./ob-stremio";
import { ObSubtitles } from "./ob-subtitles";
import { ObTaste } from "./ob-taste";
import { ObTmdb } from "./ob-tmdb";
import { ObWelcome } from "./ob-welcome";

// Step machine mirrors src/components/onboarding.tsx (same next/skip/back/finish/
// toggleTaste, mobile chrome). The mobile-only "debrid" step slots after streaming
// so first-party debrid keys are set during setup, not just in profile settings.
// "addons" sits right before it: a debrid key is worth little without a stream
// source, and nothing is installed by default, so setup used to certify a state
// where nothing could play.
type StepId =
  | "splash"
  | "language"
  | "welcome"
  | "layout"
  | "tmdb"
  | "stremio"
  | "streaming"
  | "addons"
  | "debrid"
  | "subtitles"
  | "taste"
  | "done";
const STEPS: StepId[] = [
  "splash",
  "language",
  "welcome",
  "layout",
  "tmdb",
  "stremio",
  "streaming",
  "addons",
  "debrid",
  "subtitles",
  "taste",
  "done",
];

const TOP_INSET = "max(calc(env(safe-area-inset-top, 0px) + 12px), 52px)";

export function MobileOnboarding() {
  const { onboarded, finishOnboarding } = useOnboarding();
  const t = useT();
  const [stepIdx, setStepIdx] = useState(0);
  const [closing, setClosing] = useState(false);
  const [tastePicks, setTastePicks] = useState<Meta[]>([]);
  const keyboardInset = useKeyboardInset();
  // Freeze shell gestures while onboarding is up (noop-safe outside provider).
  useRegisterSheet(!onboarded);

  useEffect(() => {
    if (!onboarded) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [onboarded]);

  if (onboarded) return null;

  const step = STEPS[stepIdx];
  const isSplash = step === "splash";
  const isTaste = step === "taste";
  const isLast = stepIdx === STEPS.length - 1;
  const toggleTaste = (m: Meta) =>
    setTastePicks((prev) =>
      prev.some((p) => p.id === m.id)
        ? prev.filter((p) => p.id !== m.id)
        : prev.length >= TASTE_MAX
          ? prev
          : [...prev, m],
    );
  const next = () => {
    if (isTaste) for (const m of tastePicks) setVote(m.id, "up", { name: m.name, type: m.type });
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const skip = () => setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  const back = () => setStepIdx((i) => Math.max(i - 1, 0));
  const finish = () => {
    setClosing(true);
    setTimeout(finishOnboarding, 320);
  };

  const skippable =
    step === "tmdb" ||
    step === "stremio" ||
    step === "streaming" ||
    step === "addons" ||
    step === "debrid" ||
    step === "subtitles" ||
    step === "taste";
  const showBack = stepIdx > 1 && stepIdx < STEPS.length - 1;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col bg-canvas [@media(max-height:500px)]:!pt-3 ${
        closing ? "opacity-0 transition-opacity duration-300" : "animate-fade-in"
      }`}
      style={{
        paddingTop: TOP_INSET,
        // A fixed overlay never sees the shell's gutter, and landscape has no top
        // inset to spend, so the 52pt floor is dead space there.
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {/* Ambient amber wash, same whisper as mobile-settings (~14%). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background:
            "radial-gradient(120% 68% at 50% -14%, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent 70%)",
        }}
      />

      {!isSplash && (
        <button
          onClick={finish}
          aria-label={t("Skip setup")}
          className="absolute end-5 z-10 flex h-11 w-11 items-center justify-center rounded-full text-ink-subtle transition-colors active:bg-raised active:text-ink"
          style={{ top: TOP_INSET }}
        >
          <X size={18} />
        </button>
      )}

      {isSplash ? (
        <ObSplash onAdvance={next} />
      ) : (
        <>
          <div
            className="flex-1 overflow-y-auto px-5 pt-2"
            style={{ paddingBottom: keyboardInset > 0 ? keyboardInset : 16 }}
          >
            <div key={step} className="animate-step-in flex min-h-full flex-col">
              {step === "language" && <ObLanguage />}
              {step === "welcome" && <ObWelcome />}
              {step === "layout" && <ObLayout />}
              {step === "tmdb" && <ObTmdb />}
              {step === "stremio" && <ObStremio />}
              {step === "streaming" && <ObStreaming />}
              {step === "addons" && <ObAddons />}
              {step === "debrid" && <ObDebrid onAdvance={next} />}
              {step === "subtitles" && <ObSubtitles />}
              {step === "taste" && <ObTaste selected={tastePicks} onToggle={toggleTaste} />}
              {step === "done" && <ObDone />}
            </div>
          </div>

          {/* Footer hides while the keyboard is up; in-step submit buttons take over. */}
          {keyboardInset === 0 && (
            <div
              className="shrink-0 px-5 pt-2 [@media(max-height:500px)]:pt-0"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
            >
              <div className="flex justify-center">
                <ObDots
                  count={STEPS.length - 1}
                  active={Math.max(stepIdx - 1, 0)}
                  onJump={(i) => setStepIdx(i + 1)}
                />
              </div>
              <button
                onClick={isLast ? finish : next}
                className="mt-2 flex h-[52px] [@media(max-height:500px)]:h-11 [@media(max-height:500px)]:mt-1 w-full items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-semibold text-canvas"
              >
                {isLast ? t("Enter Harbor") : step === "welcome" ? t("Get Started") : t("Continue")}
                <ArrowRight size={16} strokeWidth={2.4} className="dir-icon" />
              </button>
              {(showBack || skippable) && (
                <div className="mt-1 flex items-center justify-between">
                  {showBack ? (
                    <button
                      onClick={back}
                      className="flex h-11 items-center rounded-full px-4 text-[14px] font-medium text-ink-muted transition-colors active:text-ink"
                    >
                      {t("Back")}
                    </button>
                  ) : (
                    <span />
                  )}
                  {skippable && (
                    <button
                      key={`skip-${step}`}
                      onClick={skip}
                      className="animate-skip-in flex h-11 items-center rounded-full px-4 text-[13px] font-medium text-ink-subtle transition-colors active:text-ink"
                    >
                      {t("Skip for now")}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Duplicated visuals from src/components/onboarding/dots.tsx; each 6px dot is
// wrapped in a 44px-tall hit area (width is capped at 24px so all eleven dots
// still fit a 294px content column; height carries the touch target).
function ObDots({
  count,
  active,
  onJump,
}: {
  count: number;
  active: number;
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onJump(i)}
          aria-label={`Step ${i + 1}`}
          className="flex min-h-11 min-w-6 items-center justify-center"
        >
          <span
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? "w-9 bg-ink" : "w-1.5 bg-ink-subtle/40"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
