import { useEffect, useRef, useState, KeyboardEvent, PointerEvent, ReactNode, RefObject } from "react";
import type { ChartPoint, ChartProps } from "./chartTypes";

// Plain DOM SVG. The owner dashboard only runs in a browser, and drawing the
// marks directly keeps them to the spec — hairline solid grid, 2px line over a
// 10% wash, columns capped at 24px with a 4px rounded end — with a hover layer
// that victory-native's web build does not give.

const ACCENT = "#3a7bd5";
const ACCENT_HOVER = "#6f9fe3";
const GRID = "#e5e7eb";
const CROSSHAIR = "#9ca3af";
const TEXT_MUTED = "#6b7280";
const TEXT_PRIMARY = "#111827";
const SURFACE = "#ffffff";
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const MARGIN = { top: 12, right: 12, bottom: 28, left: 60 };

function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

/** Round steps (1, 2, 2.5, 5 × 10ⁿ) from zero to just past `max`. */
function niceTicks(max: number, target = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Indices whose x-labels are drawn, spaced so they cannot overlap. */
function labelStride(count: number, plotWidth: number, minSpacing: number): number {
  const fits = Math.max(1, Math.floor(plotWidth / minSpacing));
  return Math.max(1, Math.ceil(count / fits));
}

function Tooltip({ point, x, width, formatValue }: {
  point: ChartPoint;
  x: number;
  width: number;
  formatValue: (v: number) => string;
}) {
  const half = 80;
  const left = Math.min(Math.max(x, half), Math.max(width - half, half));
  return (
    <div
      role="status"
      style={{
        position: "absolute",
        top: -8,
        left,
        transform: "translate(-50%, -100%)",
        background: SURFACE,
        border: `1px solid ${GRID}`,
        borderRadius: 10,
        padding: "6px 10px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        fontFamily: FONT,
        zIndex: 2,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 800, color: TEXT_PRIMARY }}>{formatValue(point.value)}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: TEXT_MUTED }}>
        {point.tooltipLabel}
        {point.detail ? ` · ${point.detail}` : ""}
      </div>
    </div>
  );
}

/**
 * The frame both chart types share: y-grid and ticks, x-labels, the tooltip,
 * and keyboard stepping through the points with the arrow keys.
 */
function Frame({
  data,
  height,
  formatValue,
  formatTick,
  minLabelSpacing,
  ariaLabel,
  xOf,
  bandWidth,
  children,
  onPointer,
  active,
  setActive,
}: ChartProps & {
  height: number;
  minLabelSpacing: number;
  xOf: (i: number, plotWidth: number) => number;
  bandWidth: (plotWidth: number) => number;
  children: (geo: { plotWidth: number; yOf: (v: number) => number; base: number }) => ReactNode;
  onPointer: (mx: number, plotWidth: number) => number | null;
  active: number | null;
  setActive: (i: number | null) => void;
}) {
  const [ref, width] = useWidth();
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const base = MARGIN.top + plotHeight;
  const yOf = (v: number) => MARGIN.top + plotHeight - (top > 0 ? (v / top) * plotHeight : 0);
  const stride = labelStride(data.length, plotWidth, minLabelSpacing);

  // Pointer rather than mouse events, so a tap on a phone reads a value the
  // way hovering does with a mouse.
  const handlePointer = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(onPointer(e.clientX - rect.left - MARGIN.left, plotWidth));
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (data.length === 0) return;
    if (e.key === "ArrowRight") {
      setActive(active === null ? 0 : Math.min(active + 1, data.length - 1));
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      setActive(active === null ? data.length - 1 : Math.max(active - 1, 0));
      e.preventDefault();
    } else if (e.key === "Escape") {
      setActive(null);
    }
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      aria-label={`${ariaLabel}. Gunakan panah kiri dan kanan untuk membaca nilai.`}
      onKeyDown={handleKey}
      onBlur={() => setActive(null)}
      style={{ position: "relative", width: "100%", height, outline: "none" }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          style={{ display: "block", fontFamily: FONT, overflow: "visible" }}
          onPointerMove={handlePointer}
          onPointerDown={handlePointer}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={width - MARGIN.right} y1={yOf(t)} y2={yOf(t)} stroke={GRID} strokeWidth={1} />
              <text x={MARGIN.left - 8} y={yOf(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={TEXT_MUTED}>
                {formatTick(t)}
              </text>
            </g>
          ))}

          {children({ plotWidth, yOf, base })}

          {data.map((d, i) =>
            i % stride === 0 ? (
              <text
                key={d.key}
                x={MARGIN.left + xOf(i, plotWidth) + bandWidth(plotWidth) / 2}
                y={base + 18}
                textAnchor="middle"
                fontSize={11}
                fill={TEXT_MUTED}
              >
                {d.label}
              </text>
            ) : null
          )}
        </svg>
      )}

      {active !== null && data[active] && (
        <Tooltip
          point={data[active]}
          x={MARGIN.left + xOf(active, plotWidth) + bandWidth(plotWidth) / 2}
          width={width}
          formatValue={formatValue}
        />
      )}
    </div>
  );
}

