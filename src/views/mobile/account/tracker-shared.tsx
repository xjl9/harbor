import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import anilistLogo from "@/assets/anilist.png";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import malLogo from "@/assets/mal.png";
import simklLogo from "@/assets/simkl.png";
import traktLogo from "@/assets/trakt.svg";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { SetIcon } from "@/views/settings/set-icon";
import { BottomSheet, FOCUS, Notice, PillButton, Row } from "./phone-kit";

export type TrackerId = "trakt" | "simkl" | "anilist" | "mal" | "letterboxd";

// Same order, names and logos as the desktop Trackers sub-tabs
// (views/settings/trackers-panel.tsx). trakt.svg is the flat mark the desktop
// sidebar uses; trakt.png is the round tile art for the hero.
export const TRACKERS: ReadonlyArray<{ id: TrackerId; name: string; logo: string; website: string }> = [
  { id: "trakt", name: "Trakt", logo: traktLogo, website: "https://trakt.tv" },
  { id: "simkl", name: "Simkl", logo: simklLogo, website: "https://simkl.com" },
  { id: "anilist", name: "AniList", logo: anilistLogo, website: "https://anilist.co" },
  { id: "mal", name: "MyAnimeList", logo: malLogo, website: "https://myanimelist.net" },
  { id: "letterboxd", name: "Letterboxd", logo: letterboxdLogo, website: "https://letterboxd.com" },
];

/* Not-connected hero: logo tile, blurb, Connect and About, matching
   views/settings/tracker-connect.tsx stacked for a phone. */
export function TrackerHero({
  logo,
  service,
  blurb,
  website,
  onConnect,
  connectLabel,
}: {
  logo: string;
  service: string;
  blurb: string;
  website: string;
  onConnect: () => void;
  connectLabel?: string;
}) {
  const t = useT();
  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <span className="grid h-[84px] w-[84px] place-items-center rounded-[22px] bg-elevated ring-1 ring-white/[0.06]">
        <img src={logo} alt="" draggable={false} className="h-11 w-11 object-contain" />
      </span>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[24px] font-medium tracking-tight text-ink">{service}</h2>
        <p className="max-w-[40ch] text-[14px] leading-relaxed text-ink-muted">{blurb}</p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <PillButton variant="primary" full onClick={onConnect}>
          {connectLabel ?? t("Connect {service}", { service })}
        </PillButton>
        <button
          type="button"
          onClick={() => openUrl(website)}
          className={`flex min-h-11 items-center justify-center gap-1.5 text-[13px] font-medium text-ink-subtle ${FOCUS}`}
        >
          {t("About {service}", { service })}
          <ExternalLink size={13} />
        </button>
      </div>
    </section>
  );
}

/* Connected identity: avatar with the service mark, @handle, meta line,
   Open profile and Disconnect (views/settings/tracker-identity.tsx). */
export function TrackerIdentityCard({
  logo,
  service,
  handle,
  avatar,
  meta,
  profileUrl,
  onDisconnect,
}: {
  logo: string;
  service: string;
  handle?: string | null;
  avatar?: string | null;
  meta?: string;
  profileUrl?: string;
  onDisconnect: () => void;
}) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [avatar]);
  const showAvatar = !!avatar && !broken;
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex items-center gap-4">
        <span className="relative block h-14 w-14 shrink-0">
          <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-canvas">
            {showAvatar ? (
              <img
                src={avatar}
                alt=""
                draggable={false}
                onError={() => setBroken(true)}
                className="h-14 w-14 object-cover"
              />
            ) : (
              <img src={logo} alt="" draggable={false} className="h-7 w-7 object-contain" />
            )}
          </span>
          {showAvatar && (
            <span className="absolute -bottom-0.5 -end-0.5 grid h-6 w-6 place-items-center rounded-full bg-elevated ring-2 ring-elevated">
              <img src={logo} alt="" draggable={false} className="h-4 w-4 object-contain" />
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[17px] font-semibold leading-tight tracking-tight text-ink" dir="ltr">
            {handle ? `@${handle}` : t("Connected")}
          </span>
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-subtle">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
            <span className="truncate">{meta ? `${service} · ${meta}` : service}</span>
          </span>
        </span>
      </div>
      <div className="flex gap-2.5">
        {profileUrl && (
          <PillButton full onClick={() => openUrl(profileUrl)}>
            {t("Open profile")}
            <ExternalLink size={14} strokeWidth={2.2} />
          </PillButton>
        )}
        <PillButton full variant="danger" onClick={onDisconnect}>
          <SetIcon name="LogOut" size={16} />
          {t("Disconnect")}
        </PillButton>
      </div>
    </div>
  );
}

