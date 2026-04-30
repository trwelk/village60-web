"use client";

import type { ResidentPerNurseDatum } from "@/lib/analytics/demographicsWorkload";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = {
  /** Care users with at least one active assignment; excludes unassigned residents. */
  perNurse: ResidentPerNurseDatum[];
};

const fillBar = "#14b8a6";

export function StaffWorkloadSection({ perNurse }: Props) {
  const data = perNurse.map((n) => ({
    ...n,
    nurseName: n.label,
  }));
  const barHeight = Math.max(220, perNurse.length * 44);
  const empty = perNurse.length === 0;

  return (
    <section className="village-card space-y-6 bg-cream/88">
      <div>
        <h2 className="village-section-title">Staff Workload</h2>
        <p className="village-muted mt-1.5">
          Residents per assigned nurse (care role); unassigned active residents are
          excluded here.
        </p>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-pine/12 bg-pine-soft/30 px-6 py-16 text-center text-sm text-ink/60">
          No nurse assignments recorded yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-pine/12 bg-cream/90 px-3 py-5 sm:px-5">
          <h3 className="text-sm font-semibold text-pine-2">
            Residents per nurse
          </h3>
          <div className="mt-4 w-full" style={{ height: barHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 4, right: 24, left: 8, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--pine) 18%, transparent)"
                  strokeDasharray="4 6"
                  horizontal
                />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--ink)", fontSize: 11 }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="nurseName"
                  width={160}
                  tick={{ fill: "var(--ink)", fontSize: 11 }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) {
                      return null;
                    }
                    const row = payload[0]?.payload as ResidentPerNurseDatum & {
                      nurseName: string;
                    };
                    return (
                      <div className="max-w-xs rounded-lg border border-pine/20 bg-cream px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-pine-2">{row.nurseName}</p>
                        <p className="mt-1 tabular-nums text-ink">
                          {row.residentCount} active resident
                          {row.residentCount === 1 ? "" : "s"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="residentCount"
                  fill={fillBar}
                  radius={[0, 6, 6, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
