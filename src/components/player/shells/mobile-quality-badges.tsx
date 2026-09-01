// What you are actually watching, from what the engine reports rather than from
// what the stream title claimed. A release named 2160p can decode at 1080p, and
// the picture is the only honest source.
//
// These are designed badges with their own colour, not monochrome glyphs, so they
// render as images instead of going through MobileGlyph's mask.

const B = "/player-icons/";

function resolutionBadge(width: number, height: number): string | null {
  // Keyed off the long edge so anamorphic and portrait sources land in the right
  // tier rather than being demoted by their height.
  const long = Math.max(width, height);
  if (long <= 0) return null;
  if (long >= 3400) return `${B}quality-4k.png`;
  if (long >= 2400) return `${B}quality-1440p.png`;
  if (long >= 1700) return `${B}quality-1080p.png`;
  if (long >= 1100) return `${B}quality-720p.png`;
  if (long >= 700) return `${B}quality-480p.png`;
  return `${B}quality-sd.png`;
}

function dynamicRangeBadge(gamma: string): string | null {
  const g = gamma.toLowerCase();
  if (!g || g === "sdr") return null;
  if (g.includes("dolby") || g.includes("dv")) return `${B}quality-dv.png`;
  if (g.includes("hdr10")) return `${B}quality-hdr10.png`;
  return `${B}quality-hdr.png`;
}

export function MobileQualityBadges({
  videoWidth,
  videoHeight,
  hdrGamma,
}: {
  videoWidth: number;
  videoHeight: number;
  hdrGamma: string;
}) {
  const res = resolutionBadge(videoWidth, videoHeight);
  const range = dynamicRangeBadge(hdrGamma);
  if (!res && !range) return null;
  return (
    <span className="pointer-events-none flex items-center gap-1.5">
      {res && <img src={res} alt="" aria-hidden className="h-[13px] w-auto opacity-90" />}
      {range && <img src={range} alt="" aria-hidden className="h-[13px] w-auto opacity-90" />}
    </span>
  );
}
