import { Check, ChevronLeft, Copy, LogOut, MousePointer2, Plus, Share } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/together-modal/avatar";
import { ChatPanel } from "@/components/together-modal/chat-panel";
import { GuestPickToggle } from "@/components/together-modal/guest-pick-toggle";
import { ReturnToVideo } from "@/components/together-modal/return-to-video";
import { TogetherRelayBanner } from "@/components/together-relay-banner";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { buildInviteUrl } from "@/lib/together/invite";
import { useTogether } from "@/lib/together/provider";
import { useSelfIdentity } from "@/lib/together/use-self-identity";
import { useView } from "@/lib/view";
import { MOBILE_SAFE_X } from "./chrome-metrics";
import { useRegisterSheet } from "./mobile-sheet-lock";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

// Watch Together on the phone: the desktop TogetherPopover's whole flow (start a
// room, join by code or invite link, your name, the room code and invite link
// with copy and the system share sheet, who is watching, chat, cursors, leave)
// driven by the same useTogether provider, laid out as a full phone page. The
// desktop popover is 400px of hover-sized controls anchored under a top bar the
// phone does not have.
export function MobileTogetherSheet({ onClose }: { onClose: () => void }) {
  useRegisterSheet(true);
  const t = useT();
  const {
    enabled,
    snapshot,
    chat,
    displayName,
    setDisplayName,
    startSession,
    joinSession,
    leaveSession,
    retrySession,
    sendChat,
    closeModal,
    clientId,
  } = useTogether();
  const { openSettings, openPicker, topKind } = useView();
  const { settings, update } = useSettings();
  const { avatar: selfAvatar, color: selfColor } = useSelfIdentity();
  const [joinCode, setJoinCode] = useState("");
  const [draftName, setDraftName] = useState(displayName);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [closing, setClosing] = useState(false);

  useEffect(() => setDraftName(displayName), [displayName]);
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(onClose, 300);
    return () => window.clearTimeout(id);
  }, [closing, onClose]);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1400);
    return () => window.clearTimeout(id);
  }, [copied]);

  const inSession = snapshot.state === "joined" && !!snapshot.room;
  const connecting = snapshot.state === "connecting";
  const errored = snapshot.state === "error";
  const participants = useMemo(
    () => snapshot.participants.slice().sort((a, b) => a.joinedAt - b.joinedAt),
    [snapshot.participants],
  );
  const inviteUrl = useMemo(
    () => (settings.togetherRelayUrl && snapshot.room ? buildInviteUrl(settings.togetherRelayUrl, snapshot.room) : ""),
    [settings.togetherRelayUrl, snapshot.room],
  );
  const roomMedia = snapshot.syncState;
  const canReturn = inSession && !!roomMedia?.mediaId && topKind !== "player";

  const close = () => setClosing(true);

  const handleStart = () => {
    const code = startSession();
    setJoinCode(code);
  };

  // Same parsing as the desktop popover: a pasted invite link carries the relay
  // URL and the room code, and the relay has to be set before the join goes out.
  const handleJoin = () => {
    const value = joinCode.trim();
    if (!value) return;
    if (/^https?:\/\//i.test(value) || value.includes("harbor-relay=")) {
      try {
        const url = new URL(
          value.startsWith("http") ? value : `https://x${value.startsWith("?") ? value : `?${value}`}`,
        );
        const relay = url.searchParams.get("harbor-relay");
        const room = url.searchParams.get("harbor-room");
        if (relay && room) {
          if (settings.togetherRelayUrl !== relay) update({ togetherRelayUrl: relay });
          setJoinCode(room.toUpperCase());
          window.setTimeout(() => joinSession(room), 200);
          return;
        }
      } catch {
        /* not a link after all; try it as a code */
      }
    }
    joinSession(value);
  };

  const commitName = () => {
    if (draftName.trim() && draftName.trim() !== displayName) setDisplayName(draftName);
  };

  const copy = async (text: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
    } catch {
      /* clipboard denied; the value is still on screen */
    }
  };

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const share = async () => {
    if (!snapshot.room) return;
    try {
      await navigator.share({
        title: t("Watch together"),
        text: `${t("Room code")}: ${snapshot.room}`,
        url: inviteUrl || undefined,
      });
    } catch {
      /* dismissed */
    }
  };

  const returnToVideo = () => {
    if (!roomMedia?.mediaId) return;
    const meta: Meta = {
      id: roomMedia.mediaId,
      type: roomMedia.episode ? "series" : "movie",
      name: roomMedia.mediaTitle ?? "Now playing",
      poster: roomMedia.posterUrl ?? undefined,
    };
    openPicker(meta, roomMedia.episode ?? undefined, { autoPlay: true });
    closeModal();
    close();
  };

  const goToRelaySettings = () => {
    closeModal();
    openSettings("relay");
    close();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("Watch together")}
      className={`fixed inset-0 z-[70] flex flex-col bg-canvas ${
        closing
          ? "translate-x-full transition-transform duration-300 [transition-timing-function:var(--ease-out)]"
          : "animate-slide-from-right"
      }`}
      style={MOBILE_SAFE_X}
    >
      <header
        className="sticky top-0 z-10 mx-auto flex w-full max-w-[680px] items-center gap-3 bg-canvas px-5 pb-2"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <button
          type="button"
          onClick={close}
          aria-label={t("Back")}
          className={`-ms-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-muted ${FOCUS}`}
        >
          <ChevronLeft size={24} strokeWidth={2.2} className="dir-icon" />
        </button>
        <h1 className="min-w-0 truncate font-display text-[26px] font-medium leading-none tracking-[-0.02em] text-ink">
          {t("Watch together")}
        </h1>
      </header>

      <div
        className="mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-5 overflow-y-auto px-5 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 32px)" }}
      >
        <TogetherRelayBanner />

        {!enabled && (
          <section className="flex flex-col gap-3 rounded-2xl bg-elevated p-4">
            <p className="text-[15px] font-medium text-ink">{t("Watch Together needs a relay.")}</p>
            <p className="text-[13.5px] leading-relaxed text-ink-muted">
              {t(
                "A relay is a tiny Cloudflare Worker that passes play/pause/seek messages between you and your friends. No video data ever touches it. Deploy your own in one click (free tier is plenty), or paste a friend's invite link to use theirs.",
              )}
            </p>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder={t("Paste invite link")}
              autoCapitalize="off"
              autoCorrect="off"
              className="h-12 rounded-xl bg-canvas px-4 text-[16px] text-ink focus:outline-none focus:ring-1 focus:ring-inset focus:ring-accent/50"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleJoin}
                disabled={!joinCode.trim()}
                className={`h-12 rounded-xl bg-ink text-[15px] font-semibold text-canvas disabled:opacity-40 ${FOCUS}`}
              >
                {t("Join")}
              </button>
              <button
                type="button"
                onClick={goToRelaySettings}
                className={`h-12 rounded-xl bg-raised text-[15px] font-medium text-ink ${FOCUS}`}
              >
                {t("Open Settings")}
              </button>
            </div>
          </section>
        )}

        {enabled && !inSession && (
          <>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                {t("Your name")}
              </span>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
                maxLength={32}
                enterKeyHint="done"
                className="h-12 rounded-xl bg-elevated px-4 text-[16px] text-ink focus:outline-none focus:ring-1 focus:ring-inset focus:ring-accent/50"
              />
            </label>

            <button
              type="button"
              onClick={handleStart}
              disabled={connecting}
              className={`flex h-13 min-h-12 items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-semibold text-canvas disabled:opacity-40 ${FOCUS}`}
            >
              <Plus size={17} strokeWidth={2.4} />
              {connecting ? t("Starting…") : t("Start a new room")}
            </button>

            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
              <span className="h-px flex-1 bg-edge-soft" />
              <span>{t("or join")}</span>
              <span className="h-px flex-1 bg-edge-soft" />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setJoinCode(v.includes("/") || v.length > 6 ? v : v.toUpperCase());
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  placeholder="ABCD23"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  enterKeyHint="go"
                  aria-label={t("Room code")}
                  className={`h-12 min-w-0 flex-1 rounded-xl bg-elevated px-4 text-ink focus:outline-none focus:ring-1 focus:ring-inset focus:ring-accent/50 ${
                    joinCode.length > 6 || joinCode.includes("/")
                      ? "text-[16px]"
                      : "text-center font-mono text-[18px] tracking-[0.3em]"
                  }`}
                />
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={joinCode.trim().length === 0 || connecting}
                  className={`h-12 shrink-0 rounded-xl bg-raised px-5 text-[15px] font-semibold text-ink disabled:opacity-40 ${FOCUS}`}
                >
                  {t("Join")}
                </button>
              </div>
              <p className="px-1 text-[12px] text-ink-subtle">{t("or paste an invite link")}</p>
            </div>

            {errored && snapshot.lastError && (
              <div className="flex flex-col gap-2 rounded-xl bg-danger/15 p-3.5">
                <p className="text-[13.5px] leading-snug text-danger">{snapshot.lastError}</p>
                <button
                  type="button"
                  onClick={retrySession}
                  className="h-11 self-start rounded-lg bg-danger/15 px-4 text-[13.5px] font-semibold text-danger"
                >
                  {t("Try again")}
                </button>
              </div>
            )}
          </>
        )}

        {enabled && inSession && snapshot.room && (
          <>
            {canReturn && roomMedia && <ReturnToVideo media={roomMedia} onReturn={returnToVideo} />}

            <section className="flex flex-col gap-3 rounded-2xl bg-elevated p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                    {t("Room code")}
                  </span>
                  <span className="font-mono text-[24px] tracking-[0.3em] text-ink">{snapshot.room}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(snapshot.room ?? "", "code")}
                  aria-label={t("Copy room code")}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-ink-muted ${FOCUS}`}
                >
                  {copied === "code" ? <Check size={17} strokeWidth={2.4} /> : <Copy size={16} strokeWidth={2} />}
                </button>
              </div>
              {inviteUrl && (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                    {t("Invite link")}
                  </span>
                  <p className="break-all rounded-xl bg-canvas px-3 py-2.5 font-mono text-[12px] leading-snug text-ink-muted">
                    {inviteUrl}
                  </p>
                  <div className={`grid gap-2 ${canShare ? "grid-cols-2" : "grid-cols-1"}`}>
                    <button
                      type="button"
                      onClick={() => void copy(inviteUrl, "link")}
                      className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-ink text-[14.5px] font-semibold text-canvas ${FOCUS}`}
                    >
                      {copied === "link" ? <Check size={16} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2.2} />}
                      {copied === "link" ? t("Link copied") : t("Copy invite link")}
                    </button>
                    {canShare && (
                      <button
                        type="button"
                        onClick={() => void share()}
                        className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-raised text-[14.5px] font-semibold text-ink ${FOCUS}`}
                      >
                        <Share size={16} strokeWidth={2.2} />
                        {t("Share")}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                {t("{n} watching", { n: participants.length })}
              </span>
              <ul className="flex flex-wrap gap-2">
                {participants.map((p) => {
                  const self = p.id === clientId;
                  return (
                    <li key={p.id} className="flex items-center gap-2 rounded-full bg-elevated py-1 ps-1 pe-3.5">
                      <Avatar
                        name={p.name}
                        src={self ? selfAvatar : (p.avatar ?? null)}
                        color={self ? selfColor : (p.color ?? null)}
                        size={28}
                      />
                      <span className="max-w-[180px] truncate text-[14px] text-ink">{p.name}</span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <ChatPanel
              chat={chat}
              participants={snapshot.participants}
              clientId={clientId}
              selfAvatar={selfAvatar}
              selfColor={selfColor}
              onSend={sendChat}
            />

            {snapshot.hostClientId === clientId && <GuestPickToggle />}

            <button
              type="button"
              role="switch"
              aria-checked={settings.togetherShareCursors}
              onClick={() => update({ togetherShareCursors: !settings.togetherShareCursors })}
              className={`flex min-h-12 items-center justify-between gap-3 rounded-xl bg-elevated px-4 py-2 ${FOCUS}`}
            >
              <span className="flex items-center gap-2.5 text-[15px] text-ink">
                <MousePointer2 size={16} strokeWidth={2} className="text-ink-muted" />
                {t("Show cursors")}
              </span>
              <span
                aria-hidden
                className={`relative flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 ${
                  settings.togetherShareCursors ? "bg-accent" : "bg-raised"
                }`}
              >
                <span
                  className={`absolute h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200 ${
                    settings.togetherShareCursors ? "translate-x-[22px] rtl:-translate-x-[22px]" : "translate-x-[2px] rtl:-translate-x-[2px]"
                  }`}
                />
              </span>
            </button>

            <button
              type="button"
              onClick={leaveSession}
              className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-raised text-[15px] font-medium text-danger ${FOCUS}`}
            >
              <LogOut size={16} strokeWidth={2} />
              {t("Leave room")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
