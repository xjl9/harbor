import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, ImagePlus, RotateCcw, X } from "lucide-react";
import { Play } from "@/components/icons/play-filled";
import { emitListToast } from "@/components/lists/list-toast";
import { saveImageToDisk } from "@/lib/download/save-binary";
import { useT } from "@/lib/i18n";
import { isMobileNative } from "@/lib/platform";
import type { TmdbDetail } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { clearTitleBackdrop, setTitleBackdrop, useTitleBackdrop } from "@/lib/title-backdrop";
import { clearTitleLogo, setTitleLogo, useTitleLogo } from "@/lib/title-logo";
import { clearTitlePoster, setTitlePoster, useTitlePoster } from "@/lib/title-poster";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { HIDE_SCROLL } from "./data";
import { MobileTrailerOverlay } from "./trailer";
import { SectionTitle } from "./ui";

type Tab = "videos" | "backdrops" | "posters" | "logos";
export type LightboxKind = "backdrops" | "posters" | "logos" | "stills";
type GalleryVideo = { ytId: string; name: string; type: string };

const BACKDROP_DIM = 0.5;
const SWIPE_PX = 56;

function collectVideos(detail: TmdbDetail): GalleryVideo[] {
  const seen = new Set<string>();
  const out: GalleryVideo[] = [];
  for (const id of detail.trailerCandidates) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ytId: id, name: "Trailer", type: "Trailer" });
  }
  for (const v of detail.extraVideos) {
    if (seen.has(v.ytId)) continue;
    seen.add(v.ytId);
    out.push({ ytId: v.ytId, name: v.name, type: v.type });
  }
  return out;
}

function baseName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "media";
}

/**
 * Desktop's media gallery (videos, backdrops, posters, logos, with the pin and
 * theme actions) laid out for touch. Desktop hides every tile action behind
 * hover, which a phone never produces, so the actions live in the lightbox.
 */
