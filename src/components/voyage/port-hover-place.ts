export const PORT_CARD_W = 336;
const GAP = 14;
const EDGE = 12;

export type Box = { left: number; top: number; right: number; bottom: number };
export type Spot = { left: number; top: number; origin: string };

export function placeBeside(
  anchor: Box,
  height: number,
  panel: Box | null,
  viewW: number,
  viewH: number,
  rtl: boolean,
): Spot {
  const top = Math.max(EDGE, Math.min(anchor.top, viewH - height - EDGE));
  const host = panel ?? anchor;
  const atRight = host.right + GAP;
  const atLeft = host.left - GAP - PORT_CARD_W;
  const fitsRight = atRight + PORT_CARD_W <= viewW - EDGE;
  const fitsLeft = atLeft >= EDGE;
  const sides = rtl
    ? [fitsLeft && "left", fitsRight && "right"]
    : [fitsRight && "right", fitsLeft && "left"];
  const side = sides.find(Boolean);
  if (side === "right") return { left: atRight, top, origin: "top left" };
  if (side === "left") return { left: atLeft, top, origin: "top right" };
  const below = anchor.bottom + GAP + height <= viewH - EDGE;
  const y = below ? anchor.bottom + GAP : Math.max(EDGE, anchor.top - GAP - height);
  const x = Math.max(EDGE, Math.min(anchor.left, viewW - PORT_CARD_W - EDGE));
  return { left: x, top: y, origin: below ? "top left" : "bottom left" };
}
