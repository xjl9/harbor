import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import traktLogo from "@/assets/trakt.svg";
import anilistLogo from "@/assets/anilist.png";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { openUrl } from "@/lib/window";
import {
  deleteComment,
  fetchComments,
  fetchReplies,
  likeComment,
  postComment,
  rateContent,
  removeRating,
  unlikeComment,
  type TraktComment,
} from "@/lib/trakt/comments";
import { TraktApiError } from "@/lib/trakt/client";
import type { IdResolution } from "@/lib/trakt/ids";
import { getSession, subscribeSession } from "@/lib/trakt/session";
import { useAnilist } from "@/lib/anilist/provider";
import { resolveAnilistMediaId } from "@/lib/anilist/sync";
import { isAuthenticated, subscribeSession as subscribeAnilist } from "@/lib/anilist/session";
import {
  createThread,
  deleteThreadComment,
  fetchThreadComments,
  fetchThreads,
  postThreadComment,
  toggleCommentLike,
  type AnilistThread,
  type AnilistThreadComment,
} from "@/lib/anilist/threads";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import {
  fetchLetterboxdFriendsReviews,
  fetchLetterboxdReviewsDirect,
  type LetterboxdReview,
} from "@/lib/stremboxd/client";
import { requestMobileIntent } from "../mobile-intent";
import { PhonePage } from "./sheets";
import { SectionTitle } from "./ui";

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type TraktTarget = Extract<IdResolution, { ok: true }>["target"];

function timeAgo(ms: number, t: Translate): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return t("just now");
  if (mins < 60) return t("{n}m ago", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("{n}h ago", { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t("{n}d ago", { n: days });
  return t("{n}mo ago", { n: Math.floor(days / 30) });
}

function readJson<T>(key: string | null, fallback: T): T {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeRaw(key: string | null, value: string | null) {
  if (!key) return;
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    void 0;
  }
}

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return (
      <span
        style={style}
        className="flex shrink-0 items-center justify-center rounded-full bg-elevated text-[13px] font-semibold text-ink-muted"
      >
        {(name || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={style}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full object-cover"
    />
  );
}

/** Comment content blur, honoring the same settings toggle desktop reads. */
function BlurGate({ on, children }: { on: boolean; children: ReactNode }) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);
  if (!on || revealed) return <>{children}</>;
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div aria-hidden className="pointer-events-none max-h-[260px] select-none blur-md">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-canvas/40">
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="h-11 rounded-full bg-ink px-5 text-[14px] font-semibold text-canvas"
        >
          {t("Reveal comments")}
        </button>
        <span className="text-[11.5px] text-ink-muted">{t("Comments are hidden")}</span>
      </div>
    </div>
  );
}

