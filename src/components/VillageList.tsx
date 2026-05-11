"use client";

import { type ReactNode, useState } from "react";

// ---------------------------------------------------------------------------
// FilterToggle (internal)
// ---------------------------------------------------------------------------

function ListLoadingSpinner({ size = "sm" }: { size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "size-9 border-[3px]" : "size-3.5 border-2";
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-[color:color-mix(in_srgb,var(--text-muted)_35%,transparent)] border-t-[var(--accent-strong)] ${dim}`}
      aria-hidden
    />
  );
}

/** Full-area overlay: frosted backdrop, shimmer sweep, centered spinner (table + wrapBody="none"). */
function VillageListBodyLoadingLayer() {
  return (
    <div className="village-list-body-loading-layer pointer-events-none">
      <div className="village-list-body-loading-backdrop" aria-hidden />
      <div className="village-list-body-loading-shimmer" aria-hidden />
      <div
        className="village-list-body-loading-spinner"
        role="status"
        aria-live="polite"
      >
        <span className="sr-only">Loading list</span>
        <ListLoadingSpinner size="lg" />
      </div>
    </div>
  );
}

function FilterToggle({
  open,
  onClick,
  activeCount,
}: {
  open: boolean;
  onClick: () => void;
  activeCount?: number;
}) {
  return (
    <button
      type="button"
      className="village-btn-secondary gap-1.5"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="village-filter-panel"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1.5 2h13M3.5 6h9M5.5 10h5M7 14h2" />
      </svg>
      Filters
      {activeCount != null && activeCount > 0 ? (
        <span className="ml-0.5 inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--accent-strong)] px-1 text-[0.6rem] font-bold leading-none text-white">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// VillageListPagination
// ---------------------------------------------------------------------------

/** Rows per page used when `pageSize` is omitted from pagination config. */
export const DEFAULT_PAGE_SIZE = 10;

export type VillageListPaginationConfig = {
  /** Active page (1-based). May mirror URL params or React state. */
  page: number;
  /** Defaults to {@link DEFAULT_PAGE_SIZE} (10). */
  pageSize?: number;
  totalCount: number;
  /** Previous page: e.g. `router.push` with decremented page, or `setPage(p => p - 1)`. */
  onPrevious: () => void;
  /** Next page: e.g. `router.push` with incremented page, or `setPage(p => p + 1)`. */
  onNext: () => void;
};

type VillageListPaginationProps = VillageListPaginationConfig & {
  /** While true, disables Prev/Next (e.g. client-side filtered ledger fetch). */
  loading?: boolean;
  /** data-testid placed on the "Showing X–Y of Z" paragraph. */
  rangeTestId?: string;
  /**
   * Outer wrapper classes. Defaults to a top margin plus the flex row used on
   * directory pages. Pass a custom string (e.g. without `mt-4`) when the
   * pagination sits inside a parent that already gaps children.
   */
  className?: string;
};

/**
 * Shared range sentence + Prev/Next controls. Use with URL-driven pagination
 * (`router.push` in handlers) or client-only page state (`setPage` in handlers).
 */
export function VillageListPagination({
  page,
  pageSize = DEFAULT_PAGE_SIZE,
  totalCount,
  onPrevious,
  onNext,
  loading,
  rangeTestId,
  className,
}: VillageListPaginationProps) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);
  // True when the URL page is beyond the last page but there are records.
  const outOfRange = totalCount > 0 && from > totalCount;
  const canPrev = page > 1;
  const canNext = page * pageSize < totalCount;

  let rangeLabel: string;
  if (totalCount === 0) {
    rangeLabel = "Showing 0 of 0";
  } else if (outOfRange) {
    rangeLabel = `No results on this page (0 of ${totalCount})`;
  } else {
    rangeLabel = `Showing ${from}\u2013${to} of ${totalCount}`;
  }

  return (
    <div
      className={
        className ??
        "mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <p
        className="text-sm text-ink/70"
        data-testid={rangeTestId}
      >
        {rangeLabel}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="village-button"
          disabled={!canPrev || loading}
          aria-label="Previous page"
          onClick={onPrevious}
        >
          Previous
        </button>
        <button
          type="button"
          className="village-button"
          disabled={!canNext || loading}
          aria-label="Next page"
          onClick={onNext}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VillageList
// ---------------------------------------------------------------------------

type VillageListProps = {
  /**
   * Top row outside all cards — place section titles and action buttons here.
   * Rendered in a flex-wrap row with `justify-between`.
   */
  toolbar?: ReactNode;
  /**
   * Controls rendered inside the "Filters" card.
   * Use `VillageListFilter` wrappers for consistent labelling.
   * Omit to skip the card entirely.
   */
  filters?: ReactNode;
  /**
   * When true the filter panel is hidden behind a toggle button in the toolbar.
   * @default false
   */
  filtersCollapsible?: boolean;
  /**
   * Whether the collapsible filter panel starts open.
   * Only relevant when `filtersCollapsible` is true.
   * @default false
   */
  defaultFiltersOpen?: boolean;
  /**
   * Number of active (non-default) filters to show as a badge on the toggle.
   * Only relevant when `filtersCollapsible` is true.
   */
  activeFilterCount?: number;
  /**
   * Heading for the list section. When `loading` is true a small spinner is
   * shown next to the title (title stays visible). Pass `null` to hide the
   * heading; while loading without a title, a spinner row is still shown.
   * Defaults to "Directory".
   */
  listTitle?: string | null;
  /** While true: `aria-busy` on the list section, spinner by the title (when set), disabled pagination, and a frosted overlay with shimmer + centered spinner over the list body (table and `wrapBody="none"`). */
  loading?: boolean;
  /** When set, renders a `village-alert-error` banner above the list section. */
  error?: string | null;
  /** Pagination config. Omit for unpaginated lists. */
  pagination?: VillageListPaginationConfig;
  /**
   * Passed to the `data-testid` of the "Showing X–Y of Z" paragraph.
   * Useful when migrating pages that have existing test ids.
   */
  paginationRangeTestId?: string;
  /**
   * `"table"` (default) — wraps `children` in `village-table-wrap mt-4`.
   * `"none"` — renders `children` directly (for card stacks, custom layout).
   */
  wrapBody?: "table" | "none";
  /**
   * Root element. Use `"div"` when this shell is already inside a page `<main>`
   * (e.g. dashboard layout) to avoid nested `<main>` landmarks.
   * @default "main"
   */
  rootElement?: "main" | "div";
  /** The table or card-list content. */
  children: ReactNode;
};

export function VillageList({
  toolbar,
  filters,
  filtersCollapsible = false,
  defaultFiltersOpen = false,
  activeFilterCount,
  listTitle = "Directory",
  loading = false,
  error,
  pagination,
  paginationRangeTestId,
  wrapBody = "table",
  rootElement = "main",
  children,
}: VillageListProps) {
  const [filtersOpen, setFiltersOpen] = useState(defaultFiltersOpen);
  const Root = rootElement === "div" ? "div" : "main";

  const showFilterInline = filters != null && !filtersCollapsible;
  const showFilterCollapsible = filters != null && filtersCollapsible;

  return (
    <Root className="flex flex-col gap-5 text-ink">
      {/* Toolbar row: toggle + page-level actions */}
      {(toolbar != null || showFilterCollapsible) ? (
        <header className="flex flex-wrap items-center gap-3">
          {showFilterCollapsible ? (
            <FilterToggle
              open={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              activeCount={activeFilterCount}
            />
          ) : null}
          <div
            className={
              showFilterCollapsible
                ? "flex min-w-0 flex-1 flex-wrap items-center justify-end gap-3"
                : "ml-auto flex flex-wrap items-center gap-3"
            }
          >
            {toolbar}
          </div>
        </header>
      ) : null}

      {/* Collapsible filters panel */}
      {showFilterCollapsible && filtersOpen ? (
        <div
          id="village-filter-panel"
          className="animate-[village-filter-in_120ms_ease-out] will-change-[opacity,transform]"
        >
          <section className="village-region p-5 sm:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
              {filters}
            </div>
          </section>
        </div>
      ) : null}

      {/* Always-visible filters card (non-collapsible) */}
      {showFilterInline ? (
        <section className="village-region p-5 sm:p-6">
          <h2 className="village-section-title">Filters</h2>
          <div className="mt-5 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            {filters}
          </div>
        </section>
      ) : null}

      {/* Error alert */}
      {error ? <p className="village-alert-error">{error}</p> : null}

      {/* List / table section */}
      <section aria-busy={loading} className="village-region p-5 sm:p-6">
        {listTitle ? (
          <h2 className="village-section-title flex flex-wrap items-center gap-2">
            <span>{listTitle}</span>
            {loading ? <ListLoadingSpinner size="sm" /> : null}
          </h2>
        ) : loading ? (
          <div
            className="village-section-title flex items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <span className="sr-only">Loading</span>
            <ListLoadingSpinner size="sm" />
          </div>
        ) : null}

        {pagination != null ? (
          <VillageListPagination
            {...pagination}
            loading={loading}
            rangeTestId={paginationRangeTestId}
          />
        ) : null}

        {wrapBody === "table" ? (
          <div
            className={[
              "village-table-wrap mt-4",
              loading ? "relative" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {children}
            {loading ? <VillageListBodyLoadingLayer /> : null}
          </div>
        ) : loading ? (
          <div className="relative min-h-[14rem]">
            {children}
            <VillageListBodyLoadingLayer />
          </div>
        ) : (
          children
        )}
      </section>
    </Root>
  );
}

// ---------------------------------------------------------------------------
// VillageListFilter
// ---------------------------------------------------------------------------

type VillageListFilterProps = {
  /** Visible label text above the control. */
  label: string;
  /** `htmlFor` wired to an inner `<input>` or `<select>` id. */
  htmlFor?: string;
  /**
   * CSS `min-width` value — controls how much space the filter claims in the
   * flex row before wrapping. Defaults to `"10rem"`.
   */
  minWidth?: string;
  /**
   * Optional fixed CSS `width`. When set the filter does not grow; useful for
   * narrow controls like Status dropdowns (e.g. `"11rem"`).
   * When omitted the filter takes `flex: 1 1 0%`.
   */
  width?: string;
  children: ReactNode;
};

export function VillageListFilter({
  label,
  htmlFor,
  minWidth = "10rem",
  width,
  children,
}: VillageListFilterProps) {
  const style: React.CSSProperties = width
    ? { width, minWidth }
    : { minWidth, flex: "1 1 0%" };

  return (
    <div className="flex flex-col gap-1.5 text-sm" style={style}>
      <label className="village-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VillageListEmpty
// ---------------------------------------------------------------------------

type VillageListEmptyProps = {
  /**
   * When provided renders a `<tr><td colSpan={colSpan}>` — use inside a
   * `<tbody>` for tables.
   * When omitted renders a centred paragraph — use for card-stack lists.
   */
  colSpan?: number;
  /** Message to display. Defaults to "No results match these filters." */
  message?: string;
};

export function VillageListEmpty({
  colSpan,
  message = "No results match these filters.",
}: VillageListEmptyProps) {
  if (colSpan != null) {
    return (
      <tr>
        <td colSpan={colSpan} className="village-td-muted py-10 text-center">
          {message}
        </td>
      </tr>
    );
  }

  return (
    <p className="py-10 text-center text-sm text-ink/60">{message}</p>
  );
}
