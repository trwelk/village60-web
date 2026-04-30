export const HOME_CHART_COLORS = [
  "#2f6f57",
  "#b56a4a",
  "#6d8f71",
  "#8d5a7b",
  "#64748b",
];

export function getHomeChartColor(index: number): string {
  return HOME_CHART_COLORS[index % HOME_CHART_COLORS.length];
}
