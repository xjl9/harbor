import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookmarkCheck, CheckCheck, EyeOff, Heart, Info, Share2 } from "lucide-react";
import { Play } from "@/components/icons/play-filled";
import { Poster, usePosterChain } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { shareDeepLink } from "@/lib/deep-link";
import { useT } from "@/lib/i18n";
import { markMetaWatched, unmarkMetaWatched } from "@/lib/mark-watched";
import { useIsFavorite, useMediaFavorites } from "@/lib/media-favorites";
import { useSettings } from "@/lib/settings";
import { useMetaWatched } from "@/lib/watched-flag";
import { toggleWatchlist, useInWatchlist } from "@/lib/watchlist";
import { Group, SheetRow } from "../mobile-detail/sheet-ui";
import { useMobileRemote } from "../mobile-remote";
import { useRegisterSheet } from "../mobile-sheet-lock";
import { useCardImdbId } from "./card-chrome";

const SHEET_CSS = `
@keyframes mb-actions-up { from { transform: translate3d(0, 100%, 0); } to { transform: translate3d(0, 0, 0); } }
@keyframes mb-actions-down { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, 100%, 0); } }
@keyframes mb-scrim-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes mb-scrim-out { from { opacity: 1; } to { opacity: 0; } }
.mb-actions-up { animation: mb-actions-up 300ms var(--ease-out) both; }
.mb-actions-down { animation: mb-actions-down 220ms var(--ease-out) both; }
.mb-scrim-in { animation: mb-scrim-in 220ms ease both; }
.mb-scrim-out { animation: mb-scrim-out 200ms ease both; }
@media (prefers-reduced-motion: reduce) {
  .mb-actions-up, .mb-actions-down, .mb-scrim-in, .mb-scrim-out { animation: none; }
}
`;

// Long-press card sheet: the phone counterpart of the desktop right-click menu on
// a title card (context-menu.tsx, kind "meta"). Same actions, same stores:
// details, watchlist, favourite, watched, share. The desktop menu's session
// "bring friends here" and auto-download rows depend on watch-together and the
// desktop downloader and stay out.
export function CardActionsSheet({
  meta,
  onClose,
  onOpenDetail,
}: {
  meta: Meta;
  onClose: () => void;
  onOpenDetail: (m: Meta) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const { playOnHost } = useMobileRemote();
  useRegisterSheet(true);
  const [leaving, setLeaving] = useState(false);
  const imdbId = useCardImdbId(meta);
  const altIds = useMemo(() => [imdbId], [imdbId]);
  const favorites = useMediaFavorites();
  const isFav = useIsFavorite(meta.id, altIds);
  const inWatchlist = useInWatchlist(meta.id, altIds);
  const watched = useMetaWatched(meta.id, meta.type, imdbId);
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  const year = (meta.releaseInfo ?? meta.releaseDate ?? "").slice(0, 4);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLeaving(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setLeaving(true);
  const after = (fn: () => void) => {
    fn();
    close();
  };

  const share = async () => {
    const url = shareDeepLink(meta.type, meta.id);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: meta.name, url });
        close();
        return;
      }
      await navigator.clipboard?.writeText(url);
      setShared(true);
      window.setTimeout(close, 700);
    } catch {
      /* the user dismissed the share sheet */
    }
  };

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={meta.name}
      className="fixed inset-0 z-[80] flex flex-col justify-end"
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onClose();
      }}
    >
      <style>{SHEET_CSS}</style>
      <button
        type="button"
        aria-label={t("Close")}
        onClick={close}
        className={`absolute inset-0 bg-black/55 backdrop-blur-[2px] ${leaving ? "mb-scrim-out" : "mb-scrim-in"}`}
      />
      <div
        className={`relative flex max-h-[86svh] flex-col overflow-y-auto rounded-t-[26px] bg-canvas pb-2 ring-1 ring-edge-soft/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          leaving ? "mb-actions-down" : "mb-actions-up"
        }`}
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <span aria-hidden className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-ink/20" />
        <div className="flex items-center gap-3.5 px-5 pb-1 pt-4">
          <div className="w-[56px] shrink-0">
            <Poster src={src} onError={onError} seed={meta.id} ratio="portrait" lazy className="rounded-lg ring-1 ring-white/[0.06]" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="line-clamp-2 font-display text-[18px] font-medium leading-tight tracking-tight text-ink">
              {meta.name}
            </span>
            <span className="text-[12.5px] text-ink-subtle">
              {[year, meta.type === "series" ? t("Series") : meta.type === "movie" ? t("Movie") : "", meta.genres?.[0]]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
        </div>
        <Group label={t("Actions")}>
          <SheetRow
            icon={<Play size={18} strokeWidth={0} fill="currentColor" />}
            label={t("Play")}
            onClick={() => after(() => playOnHost(meta))}
          />
          <SheetRow
            icon={<Info size={19} strokeWidth={2} />}
            label={t("View details")}
            onClick={() => after(() => onOpenDetail(meta))}
          />
        </Group>
        <Group label={t("Library")}>
          <SheetRow
            icon={inWatchlist ? <BookmarkCheck size={19} strokeWidth={2} /> : <Bookmark size={19} strokeWidth={2} />}
            label={inWatchlist ? t("In watchlist") : t("Add to watchlist")}
            active={inWatchlist}
            onClick={() =>
              after(() =>
                toggleWatchlist({
                  id: meta.id,
                  type: meta.type,
                  name: meta.name,
                  poster: meta.poster,
                  imdbId,
                  addonOrigin: meta.addonOrigin,
                  videos: meta.videos,
                }),
              )
            }
          />
          <SheetRow
            icon={<Heart size={19} strokeWidth={2} fill={isFav ? "currentColor" : "none"} />}
            label={isFav ? t("Favorited") : t("Favorite")}
            active={isFav}
            onClick={() =>
              after(() =>
                favorites.toggle({
                  id: meta.id,
                  type: meta.type,
                  name: meta.name,
                  poster: meta.poster,
                  addonOrigin: meta.addonOrigin,
                  videos: meta.videos,
                }),
              )
            }
          />
          <SheetRow
            icon={watched ? <EyeOff size={19} strokeWidth={2} /> : <CheckCheck size={19} strokeWidth={2} />}
            label={watched ? t("Mark as unwatched") : meta.type === "series" ? t("Mark all watched") : t("Mark as watched")}
            active={watched}
            onClick={() =>
              after(() => {
                const run = watched ? unmarkMetaWatched(meta, imdbId) : markMetaWatched(meta, imdbId);
                run.catch(() => {});
              })
            }
          />
        </Group>
        <Group label={t("Share")}>
          <SheetRow
            icon={<Share2 size={19} strokeWidth={2} />}
            label={shared ? t("Link copied") : t("Share as link")}
            active={shared}
            onClick={() => void share()}
          />
        </Group>
      </div>
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : node;
}
