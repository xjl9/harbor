// Paints one of the player icons in public/player-icons at the current text colour.
//
// Those files carry their own fills and are loaded by URL, so an <img> would draw
// them in whatever colour the artwork happens to be and ignore the chrome around
// it. Masking paints the element's own background through the glyph's alpha, which
// means the icon inherits text-ink, dims with the chrome, and works for the PNG
// seek steps as well as the SVGs. Same technique already used by feed-hero.tsx.
export function MobileGlyph({
  url,
  size = 24,
  className = "",
}: {
  url: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: "currentColor",
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
