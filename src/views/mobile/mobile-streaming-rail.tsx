import { ServiceLogo } from "@/components/service-logo";
import { useT } from "@/lib/i18n";
import type { StreamingService } from "@/lib/settings";

// Pure settings read: renders the user's enabled streaming services as a
// horizontal rail. Tapping a tile hands the service back to the caller, which
// opens the full service catalog page as an overlay.
export function MobileStreamingRail({
  services,
  onOpen,
}: {
  services: StreamingService[];
  onOpen: (svc: StreamingService) => void;
}) {
  const t = useT();
  if (services.length === 0) return null;
  return (
    <section className="flex flex-col gap-3 [content-visibility:auto] [contain-intrinsic-size:auto_140px]">
      <h2 className="px-4 font-display text-[19px] font-medium tracking-[-0.01em] text-ink">
        {t("Your Streaming")}
      </h2>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {services.map((svc) => (
          <button
            key={svc}
            type="button"
            onClick={() => onOpen(svc)}
            className="flex h-[72px] w-[116px] shrink-0 items-center justify-center rounded-2xl bg-elevated/60 ring-1 ring-edge-soft/60"
          >
            <ServiceLogo service={svc} height={24} />
          </button>
        ))}
      </div>
    </section>
  );
}
