import { resolveVillage60Theme } from "@/lib/theme/village60Theme";

const HOME_CHART_COLORS_RESOLVED = (() => {
  const c = resolveVillage60Theme().core;
  return [
    c["--chart-categorical-1"],
    c["--chart-categorical-2"],
    c["--chart-categorical-3"],
    c["--chart-categorical-4"],
    c["--chart-categorical-5"],
    c["--chart-categorical-6"],
  ] as const;
})();

/** Series colors for multi-home charts; derived from the active theme. */
export const HOME_CHART_COLORS: readonly string[] = [...HOME_CHART_COLORS_RESOLVED];

export function getHomeChartColor(index: number): string {
  return HOME_CHART_COLORS[index % HOME_CHART_COLORS.length]!;
}
