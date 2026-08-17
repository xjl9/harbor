import type { Meta } from "@/lib/cinemeta";
import { useView } from "@/lib/view";
import { requestMobileIntent } from "@/views/mobile/mobile-intent";
import { isPhoneShell } from "./picker-utils";

export function NoSourcesConfiguredModal({ meta }: { meta: Meta }) {
  const { goBack, setView, openSettings } = useView();
  const phone = isPhoneShell();
  // The phone shell has no addons or settings frame, so setView/openSettings
  // drop this modal and land nowhere. Route both to the addons sheet instead,
  // which is where a phone user actually fixes "no sources".
  const browseAddons = () => {
    if (phone) {
      goBack();
      requestMobileIntent("addons");
      return;
    }
    setView("addons");
  };
  // The modal lists two fixes and the phone only ever got a button for the
  // first, because openSettings has no frame to land in here. Debrid keys live
  // on the profile page on this shell, so route there and let the tab switch be
  // the action. goBack first: this modal is a fixed layer over the picker and
  // would otherwise stay in front of wherever the viewer lands.
  const openDebridKeys = () => {
    if (phone) {
      goBack();
      requestMobileIntent("debrid");
      return;
    }
    openSettings("streaming");
  };
  const title = meta.name ?? "this title";
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
        <h2 className="mt-3 text-[24px] font-semibold leading-tight text-ink">
          No streaming sources yet
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          Harbor needs at least one streaming source before it can play {title}. Pick one of the options below to get set up.
        </p>
        <ul className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-ink-muted">
          <li>· Install a stream addon (Torrentio, Comet, MediaFusion).</li>
          <li>· Add a debrid key (TorBox, Real-Debrid, AllDebrid, Premiumize, Debrid-Link).</li>
        </ul>
        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={browseAddons}
            className="flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            Browse addons
          </button>
          <button
            onClick={openDebridKeys}
            className="flex h-11 items-center justify-center rounded-full bg-elevated text-[13.5px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
          >
            {phone ? "Add a debrid key" : "Open settings"}
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
