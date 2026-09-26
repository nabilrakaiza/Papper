import type { ChartProps } from "./chartTypes";

// The owner dashboard is web only — AuthContext signs an owner out of the app —
// so the charts exist only as DOM SVG in charts.web.tsx. These stand in for
// them in the native bundle, which still compiles every route.

export function AreaChart(_props: ChartProps) {
  return null;
}

export function ColumnChart(_props: ChartProps) {
  return null;
}
