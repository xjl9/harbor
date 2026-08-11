import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { LogoOrText } from "./logo-or-text";
import { isPhoneShell } from "./picker-utils";

export function CinematicLoader({
  meta,
  quorum,
}: {
  meta: Meta;
  quorum?: { settled: number; total: number };
}) {
  const t = useT();
  const phone = isPhoneShell();
  const waitingOn = quorum ? quorum.total - quorum.settled : 0;
  return (
    <div className={phone ? "flex flex-col items-center gap-8 py-10" : "flex flex-col items-center gap-8 py-24"}>
      <LogoOrText
        logo={meta.logo ?? null}
        fallbackText={meta.name}
        imgClass="max-h-40 w-auto max-w-[70%] animate-loader-pulse object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
        textClass={
          phone
            ? "animate-loader-pulse font-display text-[clamp(30px,9vw,44px)] font-medium leading-[0.96] tracking-tight text-ink drop-shadow-[0_18px_45px_rgba(0,0,0,0.55)]"
            : "animate-loader-pulse font-display text-[72px] font-medium leading-[0.96] tracking-tight text-ink drop-shadow-[0_18px_45px_rgba(0,0,0,0.55)]"
        }
      />
      <p className="text-[11px] font-semibold uppercase tracking-[0.42em] text-ink-subtle">
        Searching streams
      </p>
      {phone && quorum && quorum.total > 0 && waitingOn > 0 && (
        <p className="-mt-4 font-mono text-[12px] text-ink-subtle">
          {t("Waiting on {n} of {total} addons", { n: waitingOn, total: quorum.total })}
        </p>
      )}
    </div>
  );
}
