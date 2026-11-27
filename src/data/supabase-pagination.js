/**
 * @file #485 — deterministic PostgREST pagination for full-table reads.
 * PostgREST silently caps an unpaginated select at max_rows (Supabase default
 * 1,000), so live pulls dropped rows past the first 1,000. Every page orders by
 * `id` (the uuid primary key of every synced table) so OFFSET pages never skip
 * or repeat rows — the #476 backup-export pattern.
 */

export const PAGE_SIZE = 1000;
/** Defensive cap: 1,000 pages × 1,000 rows. A server that keeps returning full pages stops here. */
export const MAX_PAGES = 1000;

/**
 * Read every row of a query, one ordered page at a time.
 * Stops on the first short page (fewer than pageSize rows, including empty).
 * @param {() => object} buildQuery returns a fresh filtered select builder (no order/range)
 * @param {{ pageSize?: number, maxPages?: number, isCurrent?: () => boolean }} [options]
 *   isCurrent is checked after every page; once false, fetching stops and no rows are returned.
 * @returns {Promise<{ data: object[]|null, error: {message: string}|null, offset?: number, pages: number, superseded?: true, capped?: true }>}
 *   On error / superseded / cap, `data` is null so a caller can never merge a partial table.
 */
export async function fetchAllPages(buildQuery, { pageSize = PAGE_SIZE, maxPages = MAX_PAGES, isCurrent } = {}) {
  const rows = [];
  for (let page = 0; page < maxPages; page++) {
    const offset = page * pageSize;
    const { data, error } = await buildQuery()
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (isCurrent && !isCurrent()) return { data: null, error: null, superseded: true, offset, pages: page + 1 };
    if (error) return { data: null, error, offset, pages: page + 1 };
    const batch = data || [];
    for (const row of batch) rows.push(row);
    if (batch.length < pageSize) return { data: rows, error: null, pages: page + 1 };
  }
  return {
    data: null,
    error: { message: `pagination cap reached (${maxPages} pages of ${pageSize} rows)` },
    capped: true,
    offset: maxPages * pageSize,
    pages: maxPages,
  };
}
