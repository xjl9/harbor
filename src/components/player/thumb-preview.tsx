import { useEffect, useRef, useState } from "react";
import { thumbCacheGet, thumbCacheNearest, thumbCacheSet, trickplayGet } from "@/lib/trickplay";
import { useSkipSegmentsView } from "@/lib/skip-intro/segment-store";
import { useT } from "@/lib/i18n";

const SEG_LABEL = { intro: "OP", outro: "ED", recap: "Recap", ad: "Ad" } as const;
const BUCKET_SECONDS = 2;
const CARD_WIDTH = 192;
const CARD_HEIGHT = 108;
const MAX_ATTEMPTS = 24;
const RETRY_MS = 400;
const SETTLE_MS = 130;
const NEAREST_WINDOW = 30;

export function ThumbPreview({
  time,
  dur,
  canFetch = true,
}: {
  time: number;
  dur: number;
  canFetch?: boolean;
}) {
  const bucket = Math.round(time / BUCKET_SECONDS);
  const liveBucketRef = useRef(bucket);
  liveBucketRef.current = bucket;
  const [fetchedSrc, setFetchedSrc] = useState<string | null>(() => thumbCacheGet(bucket) ?? null);

  useEffect(() => {
    const cached = thumbCacheGet(bucket);
    if (cached) {
      setFetchedSrc(cached);
      return;
    }
    setFetchedSrc(null);
    if (!canFetch) return;
    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    const attempt = async () => {
      if (cancelled || liveBucketRef.current !== bucket) return;
      const url = await trickplayGet(bucket * BUCKET_SECONDS);
      if (cancelled || liveBucketRef.current !== bucket) return;
      if (url) {
        thumbCacheSet(bucket, url);
        setFetchedSrc(url);
        return;
      }
      attempts += 1;
      if (attempts >= MAX_ATTEMPTS) return;
      timer = window.setTimeout(attempt, RETRY_MS);
    };
    timer = window.setTimeout(attempt, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bucket, canFetch]);

  const t = useT();
  const segments = useSkipSegmentsView();
  const seg = segments.find((s) => time >= s.startSec && time < s.endSec);
  const segLabel = seg ? t(SEG_LABEL[seg.kind]) : null;
  const pct = (time / dur) * 100;
  const label = fmtTime(time);
  const nearest = fetchedSrc ? null : thumbCacheNearest(bucket, NEAREST_WINDOW);
  const src = fetchedSrc ?? nearest ?? null;
  const approx = !fetchedSrc && !!nearest;

  // No frame, no card. Trickplay is absent for most streamed sources, and showing
  // the 192x108 card with a spinner in it meant a scrub on those put a large empty
  // grey box over the picture and the transport for the ten seconds the retries
  // took. The time pill alone is the honest state; the card earns its space only
  // once there is a frame to put in it.
  if (!src) {
    return (
      <div
        className="pointer-events-none absolute -top-9 flex -translate-x-1/2 items-center gap-1 rounded-[10px] border border-white/[0.08] bg-[color-mix(in_srgb,var(--color-canvas)_72%,transparent)] px-2.5 py-1 font-mono text-[13px] font-semibold tabular-nums text-ink backdrop-blur-xl"
        style={{ left: `${pct}%` }}
      >
        {segLabel && (
          <span className="rounded bg-accent px-1 font-sans text-[10px] font-bold uppercase tracking-wide text-canvas">
            {segLabel}
          </span>
        )}
        {label}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute -translate-x-1/2"
      style={{ left: `${pct}%`, bottom: "calc(100% + 8px)" }}
    >
      <div
        className="relative overflow-hidden rounded-[10px] border border-white/[0.08] bg-[color-mix(in_srgb,var(--color-canvas)_72%,transparent)] backdrop-blur-xl"
        style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className={`h-full w-full object-cover transition-opacity duration-100 ${
            approx ? "opacity-60" : "opacity-100"
          }`}
        />
      </div>
      <div className="mt-1 flex items-center justify-center gap-1">
        {segLabel && (
          <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-canvas">
            {segLabel}
          </span>
        )}
        <span className="inline-block rounded-[10px] border border-white/[0.08] bg-[color-mix(in_srgb,var(--color-canvas)_72%,transparent)] px-2.5 py-1 font-mono text-[13px] font-semibold tabular-nums text-ink backdrop-blur-xl">
          {label}
        </span>
      </div>
    </div>
  );
}

function fmtTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const total = Math.floor(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
