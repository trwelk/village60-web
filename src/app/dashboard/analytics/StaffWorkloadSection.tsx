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

const fillBar = "var(--accent)";

export function StaffWorkloadSection({ perNurse }: Props) {
  const data = perNurse.map((n) => ({
    ...n,
    nurseName: n.label,
  }));
  const barHeight = Math.max(220, perNurse.length * 44);
  const empty = perNurse.length === 0;

  return (
    <section className="village-card border border-[color:color-mix(in_srgb,var(--line-subtle)_72%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg-elevated)_94%,transparent),color-mix(in_srgb,var(--bg-muted)_88%,transparent))] p-4 shadow-[0_18px_46px_-34px_color-mix(in_srgb,var(--accent)_38%,transparent)] sm:p-6">
      <div className="space-y-6">
        <div>
        <h2 className="village-section-title">Staff Workload</h2>
        <p className="village-muted mt-1.5">
          Residents per assigned nurse (care role); unassigned active residents are
          excluded here.
        </p>
      </div>

      {empty ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_58%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-muted)_82%,transparent)] px-6 py-16 text-center text-sm text-[var(--text-muted)]">
          No nurse assignments recorded yet.
        </div>
      ) : (
        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--line-strong)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--bg-elevated)_96%,transparent)] p-4 shadow-[inset_0_1px_0_color-mix(in_srgb,var(--bg-canvas)_70%,transparent)] sm:p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Residents per nurse
          </h3>
          <div className="mt-4 w-full min-w-0" style={{ height: barHeight }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 4, right: 20, left: 16, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="color-mix(in srgb, var(--line-strong) 50%, transparent)"
                  strokeDasharray="4 6"
                  horizontal
                />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="nurseName"
                  width={180}
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
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
                      <div className="max-w-xs rounded-lg border border-[color:color-mix(in_srgb,var(--line-strong)_64%,transparent)] bg-[var(--bg-elevated)] px-3 py-2 text-xs shadow-lg">
                        <p className="font-semibold text-[var(--text-primary)]">{row.nurseName}</p>
                        <p className="mt-1 tabular-nums text-[var(--text-primary)]">
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
      </div>
    </section>
  );
}
