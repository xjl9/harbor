import { useState } from "react";
import { Star } from "lucide-react";
import { ImdbIcon } from "@/components/icons/imdb-icon";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink">{children}</h2>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-surface/90 px-2.5 py-1 text-[12.5px] font-medium text-ink-muted ring-1 ring-edge-soft/70 backdrop-blur-sm">
      {children}
    </span>
  );
}

// Compact overlay rating chip for episode thumbnails (desktop's
// EpisodeRatingBadge at mobile scale).
export function EpisodeRating({ value, isImdb }: { value: number; isImdb: boolean }) {
  return (
    <span className="pointer-events-none absolute bottom-1.5 start-1.5 z-[5] flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 backdrop-blur-sm">
      {isImdb ? (
        <ImdbIcon className="h-3 w-auto rounded-[2px]" />
      ) : (
        <Star className="h-3 w-3 text-amber-400" fill="currentColor" strokeWidth={0} />
      )}
      <span className="text-[10.5px] font-bold text-white">{value.toFixed(1)}</span>
    </span>
  );
}

export function Line({ className = "" }: { className?: string }) {
  return <span className={`harbor-skeleton h-3.5 rounded bg-elevated/70 ${className}`} />;
}

export function Overview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-1.5">
      <p className={`text-[14.5px] leading-relaxed text-ink-muted ${open ? "" : "line-clamp-4"}`}>
        {text}
      </p>
      {text.length > 180 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[13px] font-semibold text-accent transition-opacity active:opacity-70 motion-reduce:transition-none"
        >
          {open ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}