/** Change over time: a 2px line over a 10% wash, with a snapping crosshair. */
export function AreaChart(props: ChartProps) {
  const { data, height = 240, minLabelSpacing = 56 } = props;
  const [active, setActive] = useState<number | null>(null);
  const n = data.length;
  const xOf = (i: number, w: number) => (n > 1 ? (i / (n - 1)) * w : w / 2);

  return (
    <Frame
      {...props}
      height={height}
      minLabelSpacing={minLabelSpacing}
      xOf={xOf}
      bandWidth={() => 0}
      active={active}
      setActive={setActive}
      onPointer={(mx, w) => {
        if (n === 0 || mx < -8 || mx > w + 8) return null;
        return n > 1 ? Math.min(n - 1, Math.max(0, Math.round((mx / w) * (n - 1)))) : 0;
      }}
    >
      {({ plotWidth, yOf, base }) => {
        if (n === 0) return null;
        const pts = data.map((d, i) => [MARGIN.left + xOf(i, plotWidth), yOf(d.value)] as const);
        const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
        const area = `${line} L${pts[n - 1][0]},${base} L${pts[0][0]},${base} Z`;
        const hovered = active !== null ? pts[active] : null;

        return (
          <g>
            <path d={area} fill={ACCENT} fillOpacity={0.1} />
            <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {n === 1 && <circle cx={pts[0][0]} cy={pts[0][1]} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />}
            {hovered && (
              <g pointerEvents="none">
                <line x1={hovered[0]} x2={hovered[0]} y1={MARGIN.top} y2={base} stroke={CROSSHAIR} strokeWidth={1} />
                <circle cx={hovered[0]} cy={hovered[1]} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
              </g>
            )}
          </g>
        );
      }}
    </Frame>
  );
}

/** Values per slot: columns capped at 24px, rounded 4px at the data end only. */
export function ColumnChart(props: ChartProps) {
  const { data, height = 220, minLabelSpacing = 28 } = props;
  const [active, setActive] = useState<number | null>(null);
  const n = Math.max(1, data.length);
  const band = (w: number) => w / n;

  return (
    <Frame
      {...props}
      height={height}
      minLabelSpacing={minLabelSpacing}
      xOf={(i, w) => i * band(w)}
      bandWidth={band}
      active={active}
      setActive={setActive}
      onPointer={(mx, w) => {
        if (data.length === 0 || mx < 0 || mx > w) return null;
        return Math.min(data.length - 1, Math.floor(mx / band(w)));
      }}
    >
      {({ plotWidth, yOf, base }) =>
        data.map((d, i) => {
          const b = band(plotWidth);
          const w = Math.min(24, b * 0.7);
          const x = MARGIN.left + i * b + (b - w) / 2;
          const y = yOf(d.value);
          const h = base - y;
          if (d.value <= 0 || h <= 0) return null;
          const r = Math.min(4, h, w / 2);
          const path =
            `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} ` +
            `H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${base} Z`;
          return <path key={d.key} d={path} fill={active === i ? ACCENT_HOVER : ACCENT} />;
        })
      }
    </Frame>
  );
}
