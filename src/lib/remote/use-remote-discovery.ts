import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { isMobileNative } from "@/lib/platform";
import type { DiscoveredHost } from "./protocol";

/**
 * Browse the LAN for other Harbor hosts (desktop/TV) advertising over mDNS so the
 * phone can connect without a typed IP. Native-only: the command exists on the
 * Android/iOS build; on web it is a no-op and callers fall back to manual entry.
 *
 * `active` drives an automatic scan (e.g. when the connect sheet opens); `rescan`
 * lets the user trigger another sweep. Discovery is best-effort and never throws
 * to the UI, so an empty result (blocked iOS multicast, no peers) is a normal
 * state, not an error.
 */
export function useRemoteDiscovery(active: boolean) {
  const [hosts, setHosts] = useState<DiscoveredHost[]>([]);
  const [scanning, setScanning] = useState(false);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const rescan = useCallback(async () => {
    if (!isMobileNative()) return;
    if (runningRef.current) return;
    runningRef.current = true;
    setScanning(true);
    try {
      const found = await invoke<DiscoveredHost[]>("remote_discover", { timeoutMs: 2500 });
      if (mountedRef.current) setHosts(Array.isArray(found) ? found : []);
    } catch {
      // Discovery is optional; manual entry stays available on failure.
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setScanning(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (active) void rescan();
  }, [active, rescan]);

  return { hosts, scanning, rescan };
}
