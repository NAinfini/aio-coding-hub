// Shared chart theme and configuration for Recharts
// Provides consistent colors, gradients, and styling across all charts

/**
 * Primary color palette for charts
 * Based on existing brand color (#0052FF) with expanded range for multi-series
 */
export const CHART_COLORS = {
  primary: "#0052FF",
  secondary: "#7C3AED",
  success: "#16A34A",
  warning: "#F97316",
  danger: "#DC2626",
  info: "#0EA5E9",
  purple: "#9333EA",
  emerald: "#059669",
  orange: "#EA580C",
  red: "#B91C1C",
} as const;

/**
 * Color palette for multi-series charts
 */
export const MULTI_SERIES_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.secondary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.danger,
  CHART_COLORS.info,
  CHART_COLORS.purple,
  CHART_COLORS.emerald,
  CHART_COLORS.orange,
  CHART_COLORS.red,
];

/**
 * Pick a color from palette by index, with HSL fallback for large series
 */
export function pickPaletteColor(index: number): string {
  if (index < MULTI_SERIES_PALETTE.length) {
    return MULTI_SERIES_PALETTE[index] ?? CHART_COLORS.primary;
  }

  // HSL fallback for series beyond palette
  const hue = (index * 137.508) % 360;
  return `hsl(${hue} 70% 45%)`;
}

/**
 * Default grid padding for charts
 */
export const CHART_GRID = {
  left: 0,
  right: 16,
  top: 8,
  bottom: 24,
} as const;

/**
 * Axis styling
 */
export const AXIS_STYLE = {
  fontSize: 10,
  fontWeight: 500,
  fill: "#64748b",
  color: "#64748b",
} as const;

/**
 * Grid line styling
 */
export const GRID_LINE_STYLE = {
  stroke: "rgba(0, 82, 255, 0.10)",
  strokeDasharray: "3 3",
} as const;

/**
 * Tooltip styling
 */
export const TOOLTIP_STYLE = {
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)",
  padding: "12px",
} as const;

/**
 * Legend styling
 */
export const LEGEND_STYLE = {
  fontSize: 11,
  fontWeight: 500,
  color: "#475569",
} as const;

/**
 * Gradient configuration for area charts
 */
export const createAreaGradient = (color: string, id: string) => ({
  id,
  x1: "0",
  y1: "0",
  x2: "0",
  y2: "1",
  gradientUnits: "userSpaceOnUse" as const,
  stops: [
    { offset: "0%", stopColor: color, stopOpacity: 0.25 },
    { offset: "100%", stopColor: color, stopOpacity: 0.0 },
  ],
});

/**
 * Animation configuration
 */
export const CHART_ANIMATION = {
  animationDuration: 300,
  animationEasing: "ease-in-out" as const,
} as const;

/**
 * Threshold zone colors
 */
export const THRESHOLD_COLORS = {
  warning: "rgba(220, 38, 38, 0.06)",
  warningLine: "rgba(220, 38, 38, 0.70)",
} as const;
