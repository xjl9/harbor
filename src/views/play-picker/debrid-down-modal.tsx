import type { Meta } from "@/lib/cinemeta";
import { isPhoneShell } from "./picker-utils";

export function DebridDownModal({
  meta,
  onTryAgain,
  onBack,
}: {
  meta: Meta;
  onTryAgain: () => void;
  onBack: () => void;
}) {
  const phone = isPhoneShell();
  const backdrop = meta.background || meta.poster;
  return (
    <main
      className={
        phone ? "fixed inset-0 z-[120] overflow-y-auto bg-black" : "fixed inset-0 z-[120] overflow-hidden bg-black"
      }
    >
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-30 blur-[28px] saturate-150"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/85" />
      <div
        className={
          phone
            ? "relative flex min-h-full flex-col items-center justify-center gap-7 px-5 py-12 text-center"
            : "relative flex h-full flex-col items-center justify-center gap-7 px-8 text-center"
        }
      >
        <span className="rounded-full bg-danger/20 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-danger ring-1 ring-danger/40">
          Debrid is down
        </span>
        <h1
          className={
            phone
              ? "max-w-2xl font-display text-[30px] font-medium leading-[1.1] text-white"
              : "max-w-2xl font-display text-[44px] font-medium leading-[1.05] text-white"
          }
        >
          Your debrid service can&apos;t process this right now.
        </h1>
        <p className="max-w-xl text-[14.5px] leading-relaxed text-white/75">
          Stremio hits the same wall when this happens. Real-Debrid, TorBox, AllDebrid and
          Premiumize all have brief outages where they stop returning links. Wait a few minutes
          and try again, or check the service&apos;s status page.
        </p>
        <div className={phone ? "flex w-full max-w-sm flex-col gap-2.5 pt-2" : "flex items-center gap-3 pt-2"}>
          <button
            type="button"
            onClick={onTryAgain}
            className={`flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-[14px] font-semibold text-black transition-colors hover:bg-white/90${phone ? " w-full justify-center" : ""}`}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onBack}
            className={`flex h-12 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 text-[14px] font-medium text-white/75 backdrop-blur-md transition-all hover:border-white/30 hover:bg-white/10 hover:text-white${phone ? " w-full justify-center" : ""}`}
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
