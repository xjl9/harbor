import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/together-modal/avatar";
import { ChatPanel } from "@/components/together-modal/chat-panel";
import { useT } from "@/lib/i18n";
import type { ChatMessage } from "@/lib/together/provider";
import { useTogether } from "@/lib/together/provider";
import { useSelfIdentity } from "@/lib/together/use-self-identity";
import { MobileSheet } from "./mobile-sheet";

// Watch Together inside the phone player. The desktop room overlays (avatar dock,
// chat stream) anchor to screen corners 24px in, which on a phone is exactly
// where the top bar and the scrubber live, so the overlay layer hides them on
// phone and the shell renders these instead: an avatar stack in the top bar that
// opens the chat as a bottom sheet, and a short-lived toast for a new message
// while the chrome is down.

export function useMobileRoom() {
  const { snapshot, chat, clientId } = useTogether();
  const inRoom = snapshot.state === "joined" && !!snapshot.room;
  return {
    inRoom,
    participants: snapshot.participants,
    hostId: snapshot.hostClientId,
    clientId,
    chat,
  };
}

// Messages from other people that arrived while the chat sheet was closed.
export function useUnreadChat(chat: ChatMessage[], clientId: string, sheetOpen: boolean): number {
  const seen = useRef(chat.length);
  const [, bump] = useState(0);
  useEffect(() => {
    if (sheetOpen) {
      seen.current = chat.length;
      bump((n) => n + 1);
    }
  }, [sheetOpen, chat.length]);
  if (chat.length < seen.current) seen.current = chat.length;
  return chat.slice(seen.current).filter((m) => m.from !== clientId).length;
}

export function MobileRoomButton({ onOpen, unread }: { onOpen: () => void; unread: number }) {
  const t = useT();
  const { participants, clientId } = useMobileRoom();
  const { avatar: selfAvatar, color: selfColor } = useSelfIdentity();
  const shown = participants.slice(0, 3);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={unread > 0 ? `${t("Chat")} (${unread})` : t("Chat")}
      className="relative flex h-11 shrink-0 items-center rounded-full px-1.5 active:bg-white/10"
    >
      <span className="flex items-center">
        {shown.map((p, i) => {
          const self = p.id === clientId;
          return (
            <span
              key={p.id}
              className={`rounded-full ring-2 ring-black/60 ${i > 0 ? "-ms-2" : ""}`}
              style={{ zIndex: shown.length - i }}
            >
              <Avatar
                name={p.name}
                src={self ? selfAvatar : (p.avatar ?? null)}
                color={self ? selfColor : (p.color ?? null)}
                size={26}
              />
            </span>
          );
        })}
      </span>
      {participants.length > shown.length && (
        <span className="ms-1 font-jakarta text-[11px] font-semibold tabular-nums text-ink-muted">
          +{participants.length - shown.length}
        </span>
      )}
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute end-0.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold tabular-nums text-canvas"
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

export function MobileChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { snapshot, chat, clientId, sendChat } = useTogether();
  const { avatar: selfAvatar, color: selfColor } = useSelfIdentity();
  const participants = snapshot.participants.slice().sort((a, b) => a.joinedAt - b.joinedAt);
  return (
    <MobileSheet open={open} onClose={onClose} title={t("Watch together")} heightClass="max-h-[80vh]">
      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
            {t("{n} watching", { n: participants.length })}
          </span>
          <ul className="flex flex-wrap gap-1.5">
            {participants.map((p) => {
              const self = p.id === clientId;
              return (
                <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-raised py-1 ps-1 pe-3">
                  <Avatar
                    name={p.name}
                    src={self ? selfAvatar : (p.avatar ?? null)}
                    color={self ? selfColor : (p.color ?? null)}
                    size={24}
                  />
                  <span className="max-w-[140px] truncate text-[13px] text-ink">
                    {p.name}
                    {p.id === snapshot.hostClientId ? ` · ${t("Host")}` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <ChatPanel
          chat={chat}
          participants={snapshot.participants}
          clientId={clientId}
          selfAvatar={selfAvatar}
          selfColor={selfColor}
          onSend={sendChat}
        />
      </div>
    </MobileSheet>
  );
}

const TOAST_MS = 5000;

// The newest message from someone else, for a few seconds, centred under the top
// bar. Suppressed while the chat sheet is open, where it is already on screen.
export function MobileChatToast({ suppressed }: { suppressed: boolean }) {
  const { inRoom, chat, clientId } = useMobileRoom();
  const [shown, setShown] = useState<ChatMessage | null>(null);
  const last = chat.length > 0 ? chat[chat.length - 1] : null;
  useEffect(() => {
    if (!last || last.from === clientId || Date.now() - last.at > TOAST_MS) return;
    setShown(last);
    const id = window.setTimeout(() => setShown(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [last, clientId]);
  if (!inRoom || suppressed || !shown) return null;
  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 z-30 flex max-w-[min(420px,calc(100vw-40px))] -translate-x-1/2 items-start gap-2 rounded-2xl border border-white/10 bg-black/65 px-3 py-2 backdrop-blur-xl animate-fade-in"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 60px)" }}
    >
      <span className="shrink-0 text-[12px] font-semibold text-white/60">{shown.name}</span>
      <span className="min-w-0 break-words text-[13.5px] leading-snug text-white">{shown.text}</span>
    </div>
  );
}
