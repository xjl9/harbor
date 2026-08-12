/**
 * Session-scoped shell state so the auto-reload after a WebContent process
 * kill lands the user back on the tab/view/scroll position they were at.
 * sessionStorage survives reloads but not app relaunches, which is exactly
 * the scope wanted here.
 */

const STORE_KEY = "harbor.mobile.restore.v1";
const WRITE_DELAY_MS = 400;
const RESTORE_TRIES = 20;
const RESTORE_INTERVAL_MS = 150;

type Persisted = {
  tab?: string;
  view?: string;
  scroll?: Record<string, number>;
};

function load(): Persisted {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Persisted;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const state: Persisted = load();
let writeTimer = 0;

function scheduleWrite(): void {
  if (writeTimer) return;
  writeTimer = window.setTimeout(() => {
    writeTimer = 0;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable: restore is best-effort.
    }
  }, WRITE_DELAY_MS);
}

function pick<T extends string>(value: string | undefined, valid: readonly T[]): T | undefined {
  return valid.includes(value as T) ? (value as T) : undefined;
}

export function restoredTab<T extends string>(valid: readonly T[]): T | undefined {
  return pick(state.tab, valid);
}

export function restoredView<T extends string>(valid: readonly T[]): T | undefined {
  return pick(state.view, valid);
}

export function noteTab(tab: string): void {
  state.tab = tab;
  scheduleWrite();
}

export function noteView(view: string): void {
  state.view = view;
  scheduleWrite();
}

export function noteScroll(key: string, top: number): void {
  (state.scroll ??= {})[key] = Math.round(top);
  scheduleWrite();
}

/**
 * Best-effort scrollTop restore. Content mounts async, so retry until the
 * scroller is tall enough to hold the target, and stand down as soon as the
 * user scrolls on their own. Returns a cancel function for unmount.
 */
export function restoreScroll(el: HTMLElement, key: string): () => void {
  const target = state.scroll?.[key] ?? 0;
  if (target <= 0) return () => {};
  let tries = 0;
  let timer = 0;
  const attempt = () => {
    timer = 0;
    if (el.scrollTop > 0) return;
    if (el.scrollHeight - el.clientHeight >= target) {
      el.scrollTop = target;
      return;
    }
    tries += 1;
    if (tries < RESTORE_TRIES) timer = window.setTimeout(attempt, RESTORE_INTERVAL_MS);
    else el.scrollTop = target;
  };
  attempt();
  return () => {
    if (timer) window.clearTimeout(timer);
  };
}
