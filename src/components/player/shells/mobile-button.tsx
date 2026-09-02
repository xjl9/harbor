import type { ReactNode } from "react";

// The one button in the touch chrome.
//
// Every control here used to hand-roll its own className, and the player ended up
// with six treatments across seven controls: bare boxes in the top bar, a filled
// circle for play, a pill carrying a REST background for speed, a bordered blurred
// surface for the Up Next tab, and three icon sizes between them. Nothing shared a
// rest state, a radius or a weight, which is what made the chrome read as cheap
// however carefully each piece had been drawn on its own.
//
// The rule is the desktop's, which has exactly one primitive (BigButton) and three
// states. The important half of it is that a background means ACTIVE. Rest is the
// glyph alone on the picture; a control that paints itself at rest is claiming a
// prominence it has not earned, and once two of them do it the row stops reading
// as a set.
//
// Active INVERTS rather than tinting. A white wash at 18% is the desktop's answer
// and it disappears over a bright frame - measured on a lit wall, the on state was
// indistinguishable from the off state - so a control that is on takes a solid
// fill and a dark glyph, which reads at any brightness.
//
// 44px because that is the platform's touch floor. The glyph inside stays 22 so
// every icon in the chrome carries the same optical weight.
export const MOBILE_GLYPH_SIZE = 22;

export function MobileButton({
  label,
  onClick,
  active = false,
  disabled = false,
  wide = false,
  children,
}: {
  label: string;
  onClick: () => void;
  /** Painted state. Reserved for a control that is genuinely on, never for rest. */
  active?: boolean;
  disabled?: boolean;
  /** Lets a text control (the speed chip) size to its label and keep the height. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-11 shrink-0 items-center justify-center rounded-full transition-[background-color,color,opacity] duration-150 ${
        wide ? "min-w-11 px-3" : "w-11"
      } ${
        disabled
          ? "cursor-not-allowed text-ink/30"
          : active
            ? "bg-ink text-canvas active:bg-ink/85"
            : "text-ink/90 active:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