export function PhoneMediaGallery({
  detail,
  title,
  logo,
  metaId,
}: {
  detail: TmdbDetail;
  title: string;
  logo?: string;
  metaId: string;
}) {
  const t = useT();
  const videos = useMemo(() => collectVideos(detail), [detail]);
  const { backdrops, posters, logos } = detail.gallery;
  const pinnedPoster = useTitlePoster(metaId);
  const pinnedBackdrop = useTitleBackdrop(metaId);
  const pinnedLogo = useTitleLogo(metaId);

  const tabs = useMemo(() => {
    const list: Array<{ id: Tab; label: string; count: number }> = [];
    if (videos.length > 0) list.push({ id: "videos", label: t("Videos"), count: videos.length });
    if (backdrops.length > 0) list.push({ id: "backdrops", label: t("Backdrops"), count: backdrops.length });
    if (posters.length > 0) list.push({ id: "posters", label: t("Posters"), count: posters.length });
    if (logos.length > 0) list.push({ id: "logos", label: t("Logos"), count: logos.length });
    return list;
  }, [videos.length, backdrops.length, posters.length, logos.length, t]);

  const [active, setActive] = useState<Tab | null>(null);
  const current = tabs.some((x) => x.id === active) ? active : (tabs[0]?.id ?? null);
  const [trailer, setTrailer] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ images: string[]; index: number; kind: LightboxKind } | null>(null);

  if (tabs.length === 0 || !current) return null;

  const pinRing = (on: boolean) => (on ? "ring-2 ring-accent/70" : "ring-1 ring-edge-soft/60");

  return (
    <section className="flex flex-col gap-3.5">
      <SectionTitle>{t("Media")}</SectionTitle>
      <div role="tablist" className={`-mx-5 flex gap-1.5 overflow-x-auto px-5 ${HIDE_SCROLL}`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current === tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors motion-reduce:transition-none ${
              current === tab.id
                ? "bg-ink text-canvas"
                : "bg-surface text-ink-muted ring-1 ring-edge-soft/70"
            }`}
          >
            {tab.label}
            <span className={`text-[11px] tabular-nums ${current === tab.id ? "text-canvas/70" : "text-ink-subtle"}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className={`-mx-5 flex snap-x snap-proximity gap-3 overflow-x-auto px-5 pb-1 ${HIDE_SCROLL}`}>
        {current === "videos" &&
          videos.map((v) => (
            <button
              key={v.ytId}
              type="button"
              onClick={() => setTrailer(v.ytId)}
              className="flex w-[240px] shrink-0 snap-start flex-col gap-2 text-start"
            >
              <span className="relative block aspect-video w-full overflow-hidden rounded-xl bg-surface ring-1 ring-edge-soft/60">
                <img
                  src={`https://img.youtube.com/vi/${v.ytId}/hqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/90 text-canvas">
                    <Play size={16} fill="currentColor" />
                  </span>
                </span>
              </span>
              <span className="flex flex-col gap-0.5 px-0.5">
                <span className="line-clamp-1 text-[13px] font-semibold text-ink">
                  {v.type === "Trailer" && v.name === "Trailer" ? t("Trailer") : v.name}
                </span>
                <span className="text-[11.5px] text-ink-subtle">{v.type}</span>
              </span>
            </button>
          ))}
        {current === "backdrops" &&
          backdrops.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setLightbox({ images: backdrops, index: i, kind: "backdrops" })}
              className={`relative aspect-video w-[240px] shrink-0 snap-start overflow-hidden rounded-xl bg-surface ${pinRing(pinnedBackdrop === src)}`}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              {pinnedBackdrop === src && <PinnedBadge label={t("Show backdrop")} />}
            </button>
          ))}
        {current === "posters" &&
          posters.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setLightbox({ images: posters, index: i, kind: "posters" })}
              className={`relative aspect-[2/3] w-[118px] shrink-0 snap-start overflow-hidden rounded-xl bg-surface ${pinRing(pinnedPoster === src)}`}
            >
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
              {pinnedPoster === src && <PinnedBadge label={t("Show poster")} />}
            </button>
          ))}
        {current === "logos" &&
          logos.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setLightbox({ images: logos, index: i, kind: "logos" })}
              className={`relative flex h-[96px] w-[180px] shrink-0 snap-start items-center justify-center rounded-xl bg-surface/60 p-4 ${pinRing(pinnedLogo === src)}`}
            >
              <img src={src} alt="" loading="lazy" className="max-h-full max-w-full object-contain" />
              {pinnedLogo === src && <PinnedBadge label={t("Show logo")} />}
            </button>
          ))}
      </div>

      {trailer && (
        <MobileTrailerOverlay id={trailer} title={title} logo={logo} onClose={() => setTrailer(null)} />
      )}
      {lightbox && (
        <PhoneLightbox
          images={lightbox.images}
          index={lightbox.index}
          kind={lightbox.kind}
          metaId={metaId}
          fileBase={baseName(title)}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
}

function PinnedBadge({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute start-1.5 top-1.5 flex h-5 items-center gap-1 rounded-full bg-accent/20 px-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em] text-accent ring-1 ring-accent/30 backdrop-blur-sm">
      <Check size={9} strokeWidth={2.6} />
      {label}
    </span>
  );
}

/**
 * Full-screen image viewer driven by touch: swipe sideways to page, swipe down
 * to dismiss. The pin and theme actions desktop keeps on the hover tiles sit in
 * a bottom bar here. Saving to disk goes through a desktop file dialog, so it
 * is only offered where one exists (the browser build saves through a link).
 */
export function PhoneLightbox({
  images,
  index,
  kind,
  metaId,
  fileBase = "media",
  onClose,
}: {
  images: string[];
  index: number;
  kind: LightboxKind;
  metaId?: string;
  fileBase?: string;
  onClose: () => void;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  useRegisterSheet(true);
  const [i, setI] = useState(index);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(0);
  const gesture = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);
  const multi = images.length > 1;
  const src = images[i] ?? images[0];

  const pinnedPoster = useTitlePoster(metaId);
  const pinnedBackdrop = useTitleBackdrop(metaId);
  const pinnedLogo = useTitleLogo(metaId);

  const go = useCallback(
    (d: -1 | 1) => setI((p) => (p + d + images.length) % images.length),
    [images.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";

  const onTouchStart = (e: React.TouchEvent) => {
    const p = e.touches[0];
    if (!p || e.touches.length > 1) return;
    gesture.current = { x: p.clientX, y: p.clientY, axis: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    const p = e.touches[0];
    if (!g || !p) return;
    const mx = p.clientX - g.x;
    const my = p.clientY - g.y;
    if (!g.axis && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
      g.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
    }
    if (g.axis === "x" && multi) setDx(mx);
    if (g.axis === "y" && my > 0) setDy(my);
  };
  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.axis === "x" && multi) {
      const forward = rtl ? dx > SWIPE_PX : dx < -SWIPE_PX;
      const back = rtl ? dx < -SWIPE_PX : dx > SWIPE_PX;
      if (forward) go(1);
      else if (back) go(-1);
    }
    if (g?.axis === "y" && dy > 110) {
      onClose();
      return;
    }
    setDx(0);
    setDy(0);
  };

  const pin =
    kind === "posters"
      ? {
          on: pinnedPoster === src,
          set: () => {
            if (!metaId) return;
            if (pinnedPoster === src) {
              clearTitlePoster(metaId);
              emitListToast(t("Poster reset to default"));
            } else {
              setTitlePoster(metaId, src);
              emitListToast(t("Set as show poster"));
            }
          },
          label: pinnedPoster === src ? t("Reset to default poster") : t("Set as show poster"),
        }
      : kind === "backdrops"
        ? {
            on: pinnedBackdrop === src,
            set: () => {
              if (!metaId) return;
              if (pinnedBackdrop === src) {
                clearTitleBackdrop(metaId);
                emitListToast(t("Backdrop reset to default"));
              } else {
                setTitleBackdrop(metaId, src);
                emitListToast(t("Set as show backdrop"));
              }
            },
            label: pinnedBackdrop === src ? t("Reset to default backdrop") : t("Set as show backdrop"),
          }
        : kind === "logos"
          ? {
              on: pinnedLogo === src,
              set: () => {
                if (!metaId) return;
                if (pinnedLogo === src) {
                  clearTitleLogo(metaId);
                  emitListToast(t("Logo reset to default"));
                } else {
                  setTitleLogo(metaId, src);
                  emitListToast(t("Set as show logo"));
                }
              },
              label: pinnedLogo === src ? t("Reset to default logo") : t("Set as show logo"),
            }
          : null;
  const canSave = !isMobileNative();

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex flex-col bg-black"
      style={{ backgroundColor: `rgba(0,0,0,${Math.max(0.55, 0.96 - dy / 600)})` }}
    >
      <div
        className="flex items-center justify-between px-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
      >
        <span className="px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55 tabular-nums">
          {multi ? `${i + 1} / ${images.length}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close")}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white/12 text-white"
        >
          <X size={19} strokeWidth={2.4} />
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-3"
        style={{ touchAction: "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <img
          key={src}
          src={src}
          alt=""
          draggable={false}
          className={`max-h-full max-w-full select-none rounded-xl object-contain ${kind === "logos" ? "p-6" : ""}`}
          style={{
            transform: `translate3d(${dx}px, ${dy}px, 0)`,
            transition: dx === 0 && dy === 0 ? "transform 220ms var(--ease-out)" : "none",
          }}
        />
      </div>

      {(pin || kind === "backdrops" || canSave) && metaId !== undefined && (
        <div
          className="flex flex-wrap items-center justify-center gap-2 px-4 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        >
          {pin && (
            <LightboxAction
              icon={pin.on ? <RotateCcw size={16} strokeWidth={2.2} /> : <Check size={16} strokeWidth={2.4} />}
              label={pin.label}
              active={pin.on}
              onClick={pin.set}
            />
          )}
          {kind === "backdrops" && (
            <LightboxAction
              icon={<ImagePlus size={16} strokeWidth={2.2} />}
              label={t("Set as theme backdrop")}
              onClick={() => {
                update({ theme: { ...settings.theme, backgroundImage: src, backgroundDim: BACKDROP_DIM } });
                emitListToast(t("Set as theme backdrop"));
              }}
            />
          )}
          {canSave && (
            <LightboxAction
              icon={<Download size={16} strokeWidth={2.2} />}
              label={t("Download")}
              onClick={() => {
                saveImageToDisk(src, `${fileBase}-${kind.slice(0, -1)}-${i + 1}`)
                  .then((r) => {
                    if (r.saved) emitListToast(t("Saved to disk"));
                  })
                  .catch(() => emitListToast(t("Download failed")));
              }}
            />
          )}
        </div>
      )}
      {metaId === undefined && (
        <div style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }} />
      )}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}

function LightboxAction({
  icon,
  label,
  active = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold ${
        active ? "bg-accent/20 text-accent" : "bg-white/12 text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
