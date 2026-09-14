import { useState } from "react";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { HARBOR_PUBLIC_RELAY, isPublicRelay } from "@/lib/together/relay-version";
import { useRelayHealth } from "@/views/settings/relay-panel/use-relay-health";
import { RelayDocs } from "@/views/settings/relay-docs";
import { SetIcon } from "@/views/settings/set-icon";
import { ConfirmSheet, Group, InputSheet, PhonePage, Row, Rows } from "./phone-kit";

// Account > Harbor Relay from desktop settings (views/settings/relay-panel.tsx)
// minus the Cloudflare deploy, which needs the desktop build. The phone can use
// Harbor's public relay, paste a relay URL a friend shared, test it, copy it,
// and read the self-hosting docs.
export function RelayPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const url = settings.togetherRelayUrl;
  const { testing, testResult, runTest, passive } = useRelayHealth(url);
  const [urlOpen, setUrlOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasUrl = !!url;
  const isPub = hasUrl && isPublicRelay(url);
  const status = !hasUrl
    ? t("Not set")
    : !passive
      ? t("Checking…")
      : !passive.reachable
        ? t("Unreachable")
        : passive.needsUpdate
          ? t("Needs update")
          : t("Live");

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (docsOpen) {
    return (
      <PhonePage kicker={t("Harbor Relay")} title={t("Run your own relay")} onClose={() => setDocsOpen(false)}>
        <div className="hset-phone-docs">
          <RelayDocs onBack={() => setDocsOpen(false)} />
        </div>
      </PhonePage>
    );
  }

  return (
    <PhonePage kicker={t("Account")} title={t("Harbor Relay")} onClose={onClose}>
      <Group
        note={
          isPub
            ? t("Watch Together rooms are routed through Harbor's hosted relay.")
            : hasUrl
              ? t("Watch Together rooms are routed through your own relay.")
              : t("Watch Together needs a relay. Use Harbor's public one or paste a relay URL.")
        }
      >
        <Rows>
          <Row
            icon={<SetIcon name="RelaySettings" size={20} />}
            label={t("Relay")}
            sub={hasUrl ? <span className="break-all font-mono" dir="ltr">{url}</span> : undefined}
            value={status}
            dot={passive?.reachable && !passive.needsUpdate ? "ok" : null}
          />
          {hasUrl && (
            <Row
              icon={<SetIcon name="Activity" size={20} />}
              label={t("Test connection")}
              sub={
                testResult
                  ? testResult.ok
                    ? t("Reachable. Version {version}.", {
                        version: testResult.workerVersion != null ? String(testResult.workerVersion) : t("unknown"),
                      })
                    : testResult.message
                  : undefined
              }
              busy={testing}
              onClick={() => void runTest()}
            />
          )}
          {hasUrl && (
            <Row
              icon={<SetIcon name="Copy" size={20} />}
              label={copied ? t("Copied") : t("Copy relay URL")}
              onClick={() => void copy()}
            />
          )}
        </Rows>
      </Group>

      <Group title={t("Get a relay")}>
        <Rows>
          <Row
            icon={<SetIcon name="Sailboat" size={20} />}
            label={t("Harbor's public relay")}
            sub={t("A relay we run. Nothing to set up, and it stays current on its own.")}
            dot={isPub ? "ok" : null}
            onClick={() => update({ togetherRelayUrl: HARBOR_PUBLIC_RELAY })}
          />
          <Row
            icon={<SetIcon name="Link2" size={20} />}
            label={t("Use an existing relay")}
            sub={t("Paste a wss:// URL that a friend or your community shared with you.")}
            onClick={() => setUrlOpen(true)}
          />
          <Row
            icon={<SetIcon name="Power" size={20} />}
            label={t("Deploy a relay (desktop only)")}
            sub={t("Relay deployment requires the Cloudflare API, which is unavailable to browser clients. Use the desktop build to deploy a Worker, then enter the resulting URL below.")}
          />
        </Rows>
      </Group>

      <Group title={t("Documentation")}>
        <Rows>
          <Row
            icon={<SetIcon name="BookOpen" size={20} />}
            label={t("Run your own relay")}
            sub={t("Overview, manual wrangler deploy, costs, and troubleshooting.")}
            onClick={() => setDocsOpen(true)}
          />
          {hasUrl && (
            <Row
              icon={<SetIcon name="X" size={20} />}
              label={t("Clear relay")}
              danger
              onClick={() => setConfirmClear(true)}
            />
          )}
        </Rows>
      </Group>

      {urlOpen && (
        <InputSheet
          title={t("Use an existing relay")}
          hint={t("Paste a wss:// URL that a friend or your community shared with you.")}
          initial={isPub ? "" : url}
          placeholder="wss://"
          inputMode="url"
          onSave={(v) => {
            const next = v.trim();
            if (next) update({ togetherRelayUrl: next });
            setUrlOpen(false);
          }}
          onClose={() => setUrlOpen(false)}
        />
      )}
      {confirmClear && (
        <ConfirmSheet
          title={t("Clear relay")}
          message={t("Watch Together will not work until a relay is set again.")}
          confirmLabel={t("Clear relay")}
          danger
          onClose={() => setConfirmClear(false)}
          onConfirm={() => {
            update({ togetherRelayUrl: "" });
            setConfirmClear(false);
          }}
        />
      )}
    </PhonePage>
  );
}
