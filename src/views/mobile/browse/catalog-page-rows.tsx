import { useMemo, useState, type ReactNode } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import {
  applyPageRows,
  hasPageRowChanges,
  movePageRow,
  renamePageRow,
  resetPageRows,
  togglePageRowHidden,
  usePageRows,
} from "@/lib/page-rows";
import { MobileRail, MobileRankRail } from "../mobile-rail";
import { CustomizePill, CustomizeSheet } from "./customize-sheet";
import { MobileGridSheet, type GridFetcher } from "./grid-sheet";

export type PageRow = {
  key: string;
  title: string;
  metas: Meta[];
  fetcher?: GridFetcher;
  variant?: "rank";
  // Built-in titles are translation keys; user-named rows (collections) are not.
  translate?: boolean;
};

// Movies and Shows share the desktop CatalogRows contract: rows honour the
// per-page customization (harbor.pageRows.<page>: order, hidden, renamed) the
// desktop Customize page bar writes, and every rail's chevron opens the full
// paged grid for that row.
export function CatalogPageRows({
  page,
  rows,
  customizeTitle,
  onOpenDetail,
  before,
}: {
  page: string;
  rows: PageRow[];
  customizeTitle: string;
  onOpenDetail: (m: Meta) => void;
  // Content placed between the customize pill and the rows (Shows' resume row).
  before?: ReactNode;
}) {
  const t = useT();
  const pageRows = usePageRows(page);
  const { custom, persist } = pageRows;
  const [grid, setGrid] = useState<{ title: string; fetcher: GridFetcher; initial: Meta[] } | null>(null);
  const [open, setOpen] = useState(false);
  const keys = useMemo(() => rows.map((r) => r.key), [rows]);
  const visible = useMemo(() => applyPageRows(rows, custom, false), [rows, custom]);
  const all = useMemo(() => applyPageRows(rows, custom, true), [rows, custom]);
  const label = (r: PageRow) => (r.key in custom.renamed || r.translate === false ? r.title : t(r.title));

  return (
    <>
      <div className="-mt-3 flex justify-end px-4">
        <CustomizePill label={t("Customize page")} onClick={() => setOpen(true)} />
      </div>
      {before}
      {visible.map((r) => {
        const seeAll = r.fetcher ? () => setGrid({ title: label(r), fetcher: r.fetcher!, initial: r.metas }) : undefined;
        return r.variant === "rank" ? (
          <MobileRankRail key={r.key} title={label(r)} metas={r.metas} onSeeAll={seeAll} onOpenDetail={onOpenDetail} />
        ) : (
          <MobileRail key={r.key} title={label(r)} metas={r.metas.slice(0, 20)} onSeeAll={seeAll} onOpenDetail={onOpenDetail} />
        );
      })}
      {grid && (
        <MobileGridSheet
          title={grid.title}
          fetcher={grid.fetcher}
          initial={grid.initial.length >= 20 ? grid.initial : undefined}
          onClose={() => setGrid(null)}
        />
      )}
      {open && (
        <CustomizeSheet
          title={customizeTitle}
          rows={all.map((r) => ({
            key: r.key,
            name: label(r),
            hidden: custom.hidden.includes(r.key),
            renamed: r.key in custom.renamed,
          }))}
          hasChanges={hasPageRowChanges(custom)}
          onMove={(k, d) => persist(movePageRow(custom, keys, k, d))}
          onToggleHidden={(k) => persist(togglePageRowHidden(custom, k))}
          onRename={(k, v) => persist(renamePageRow(custom, k, v))}
          onReset={() => persist(resetPageRows())}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function listPager(list: Meta[], size = 30): GridFetcher {
  return (page) => Promise.resolve(list.slice((page - 1) * size, page * size));
}
