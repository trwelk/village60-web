/* eslint-disable react/no-array-index-key -- skeleton placeholder cells */

const CELL_WIDTHS = ["w-[88%]", "w-[62%]", "w-[74%]", "w-[55%]", "w-[70%]"] as const;

function SkeletonPulseBar({ className }: { className: string }) {
  return (
    <div
      className={[
        "h-3 rounded bg-ink/10 motion-safe:animate-pulse",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

type VillageListSkeletonProps = {
  /** Skeleton table body rows. @default 8 */
  rows?: number;
  /** Number of table columns (header + cells). @default 5 */
  cols?: number;
  /** Pulse placeholders for toolbar actions. @default 2 */
  toolbarSlots?: number;
  /** Include filters card placeholders. @default true */
  showFilters?: boolean;
  /** Include pagination row placeholders. @default true */
  showPagination?: boolean;
  /** Match {@link VillageList} `rootElement`. @default "main" */
  rootElement?: "main" | "div";
};

/**
 * Layout shell matching {@link VillageList} for `loading.tsx` and `Suspense`
 * fallbacks. Uses `motion-safe:animate-pulse`; avoid `Math.random()` widths so
 * SSR output is stable.
 */
export function VillageListSkeleton({
  rows = 8,
  cols = 5,
  toolbarSlots = 2,
  showFilters = true,
  showPagination = true,
  rootElement = "main",
}: VillageListSkeletonProps) {
  const Root = rootElement === "div" ? "div" : "main";

  return (
    <Root className="flex flex-col gap-5 text-ink">
      <header className="flex flex-wrap items-center justify-end gap-3">
        {Array.from({ length: toolbarSlots }, (_, i) => (
          <div
            key={i}
            className="h-9 w-[6.5rem] rounded-md bg-ink/10 motion-safe:animate-pulse"
          />
        ))}
      </header>

      {showFilters ? (
        <section className="village-region p-5 sm:p-6">
          <h2 className="village-section-title">Filters</h2>
          <div className="mt-5 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex min-w-[10rem] flex-1 flex-col gap-1.5 sm:max-w-[14rem]"
              >
                <div className="h-3 w-20 rounded bg-ink/10 motion-safe:animate-pulse" />
                <div className="h-10 w-full rounded-md bg-ink/8 motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="village-region p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-6 w-28 rounded bg-ink/10 motion-safe:animate-pulse" />
        </div>

        {showPagination ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="h-4 w-40 rounded bg-ink/10 motion-safe:animate-pulse" />
            <div className="flex gap-2">
              <div className="h-9 w-[5.5rem] rounded-md bg-ink/8 motion-safe:animate-pulse" />
              <div className="h-9 w-[5.5rem] rounded-md bg-ink/8 motion-safe:animate-pulse" />
            </div>
          </div>
        ) : null}

        <div className="village-table-wrap mt-4">
          <table className="village-table" aria-hidden>
            <thead className="village-thead">
              <tr>
                {Array.from({ length: cols }, (_, j) => (
                  <th key={j} className="village-th">
                    <div className="h-3 w-16 rounded bg-ink/12 motion-safe:animate-pulse" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="village-tbody">
              {Array.from({ length: rows }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className="village-td">
                      <SkeletonPulseBar
                        className={CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Root>
  );
}

/**
 * Breadcrumb strip + stacked cards for invoice / ledger `Suspense` fallbacks.
 */
export function DashboardDetailRouteSkeleton() {
  return (
    <main className="flex flex-col gap-8 text-ink">
      <div className="flex flex-wrap items-center gap-2">
        <div className="h-4 w-28 rounded bg-ink/10 motion-safe:animate-pulse" />
        <span className="text-ink/30" aria-hidden>
          /
        </span>
        <div className="h-4 w-36 rounded bg-ink/10 motion-safe:animate-pulse" />
      </div>
      <div className="village-card overflow-hidden p-0">
        <div className="min-h-[12rem] bg-ink/8 motion-safe:animate-pulse sm:min-h-[14rem]" />
      </div>
      <div className="village-panel-card overflow-hidden p-0">
        <div className="min-h-[10rem] bg-ink/8 motion-safe:animate-pulse sm:min-h-[12rem]" />
      </div>
    </main>
  );
}
