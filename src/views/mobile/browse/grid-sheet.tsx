import { useCallback, useState } from "react";
import { Film } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { MobileDetail } from "../mobile-detail";
import { MAX_PAGE, MobileCatalogGrid, TMDB_PAGE_SIZE, type CatalogFetch } from "../mobile-catalog-page";
import { MobilePageShell, portalPage } from "./page-shell";

export type GridFetcher = (page: number) => Promise<Meta[]>;

// Adapts a desktop-style row fetcher (page -> metas) to the phone grid's
// (page -> { metas, more }) contract. A short page means the catalog ran out.
export function pagedFetch(fetcher: GridFetcher, pageSize = TMDB_PAGE_SIZE, maxPage = MAX_PAGE): CatalogFetch {
  return (page) =>
    fetcher(page).then((metas) => ({
      metas,
      more: metas.length >= pageSize && page < maxPage,
    }));
}

// See-all page behind every rail chevron: the desktop GridView, on the phone.
export function MobileGridSheet({
  title,
  kicker,
  fetcher,
  initial,
  pageSize,
  onClose,
}: {
  title: string;
  kicker?: string;
  fetcher: GridFetcher;
  initial?: Meta[];
  pageSize?: number;
  onClose: () => void;
}) {
  const t = useT();
  const [meta, setMeta] = useState<Meta | null>(null);
  const fetchPage = useCallback<CatalogFetch>(
    (page) => {
      // The rail already holds page one; reuse it so the grid opens instantly
      // and the second page is the first network hit.
      if (page === 1 && initial && initial.length > 0) {
        return Promise.resolve({ metas: initial, more: true });
      }
      return pagedFetch(fetcher, pageSize)(page);
    },
    [fetcher, initial, pageSize],
  );
  return portalPage(
    <MobilePageShell title={title} kicker={kicker} onBack={onClose}>
      <div className="pt-2">
        <MobileCatalogGrid
          fetchPage={fetchPage}
          resetKey={title}
          enabled
          initialPages={initial && initial.length > 0 ? 1 : 2}
          emptyState={
            <div className="flex min-h-[42vh] flex-col items-center justify-center gap-4 px-8 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated/60 text-ink-subtle ring-1 ring-edge-soft/60">
                <Film size={26} strokeWidth={1.8} />
              </span>
              <h2 className="font-display text-[19px] font-medium text-ink">{t("Nothing to show yet")}</h2>
            </div>
          }
          onOpenDetail={setMeta}
        />
      </div>
      {meta && <MobileDetail meta={meta} onClose={() => setMeta(null)} />}
    </MobilePageShell>,
  );
}
