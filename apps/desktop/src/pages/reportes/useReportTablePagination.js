import { useEffect, useMemo, useState } from 'react';
import { GLOBAL_PAGE_SIZE } from '../../constants/pagination';

export function useReportTablePagination(rows = [], pageSize = GLOBAL_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const totalRecords = Array.isArray(rows) ? rows.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  useEffect(() => {
    setPage((prev) => Math.min(Math.max(prev, 1), totalPages));
  }, [totalPages]);

  const pagedRows = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [page, pageSize, rows, totalPages]);

  return {
    page,
    setPage,
    totalPages,
    totalRecords,
    pagedRows
  };
}
