import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { creditToMeta, tmdbPerson, type PersonCredit, type PersonDetail } from "@/lib/providers/tmdb";
import { useSettings } from "@/lib/settings";
import { MobileDetail } from "../mobile-detail";
import { GridTile } from "../mobile-catalog-page";
import { MobilePageShell, portalPage } from "./page-shell";

export type PersonRef = { id: number; name: string; profilePath?: string | null; note?: string };

function profileUrl(path: string | null | undefined, size: "w342" | "h632" = "w342"): string | undefined {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : undefined;
}

function creditsOf(p: PersonDetail): Meta[] {
  const pool: PersonCredit[] = p.knownForDepartment === "Acting" ? p.cast : [...p.crew, ...p.cast];
  const seen = new Set<number>();
  const out: PersonCredit[] = [];
  for (const c of pool) {
    if (!c.poster || seen.has(c.id)) continue;
    if (c.mediaType === "tv" && (c.episodeCount ?? 0) < 2 && p.knownForDepartment === "Acting") continue;
    seen.add(c.id);
    out.push(c);
  }
  out.sort(
    (a, b) =>
      (b.voteAverage || 0) * Math.log2(2 + (b.voteCount || 0)) -
      (a.voteAverage || 0) * Math.log2(2 + (a.voteCount || 0)),
  );
  return out.map(creditToMeta);
}

function age(birthday: string | null, deathday: string | null): number | null {
  if (!birthday) return null;
  const b = new Date(birthday);
  const end = deathday ? new Date(deathday) : new Date();
  if (Number.isNaN(b.getTime()) || Number.isNaN(end.getTime())) return null;
  let a = end.getFullYear() - b.getFullYear();
  const m = end.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && end.getDate() < b.getDate())) a -= 1;
  return a;
}

// Phone person page. The desktop person view is a full nav frame the phone shell
// does not render, so this is the surface the spotlight, brand and Top People
// rails open: portrait, bio, then the filmography as a grid of the same tiles
// every other phone grid uses, opening the shared detail sheet.
export function PersonSheet({ person, onClose }: { person: PersonRef; onClose: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [bioOpen, setBioOpen] = useState(false);
  const [meta, setMeta] = useState<Meta | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setFailed(false);
    if (!settings.tmdbKey) {
      setFailed(true);
      return;
    }
    tmdbPerson(settings.tmdbKey, person.id)
      .then((p) => {
        if (!alive) return;
        if (p) setDetail(p);
        else setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [person.id, settings.tmdbKey]);

  const credits = useMemo(() => (detail ? creditsOf(detail) : []), [detail]);
  const photo = profileUrl(detail?.profilePath ?? person.profilePath, "h632");
  const years = detail
    ? [detail.birthday?.slice(0, 4), detail.deathday ? detail.deathday.slice(0, 4) : null]
        .filter(Boolean)
        .join(" - ")
    : "";
  const personAge = detail ? age(detail.birthday, detail.deathday) : null;
  const dept = detail?.knownForDepartment ?? person.note ?? "";

  return portalPage(
    <MobilePageShell title={person.name} kicker={dept ? t(dept) : undefined} onBack={onClose}>
      <div className="flex flex-col gap-6 px-4 pt-2">
        <div className="flex items-start gap-4">
          <div className="w-[104px] shrink-0 overflow-hidden rounded-2xl bg-elevated ring-1 ring-edge-soft/60">
            {photo ? (
              <img src={photo} alt="" className="aspect-[3/4] w-full object-cover object-top" />
            ) : (
              <div className="aspect-[3/4] w-full bg-gradient-to-br from-elevated to-canvas" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
            <h2 className="font-display text-[24px] font-medium leading-[1.05] tracking-tight text-ink">
              {person.name}
            </h2>
            {years && (
              <span className="text-[13px] text-ink-muted">
                {years}
                {personAge != null && !detail?.deathday ? ` · ${t("{n} years old", { n: personAge })}` : ""}
              </span>
            )}
            {detail?.placeOfBirth && (
              <span className="line-clamp-2 text-[12.5px] text-ink-subtle">{detail.placeOfBirth}</span>
            )}
            {credits.length > 0 && (
              <span className="text-[12.5px] font-medium text-ink-muted">
                {t("{n} titles", { n: credits.length })}
              </span>
            )}
          </div>
        </div>
        {detail?.biography && (
          <button
            type="button"
            onClick={() => setBioOpen((v) => !v)}
            className={`text-start text-[13.5px] leading-relaxed text-ink-muted ${bioOpen ? "" : "line-clamp-4"}`}
          >
            {detail.biography}
          </button>
        )}
        {failed && !settings.tmdbKey && (
          <p className="rounded-2xl bg-elevated/50 px-4 py-3 text-[13px] text-ink-muted ring-1 ring-edge-soft/60">
            {t("Add a TMDB key to browse by this filter.")}
          </p>
        )}
        <section className="flex flex-col gap-3">
          <h3 className="font-display text-[19px] font-medium tracking-[-0.01em] text-ink">{t("Known for")}</h3>
          {detail === null && !failed ? (
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="harbor-skeleton aspect-[2/3] rounded-lg bg-elevated/40" />
              ))}
            </div>
          ) : credits.length === 0 ? (
            <p className="text-[13px] text-ink-subtle">{t("Nothing to show here right now.")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-x-3 gap-y-5 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5">
              {credits.map((m) => (
                <GridTile key={m.id} meta={m} onOpen={setMeta} />
              ))}
            </div>
          )}
        </section>
      </div>
      {meta && <MobileDetail meta={meta} onClose={() => setMeta(null)} />}
    </MobilePageShell>,
  );
}

// Compact portrait tile for people rails (brand faces, spotlight presenter).
export function PersonTile({
  person,
  onOpen,
  width = 108,
}: {
  person: PersonRef;
  onOpen: (p: PersonRef) => void;
  width?: number;
}) {
  const photo = profileUrl(person.profilePath);
  return (
    <button
      type="button"
      onClick={() => onOpen(person)}
      className="shrink-0 text-start"
      style={{ width }}
    >
      <span className="block aspect-[3/4] w-full overflow-hidden rounded-xl bg-elevated ring-1 ring-edge-soft/60">
        {photo ? (
          <img src={photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="block h-full w-full bg-gradient-to-br from-elevated to-canvas" />
        )}
      </span>
      <span className="mt-1.5 line-clamp-1 text-[12.5px] font-medium text-ink">{person.name}</span>
      {person.note && <span className="line-clamp-1 text-[11px] text-ink-subtle">{person.note}</span>}
    </button>
  );
}