/* "n waiting to sync" line under a tracker. The queues live in localStorage
   per profile and flush on the next online event; neither surface showed
   them before. */
export function PendingSyncRow({ count }: { count: number }) {
  const t = useT();
  return (
    <Row
      icon={<SetIcon name={count > 0 ? "CloudOff" : "RefreshCw"} size={20} />}
      label={count > 0 ? t("Waiting to sync") : t("Everything is synced")}
      sub={
        count > 0
          ? t("Plays recorded offline are sent the next time this device is online.")
          : t("Nothing is queued on this device.")
      }
      value={count > 0 ? String(count) : undefined}
    />
  );
}

type CodeState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "awaiting"; userCode: string; verificationUrl: string; openUrl: string }
  | { kind: "expired" }
  | { kind: "denied" }
  | { kind: "error"; message: string }
  | { kind: "success"; username: string | null };

/* Device-code sheet for Trakt and Simkl: the logic of TraktDeviceModal and
   SimklDeviceModal (request a code, open the site, copy the code, poll until
   authorized) in a bottom sheet with 44pt targets. */
export function DeviceCodeSheet({
  service,
  host,
  state,
  beginConnect,
  cancelConnect,
  onClose,
}: {
  service: string;
  host: string;
  state: CodeState;
  beginConnect: () => void;
  cancelConnect: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (state.kind === "idle") beginConnect();
  }, [state.kind, beginConnect]);

  const finish = useCallback(() => {
    if (!doneRef.current) cancelConnect();
    onClose();
  }, [cancelConnect, onClose]);

  useEffect(() => {
    if (state.kind !== "success") return;
    doneRef.current = true;
    const id = setTimeout(onClose, 1400);
    return () => clearTimeout(id);
  }, [state.kind, onClose]);

  const copy = async () => {
    if (state.kind !== "awaiting") return;
    try {
      await navigator.clipboard.writeText(state.userCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  const retryable = state.kind === "expired" || state.kind === "denied" || state.kind === "error";

  return (
    <BottomSheet
      title={state.kind === "success" ? t("Connected") : t("Authorize Harbor on {service}", { service })}
      ariaLabel={t("Connect {service}", { service })}
      onClose={finish}
      footer={
        retryable ? (
          <>
            <PillButton full onClick={finish}>
              {t("Cancel")}
            </PillButton>
            <PillButton full variant="primary" onClick={beginConnect}>
              {t("Try again")}
            </PillButton>
          </>
        ) : state.kind === "awaiting" ? (
          <PillButton full onClick={finish}>
            {t("Cancel")}
          </PillButton>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {(state.kind === "starting" || state.kind === "idle") && (
          <Spinner label={t("Requesting code from {service}…", { service })} />
        )}
        {state.kind === "awaiting" && (
          <>
            <Step label={t("Step 1 · Open {service}", { service })}>
              <button
                type="button"
                onClick={() => openUrl(state.openUrl)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-canvas px-4 text-start transition-colors active:bg-raised ${FOCUS}`}
              >
                <span className="truncate font-mono text-[13px] tracking-tight text-ink-muted" dir="ltr">
                  {state.verificationUrl}
                </span>
                <ExternalLink size={14} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
              </button>
            </Step>
            <Step label={t("Step 2 · Enter this code")}>
              <button
                type="button"
                onClick={() => void copy()}
                className={`flex w-full items-center justify-between gap-4 rounded-xl bg-canvas px-5 py-4 transition-colors active:bg-raised ${FOCUS}`}
              >
                <span className="font-mono text-[26px] font-semibold tracking-[0.18em] text-ink" dir="ltr">
                  {state.userCode}
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                  {copied ? (
                    <>
                      <Check size={13} strokeWidth={2.4} />
                      {t("Copied")}
                    </>
                  ) : (
                    <>
                      <Copy size={13} strokeWidth={2.2} />
                      {t("Copy")}
                    </>
                  )}
                </span>
              </button>
            </Step>
            <Spinner label={t("Waiting for you to authorize on {host}…", { host })} />
          </>
        )}
        {state.kind === "success" && (
          <Notice tone="ok">
            {state.username
              ? t("Connected as {username}", { username: state.username })
              : t("Connected to {service}", { service })}
          </Notice>
        )}
        {state.kind === "expired" && (
          <ErrorBox
            title={t("Code expired")}
            message={t("The authorization code timed out before you finished. Try again.")}
          />
        )}
        {state.kind === "denied" && (
          <ErrorBox
            title={t("Access denied")}
            message={t("{service} reported that authorization was denied. Try again if this was unintentional.", { service })}
          />
        )}
        {state.kind === "error" && (
          <ErrorBox title={t("Couldn't reach {service}", { service })} message={state.message} />
        )}
      </div>
    </BottomSheet>
  );
}

type PasteState =
  | { kind: "idle" }
  | { kind: "needs-code" }
  | { kind: "verifying" }
  | { kind: "error"; message: string }
  | { kind: "success"; username: string | null };

/* Paste-a-code sheet for AniList and MyAnimeList (the logic of
   AnilistConnectModal / MalConnectModal). The provider opens the site; the
   user approves Harbor there and pastes what it shows here. */
export function PasteCodeSheet({
  service,
  hint,
  placeholder,
  state,
  beginConnect,
  submitCode,
  cancelConnect,
  onClose,
}: {
  service: string;
  hint: string;
  placeholder: string;
  state: PasteState;
  beginConnect: () => void;
  submitCode: (code: string) => void;
  cancelConnect: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState("");
  const started = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    beginConnect();
  }, [beginConnect]);

  const finish = useCallback(() => {
    if (!doneRef.current) cancelConnect();
    onClose();
  }, [cancelConnect, onClose]);

  useEffect(() => {
    if (state.kind !== "success") return;
    doneRef.current = true;
    const id = setTimeout(onClose, 1400);
    return () => clearTimeout(id);
  }, [state.kind, onClose]);

  const heading =
    state.kind === "success"
      ? t("Connected")
      : state.kind === "verifying"
        ? t("Verifying")
        : t("Authorize Harbor on {service}", { service });

  return (
    <BottomSheet
      title={heading}
      ariaLabel={t("Connect {service}", { service })}
      onClose={finish}
      footer={
        state.kind === "needs-code" ? (
          <>
            <PillButton full onClick={beginConnect}>
              {t("Open {service} again", { service })}
              <ExternalLink size={12} strokeWidth={2.2} />
            </PillButton>
            <PillButton full variant="primary" disabled={!draft.trim()} onClick={() => submitCode(draft)}>
              {t("Connect")}
            </PillButton>
          </>
        ) : state.kind === "error" ? (
          <>
            <PillButton full onClick={finish}>
              {t("Cancel")}
            </PillButton>
            <PillButton full variant="primary" onClick={beginConnect}>
              {t("Try again")}
            </PillButton>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 pt-2">
        {state.kind === "idle" && <Spinner label={t("Opening {service}...", { service })} />}
        {state.kind === "needs-code" && (
          <>
            <p className="text-[13px] leading-relaxed text-ink-muted">{hint}</p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={placeholder}
              autoFocus
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              rows={4}
              className="resize-none rounded-xl bg-canvas px-4 py-3 font-mono text-[14px] leading-relaxed text-ink outline-none placeholder:font-sans placeholder:text-ink-subtle/55 focus:ring-1 focus:ring-accent"
            />
          </>
        )}
        {state.kind === "verifying" && <Spinner label={t("Checking with {service}...", { service })} />}
        {state.kind === "success" && (
          <Notice tone="ok">
            {state.username
              ? t("Connected as {username}", { username: state.username })
              : t("Connected to {service}", { service })}
          </Notice>
        )}
        {state.kind === "error" && (
          <ErrorBox title={t("Couldn't connect to {service}", { service })} message={state.message} />
        )}
      </div>
    </BottomSheet>
  );
}

function Step({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-ink-subtle">{label}</span>
      {children}
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-[13px] text-ink-muted">
      <Loader2 size={14} className="shrink-0 animate-spin" />
      {label}
    </p>
  );
}

function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-canvas px-4 py-3.5">
      <span className="text-[13.5px] font-semibold text-danger">{title}</span>
      <span className="text-[12.5px] leading-relaxed text-ink-muted">{message}</span>
    </div>
  );
}
