import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { Search } from "@/components/icons/search-icon";
import { AVATAR_CATALOG, avatarUrl } from "@/lib/avatars/catalog";
import { flattenAvatar, loadPersonBg } from "@/lib/avatars/flatten";
import { UPLOADS_ID, useAvatarPacks } from "@/lib/avatars/packs";
import { useT } from "@/lib/i18n";
import { FOCUS, PhonePage } from "./phone-kit";

type Item = { key: string; name: string; value: string; transparent?: boolean };
type ViewGroup = { id: string; label: string; transparent?: boolean; items: Item[] };

// The same catalog the desktop AvatarCatalogModal shows (Harbor originals plus
// any packs imported on this device), laid out as a phone page: a search field,
// a scrolling strip of group chips, and a grid of 44pt+ tiles. Pack import and
// export stay on desktop; they are file-system flows.
export function AvatarCatalogSheet({
  current,
  onPick,
  onClose,
}: {
  current?: string | null;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const packs = useAvatarPacks();
  const [q, setQ] = useState("");
  const [section, setSection] = useState("all");
  const personBg = useMemo(loadPersonBg, []);

  const groups = useMemo<ViewGroup[]>(() => {
    const catalog = AVATAR_CATALOG.map((g) => ({
      id: g.group,
      label: g.group,
      transparent: g.transparent,
      items: g.items.map((it) => ({
        key: it.id,
        name: it.name,
        value: avatarUrl(it.id),
        transparent: g.transparent,
      })),
    }));
    const packGroups = [...packs]
      .sort((a, b) =>
        a.id === UPLOADS_ID ? -1 : b.id === UPLOADS_ID ? 1 : a.createdAt - b.createdAt,
      )
      .map((p) => ({
        id: p.id,
        label: p.name,
        items: p.items.map((it) => ({ key: it.id, name: it.name, value: it.data })),
      }));
    return [...catalog, ...packGroups];
  }, [packs]);

  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);
  const query = q.trim().toLowerCase();
  const results = useMemo(
    () =>
      query
        ? groups.flatMap((g) => g.items).filter((it) => it.name.toLowerCase().includes(query))
        : null,
    [groups, query],
  );
  const shown = results
    ? [{ id: "search", label: t("Search"), items: results }]
    : section === "all"
      ? groups
      : groups.filter((g) => g.id === section);

  const pick = async (item: Item) => {
    if (item.transparent) {
      try {
        onPick(await flattenAvatar(item.value, personBg));
        return;
      } catch {
        /* fall back to the raw value */
      }
    }
    onPick(item.value);
  };

  return (
    <PhonePage kicker={t("{n} avatars", { n: total })} title={t("Choose an avatar")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-edge-soft/70 bg-elevated/40 px-4 focus-within:border-accent">
          <Search size={16} className="shrink-0 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Search")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none"
          />
        </label>
        {!results && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Chip on={section === "all"} onClick={() => setSection("all")}>
              {t("All")}
            </Chip>
            {groups.map((g) => (
              <Chip key={g.id} on={section === g.id} onClick={() => setSection(g.id)}>
                {g.label}
                <span className="ms-1.5 text-[11px] tabular-nums opacity-60">{g.items.length}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 || (results && results.length === 0) ? (
        <p className="py-16 text-center text-[13.5px] text-ink-subtle">{t("No matches.")}</p>
      ) : (
        shown.map((g) => (
          <section key={g.id} className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-ink-subtle">
                {g.label}
              </h3>
              <span className="text-[11px] tabular-nums text-ink-subtle/70">{g.items.length}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-3">
              {g.items.map((it) => {
                const selected = current === it.value;
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => void pick(it)}
                    aria-label={it.name}
                    aria-pressed={selected}
                    className={`relative aspect-square overflow-hidden rounded-full ring-1 transition-transform active:scale-95 ${FOCUS} ${
                      selected ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : "ring-edge-soft/60"
                    }`}
                    style={{ background: it.transparent ? personBg : undefined }}
                  >
                    <img
                      src={it.value}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                    {selected && (
                      <span className="absolute bottom-0.5 end-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-canvas ring-2 ring-canvas">
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </PhonePage>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors ${FOCUS} ${
        on ? "border-ink bg-ink text-canvas" : "border-edge-soft/70 bg-elevated/40 text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}
