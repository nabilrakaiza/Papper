export type ChartPoint = {
  key: string;
  /** Under the x-axis. Thinned out when they would collide. */
  label: string;
  /** Names the point in the tooltip, e.g. "Senin, 21 Sep 2026". */
  tooltipLabel: string;
  value: number;
  /** Secondary line in the tooltip, e.g. "3 transaksi". */
  detail?: string;
};

export type ChartProps = {
  data: ChartPoint[];
  height?: number;
  /** Full value, for the tooltip. */
  formatValue: (value: number) => string;
  /** Compact value, for the y-axis. */
  formatTick: (value: number) => string;
  /** Smallest gap, in px, allowed between two x-axis labels. */
  minLabelSpacing?: number;
  /** What the chart shows, for screen readers. */
  ariaLabel: string;
};
