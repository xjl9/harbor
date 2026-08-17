import type { Meta } from "@/lib/cinemeta";
import { useView, type PlayEpisode } from "@/lib/view";
import { requestMobileIntent } from "@/views/mobile/mobile-intent";
import { openUrl } from "@/lib/window";
import { isPhoneShell } from "./picker-utils";

export function AutoExhaustedModal({
  meta,
  episode,
  triedCount,
  onBrowseManually,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  triedCount: number;
  onBrowseManually: () => void;
}) {
  const { goBack, setView, openSettings } = useView();
  const phone = isPhoneShell();
  // Both branches of the cause list below name an expired or missing debrid key,
  // and the modal offered no way to go and check one. Debrid keys live on the
  // profile page on this shell and in streaming settings on desktop.
  //
  // setView("home"), not goBack(): this modal sits on a stack of fixed overlays
  // (picker over detail page), and popping one frame only revealed the detail
  // page, which then covered the tab the intent had switched to. setView("home")
  // collapses the whole stack to a single home frame, so the destination is
  // actually visible. That is the right depth anyway, since the viewer is
  // leaving playback to go and configure something.
  const fixDebrid = () => {
    if (phone) {
      setView("home");
      requestMobileIntent("debrid");
      return;
    }
    openSettings("streaming");
  };
  const title = meta.name ?? "this title";
  const epSuffix = episode
    ? ` S${episode.imdbSeason ?? episode.season}E${String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}`
    : "";
  const subject = `Harbor: no working stream for ${title}${epSuffix}`;
  const body =
    `Title: ${title}${epSuffix}\n` +
    `IMDb: ${meta.id ?? ""}\n` +
    `Streams tried: ${triedCount}\n` +
    `\nWhat happened: Harbor could not find a working stream automatically.\n` +
    `\n(Add any extra detail here)`;
  const mailto = `mailto:bugs@harbor.site?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <main
      className={
        phone
          ? "fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-black px-5 py-12"
          : "fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-black px-6"
      }
    >
      <div className={`w-full max-w-md rounded-2xl bg-elevated p-8 ring-1 ring-edge-soft${phone ? " my-auto" : ""}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-subtle">
          Harbor
        </p>
        <h2 className="mt-3 text-start text-[24px] font-semibold leading-tight text-ink" dir="auto">
          We could not find a working stream
        </h2>
        <p className="mt-3 text-start text-[14px] leading-relaxed text-ink-muted" dir="auto">
          {triedCount > 0
            ? `Harbor tried ${triedCount} ${triedCount === 1 ? "source" : "sources"} for ${title}${epSuffix} and none of them played.`
            : `Harbor found no sources for ${title}${epSuffix}.`}{" "}
          {triedCount > 0 ? "Usually that means:" : "The most common reasons:"}
        </p>
        {/* The count is the whole diagnosis. Saying "no addon is installed" when an
            addon just returned dozens of sources sends people to fix the one thing
            that is provably working, so that line only shows when nothing came back. */}
        <ul className="mt-3 space-y-1.5 text-start text-[13.5px] leading-relaxed text-ink-muted" dir="auto">
          {triedCount > 0 ? (
            <>
              <li dir="auto">· None of them are cached on your debrid yet.</li>
              <li dir="auto">· A debrid key (TorBox, Real-Debrid, etc.) is missing or expired.</li>
              <li dir="auto">· Pick one yourself below and Harbor will start it downloading.</li>
            </>
          ) : (
            <>
              <li dir="auto">· No stream addon is installed yet (Torrentio, MediaFusion, Comet).</li>
              <li dir="auto">· A debrid key (TorBox, Real-Debrid, etc.) is missing or expired.</li>
              <li dir="auto">· This title is too new and no source has it cached yet.</li>
            </>
          )}
        </ul>
        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={onBrowseManually}
            className="flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            Browse streams manually
          </button>
          <button
            onClick={fixDebrid}
            className="flex h-11 items-center justify-center rounded-full bg-elevated text-[13.5px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
          >
            {phone ? "Check debrid key" : "Open settings"}
          </button>
          <button
            onClick={() => openUrl(mailto)}
            className="flex h-11 items-center justify-center rounded-full bg-elevated text-[13.5px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
          >
            Send a bug report
          </button>
          <button
            onClick={goBack}
            className={`mt-1 text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted${phone ? " min-h-11" : ""}`}
          >
            Back
          </button>
        </div>
      </div>
    </main>
  );
}