function ConnectCta({ text, cta }: { text: string; cta: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface/60 px-5 py-5 text-center ring-1 ring-edge-soft/60">
      <p className="text-[13.5px] leading-relaxed text-ink-muted">{text}</p>
      <button
        type="button"
        onClick={() => requestMobileIntent("settings")}
        className="h-11 rounded-full bg-ink px-5 text-[14px] font-semibold text-canvas"
      >
        {cta}
      </button>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors motion-reduce:transition-none ${
        active ? "bg-ink text-canvas" : "bg-surface text-ink-muted ring-1 ring-edge-soft/70"
      }`}
    >
      {children}
    </button>
  );
}

/** Ten-point score as five 44pt stars; each star's leading half is the odd value. */
function StarPicker({
  value,
  onRate,
  label,
}: {
  value: number;
  onRate: (v: number) => void;
  label: string;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={label} className="flex items-center" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => {
        const full = value >= n * 2;
        const half = value === n * 2 - 1;
        return (
          <span key={n} className="relative flex h-11 w-11 items-center justify-center">
            <Star size={26} className="text-ink-muted/30" />
            {(full || half) && (
              <span
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
                style={half ? { clipPath: "inset(0 50% 0 0)" } : undefined}
              >
                <Star size={26} className="fill-amber-400 text-amber-400" />
              </span>
            )}
            <button
              type="button"
              aria-label={t("Rate {n}", { n: n * 2 - 1 })}
              onClick={() => onRate(n * 2 - 1)}
              className="absolute inset-y-0 left-0 w-1/2"
            />
            <button
              type="button"
              aria-label={t("Rate {n}", { n: n * 2 })}
              onClick={() => onRate(n * 2)}
              className="absolute inset-y-0 right-0 w-1/2"
            />
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trakt

const SORTS = ["likes", "newest", "oldest"] as const;
type Sort = (typeof SORTS)[number];
const SORT_LABEL: Record<Sort, string> = { likes: "Likes", newest: "Newest", oldest: "Oldest" };
const COMMENTS_PAGE = 20;

function traktKey(prefix: string, target: TraktTarget | null): string | null {
  if (!target) return null;
  if (target.kind === "episode") {
    const id = target.show.ids.imdb ?? target.show.ids.tmdb;
    return `${prefix}:episode:${id}:s${target.season}e${target.number}`;
  }
  const id = target.ids.imdb ?? target.ids.tmdb;
  return `${prefix}:${target.kind}:${id}`;
}

export function TraktCommentsPhone({ resolution }: { resolution: IdResolution | null }) {
  const t = useT();
  const { settings } = useSettings();
  const [session, setSessionState] = useState(() => getSession());
  const connected = !!session;
  const username = session?.username ?? null;
  const target = resolution?.ok ? resolution.target : null;
  const ratingKey = useMemo(() => traktKey("trakt-rating", target), [target]);
  const cacheKey = useMemo(() => traktKey("trakt-comments", target), [target]);

  const [comments, setComments] = useState<TraktComment[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState<Sort>("likes");
  const [mine, setMine] = useState(false);
  const [text, setText] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [rating_busy, setRatingBusy] = useState(false);

  useEffect(() => subscribeSession(() => setSessionState(getSession())), []);

  useEffect(() => {
    const cached = Number(readJson<number | string>(ratingKey, 0));
    setRating(cached > 0 ? cached : 0);
  }, [ratingKey]);

  useEffect(() => {
    if (!target) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPage(1);
    fetchComments(target, sort, 1, COMMENTS_PAGE)
      .then((data) => {
        if (cancelled) return;
        const local = readJson<TraktComment[]>(cacheKey, []);
        const localIds = new Set(local.map((c) => c.id));
        setComments([...local, ...data.filter((c) => !localIds.has(c.id))]);
        setHasMore(data.length >= COMMENTS_PAGE);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, sort, cacheKey]);

  const loadMore = useCallback(async () => {
    if (!target || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const next = page + 1;
    const data = await fetchComments(target, sort, next, COMMENTS_PAGE).catch(() => []);
    setComments((prev) => {
      const ids = new Set(prev.map((c) => c.id));
      return [...prev, ...data.filter((c) => !ids.has(c.id))];
    });
    setPage(next);
    setHasMore(data.length >= COMMENTS_PAGE);
    setLoadingMore(false);
  }, [target, sort, page, hasMore, loadingMore]);

  const openOnTrakt = () => {
    if (!target) return;
    const ids = target.kind === "episode" ? target.show.ids : target.ids;
    const slug = ids.tmdb ? `tmdb:${ids.tmdb}` : ids.imdb;
    if (!slug) return;
    if (target.kind === "episode") {
      openUrl(`https://app.trakt.tv/shows/${slug}/seasons/${target.season}/episodes/${target.number}?mode=media`);
    } else if (target.kind === "movie") {
      openUrl(`https://app.trakt.tv/movies/${slug}?mode=media`);
    } else {
      openUrl(`https://app.trakt.tv/shows/${slug}?mode=media`);
    }
  };

  const post = async () => {
    if (!target || !text.trim() || posting) return;
    setPostError(null);
    setPosting(true);
    try {
      const created = await postComment(target, text.trim(), spoiler);
      setComments((prev) => [created, ...prev]);
      setText("");
      setSpoiler(false);
      const existing = readJson<TraktComment[]>(cacheKey, []);
      writeRaw(cacheKey, JSON.stringify([created, ...existing]));
    } catch (e) {
      if (e instanceof TraktApiError) {
        let msg = "";
        try {
          const parsed = JSON.parse(e.body);
          const first = parsed.errors && typeof parsed.errors === "object" ? Object.values(parsed.errors)[0] : null;
          if (Array.isArray(first) && first.length > 0) msg = String(first[0]);
          if (!msg) msg = parsed.error_description ?? parsed.error ?? "";
        } catch {
          void 0;
        }
        setPostError(msg ? msg.replace(/^\w+\s*-\s*/, "") : t("Failed to post comment"));
      } else {
        setPostError(e instanceof TypeError ? t("Network error") : t("Failed to post comment"));
      }
    }
    setPosting(false);
  };

  const rate = async (value: number) => {
    if (!target || rating_busy) return;
    setRatingBusy(true);
    try {
      if (value === rating) {
        await removeRating(target);
        setRating(0);
        writeRaw(ratingKey, null);
      } else {
        await rateContent(target, value);
        setRating(value);
        writeRaw(ratingKey, String(value));
      }
    } catch {
      void 0;
    }
    setRatingBusy(false);
  };

  const onDelete = (id: number) => {
    setComments((prev) => prev.filter((c) => c.id !== id));
    const existing = readJson<TraktComment[]>(cacheKey, []);
    writeRaw(cacheKey, JSON.stringify(existing.filter((c) => c.id !== id)));
  };

  const shown = mine ? comments.filter((c) => c.user.username === username) : comments;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t("Trakt Comments")}</SectionTitle>
        {target && (
          <button
            type="button"
            onClick={openOnTrakt}
            aria-label={t("Open on Trakt")}
            className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-surface px-3.5 text-[12.5px] font-semibold text-ink-muted ring-1 ring-edge-soft/70"
          >
            <img src={traktLogo} alt="" className="h-4 w-4 object-contain" />
            <ExternalLink size={13} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {resolution && !resolution.ok && (
        <p className="rounded-2xl bg-surface/60 p-4 text-[13px] text-ink-muted">
          {resolution.reason === "anime"
            ? t("Trakt comments are not available for anime titles.")
            : t("Could not identify this title on Trakt.")}
        </p>
      )}

      {target && !connected && (
        <ConnectCta text={t("Connect your Trakt account to see comments and reviews.")} cta={t("Connect Trakt")} />
      )}

      {target && connected && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface/60 p-3.5 ring-1 ring-edge-soft/60">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
              {t("Rating")}
            </span>
            <div className="flex items-center gap-1">
              {rating_busy && <Loader2 size={14} className="animate-spin text-ink-subtle" />}
              <StarPicker value={rating} onRate={(v) => void rate(v)} label={t("Rating")} />
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("Write a comment...")}
            rows={3}
            className="min-h-[88px] w-full resize-none rounded-xl bg-canvas px-3.5 py-2.5 text-[16px] leading-snug text-ink outline-none ring-1 ring-inset ring-edge-soft placeholder:text-ink-subtle focus:ring-accent/50"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-pressed={spoiler}
              onClick={() => setSpoiler((v) => !v)}
              className="-ms-1 flex h-11 items-center gap-2 px-1 text-[13px] text-ink-muted"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-md ${
                  spoiler ? "bg-accent text-canvas" : "ring-1 ring-inset ring-edge"
                }`}
              >
                {spoiler && <Eye size={12} strokeWidth={2.6} />}
              </span>
              {t("Contains spoiler")}
            </button>
            <button
              type="button"
              onClick={() => void post()}
              disabled={!text.trim() || posting}
              aria-label={t("Post comment")}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-semibold text-canvas disabled:opacity-40"
            >
              {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              {t("Post")}
            </button>
          </div>
          {postError && (
            <p className="flex items-center gap-1.5 text-[12px] text-danger">
              <AlertCircle size={13} className="shrink-0" />
              {postError}
            </p>
          )}
        </div>
      )}

      {target && (
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SORTS.map((s) => (
            <Chip key={s} active={sort === s && !mine} onClick={() => { setSort(s); setMine(false); }}>
              {t(SORT_LABEL[s])}
            </Chip>
          ))}
          {connected && (
            <Chip active={mine} onClick={() => setMine((v) => !v)}>
              {t("My")}
            </Chip>
          )}
        </div>
      )}

      {target && loading && (
        <div className="flex items-center gap-2 py-4 text-[13px] text-ink-subtle">
          <Loader2 size={15} className="animate-spin" />
          {t("Loading")}
        </div>
      )}
      {target && !loading && shown.length === 0 && (
        <p className="text-[13.5px] text-ink-subtle">
          {mine ? t("You haven't commented yet") : t("No comments yet")}
        </p>
      )}
      {target && !loading && shown.length > 0 && (
        <BlurGate on={settings.blurComments}>
          <div className="flex flex-col gap-2.5">
            {shown.map((c) => (
              <TraktCommentCard key={c.id} comment={c} connected={connected} username={username} onDelete={onDelete} />
            ))}
            {hasMore && !mine && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="flex h-11 items-center justify-center gap-2 rounded-full bg-surface text-[13.5px] font-semibold text-ink-muted ring-1 ring-edge-soft/70 disabled:opacity-60"
              >
                {loadingMore && <Loader2 size={15} className="animate-spin" />}
                {loadingMore ? t("Loading more") : t("Load more comments")}
              </button>
            )}
          </div>
        </BlurGate>
      )}
    </section>
  );
}

function TraktCommentCard({
  comment,
  connected,
  username,
  onDelete,
}: {
  comment: TraktComment;
  connected: boolean;
  username: string | null;
  onDelete: (id: number) => void;
}) {
  const t = useT();
  const [likes, setLikes] = useState(comment.likes);
  const [liking, setLiking] = useState(false);
  const [revealed, setRevealed] = useState(!comment.spoiler);
  const [expanded, setExpanded] = useState(false);
  const [replies, setReplies] = useState<TraktComment[] | null>(null);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const liked = likes !== comment.likes;
  const avatar =
    comment.user.avatar ??
    (comment.user.slug ? `https://walter.trakt.tv/users/${comment.user.slug}/avatars/medium` : null);
  const name = comment.user.name ?? comment.user.username;

  const like = async () => {
    if (liking || !connected) return;
    setLiking(true);
    if (liked) {
      setLikes((l) => l - 1);
      await unlikeComment(comment.id).catch(() => {});
    } else {
      setLikes((l) => l + 1);
      try {
        await likeComment(comment.id);
      } catch {
        setLikes((l) => l - 1);
      }
    }
    setLiking(false);
  };

  return (
    <article className="flex gap-3 rounded-2xl bg-surface/60 p-3.5 ring-1 ring-edge-soft/60">
      <Avatar src={avatar} name={name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">{name}</span>
          <span className="text-[11.5px] text-ink-subtle">{timeAgo(new Date(comment.createdAt).getTime(), t)}</span>
          {comment.userRating != null && (
            <span className="flex items-center gap-0.5 text-[11.5px] font-semibold text-amber-400">
              <Star size={11} className="fill-amber-400" />
              {comment.userRating}/10
            </span>
          )}
        </div>
        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="flex h-11 items-center self-start rounded-full bg-amber-400/10 px-3.5 text-[12.5px] font-semibold text-amber-300"
          >
            {t("Spoiler, tap to reveal")}
          </button>
        ) : (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-start">
            <p
              dir="auto"
              className={`whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink ${
                expanded ? "" : "line-clamp-6"
              }`}
            >
              {comment.comment}
            </p>
          </button>
        )}
        <div className="-ms-2 flex items-center">
          <button
            type="button"
            onClick={() => void like()}
            disabled={liking || !connected}
            aria-label={t("Like")}
            className={`flex h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-[12.5px] ${
              liked ? "text-rose-400" : "text-ink-subtle"
            } ${connected ? "" : "opacity-50"}`}
          >
            {liking ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} fill={liked ? "currentColor" : "none"} />}
            {likes}
          </button>
          {comment.replies > 0 && (
            <button
              type="button"
              onClick={() => {
                if (replies) {
                  setReplies(null);
                  return;
                }
                setLoadingReplies(true);
                fetchReplies(comment.id)
                  .then(setReplies)
                  .finally(() => setLoadingReplies(false));
              }}
              aria-label={t("Replies")}
              className="flex h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-[12.5px] text-ink-subtle"
            >
              {loadingReplies ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
              {comment.replies}
            </button>
          )}
          {comment.user.username === username && (
            <button
              type="button"
              onClick={async () => {
                if (deleting) return;
                setDeleting(true);
                try {
                  await deleteComment(comment.id);
                  onDelete(comment.id);
                } catch {
                  setDeleting(false);
                }
              }}
              aria-label={t("Delete")}
              className="flex h-11 w-11 items-center justify-center text-ink-subtle"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            </button>
          )}
        </div>
        {replies && (
          <div className="flex flex-col gap-2 border-s-2 border-edge-soft ps-3">
            {replies.map((r) => (
              <div key={r.id} className="flex gap-2">
                <Avatar src={r.user.avatar} name={r.user.name ?? r.user.username} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-ink">
                    {r.user.name ?? r.user.username}
                    <span className="ms-2 font-normal text-ink-subtle">
                      {timeAgo(new Date(r.createdAt).getTime(), t)}
                    </span>
                  </p>
                  <p dir="auto" className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-ink-muted">
                    {r.spoiler ? t("Spoiler") : r.comment}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// AniList

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll("script, style, iframe, object, embed, link, meta, form, input, button, svg")
    .forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/\s+/g, "").toLowerCase();
      if (
        name.startsWith("on") ||
        ((name === "href" || name === "src" || name === "xlink:href") &&
          /^(javascript|data|vbscript):/.test(value))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

function HtmlContent({ html, className }: { html: string; className?: string }) {
  const safe = useMemo(() => sanitizeHtml(html), [html]);
  return (
    <div
      dir="auto"
      className={`break-words [&_a]:text-accent [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: safe }}
      onClick={(e) => {
        const anchor = (e.target as HTMLElement).closest("a");
        if (!anchor) return;
        e.preventDefault();
        const href = anchor.getAttribute("href");
        if (href) openUrl(href);
      }}
    />
  );
}

const THREADS_PAGE = 20;

export function AnilistCommentsPhone({ harborId }: { harborId: string | null }) {
  const t = useT();
  const { settings } = useSettings();
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [mediaId, setMediaId] = useState<number | null>(null);
  const [resolving, setResolving] = useState(true);
  const [threads, setThreads] = useState<AnilistThread[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<AnilistThread | null>(null);
  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => subscribeAnilist(() => setAuthed(isAuthenticated())), []);

  useEffect(() => {
    let cancelled = false;
    setResolving(true);
    setMediaId(null);
    if (!harborId) {
      setResolving(false);
      return;
    }
    resolveAnilistMediaId(harborId)
      .then((id) => {
        if (!cancelled) setMediaId(id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [harborId]);

  const load = useCallback(
    async (p: number) => {
      if (!mediaId) return;
      const { threads: data, hasNextPage } = await fetchThreads(mediaId, p, THREADS_PAGE);
      setThreads((prev) => {
        if (p === 1) return data;
        const ids = new Set(prev.map((x) => x.id));
        return [...prev, ...data.filter((x) => !ids.has(x.id))];
      });
      setHasMore(hasNextPage);
      setPage(p);
    },
    [mediaId],
  );

  useEffect(() => {
    if (!mediaId || !authed) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    load(1)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId, authed, load]);

  if (!harborId || resolving) return null;

  const create = async () => {
    if (!mediaId || !title.trim() || creating) return;
    setCreateError(null);
    setCreating(true);
    try {
      const created = await createThread(title.trim(), body.trim(), mediaId);
      setThreads((prev) => [created, ...prev]);
      setTitle("");
      setBody("");
      setComposing(false);
    } catch {
      setCreateError(t("Failed to create thread"));
    }
    setCreating(false);
  };

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t("AniList Comments")}</SectionTitle>
        {authed && mediaId != null && (
          <button
            type="button"
            onClick={() => setComposing((v) => !v)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-[12.5px] font-semibold text-ink-muted ring-1 ring-edge-soft/70"
          >
            <Plus size={14} strokeWidth={2.4} />
            {t("New thread")}
          </button>
        )}
      </div>

      {!authed ? (
        <ConnectCta
          text={t("Connect your AniList account to see forum threads and comments.")}
          cta={t("Connect AniList")}
        />
      ) : mediaId == null ? (
        <p className="rounded-2xl bg-surface/60 p-4 text-[13px] text-ink-muted">
          {t("Could not find this title on AniList.")}
        </p>
      ) : (
        <>
          {composing && (
            <div className="flex flex-col gap-2 rounded-2xl bg-surface/60 p-3.5 ring-1 ring-edge-soft/60">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("Thread title")}
                className="h-12 rounded-xl bg-canvas px-3.5 text-[16px] text-ink outline-none ring-1 ring-inset ring-edge-soft placeholder:text-ink-subtle focus:ring-accent/50"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("Thread body (optional)")}
                rows={3}
                className="resize-none rounded-xl bg-canvas px-3.5 py-2.5 text-[16px] text-ink outline-none ring-1 ring-inset ring-edge-soft placeholder:text-ink-subtle focus:ring-accent/50"
              />
              {createError && <p className="text-[12px] text-danger">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void create()}
                  disabled={!title.trim() || creating}
                  className="flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-semibold text-canvas disabled:opacity-40"
                >
                  {creating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  {t("Create thread")}
                </button>
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  className="h-11 rounded-full px-4 text-[14px] font-medium text-ink-muted"
                >
                  {t("Cancel")}
                </button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-[13px] text-ink-subtle">
              <Loader2 size={15} className="animate-spin" />
              {t("Loading")}
            </div>
          ) : threads.length === 0 ? (
            <div className="rounded-2xl bg-surface/60 p-5 text-center">
              <p className="text-[13.5px] text-ink-muted">{t("No threads for this title yet.")}</p>
              <p className="mt-1 text-[12px] text-ink-subtle">{t("Be the first to start a discussion.")}</p>
            </div>
          ) : (
            <BlurGate on={settings.anilistBlurComments}>
              <div className="flex flex-col gap-2">
                {threads.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => setOpen(th)}
                    className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl bg-surface/60 px-3.5 py-3 text-start ring-1 ring-edge-soft/60 active:bg-elevated/60"
                  >
                    <Avatar src={th.user.avatar} name={th.user.name} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-1.5">
                        <span className="line-clamp-2 text-[14px] font-semibold text-ink">{th.title}</span>
                        {th.isLocked && <Lock size={12} className="shrink-0 text-ink-subtle" />}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-ink-subtle">
                        <span>{th.user.name}</span>
                        <span>{timeAgo(th.createdAt * 1000, t)}</span>
                        <span className="flex items-center gap-1">
                          <MessageCircle size={11} />
                          {th.replyCount}
                        </span>
                      </span>
                    </span>
                    <ChevronRight size={17} className="dir-icon shrink-0 text-ink-subtle" />
                  </button>
                ))}
                {hasMore && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (loadingMore) return;
                      setLoadingMore(true);
                      await load(page + 1).catch(() => {});
                      setLoadingMore(false);
                    }}
                    disabled={loadingMore}
                    className="flex h-11 items-center justify-center gap-2 rounded-full bg-surface text-[13.5px] font-semibold text-ink-muted ring-1 ring-edge-soft/70 disabled:opacity-60"
                  >
                    {loadingMore && <Loader2 size={15} className="animate-spin" />}
                    {loadingMore ? t("Loading more") : t("Load more threads")}
                  </button>
                )}
              </div>
            </BlurGate>
          )}
        </>
      )}
      {open && <AnilistThreadPage thread={open} onBack={() => setOpen(null)} />}
    </section>
  );
}

function AnilistThreadPage({ thread, onBack }: { thread: AnilistThread; onBack: () => void }) {
  const t = useT();
  const { session } = useAnilist();
  const [comments, setComments] = useState<AnilistThreadComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchThreadComments(thread.id)
      .then((data) => {
        if (!cancelled) setComments(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [thread.id]);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPostError(null);
    setPosting(true);
    try {
      const created = await postThreadComment(thread.id, text.trim());
      setComments((prev) => [...prev, created]);
      setText("");
    } catch {
      setPostError(t("Failed to post comment"));
    }
    setPosting(false);
  };

  return (
    <PhonePage title={thread.title} eyebrow="AniList" onBack={onBack}>
      <div className="flex flex-col gap-4 px-5 pt-2">
        <div className="flex flex-col gap-2 rounded-2xl bg-surface/60 p-4 ring-1 ring-edge-soft/60">
          {thread.bodyHtml && (
            <HtmlContent html={thread.bodyHtml} className="text-[14px] leading-relaxed text-ink-muted" />
          )}
          <div className="flex items-center gap-2 text-[12px] text-ink-subtle">
            <Avatar src={thread.user.avatar} name={thread.user.name} size={24} />
            <span>{thread.user.name}</span>
            <span>{timeAgo(thread.createdAt * 1000, t)}</span>
          </div>
          {thread.siteUrl && (
            <button
              type="button"
              onClick={() => openUrl(thread.siteUrl!)}
              className="flex h-11 items-center gap-2 self-start text-[13px] font-semibold text-accent"
            >
              <img src={anilistLogo} alt="" className="h-4 w-4 rounded-[3px]" />
              {t("Open on AniList")}
            </button>
          )}
        </div>

        {thread.isLocked ? (
          <p className="flex items-center gap-2 rounded-xl bg-surface/60 px-3.5 py-3 text-[12.5px] text-ink-muted">
            <Lock size={13} />
            {t("This thread is locked.")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("Write a comment...")}
              rows={3}
              className="resize-none rounded-xl bg-surface px-3.5 py-2.5 text-[16px] text-ink outline-none ring-1 ring-inset ring-edge-soft placeholder:text-ink-subtle focus:ring-accent/50"
            />
            <div className="flex items-center justify-between gap-2">
              {postError ? <p className="text-[12px] text-danger">{postError}</p> : <span />}
              <button
                type="button"
                onClick={() => void post()}
                disabled={!text.trim() || posting}
                className="flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-semibold text-canvas disabled:opacity-40"
              >
                {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {t("Post")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-[13px] text-ink-subtle">
            <Loader2 size={15} className="animate-spin" />
            {t("Loading")}
          </div>
        ) : comments.length === 0 ? (
          <p className="text-[13.5px] text-ink-subtle">{t("No comments yet")}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {comments.map((c) => (
              <AnilistCommentRow
                key={c.id}
                comment={c}
                ownerId={session?.userId ?? null}
                onDelete={(id) => setComments((prev) => prev.filter((x) => x.id !== id))}
              />
            ))}
          </div>
        )}
      </div>
    </PhonePage>
  );
}

function AnilistCommentRow({
  comment,
  ownerId,
  onDelete,
}: {
  comment: AnilistThreadComment;
  ownerId: number | null;
  onDelete: (id: number) => void;
}) {
  const t = useT();
  const [liked, setLiked] = useState(comment.isLiked);
  const [count, setCount] = useState(comment.likeCount);
  const [busy, setBusy] = useState(false);
  const like = async () => {
    if (busy) return;
    setBusy(true);
    const was = liked;
    setLiked(!was);
    setCount((c) => c + (was ? -1 : 1));
    try {
      const res = await toggleCommentLike(comment.id);
      if (res) {
        setLiked(res.isLiked);
        setCount(res.likeCount);
      }
    } catch {
      setLiked(was);
      setCount((c) => c + (was ? 1 : -1));
    }
    setBusy(false);
  };
  return (
    <article className="flex gap-3 rounded-2xl bg-surface/60 p-3.5 ring-1 ring-edge-soft/60">
      <Avatar src={comment.user.avatar} name={comment.user.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] font-semibold text-ink">
          {comment.user.name}
          <span className="ms-2 text-[11.5px] font-normal text-ink-subtle">
            {timeAgo(comment.createdAt * 1000, t)}
          </span>
        </p>
        <HtmlContent html={comment.commentHtml} className="text-[13.5px] leading-relaxed text-ink" />
        <div className="-ms-2 flex items-center">
          <button
            type="button"
            onClick={() => void like()}
            aria-label={t("Like")}
            className={`flex h-11 min-w-11 items-center justify-center gap-1.5 px-2 text-[12.5px] ${
              liked ? "text-rose-400" : "text-ink-subtle"
            }`}
          >
            <Heart size={14} fill={liked ? "currentColor" : "none"} />
            {count}
          </button>
          {comment.user.id === ownerId && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await deleteThreadComment(comment.id);
                  onDelete(comment.id);
                } catch {
                  void 0;
                }
              }}
              aria-label={t("Delete")}
              className="flex h-11 w-11 items-center justify-center text-ink-subtle"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Letterboxd reviews

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // A scrape hiccup must never take the detail screen down with it.
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function LetterboxdReviewsPhone({ meta, imdbId }: { meta: Meta; imdbId: string | null }) {
  return (
    <Boundary>
      <LetterboxdReviewsInner meta={meta} imdbId={imdbId} />
    </Boundary>
  );
}

const REVIEWS_VISIBLE = 5;

function LetterboxdReviewsInner({ meta, imdbId }: { meta: Meta; imdbId: string | null }) {
  const t = useT();
  const lb = useLetterboxd();
  const { settings } = useSettings();
  const id = imdbId ?? (meta.id.startsWith("tt") ? meta.id : null);
  const [reviews, setReviews] = useState<LetterboxdReview[]>([]);
  const [friends, setFriends] = useState<LetterboxdReview[]>([]);
  const [loading, setLoading] = useState(false);
  const [tried, setTried] = useState(false);
  const [filter, setFilter] = useState<"all" | "friends">("all");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setShowAll(false);
    try {
      const result = await fetchLetterboxdReviewsDirect(id);
      setReviews(result.reviews);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
      setTried(true);
    }
    if (lb.isFullConnected && lb.username) {
      fetchLetterboxdFriendsReviews(lb.username, id)
        .then(setFriends)
        .catch(() => setFriends([]));
    }
  }, [id, lb.isFullConnected, lb.username]);

  useEffect(() => {
    if (!lb.isActive || meta.type === "series") return;
    void load();
  }, [load, lb.isActive, meta.type]);

  if (!lb.isActive || meta.type === "series" || !id) return null;

  const list = filter === "friends" ? friends : reviews;
  const visible = showAll ? list : list.slice(0, REVIEWS_VISIBLE);
  const hidden = list.length - visible.length;

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t("Letterboxd Reviews")}</SectionTitle>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t("Refresh")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-muted ring-1 ring-edge-soft/70"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
          <button
            type="button"
            onClick={() => openUrl(`https://letterboxd.com/imdb/${id}/reviews/`)}
            aria-label={t("All reviews")}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface ring-1 ring-edge-soft/70"
          >
            <img src={letterboxdLogo} alt="" className="h-4 w-4 rounded-[3px] object-cover" />
          </button>
        </div>
      </div>

      {lb.isFullConnected && lb.username && (
        <div className="flex gap-1.5">
          <Chip active={filter === "all"} onClick={() => { setFilter("all"); setShowAll(false); }}>
            <MessageCircle size={13} />
            {t("All")}
          </Chip>
          <Chip active={filter === "friends"} onClick={() => { setFilter("friends"); setShowAll(false); }}>
            <Users size={13} />
            {t("Friends")}
          </Chip>
        </div>
      )}

      {loading && reviews.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-[13px] text-ink-subtle">
          <Loader2 size={15} className="animate-spin" />
          {t("Loading")}
        </div>
      ) : tried && reviews.length === 0 && filter === "all" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface/60 p-5 text-center">
          <p className="text-[13.5px] text-ink-muted">{t("Reviews couldn't be loaded right now.")}</p>
          <button
            type="button"
            onClick={() => openUrl(`https://letterboxd.com/imdb/${id}/reviews/`)}
            className="flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-[14px] font-semibold text-canvas"
          >
            {t("View on Letterboxd")}
            <ExternalLink size={13} strokeWidth={2.2} />
          </button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-[13.5px] text-ink-subtle">
          {filter === "friends" ? t("No reviews from your friends for this film.") : t("No reviews yet.")}
        </p>
      ) : (
        <BlurGate on={settings.blurComments}>
          <div className="flex flex-col gap-2.5">
            {visible.map((r, i) => (
              <article
                key={`${r.author}-${i}`}
                className="flex gap-3 rounded-2xl bg-surface/60 p-3.5 ring-1 ring-edge-soft/60"
              >
                <Avatar src={r.avatar} name={r.author} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <button
                      type="button"
                      onClick={() => r.authorUrl && openUrl(r.authorUrl)}
                      className="min-w-0 truncate text-[13.5px] font-semibold text-ink"
                    >
                      {r.author || t("Anonymous")}
                    </button>
                    {r.rating && <span className="text-[13px] leading-none text-amber-300">{r.rating}</span>}
                    {r.date && (
                      <span className="text-[11.5px] text-ink-subtle">
                        {new Date(r.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                  <p dir="auto" className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-muted">
                    {r.text}
                  </p>
                </div>
              </article>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex h-11 items-center justify-center rounded-full bg-surface text-[13.5px] font-semibold text-ink-muted ring-1 ring-edge-soft/70"
              >
                {t("Show {n} more reviews", { n: hidden })}
              </button>
            )}
          </div>
        </BlurGate>
      )}
    </section>
  );
}
