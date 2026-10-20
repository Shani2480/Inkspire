import { parseChartSheet, type ChartSheet } from "@/editor/chart-sheet"
import { expandSpec } from "@/editor/chart-expand"
import { THEME_ACCENTS, shade } from "@/editor/shape-style"

/**
 * Word's chart (20.8): the data, the elements and their formatting as one spec kept on the chart's node, drawn by
 * one SVG renderer whose every part can be clicked, and written to .docx as a real chart.
 */

export type ChartType =
  "column" | "bar" | "line" | "area" | "pie" | "doughnut" | "scatter" | "radar" | "histogram" | "waterfall" | "funnel"
export type ChartGrouping = "clustered" | "stacked" | "percent"
export type LegendPosition = "none" | "right" | "top" | "bottom" | "left"
export type LabelPosition = "none" | "center" | "insideEnd" | "insideBase" | "outsideEnd" | "bestFit"
export type ErrorBarKind = "none" | "fixed" | "percent" | "stddev" | "stderr"
export type TrendlineKind = "none" | "linear" | "exponential" | "logarithmic" | "movingAverage"

/** A part's own formatting, over what the chart style gives it. */
export type PartFormat = {
  fill?: string
  line?: string
  lineWidth?: number
  color?: string
  fontSize?: number
  bold?: boolean
}

export type ChartSeries = {
  name: string
  values: number[]
  /** For a combo chart: the type this series is drawn as, when it is not the chart's. */
  type?: "column" | "line" | "area"
  secondary?: boolean
  hidden?: boolean
  trendline?: TrendlineKind
}

export type LabelContent = { value: boolean; category: boolean; series: boolean; percent: boolean }

export type ValueAxis = {
  min?: number
  max?: number
  major?: number
  reverse?: boolean
  log?: boolean
  numberFormat?: string
}

export type ChartSpec = {
  type: ChartType
  grouping: ChartGrouping
  markers: boolean
  smooth: boolean
  /** Scatter: points joined by lines. Radar: filled. */
  lines: boolean
  filled: boolean
  categories: string[]
  hiddenCategories: number[]
  series: ChartSeries[]
  title: { show: boolean; text: string }
  axisTitles: { category: { show: boolean; text: string }; value: { show: boolean; text: string } }
  axes: { category: boolean; value: boolean }
  gridlines: { major: boolean; minor: boolean; vertical: boolean }
  legend: LegendPosition
  dataLabels: LabelPosition
  labelContent: LabelContent
  dataTable: boolean
  /** Word's chart styles, 1 to 14. */
  style: number
  palette: string
  valueAxis: ValueAxis
  categoryReverse: boolean
  gapWidth: number
  overlap: number
  firstSliceAngle: number
  holeSize: number
  explosion: number
  /** Error bars on every series (22.14): how the error is worked out, and its amount (not used by `stderr`). */
  errorBars: { kind: ErrorBarKind; amount: number }
  /** Line and area charts: a line from each point down to the axis. */
  dropLines: boolean
  /** Line charts: a line from the highest to the lowest point of each category. */
  highLowLines: boolean
  /** Line charts: bars between the first and the last series in each category. */
  upDownBars: boolean
  format: Record<string, PartFormat>
}

export const DEFAULT_LABEL_CONTENT: LabelContent = { value: true, category: false, series: false, percent: false }

const BASE: Omit<ChartSpec, "categories" | "series"> = {
  type: "column",
  grouping: "clustered",
  markers: false,
  smooth: false,
  lines: false,
  filled: false,
  hiddenCategories: [],
  title: { show: true, text: "Chart Title" },
  axisTitles: { category: { show: false, text: "Axis Title" }, value: { show: false, text: "Axis Title" } },
  axes: { category: true, value: true },
  gridlines: { major: true, minor: false, vertical: false },
  legend: "bottom",
  dataLabels: "none",
  labelContent: DEFAULT_LABEL_CONTENT,
  dataTable: false,
  style: 1,
  palette: "colorful1",
  valueAxis: {},
  categoryReverse: false,
  gapWidth: 219,
  overlap: -27,
  firstSliceAngle: 0,
  holeSize: 75,
  explosion: 0,
  errorBars: { kind: "none", amount: 5 },
  dropLines: false,
  highLowLines: false,
  upDownBars: false,
  format: {},
}

// ---------------------------------------------------------------------------------------------------------------
// Chart types and their variants, as Word's Insert Chart dialog lists them
// ---------------------------------------------------------------------------------------------------------------

export type ChartVariant = {
  id: string
  label: string
  type: ChartType
  grouping?: ChartGrouping
  markers?: boolean
  smooth?: boolean
  lines?: boolean
  filled?: boolean
  /** Combo charts: the type of each series after the first, and whether the last goes on a secondary axis. */
  combo?: { first: "column" | "area"; rest: "line" | "column"; secondary?: boolean; firstGrouping?: ChartGrouping }
}

export const CHART_FAMILIES: { id: string; label: string; items: ChartVariant[] }[] = [
  {
    id: "column",
    label: "Column",
    items: [
      { id: "column", label: "Clustered Column", type: "column" },
      { id: "column-stacked", label: "Stacked Column", type: "column", grouping: "stacked" },
      { id: "column-percent", label: "100% Stacked Column", type: "column", grouping: "percent" },
    ],
  },
  {
    id: "line",
    label: "Line",
    items: [
      { id: "line", label: "Line", type: "line" },
      { id: "line-stacked", label: "Stacked Line", type: "line", grouping: "stacked" },
      { id: "line-percent", label: "100% Stacked Line", type: "line", grouping: "percent" },
      { id: "line-markers", label: "Line with Markers", type: "line", markers: true },
      {
        id: "line-stacked-markers",
        label: "Stacked Line with Markers",
        type: "line",
        grouping: "stacked",
        markers: true,
      },
      {
        id: "line-percent-markers",
        label: "100% Stacked Line with Markers",
        type: "line",
        grouping: "percent",
        markers: true,
      },
    ],
  },
  {
    id: "pie",
    label: "Pie",
    items: [
      { id: "pie", label: "Pie", type: "pie" },
      { id: "doughnut", label: "Doughnut", type: "doughnut" },
    ],
  },
  {
    id: "bar",
    label: "Bar",
    items: [
      { id: "hbar", label: "Clustered Bar", type: "bar" },
      { id: "hbar-stacked", label: "Stacked Bar", type: "bar", grouping: "stacked" },
      { id: "hbar-percent", label: "100% Stacked Bar", type: "bar", grouping: "percent" },
    ],
  },
  {
    id: "area",
    label: "Area",
    items: [
      { id: "area", label: "Area", type: "area" },
      { id: "area-stacked", label: "Stacked Area", type: "area", grouping: "stacked" },
      { id: "area-percent", label: "100% Stacked Area", type: "area", grouping: "percent" },
    ],
  },
  {
    id: "scatter",
    label: "X Y (Scatter)",
    items: [
      { id: "scatter", label: "Scatter", type: "scatter", markers: true },
      {
        id: "scatter-smooth-markers",
        label: "Scatter with Smooth Lines and Markers",
        type: "scatter",
        markers: true,
        lines: true,
        smooth: true,
      },
      { id: "scatter-smooth", label: "Scatter with Smooth Lines", type: "scatter", lines: true, smooth: true },
      {
        id: "scatter-lines-markers",
        label: "Scatter with Straight Lines and Markers",
        type: "scatter",
        markers: true,
        lines: true,
      },
      { id: "scatter-lines", label: "Scatter with Straight Lines", type: "scatter", lines: true },
    ],
  },
  {
    id: "radar",
    label: "Radar",
    items: [
      { id: "radar", label: "Radar", type: "radar" },
      { id: "radar-markers", label: "Radar with Markers", type: "radar", markers: true },
      { id: "radar-filled", label: "Filled Radar", type: "radar", filled: true },
    ],
  },
  {
    id: "histogram",
    label: "Histogram",
    items: [{ id: "histogram", label: "Histogram", type: "histogram" }],
  },
  {
    id: "waterfall",
    label: "Waterfall",
    items: [{ id: "waterfall", label: "Waterfall", type: "waterfall" }],
  },
  {
    id: "funnel",
    label: "Funnel",
    items: [{ id: "funnel", label: "Funnel", type: "funnel" }],
  },
  {
    id: "combo",
    label: "Combo",
    items: [
      {
        id: "combo-column-line",
        label: "Clustered Column - Line",
        type: "column",
        combo: { first: "column", rest: "line" },
      },
      {
        id: "combo-column-line-secondary",
        label: "Clustered Column - Line on Secondary Axis",
        type: "column",
        combo: { first: "column", rest: "line", secondary: true },
      },
      {
        id: "combo-area-column",
        label: "Stacked Area - Clustered Column",
        type: "area",
        combo: { first: "area", rest: "column", firstGrouping: "stacked" },
      },
    ],
  },
]

export const CHART_VARIANTS = CHART_FAMILIES.flatMap((family) => family.items)

export function chartVariant(id: string) {
  return CHART_VARIANTS.find((item) => item.id === id)
}

/** The variant a spec is drawn as, for the Change Chart Type dialog. */
export function variantOf(spec: ChartSpec): string {
  const types = new Set(spec.series.map((serie) => serie.type).filter(Boolean))
  if (types.size > 0) {
    const secondary = spec.series.some((serie) => serie.secondary)
    if (spec.type === "area") {
      return "combo-area-column"
    }
    return secondary ? "combo-column-line-secondary" : "combo-column-line"
  }
  const match = CHART_VARIANTS.find(
    (item) =>
      !item.combo &&
      item.type === spec.type &&
      (item.grouping ?? "clustered") === (isGrouped(spec.type) ? spec.grouping : "clustered") &&
      (spec.type === "line" || spec.type === "scatter" || spec.type === "radar"
        ? Boolean(item.markers) === spec.markers
        : true) &&
      (spec.type === "scatter" ? Boolean(item.lines) === spec.lines && Boolean(item.smooth) === spec.smooth : true) &&
      (spec.type === "radar" ? Boolean(item.filled) === spec.filled : true),
  )
  return match?.id ?? spec.type
}

function isGrouped(type: ChartType) {
  return type === "column" || type === "bar" || type === "line" || type === "area"
}

/** The spec drawn as another type, keeping its data, elements and formatting. */
export function withVariant(spec: ChartSpec, id: string): ChartSpec {
  const variant = chartVariant(id)
  if (!variant) {
    return spec
  }
  const round = variant.type === "pie" || variant.type === "doughnut"
  const next: ChartSpec = {
    ...spec,
    type: variant.type,
    grouping: variant.combo?.firstGrouping ?? variant.grouping ?? "clustered",
    markers: Boolean(variant.markers),
    smooth: Boolean(variant.smooth),
    lines: Boolean(variant.lines),
    filled: Boolean(variant.filled),
    series: spec.series.map((serie, index) => {
      const { type: _type, secondary: _secondary, ...rest } = serie
      if (!variant.combo || index === 0) {
        return rest
      }
      return {
        ...rest,
        type: variant.combo.rest,
        secondary: variant.combo.secondary && index === spec.series.length - 1 ? true : undefined,
      }
    }),
  }
  if (round && !["right", "bottom", "none"].includes(spec.legend)) {
    next.legend = "bottom"
  }
  if (variant.type === "bar" || variant.type === "column") {
    next.gapWidth = next.grouping === "clustered" ? 219 : 150
    next.overlap = next.grouping === "clustered" ? -27 : 100
  }
  return next
}

// ---------------------------------------------------------------------------------------------------------------
// Making and reading specs
// ---------------------------------------------------------------------------------------------------------------

/** Word's sample data for a new chart of this variant. */
export function defaultChartSpec(variantId = "column"): ChartSpec {
  const variant = chartVariant(variantId) ?? CHART_VARIANTS[0]!
  if (variant.type === "pie" || variant.type === "doughnut") {
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Sales" },
        categories: ["1st Qtr", "2nd Qtr", "3rd Qtr", "4th Qtr"],
        series: [{ name: "Sales", values: [8.2, 3.2, 1.4, 1.2] }],
      },
      variant.id,
    )
  }
  if (variant.type === "scatter") {
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Y-Values" },
        legend: "none",
        gridlines: { major: true, minor: false, vertical: true },
        categories: ["0.7", "1.8", "2.6"],
        series: [{ name: "Y-Values", values: [2.7, 3.2, 0.8] }],
      },
      variant.id,
    )
  }
  if (variant.type === "histogram") {
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Histogram" },
        legend: "none",
        categories: Array.from({ length: 12 }, (_, index) => `Item ${index + 1}`),
        series: [{ name: "Values", values: [4, 7, 9, 10, 12, 12, 13, 15, 18, 21, 22, 30] }],
      },
      variant.id,
    )
  }
  if (variant.type === "waterfall") {
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Waterfall" },
        legend: "none",
        categories: ["Start", "Sales", "Returns", "Services", "Costs"],
        series: [{ name: "Change", values: [100, 40, -15, 25, -30] }],
      },
      variant.id,
    )
  }
  if (variant.type === "funnel") {
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Funnel" },
        legend: "none",
        categories: ["Visits", "Sign-ups", "Trials", "Customers"],
        series: [{ name: "People", values: [1000, 600, 300, 120] }],
      },
      variant.id,
    )
  }
  return withVariant(
    {
      ...structuredClone(BASE),
      categories: ["Category 1", "Category 2", "Category 3", "Category 4"],
      series: [
        { name: "Series 1", values: [4.3, 2.5, 3.5, 4.5] },
        { name: "Series 2", values: [2.4, 4.4, 1.8, 2.8] },
        { name: "Series 3", values: [2, 2, 3, 5] },
      ],
    },
    variant.id,
  )
}

/** A spec from saved JSON, filling in anything an older or partial spec leaves out. */
export function normalizeChartSpec(value: Partial<ChartSpec>): ChartSpec {
  const base = structuredClone(BASE)
  const spec: ChartSpec = {
    ...base,
    ...value,
    title: { ...base.title, ...value.title },
    axisTitles: {
      category: { ...base.axisTitles.category, ...value.axisTitles?.category },
      value: { ...base.axisTitles.value, ...value.axisTitles?.value },
    },
    axes: { ...base.axes, ...value.axes },
    gridlines: { ...base.gridlines, ...value.gridlines },
    labelContent: { ...base.labelContent, ...value.labelContent },
    valueAxis: { ...value.valueAxis },
    errorBars: { ...base.errorBars, ...value.errorBars },
    format: { ...value.format },
    categories: (value.categories ?? []).map(String),
    hiddenCategories: value.hiddenCategories ?? [],
    series: (value.series ?? []).map((serie, index) => ({
      ...serie,
      name: String(serie.name ?? `Series ${index + 1}`),
      values: (serie.values ?? []).map((item) => (Number.isFinite(Number(item)) ? Number(item) : 0)),
    })),
  }
  if (spec.series.length === 0) {
    spec.series = [{ name: "Series 1", values: spec.categories.map(() => 0) }]
  }
  spec.style = Math.min(14, Math.max(1, Math.round(spec.style) || 1))
  return spec
}

/** The chart a node shows: its spec, or one made from the sheet, type and options of a chart from before 20.8. */
export function chartSpecOf(attrs: Record<string, unknown>): ChartSpec {
  const raw = typeof attrs.chart === "string" ? attrs.chart : ""
  if (raw) {
    try {
      return normalizeChartSpec(JSON.parse(raw) as Partial<ChartSpec>)
    } catch {
      // A spec that cannot be read falls back to the sheet.
    }
  }
  const variantId = String(attrs.variant || "column")
  const sheet = parseChartSheet(String(attrs.values || ""))
  const spec = withVariant(
    { ...structuredClone(BASE), ...sheetData(sheet) },
    variantId === "bar" ? "column" : variantId,
  )
  const chrome = String(attrs.chrome ?? "axes").split(",")
  spec.title.show = chrome.includes("title")
  spec.legend = chrome.includes("legend") || sheet.series.length > 1 ? "bottom" : "none"
  spec.dataLabels = chrome.includes("labels") ? "outsideEnd" : "none"
  spec.axes = { category: chrome.includes("axes"), value: chrome.includes("axes") }
  spec.gridlines.major = false
  const accent = String(attrs.accent || "")
  if (accent && accent !== "#0f6cbd") {
    spec.format["series:0"] = { fill: accent }
  }
  const stroke = String(attrs.stroke || "")
  if (stroke) {
    spec.format.chartArea = { line: stroke, lineWidth: 2 }
  }
  return spec
}

export function serializeChartSpec(spec: ChartSpec) {
  return JSON.stringify(spec)
}

/** The chart's data as the sheet Edit Data shows: series in columns, categories in rows. */
export function specToSheet(spec: ChartSpec): ChartSheet {
  return {
    series: spec.series.map((serie) => serie.name),
    categories: [...spec.categories],
    rows: spec.categories.map((_, row) => spec.series.map((serie) => serie.values[row] ?? 0)),
  }
}

function sheetData(sheet: ChartSheet): Pick<ChartSpec, "categories" | "series"> {
  return {
    categories: [...sheet.categories],
    series: sheet.series.map((name, column) => ({ name, values: sheet.rows.map((row) => row[column] ?? 0) })),
  }
}

/** The spec with the sheet's data, keeping each series' options where its column is still there. */
export function withSheet(spec: ChartSpec, sheet: ChartSheet): ChartSpec {
  const data = sheetData(sheet)
  return {
    ...spec,
    categories: data.categories,
    hiddenCategories: spec.hiddenCategories.filter((index) => index < data.categories.length),
    series: data.series.map((serie, index) => ({ ...spec.series[index], ...serie })),
  }
}

/** Switch Row/Column: series become categories and categories series. */
export function switchRowColumn(spec: ChartSpec): ChartSpec {
  return {
    ...spec,
    categories: spec.series.map((serie) => serie.name),
    hiddenCategories: [],
    series: spec.categories.map((name, row) => ({ name, values: spec.series.map((serie) => serie.values[row] ?? 0) })),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Colours and styles
// ---------------------------------------------------------------------------------------------------------------

const ACCENTS = THEME_ACCENTS.filter((item) => item.id.startsWith("accent")).map((item) => item.color)

export const CHART_PALETTES: { id: string; label: string; group: "Colorful" | "Monochromatic"; colors: string[] }[] = [
  { id: "colorful1", label: "Colorful Palette 1", group: "Colorful", colors: ACCENTS },
  {
    id: "colorful2",
    label: "Colorful Palette 2",
    group: "Colorful",
    colors: [1, 3, 5, 0, 2, 4].map((i) => ACCENTS[i]!),
  },
  {
    id: "colorful3",
    label: "Colorful Palette 3",
    group: "Colorful",
    colors: [2, 4, 0, 1, 3, 5].map((i) => ACCENTS[i]!),
  },
  {
    id: "colorful4",
    label: "Colorful Palette 4",
    group: "Colorful",
    colors: [5, 4, 3, 2, 1, 0].map((i) => ACCENTS[i]!),
  },
  ...ACCENTS.map((color, index) => ({
    id: `mono${index + 1}`,
    label: `Monochromatic Palette ${index + 1}`,
    group: "Monochromatic" as const,
    colors: [-0.5, -0.25, 0, 0.3, 0.55, 0.75].map((amount) => shade(color, amount)),
  })),
  {
    id: "mono7",
    label: "Monochromatic Palette 7",
    group: "Monochromatic",
    colors: [-0.75, -0.55, -0.35, 0.1, 0.4, 0.7].map((amount) => shade("#7f7f7f", amount)),
  },
]

/** The colour of the n-th series (or pie slice) in the spec's palette. */
export function paletteColor(spec: Pick<ChartSpec, "palette">, index: number) {
  const palette = CHART_PALETTES.find((item) => item.id === spec.palette) ?? CHART_PALETTES[0]!
  const colors = palette.colors
  const base = colors[index % colors.length]!
  const round = Math.floor(index / colors.length)
  // Past the palette, Word repeats it darker, then lighter.
  return round === 0 ? base : shade(base, round % 2 ? -0.4 : 0.4)
}

type ChartLook = {
  background: string
  text: string
  border: string
  grid: string
  axis: string
  plot: string
  /** How a series is filled: solid, with a gradient, or lightly with its colour as the outline. */
  fill: "solid" | "gradient" | "tint" | "outline"
  seriesLine: string
  seriesLineWidth: number
  shadow: boolean
  gridDash: boolean
  titleBold: boolean
  labels?: LabelPosition
  noValueAxis?: boolean
  noGrid?: boolean
  gapWidth?: number
}

const LIGHT = {
  background: "#ffffff",
  text: "#595959",
  border: "#d9d9d9",
  grid: "#d9d9d9",
  axis: "#bfbfbf",
  plot: "none",
  fill: "solid",
  seriesLine: "none",
  seriesLineWidth: 0,
  shadow: false,
  gridDash: false,
  titleBold: false,
} satisfies ChartLook

const DARK = { ...LIGHT, background: "#404040", text: "#d9d9d9", border: "#404040", grid: "#595959", axis: "#7f7f7f" }

/** Word's fourteen chart styles, as looks laid over the spec. */
export const CHART_STYLES: ChartLook[] = [
  LIGHT,
  { ...LIGHT, labels: "outsideEnd", noValueAxis: true, noGrid: true, gapWidth: 100 },
  { ...LIGHT, fill: "tint", seriesLine: "series", seriesLineWidth: 1 },
  { ...LIGHT, gridDash: true, gapWidth: 80 },
  { ...LIGHT, plot: "#f2f2f2", grid: "#ffffff" },
  { ...LIGHT, seriesLine: "#ffffff", seriesLineWidth: 1.5, gridDash: true },
  { ...LIGHT, fill: "gradient" },
  { ...LIGHT, shadow: true, titleBold: true },
  { ...LIGHT, fill: "outline", seriesLine: "series", seriesLineWidth: 1.5, noGrid: true },
  DARK,
  { ...DARK, fill: "gradient", gapWidth: 80 },
  { ...DARK, background: "#1f3864", border: "#1f3864", grid: "#2f5597", labels: "insideEnd", noValueAxis: true },
  { ...LIGHT, background: "#deebf7", border: "#deebf7", grid: "#bdd7ee", titleBold: true },
  { ...LIGHT, gapWidth: 50, titleBold: true, shadow: true, noGrid: true, labels: "insideEnd" },
]

/** A style's look on the spec: its data labels, axes and gridlines as the style sets them. */
export function withStyle(spec: ChartSpec, style: number): ChartSpec {
  const look = CHART_STYLES[style - 1] ?? LIGHT
  const next: ChartSpec = { ...spec, style }
  next.dataLabels = look.labels ?? "none"
  next.axes = { ...spec.axes, value: !look.noValueAxis }
  next.gridlines = { ...spec.gridlines, major: !look.noGrid }
  if (look.gapWidth !== undefined && (spec.type === "column" || spec.type === "bar")) {
    next.gapWidth = look.gapWidth
  }
  return next
}

/** Word's Quick Layouts for a chart: which elements show, and where. */
export const QUICK_LAYOUTS: { id: number; label: string; apply: (spec: ChartSpec) => ChartSpec }[] = [
  [true, "right", false, false, "none", false, true],
  [true, "top", false, false, "outsideEnd", false, false],
  [true, "bottom", false, false, "none", false, true],
  [false, "bottom", false, false, "outsideEnd", false, false],
  [true, "none", false, true, "none", true, true],
  [true, "none", false, true, "none", false, true],
  [false, "right", true, true, "none", false, true],
  [true, "none", true, true, "none", false, false],
  [true, "right", true, true, "none", false, true],
  [true, "right", false, false, "none", false, true],
  [false, "right", false, false, "none", false, false],
].map(([title, legend, categoryTitle, valueTitle, labels, table, grid], index) => ({
  id: index + 1,
  label: `Layout ${index + 1}`,
  apply: (spec: ChartSpec) => ({
    ...spec,
    title: { ...spec.title, show: Boolean(title) },
    legend: legend as LegendPosition,
    axisTitles: {
      category: { ...spec.axisTitles.category, show: Boolean(categoryTitle) },
      value: { ...spec.axisTitles.value, show: Boolean(valueTitle) },
    },
    dataLabels: labels as LabelPosition,
    dataTable: Boolean(table),
    gridlines: { ...spec.gridlines, major: Boolean(grid) },
    gapWidth: index === 9 ? 0 : spec.gapWidth,
  }),
}))

// ---------------------------------------------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------------------------------------------

export const NUMBER_FORMATS = [
  { id: "General", label: "General" },
  { id: "0", label: "Number (0)" },
  { id: "0.00", label: "Number (0.00)" },
  { id: "#,##0", label: "Number (#,##0)" },
  { id: "$#,##0.00", label: "Currency" },
  { id: "0%", label: "Percentage" },
  { id: "0.0E+00", label: "Scientific" },
]

export function formatNumber(value: number, format = "General") {
  if (!Number.isFinite(value)) {
    return ""
  }
  switch (format) {
    case "0":
      return Math.round(value).toString()
    case "0.0":
      return value.toFixed(1)
    case "0.00":
      return value.toFixed(2)
    case "#,##0":
      return Math.round(value).toLocaleString("en-US")
    case "$#,##0.00":
      return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    case "0%":
      return `${Math.round(value * 100)}%`
    case "0.0E+00":
      return value.toExponential(1).toUpperCase()
    default: {
      const rounded = Math.round(value * 1e6) / 1e6
      return String(rounded)
    }
  }
}

/** Round tick marks covering the range, as Word picks them. */
export function niceScale(low: number, high: number, axis: ValueAxis = {}, count = 5) {
  let min = axis.min ?? Math.min(0, low)
  let max = axis.max ?? Math.max(0, high)
  if (max === min) {
    max = min + 1
  }
  const raw = (max - min) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = axis.major ?? [1, 2, 2.5, 5, 10].map((item) => item * power).find((item) => item >= raw)!
  if (axis.min === undefined) {
    min = Math.floor(min / step) * step
  }
  if (axis.max === undefined) {
    max = Math.ceil(max / step - 1e-9) * step
    if (max <= high && high > 0 && axis.max === undefined && max - high < step * 0.05) {
      max += step
    }
  }
  const ticks: number[] = []
  for (let value = min; value <= max + step / 1000; value += step) {
    ticks.push(Math.round(value / step) * step)
  }
  return { min, max, step, ticks }
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------------------------

export const CHART_FONT = "Aptos, Calibri, 'Segoe UI', Arial, sans-serif"
const TEXT_SIZE = 12
const TITLE_SIZE = 18.7
const CHAR = 6.4

/** How many value-axis labels fit in `span` pixels at `size` pixels each: five at most, two at least. */
export function labelCount(span: number, size: number) {
  return Math.max(2, Math.min(5, Math.floor(span / size)))
}

/** Every how-manyth category label shows so the shown ones do not touch: 1 when all fit. */
export function labelStep(band: number, size: number) {
  return Math.max(1, Math.ceil(size / Math.max(1, band)))
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function n(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0
}

type Box = { x: number; y: number; w: number; h: number }

type Painter = {
  spec: ChartSpec
  look: ChartLook
  out: string[]
  defs: string[]
}

/** The colour, outline and text format a part has: its own, or the style's. */
function partFill(painter: Painter, part: string, fallback: string) {
  return painter.spec.format[part]?.fill || fallback
}

function partLine(painter: Painter, part: string, fallback: string, width = 1) {
  const format = painter.spec.format[part]
  return { stroke: format?.line || fallback, width: format?.lineWidth ?? width }
}

function textAttrs(painter: Painter, part: string, size = TEXT_SIZE, bold = false) {
  const format = painter.spec.format[part]
  const weight = (format?.bold ?? bold) ? ` font-weight="700"` : ""
  return `font-family="${CHART_FONT}" font-size="${format?.fontSize ? n((format.fontSize * 4) / 3) : size}" fill="${format?.color || painter.look.text}"${weight}`
}

function seriesColor(painter: Painter, index: number) {
  return painter.spec.format[`series:${index}`]?.fill || paletteColor(painter.spec, index)
}

function pointColor(painter: Painter, index: number) {
  return painter.spec.format[`point:${index}`]?.fill || paletteColor(painter.spec, index)
}

/** Fill and outline for a series' bar, area or slice, by the style's look. */
function seriesPaint(painter: Painter, color: string, part: string) {
  const { look } = painter
  let fill = color
  if (look.fill === "gradient") {
    const id = `g${painter.defs.length}`
    painter.defs.push(
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(color, 0.35)}"/><stop offset="1" stop-color="${shade(color, -0.15)}"/></linearGradient>`,
    )
    fill = `url(#${id})`
  } else if (look.fill === "tint") {
    fill = shade(color, 0.45)
  } else if (look.fill === "outline") {
    fill = shade(color, 0.8)
  }
  const own = painter.spec.format[part]
  if (own?.fill) {
    fill = own.fill
  }
  const stroke = own?.line || (look.seriesLine === "series" ? color : look.seriesLine)
  const width = own?.lineWidth ?? look.seriesLineWidth
  const shadow = look.shadow ? ` filter="url(#chart-shadow)"` : ""
  return `fill="${fill}" stroke="${stroke}" stroke-width="${width}"${shadow}`
}

/** The chart, as the markup inside an `<svg viewBox="0 0 width height">`. */
export function renderChart(source: ChartSpec, width: number, height: number) {
  const spec = expandSpec(source)
  const look = CHART_STYLES[spec.style - 1] ?? LIGHT
  const painter: Painter = { spec, look, out: [], defs: [] }
  const area = partLine(painter, "chartArea", look.border, 0.75)
  painter.out.push(
    `<rect data-chart-part="chartArea" x="0.5" y="0.5" width="${n(width - 1)}" height="${n(height - 1)}" fill="${partFill(painter, "chartArea", look.background)}" stroke="${area.stroke}" stroke-width="${area.width}"/>`,
  )
  const box: Box = { x: 10, y: 8, w: width - 20, h: height - 16 }
  if (spec.title.show) {
    const size = spec.format.title?.fontSize ? (spec.format.title.fontSize * 4) / 3 : TITLE_SIZE
    painter.out.push(
      `<text data-chart-part="title" x="${n(width / 2)}" y="${n(box.y + size)}" text-anchor="middle" ${textAttrs(painter, "title", TITLE_SIZE, look.titleBold)}>${escapeXml(spec.title.text)}</text>`,
    )
    box.y += size + 10
    box.h -= size + 10
  }
  const round = spec.type === "pie" || spec.type === "doughnut"
  const visibleSeries = spec.series.map((serie, index) => ({ ...serie, index })).filter((serie) => !serie.hidden)
  const entries = round
    ? spec.categories
        .map((name, index) => ({ name, color: pointColor(painter, index), index, line: false }))
        .filter((entry) => !spec.hiddenCategories.includes(entry.index))
    : visibleSeries.map((serie) => ({
        name: serie.name,
        color: seriesColor(painter, serie.index),
        index: serie.index,
        line:
          (serie.type ?? spec.type) === "line" || spec.type === "scatter" || (spec.type === "radar" && !spec.filled),
      }))
  if (spec.legend !== "none" && !(spec.dataTable && !round)) {
    legend(painter, entries, box, spec.legend)
  }
  if (round) {
    pie(painter, box)
  } else if (spec.type === "radar") {
    radar(painter, box, visibleSeries)
  } else {
    cartesian(painter, box, visibleSeries, entries)
  }
  const defs = [
    ...painter.defs,
    look.shadow
      ? `<filter id="chart-shadow" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="1.5" dy="1.5" stdDeviation="1.2" flood-opacity="0.35"/></filter>`
      : "",
  ].join("")
  return `${defs ? `<defs>${defs}</defs>` : ""}${painter.out.join("")}`
}

function legend(painter: Painter, entries: { name: string; color: string; line: boolean }[], box: Box, at: string) {
  if (entries.length === 0) {
    return
  }
  const key = (entry: { color: string; line: boolean }, x: number, y: number) =>
    entry.line
      ? `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + 14)}" y2="${n(y)}" stroke="${entry.color}" stroke-width="2.25"/>`
      : `<rect x="${n(x + 3)}" y="${n(y - 3.5)}" width="7" height="7" fill="${entry.color}"/>`
  const text = textAttrs(painter, "legend")
  const parts: string[] = []
  if (at === "right" || at === "left") {
    const widest = Math.min(box.w * 0.35, Math.max(...entries.map((entry) => entry.name.length)) * CHAR + 22)
    const rowHeight = 18
    const top = box.y + box.h / 2 - (entries.length * rowHeight) / 2 + rowHeight / 2
    const x = at === "right" ? box.x + box.w - widest : box.x
    entries.forEach((entry, index) => {
      const y = top + index * rowHeight
      parts.push(key(entry, x, y), `<text x="${n(x + 18)}" y="${n(y + 4)}" ${text}>${escapeXml(entry.name)}</text>`)
    })
    if (at === "left") {
      box.x += widest + 8
    }
    box.w -= widest + 8
  } else {
    const widths = entries.map((entry) => entry.name.length * CHAR + 30)
    const rows: number[][] = [[]]
    let used = 0
    widths.forEach((itemWidth, index) => {
      if (used + itemWidth > box.w && rows[rows.length - 1]!.length > 0) {
        rows.push([])
        used = 0
      }
      rows[rows.length - 1]!.push(index)
      used += itemWidth
    })
    const rowHeight = 18
    const total = rows.length * rowHeight
    const top = at === "top" ? box.y + rowHeight / 2 : box.y + box.h - total + rowHeight / 2
    rows.forEach((row, rowIndex) => {
      const rowWidth = row.reduce((sum, index) => sum + widths[index]!, 0)
      let x = box.x + box.w / 2 - rowWidth / 2
      const y = top + rowIndex * rowHeight
      row.forEach((index) => {
        const entry = entries[index]!
        parts.push(key(entry, x, y), `<text x="${n(x + 18)}" y="${n(y + 4)}" ${text}>${escapeXml(entry.name)}</text>`)
        x += widths[index]!
      })
    })
    if (at === "top") {
      box.y += total + 6
    }
    box.h -= total + 6
  }
  painter.out.push(`<g data-chart-part="legend">${parts.join("")}</g>`)
}

/** The values a series shows, one per visible category. */
function visibleValues(spec: ChartSpec, values: number[]) {
  return spec.categories
    .map((_, index) => index)
    .filter((index) => !spec.hiddenCategories.includes(index))
    .map((index) => values[index] ?? 0)
}

type Serie = ChartSeries & { index: number }

function cartesian(painter: Painter, box: Box, series: Serie[], entries: { name: string; color: string }[]) {
  const { spec, look } = painter
  const horizontal = spec.type === "bar"
  const scatter = spec.type === "scatter"
  const categories = spec.categories.filter((_, index) => !spec.hiddenCategories.includes(index))
  const count = Math.max(1, categories.length)
  const kindOf = (serie: Serie) => (scatter ? "scatter" : (serie.type ?? (horizontal ? "column" : spec.type)))
  const primary = series.filter((serie) => !serie.secondary)
  const secondary = series.filter((serie) => serie.secondary)
  const stackedKind = horizontal ? "column" : spec.type
  const stacking = spec.grouping !== "clustered" && !scatter
  const values = new Map(series.map((serie) => [serie.index, visibleValues(spec, serie.values)]))
  // Stacked series sit on the ones before them; 100% stacked ones are shares of each category's total.
  const stacked = new Map<number, { from: number[]; to: number[] }>()
  if (stacking) {
    const totals = categories.map((_, column) =>
      primary
        .filter((serie) => kindOf(serie) === stackedKind)
        .reduce((sum, serie) => sum + Math.abs(values.get(serie.index)![column] ?? 0), 0),
    )
    const up = categories.map(() => 0)
    const down = categories.map(() => 0)
    for (const serie of primary.filter((item) => kindOf(item) === stackedKind)) {
      const own = values.get(serie.index)!
      const from: number[] = []
      const to: number[] = []
      own.forEach((raw, column) => {
        const value = spec.grouping === "percent" ? raw / (totals[column] || 1) : raw
        const base = value >= 0 ? up : down
        from.push(base[column]!)
        base[column]! += value
        to.push(base[column]!)
      })
      stacked.set(serie.index, { from, to })
    }
  }
  const rangeOf = (list: Serie[]) => {
    const numbers = list.flatMap((serie) => {
      const stack = stacked.get(serie.index)
      return stack ? [...stack.from, ...stack.to] : values.get(serie.index)!
    })
    return numbers.length ? [Math.min(...numbers), Math.max(...numbers)] : [0, 1]
  }
  const percent = spec.grouping === "percent" && !scatter
  const format = spec.valueAxis.numberFormat ?? (percent ? "0%" : "General")
  const [low, high] = rangeOf(primary.length ? primary : series)
  // Fewer, rounder steps as the chart shrinks, so the axis labels never run into each other.
  const valueCount = horizontal ? labelCount(box.w - 60, 6 * CHAR + 14) : labelCount(box.h - 40, 28)
  const scale = niceScale(
    low!,
    high!,
    percent ? { min: low! < 0 ? -1 : 0, max: 1, major: 0.1, ...spec.valueAxis } : spec.valueAxis,
    valueCount,
  )
  const [low2, high2] = rangeOf(secondary)
  const scale2 = secondary.length ? niceScale(low2!, high2!) : null
  const xNumbers = scatter
    ? categories.map((item, index) => (Number.isFinite(Number(item)) ? Number(item) : index + 1))
    : []
  const xScale = scatter
    ? niceScale(Math.min(...xNumbers, 0), Math.max(...xNumbers, 1), {}, labelCount(box.w - 60, 6 * CHAR + 14))
    : null

  // Room for the axis titles, the labels and the data table, then the plot area takes what is left.
  const showValueAxis = spec.axes.value
  const showCategoryAxis = spec.axes.category
  const valueLabelWidth = showValueAxis
    ? Math.max(...scale.ticks.map((tick) => formatNumber(tick, format).length)) * CHAR + 8
    : 0
  const categoryLabelWidth = horizontal
    ? Math.min(box.w * 0.35, Math.max(...categories.map((item) => item.length)) * CHAR + 8)
    : 0
  const plot: Box = { ...box }
  const valueTitle = spec.axisTitles.value.show
  const categoryTitle = spec.axisTitles.category.show
  const leftTitle = horizontal ? categoryTitle : valueTitle
  const bottomTitle = horizontal ? valueTitle : categoryTitle
  if (leftTitle) {
    plot.x += 20
    plot.w -= 20
  }
  if (bottomTitle) {
    plot.h -= 20
  }
  const tableRows = spec.dataTable ? series.length + 1 : 0
  const tableHeight = tableRows * 17
  if (spec.dataTable) {
    plot.h -= tableHeight
  }
  if (horizontal) {
    if (showCategoryAxis) {
      plot.x += categoryLabelWidth
      plot.w -= categoryLabelWidth
    }
    if (showValueAxis) {
      plot.h -= 18
    }
  } else {
    plot.x += valueLabelWidth
    plot.w -= valueLabelWidth
    if (scale2) {
      const width2 = Math.max(...scale2.ticks.map((tick) => formatNumber(tick).length)) * CHAR + 8
      plot.w -= width2
    }
    if ((showCategoryAxis || scatter) && !spec.dataTable) {
      plot.h -= 18
    }
  }
  plot.w = Math.max(10, plot.w)
  plot.h = Math.max(10, plot.h)
  const plotLine = partLine(painter, "plotArea", "none", 0.75)
  painter.out.push(
    `<rect data-chart-part="plotArea" x="${n(plot.x)}" y="${n(plot.y)}" width="${n(plot.w)}" height="${n(plot.h)}" fill="${partFill(painter, "plotArea", look.plot)}" stroke="${plotLine.stroke}" stroke-width="${plotLine.width}" pointer-events="all"/>`,
  )

  const valueSpan = horizontal ? plot.w : plot.h
  const toValue = (value: number, current = scale) => {
    let share = (value - current.min) / (current.max - current.min || 1)
    if (spec.valueAxis.log && current === scale && value > 0 && current.min > 0) {
      share = Math.log(value / current.min) / Math.log(current.max / current.min)
    }
    if (spec.valueAxis.reverse) {
      share = 1 - share
    }
    return horizontal ? plot.x + share * valueSpan : plot.y + plot.h - share * valueSpan
  }
  const band = (horizontal ? plot.h : plot.w) / count
  const areaOnly = series.length > 0 && series.every((serie) => kindOf(serie) === "area")
  const slot = (column: number) => {
    const ordered = spec.categoryReverse ? count - 1 - column : column
    // Bars run top-down in Word's bar chart: the first category sits at the bottom.
    const place = horizontal ? count - 1 - ordered : ordered
    if (areaOnly && !horizontal) {
      return plot.x + (count <= 1 ? plot.w / 2 : (ordered / (count - 1)) * plot.w)
    }
    return (horizontal ? plot.y : plot.x) + place * band + band / 2
  }
  const toX = (value: number) => plot.x + ((value - xScale!.min) / (xScale!.max - xScale!.min || 1)) * plot.w

  // Gridlines.
  const grid: string[] = []
  const gridLine = partLine(painter, "gridlines", look.grid, 0.75)
  const dash = look.gridDash ? ` stroke-dasharray="3 2"` : ""
  const gridAt = (value: number, minor = false) => {
    const at = toValue(value)
    const stroke = minor ? shade(gridLine.stroke, 0.5) : gridLine.stroke
    grid.push(
      horizontal
        ? `<line x1="${n(at)}" y1="${n(plot.y)}" x2="${n(at)}" y2="${n(plot.y + plot.h)}" stroke="${stroke}" stroke-width="${gridLine.width}"${dash}/>`
        : `<line x1="${n(plot.x)}" y1="${n(at)}" x2="${n(plot.x + plot.w)}" y2="${n(at)}" stroke="${stroke}" stroke-width="${gridLine.width}"${dash}/>`,
    )
  }
  if (spec.gridlines.minor) {
    scale.ticks.slice(0, -1).forEach((tick) => gridAt(tick + scale.step / 2, true))
  }
  if (spec.gridlines.major) {
    scale.ticks.forEach((tick) => gridAt(tick))
  }
  if (spec.gridlines.vertical) {
    if (xScale) {
      xScale.ticks.forEach((tick) => {
        const x = toX(tick)
        grid.push(
          `<line x1="${n(x)}" y1="${n(plot.y)}" x2="${n(x)}" y2="${n(plot.y + plot.h)}" stroke="${gridLine.stroke}" stroke-width="${gridLine.width}"/>`,
        )
      })
    } else {
      for (let column = 0; column <= count; column += 1) {
        const at = (horizontal ? plot.y : plot.x) + column * band
        grid.push(
          horizontal
            ? `<line x1="${n(plot.x)}" y1="${n(at)}" x2="${n(plot.x + plot.w)}" y2="${n(at)}" stroke="${gridLine.stroke}" stroke-width="${gridLine.width}"/>`
            : `<line x1="${n(at)}" y1="${n(plot.y)}" x2="${n(at)}" y2="${n(plot.y + plot.h)}" stroke="${gridLine.stroke}" stroke-width="${gridLine.width}"/>`,
        )
      }
    }
  }
  if (grid.length) {
    painter.out.push(`<g data-chart-part="gridlines">${grid.join("")}</g>`)
  }

  // Axes.
  const axisLine = partLine(painter, "axis:category", look.axis, 0.75)
  const valueText = textAttrs(painter, "axis:value")
  const categoryText = textAttrs(painter, "axis:category")
  if (showValueAxis) {
    const labels = scale.ticks.map((tick) => {
      const at = toValue(tick)
      const label = escapeXml(formatNumber(tick, format))
      return horizontal
        ? `<text x="${n(at)}" y="${n(plot.y + plot.h + 14)}" text-anchor="middle" ${valueText}>${label}</text>`
        : `<text x="${n(plot.x - 6)}" y="${n(at + 4)}" text-anchor="end" ${valueText}>${label}</text>`
    })
    painter.out.push(`<g data-chart-part="axis:value">${labels.join("")}</g>`)
  }
  if (scale2) {
    const labels = scale2.ticks.map((tick) => {
      const at = toValue(tick, scale2)
      return `<text x="${n(plot.x + plot.w + 6)}" y="${n(at + 4)}" ${valueText}>${escapeXml(formatNumber(tick))}</text>`
    })
    painter.out.push(`<g data-chart-part="axis:secondary">${labels.join("")}</g>`)
  }
  if (scatter && xScale && showCategoryAxis) {
    const labels = xScale.ticks.map(
      (tick) =>
        `<text x="${n(toX(tick))}" y="${n(plot.y + plot.h + 14)}" text-anchor="middle" ${categoryText}>${escapeXml(formatNumber(tick))}</text>`,
    )
    painter.out.push(`<g data-chart-part="axis:category">${labels.join("")}</g>`)
  } else if (showCategoryAxis) {
    const zero = toValue(Math.max(scale.min, Math.min(scale.max, 0)))
    const line = horizontal
      ? `<line x1="${n(zero)}" y1="${n(plot.y)}" x2="${n(zero)}" y2="${n(plot.y + plot.h)}" stroke="${axisLine.stroke}" stroke-width="${axisLine.width}"/>`
      : `<line x1="${n(plot.x)}" y1="${n(zero)}" x2="${n(plot.x + plot.w)}" y2="${n(zero)}" stroke="${axisLine.stroke}" stroke-width="${axisLine.width}"/>`
    const widest = Math.max(1, ...categories.map((item) => item.length)) * CHAR + 6
    const every = horizontal ? labelStep(band, 14) : labelStep(band, Math.min(widest, 5 * CHAR + 6))
    const labels = spec.dataTable
      ? []
      : categories.flatMap((name, column) => {
          if (column % every !== 0) {
            return []
          }
          const at = slot(column)
          const fit = horizontal ? name : clip(name, band * every)
          return horizontal
            ? `<text x="${n(plot.x - 6)}" y="${n(at + 4)}" text-anchor="end" ${categoryText}>${escapeXml(fit)}</text>`
            : `<text x="${n(at)}" y="${n(plot.y + plot.h + 14)}" text-anchor="middle" ${categoryText}>${escapeXml(fit)}</text>`
        })
    painter.out.push(`<g data-chart-part="axis:category">${line}${labels.join("")}</g>`)
  }

  // Series: areas first, then bars, then lines and points, as Word layers a combo chart.
  const bars = series.filter((serie) => kindOf(serie) === "column")
  const order = ["area", "column", "line", "scatter"]
  const labels: string[] = []
  const overlap = stacking ? 1 : spec.overlap / 100
  const gap = spec.gapWidth / 100
  const barCount = stacking ? 1 : Math.max(1, bars.length)
  const barWidth = band / (1 + (barCount - 1) * (1 - overlap) + gap)
  const labelPosition = spec.dataLabels
  for (const kind of order) {
    for (const serie of series.filter((item) => kindOf(item) === kind)) {
      const own = values.get(serie.index)!
      const stack = stacked.get(serie.index)
      const color = seriesColor(painter, serie.index)
      const current = serie.secondary && scale2 ? scale2 : scale
      const shapes: string[] = []
      const points = own.map((value, column) => {
        const top = stack ? stack.to[column]! : value
        const base = stack ? stack.from[column]! : Math.max(current.min, Math.min(current.max, 0))
        return {
          value,
          column,
          at: scatter ? toX(xNumbers[column]!) : slot(column),
          top: toValue(top, current),
          base: toValue(base, current),
        }
      })
      if (kind === "column") {
        const place = stacking ? 0 : bars.indexOf(serie)
        const offset = -((barCount - 1) * (1 - overlap) * barWidth + barWidth) / 2 + place * (1 - overlap) * barWidth
        const paint = seriesPaint(painter, color, `series:${serie.index}`)
        for (const point of points) {
          const start = point.at + offset
          const from = Math.min(point.top, point.base)
          const length = Math.abs(point.top - point.base)
          shapes.push(
            horizontal
              ? `<rect x="${n(from)}" y="${n(start)}" width="${n(length)}" height="${n(barWidth)}" ${paint}/>`
              : `<rect x="${n(start)}" y="${n(from)}" width="${n(barWidth)}" height="${n(length)}" ${paint}/>`,
          )
          if (labelPosition !== "none") {
            labels.push(barLabel(painter, serie, point, start + barWidth / 2, horizontal, labelPosition))
          }
        }
      } else if (kind === "area") {
        const top = points.map((point) => `${n(point.at)},${n(point.top)}`)
        const base = [...points].reverse().map((point) => `${n(point.at)},${n(point.base)}`)
        shapes.push(
          `<polygon points="${[...top, ...base].join(" ")}" ${seriesPaint(painter, color, `series:${serie.index}`)}/>`,
        )
        if (labelPosition !== "none") {
          points.forEach((point) =>
            labels.push(textLabel(painter, serie, point, point.at, (point.top + point.base) / 2 + 4)),
          )
        }
      } else {
        const line = partLine(painter, `series:${serie.index}`, color, 2.25)
        const joined = !scatter || spec.lines
        if (joined && points.length > 1) {
          const coords = points.map((point) => [point.at, point.top] as [number, number])
          const path = spec.smooth ? smoothPath(coords) : `M${coords.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L")}`
          shapes.push(
            `<path d="${path}" fill="none" stroke="${line.stroke}" stroke-width="${line.width}" stroke-linejoin="round" stroke-linecap="round"/>`,
          )
        }
        if (spec.markers || (scatter && !spec.lines)) {
          for (const point of points) {
            shapes.push(`<circle cx="${n(point.at)}" cy="${n(point.top)}" r="3.4" fill="${color}" stroke="${color}"/>`)
          }
        }
        if (labelPosition !== "none") {
          points.forEach((point) =>
            labels.push(
              textLabel(painter, serie, point, point.at, labelPosition === "center" ? point.top + 4 : point.top - 7),
            ),
          )
        }
      }
      painter.out.push(`<g data-chart-part="series:${serie.index}">${shapes.join("")}</g>`)
      if (spec.errorBars.kind !== "none") {
        const errors = errorAmounts(spec.errorBars.kind, spec.errorBars.amount, own)
        const bars = points.map((point, column) => {
          const top = stack ? stack.to[column]! : point.value
          const low = toValue(top - errors[column]!, current)
          const high = toValue(top + errors[column]!, current)
          const along = point.at
          return horizontal
            ? `<path d="M${n(low)} ${n(along)}H${n(high)}M${n(low)} ${n(along - 3)}V${n(along + 3)}M${n(high)} ${n(along - 3)}V${n(along + 3)}"/>`
            : `<path d="M${n(along)} ${n(low)}V${n(high)}M${n(along - 3)} ${n(low)}H${n(along + 3)}M${n(along - 3)} ${n(high)}H${n(along + 3)}"/>`
        })
        painter.out.push(
          `<g data-chart-part="errorBars:${serie.index}" fill="none" stroke="${look.axis}" stroke-width="1">${bars.join("")}</g>`,
        )
      }
      if (serie.trendline && serie.trendline !== "none" && !stack) {
        const trend = trendline(
          serie.trendline,
          points.map((point, index) => [scatter ? xNumbers[index]! : index + 1, point.value]),
        )
        if (trend.length > 1) {
          const stepAlong = count > 1 ? slot(1) - slot(0) : 0
          const coords = trend.map(([x, y]) => {
            const along = scatter ? toX(x) : slot(0) + (x - 1) * stepAlong
            return horizontal ? [toValue(y, current), along] : [along, toValue(y, current)]
          })
          painter.out.push(
            `<path data-chart-part="trendline:${serie.index}" d="M${coords.map(([x, y]) => `${n(x!)} ${n(y!)}`).join(" L")}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
          )
        }
      }
    }
  }
  // Drop lines, high-low lines and up/down bars (22.14) belong to line and area charts.
  const lined = series.filter((serie) => kindOf(serie) === "line" || kindOf(serie) === "area")
  if (!horizontal && !scatter && lined.length) {
    const at = (serie: Serie, column: number) => {
      const current = serie.secondary && scale2 ? scale2 : scale
      return toValue(values.get(serie.index)![column] ?? 0, current)
    }
    const zero = toValue(Math.max(scale.min, Math.min(scale.max, 0)))
    const extras: string[] = []
    if (spec.dropLines) {
      for (const serie of lined) {
        categories.forEach((_, column) => {
          extras.push(
            `<line x1="${n(slot(column))}" y1="${n(at(serie, column))}" x2="${n(slot(column))}" y2="${n(zero)}"/>`,
          )
        })
      }
    }
    if (spec.highLowLines && lined.length > 1) {
      categories.forEach((_, column) => {
        const ys = lined.map((serie) => at(serie, column))
        extras.push(
          `<line x1="${n(slot(column))}" y1="${n(Math.min(...ys))}" x2="${n(slot(column))}" y2="${n(Math.max(...ys))}"/>`,
        )
      })
    }
    if (extras.length) {
      painter.out.push(
        `<g data-chart-part="lines" stroke="${look.axis}" stroke-width="1" stroke-dasharray="3 2">${extras.join("")}</g>`,
      )
    }
    if (spec.upDownBars && lined.length > 1) {
      const first = lined[0]!
      const last = lined[lined.length - 1]!
      const width = Math.max(4, band * 0.4)
      const rects = categories.map((_, column) => {
        const from = values.get(first.index)![column] ?? 0
        const to = values.get(last.index)![column] ?? 0
        const y1 = at(first, column)
        const y2 = at(last, column)
        return `<rect x="${n(slot(column) - width / 2)}" y="${n(Math.min(y1, y2))}" width="${n(width)}" height="${n(Math.max(1, Math.abs(y1 - y2)))}" fill="${to >= from ? "#ffffff" : "#404040"}" stroke="#404040" stroke-width="1"/>`
      })
      painter.out.push(`<g data-chart-part="upDownBars">${rects.join("")}</g>`)
    }
  }
  if (labels.length) {
    painter.out.push(`<g data-chart-part="dataLabels">${labels.join("")}</g>`)
  }

  // Axis titles.
  if (valueTitle) {
    const text = escapeXml(spec.axisTitles.value.text)
    painter.out.push(
      horizontal
        ? `<text data-chart-part="axisTitle:value" x="${n(plot.x + plot.w / 2)}" y="${n(plot.y + plot.h + 34)}" text-anchor="middle" ${textAttrs(painter, "axisTitle:value", 13.3, true)}>${text}</text>`
        : `<text data-chart-part="axisTitle:value" transform="translate(${n(box.x + 10)} ${n(plot.y + plot.h / 2)}) rotate(-90)" text-anchor="middle" ${textAttrs(painter, "axisTitle:value", 13.3, true)}>${text}</text>`,
    )
  }
  if (categoryTitle) {
    const text = escapeXml(spec.axisTitles.category.text)
    const below = plot.y + plot.h + (horizontal ? 0 : 18) + tableHeight + 16
    painter.out.push(
      horizontal
        ? `<text data-chart-part="axisTitle:category" transform="translate(${n(box.x + 10)} ${n(plot.y + plot.h / 2)}) rotate(-90)" text-anchor="middle" ${textAttrs(painter, "axisTitle:category", 13.3, true)}>${text}</text>`
        : `<text data-chart-part="axisTitle:category" x="${n(plot.x + plot.w / 2)}" y="${n(below)}" text-anchor="middle" ${textAttrs(painter, "axisTitle:category", 13.3, true)}>${text}</text>`,
    )
  }
  if (spec.dataTable && !horizontal && !scatter) {
    dataTable(painter, plot, band, categories, series, values, entries, slot)
  }
}

/** A label cut to fit its band, with an ellipsis. */
function clip(text: string, room: number) {
  const fits = Math.max(1, Math.floor(room / CHAR))
  return text.length <= fits ? text : `${text.slice(0, Math.max(1, fits - 1))}…`
}

/** The plus-and-minus amount of an error bar at each point of a series (22.14). */
export function errorAmounts(kind: ErrorBarKind, amount: number, values: number[]): number[] {
  if (kind === "none") {
    return values.map(() => 0)
  }
  if (kind === "fixed") {
    return values.map(() => Math.abs(amount))
  }
  if (kind === "percent") {
    return values.map((value) => Math.abs(value) * (Math.abs(amount) / 100))
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / (values.length || 1)
  const spread =
    values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : 0
  const each = kind === "stderr" ? spread / Math.sqrt(values.length || 1) : spread * (Math.abs(amount) || 1)
  return values.map(() => each)
}

function labelText(spec: ChartSpec, serie: Serie, value: number, column: number, share?: number) {
  const parts: string[] = []
  const content = spec.labelContent
  const visible = spec.categories.filter((_, index) => !spec.hiddenCategories.includes(index))
  if (content.series) {
    parts.push(serie.name)
  }
  if (content.category) {
    parts.push(visible[column] ?? "")
  }
  if (content.value || parts.length === 0) {
    parts.push(formatNumber(value, spec.valueAxis.numberFormat))
  }
  if (content.percent && share !== undefined) {
    parts.push(`${Math.round(share * 100)}%`)
  }
  return parts.join(", ")
}

function textLabel(painter: Painter, serie: Serie, point: { value: number; column: number }, x: number, y: number) {
  return `<text x="${n(x)}" y="${n(y)}" text-anchor="middle" ${textAttrs(painter, "dataLabels")}>${escapeXml(labelText(painter.spec, serie, point.value, point.column))}</text>`
}

function barLabel(
  painter: Painter,
  serie: Serie,
  point: { value: number; column: number; top: number; base: number },
  middle: number,
  horizontal: boolean,
  position: LabelPosition,
) {
  const text = escapeXml(labelText(painter.spec, serie, point.value, point.column))
  const attrs = textAttrs(painter, "dataLabels")
  // The way the bar grows on screen, and how far a label sits from an end, by its baseline.
  const grows = point.top >= point.base ? 1 : -1
  const ahead = horizontal ? 14 : grows < 0 ? 5 : 14
  const behind = horizontal ? 14 : grows < 0 ? 14 : 5
  const along = (() => {
    switch (position) {
      case "center":
        return (point.top + point.base) / 2 + (horizontal ? 0 : 4)
      case "insideEnd":
        return point.top - grows * behind
      case "insideBase":
        return point.base + grows * ahead
      default:
        return point.top + grows * ahead
    }
  })()
  return horizontal
    ? `<text x="${n(along)}" y="${n(middle + 4)}" text-anchor="middle" ${attrs}>${text}</text>`
    : `<text x="${n(middle)}" y="${n(along)}" text-anchor="middle" ${attrs}>${text}</text>`
}

function dataTable(
  painter: Painter,
  plot: Box,
  band: number,
  categories: string[],
  series: Serie[],
  values: Map<number, number[]>,
  entries: { name: string; color: string }[],
  slot: (column: number) => number,
) {
  const top = plot.y + plot.h + 2
  const rowHeight = 17
  const border = painter.look.border
  const text = textAttrs(painter, "dataTable")
  const cells: string[] = []
  const rows = series.length + 1
  const left = Math.min(plot.x, 10 + Math.max(...series.map((serie) => serie.name.length)) * CHAR + 18)
  const keyWidth = plot.x - left
  for (let row = 0; row <= rows; row += 1) {
    const y = top + row * rowHeight
    cells.push(
      `<line x1="${n(row === 0 ? plot.x : left)}" y1="${n(y)}" x2="${n(plot.x + plot.w)}" y2="${n(y)}" stroke="${border}"/>`,
    )
  }
  for (let column = 0; column <= categories.length; column += 1) {
    const x = plot.x + column * band
    cells.push(`<line x1="${n(x)}" y1="${n(top)}" x2="${n(x)}" y2="${n(top + rows * rowHeight)}" stroke="${border}"/>`)
  }
  cells.push(
    `<line x1="${n(left)}" y1="${n(top + rowHeight)}" x2="${n(left)}" y2="${n(top + rows * rowHeight)}" stroke="${border}"/>`,
  )
  categories.forEach((name, column) => {
    cells.push(
      `<text x="${n(slot(column))}" y="${n(top + 12.5)}" text-anchor="middle" ${text}>${escapeXml(clip(name, band))}</text>`,
    )
  })
  series.forEach((serie, row) => {
    const y = top + (row + 1) * rowHeight + 12.5
    const entry = entries.find((item) => item.name === serie.name)
    if (keyWidth > 20) {
      cells.push(
        `<rect x="${n(left + 4)}" y="${n(y - 7.5)}" width="7" height="7" fill="${entry?.color ?? seriesColor(painter, serie.index)}"/>`,
        `<text x="${n(left + 15)}" y="${n(y)}" ${text}>${escapeXml(clip(serie.name, keyWidth - 18))}</text>`,
      )
    }
    values.get(serie.index)!.forEach((value, column) => {
      cells.push(
        `<text x="${n(slot(column))}" y="${n(y)}" text-anchor="middle" ${text}>${escapeXml(formatNumber(value, painter.spec.valueAxis.numberFormat))}</text>`,
      )
    })
  })
  painter.out.push(`<g data-chart-part="dataTable">${cells.join("")}</g>`)
}

function smoothPath(points: [number, number][]) {
  const [first, ...rest] = points
  let path = `M${n(first![0])} ${n(first![1])}`
  rest.forEach((point, index) => {
    const before = points[index - 1] ?? points[index]!
    const start = points[index]!
    const after = points[index + 2] ?? point
    const c1 = [start[0] + (point[0] - before[0]) / 6, start[1] + (point[1] - before[1]) / 6]
    const c2 = [point[0] - (after[0] - start[0]) / 6, point[1] - (after[1] - start[1]) / 6]
    path += ` C${n(c1[0]!)} ${n(c1[1]!)} ${n(c2[0]!)} ${n(c2[1]!)} ${n(point[0])} ${n(point[1])}`
  })
  return path
}

/** A trendline through the points, as [x, y] pairs to draw. */
export function trendline(kind: TrendlineKind, points: [number, number][]): [number, number][] {
  if (points.length < 2) {
    return []
  }
  if (kind === "movingAverage") {
    return points.slice(1).map(([x, y], index) => [x, (y + points[index]![1]) / 2])
  }
  const fit = (xs: number[], ys: number[]) => {
    const count = xs.length
    const meanX = xs.reduce((sum, value) => sum + value, 0) / count
    const meanY = ys.reduce((sum, value) => sum + value, 0) / count
    const slope =
      xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index]! - meanY), 0) /
      (xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0) || 1)
    return { slope, intercept: meanY - slope * meanX }
  }
  const xs = points.map(([x]) => x)
  const low = Math.min(...xs)
  const high = Math.max(...xs)
  const steps = kind === "linear" ? 1 : 24
  const samples = Array.from({ length: steps + 1 }, (_, index) => low + ((high - low) * index) / steps)
  if (kind === "exponential") {
    const usable = points.filter(([, y]) => y > 0)
    const line = fit(
      usable.map(([x]) => x),
      usable.map(([, y]) => Math.log(y)),
    )
    return samples.map((x) => [x, Math.exp(line.intercept + line.slope * x)])
  }
  if (kind === "logarithmic") {
    const usable = points.filter(([x]) => x > 0)
    const line = fit(
      usable.map(([x]) => Math.log(x)),
      usable.map(([, y]) => y),
    )
    return samples.filter((x) => x > 0).map((x) => [x, line.intercept + line.slope * Math.log(x)])
  }
  const line = fit(
    xs,
    points.map(([, y]) => y),
  )
  return samples.map((x) => [x, line.intercept + line.slope * x])
}

function pie(painter: Painter, box: Box) {
  const { spec } = painter
  const serie = spec.series.map((item, index) => ({ ...item, index })).find((item) => !item.hidden)
  if (!serie) {
    return
  }
  const shown = spec.categories.map((_, index) => index).filter((index) => !spec.hiddenCategories.includes(index))
  const values = shown.map((index) => Math.max(0, serie.values[index] ?? 0))
  const total = values.reduce((sum, value) => sum + value, 0) || 1
  const labels = spec.dataLabels !== "none"
  const radius = Math.max(4, Math.min(box.w, box.h) / 2 - (labels && spec.dataLabels === "outsideEnd" ? 18 : 4))
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const hole = spec.type === "doughnut" ? (radius * spec.holeSize) / 100 : 0
  const explode = (radius * spec.explosion) / 100
  let angle = ((spec.firstSliceAngle - 90) * Math.PI) / 180
  const slices: string[] = []
  const texts: string[] = []
  const line = spec.style === 1 ? "#ffffff" : undefined
  values.forEach((value, place) => {
    const index = shown[place]!
    const sweep = (value / total) * Math.PI * 2
    const start = angle
    angle += sweep
    const middle = start + sweep / 2
    const dx = Math.cos(middle) * explode
    const dy = Math.sin(middle) * explode
    const point = (r: number, a: number) => `${n(cx + dx + Math.cos(a) * r)} ${n(cy + dy + Math.sin(a) * r)}`
    const large = sweep > Math.PI ? 1 : 0
    const full = sweep >= Math.PI * 2 - 1e-6
    const path = full
      ? `M${point(radius, 0)} A${n(radius)} ${n(radius)} 0 1 1 ${point(radius, Math.PI)} A${n(radius)} ${n(radius)} 0 1 1 ${point(radius, 0)}${hole ? ` M${point(hole, 0)} A${n(hole)} ${n(hole)} 0 1 0 ${point(hole, Math.PI)} A${n(hole)} ${n(hole)} 0 1 0 ${point(hole, 0)}` : ""}Z`
      : hole
        ? `M${point(radius, start)} A${n(radius)} ${n(radius)} 0 ${large} 1 ${point(radius, angle)} L${point(hole, angle)} A${n(hole)} ${n(hole)} 0 ${large} 0 ${point(hole, start)}Z`
        : `M${n(cx + dx)} ${n(cy + dy)} L${point(radius, start)} A${n(radius)} ${n(radius)} 0 ${large} 1 ${point(radius, angle)}Z`
    const color = pointColor(painter, index)
    let paint = seriesPaint(painter, color, `point:${index}`)
    if (line && !spec.format[`point:${index}`]?.line) {
      paint = paint.replace(/stroke="[^"]*" stroke-width="[^"]*"/, `stroke="${line}" stroke-width="1.5"`)
    }
    slices.push(`<path data-chart-part="point:${index}" d="${path}" fill-rule="evenodd" ${paint}/>`)
    if (labels) {
      const at = spec.dataLabels === "outsideEnd" ? radius + 12 : hole ? (radius + hole) / 2 : radius * 0.62
      const text = labelText(spec, { ...serie, name: serie.name }, value, place, value / total)
      texts.push(
        `<text x="${n(cx + dx + Math.cos(middle) * at)}" y="${n(cy + dy + Math.sin(middle) * at + 4)}" text-anchor="middle" ${textAttrs(painter, "dataLabels")}>${escapeXml(text)}</text>`,
      )
    }
  })
  painter.out.push(`<g data-chart-part="series:${serie.index}">${slices.join("")}</g>`)
  if (texts.length) {
    painter.out.push(`<g data-chart-part="dataLabels">${texts.join("")}</g>`)
  }
}

function radar(painter: Painter, box: Box, series: Serie[]) {
  const { spec, look } = painter
  const categories = spec.categories.filter((_, index) => !spec.hiddenCategories.includes(index))
  const count = Math.max(3, categories.length)
  const values = series.map((serie) => visibleValues(spec, serie.values))
  const scale = niceScale(Math.min(0, ...values.flat()), Math.max(1, ...values.flat()), spec.valueAxis, 4)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2 + 4
  const radius = Math.max(4, Math.min(box.w / 2 - 50, box.h / 2 - 16))
  const at = (column: number, value: number) => {
    const angle = -Math.PI / 2 + (column / count) * Math.PI * 2
    const r = ((value - scale.min) / (scale.max - scale.min || 1)) * radius
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const
  }
  const grid: string[] = []
  if (spec.gridlines.major) {
    for (const tick of scale.ticks.slice(1)) {
      const ring = Array.from({ length: count }, (_, column) => at(column, tick).map(n).join(","))
      grid.push(`<polygon points="${ring.join(" ")}" fill="none" stroke="${look.grid}" stroke-width="0.75"/>`)
    }
  }
  for (let column = 0; column < count; column += 1) {
    const [x, y] = at(column, scale.max)
    grid.push(`<line x1="${n(cx)}" y1="${n(cy)}" x2="${n(x)}" y2="${n(y)}" stroke="${look.grid}" stroke-width="0.75"/>`)
  }
  painter.out.push(`<g data-chart-part="gridlines">${grid.join("")}</g>`)
  if (spec.axes.category) {
    const labels = categories.map((name, column) => {
      const [x, y] = at(column, scale.max + (scale.max - scale.min) * 0.12)
      return `<text x="${n(x)}" y="${n(y + 4)}" text-anchor="middle" ${textAttrs(painter, "axis:category")}>${escapeXml(name)}</text>`
    })
    painter.out.push(`<g data-chart-part="axis:category">${labels.join("")}</g>`)
  }
  if (spec.axes.value) {
    const labels = scale.ticks.map((tick) => {
      const [, y] = at(0, tick)
      return `<text x="${n(cx - 4)}" y="${n(y + 4)}" text-anchor="end" ${textAttrs(painter, "axis:value")}>${escapeXml(formatNumber(tick, spec.valueAxis.numberFormat))}</text>`
    })
    painter.out.push(`<g data-chart-part="axis:value">${labels.join("")}</g>`)
  }
  const labels: string[] = []
  series.forEach((serie, place) => {
    const color = seriesColor(painter, serie.index)
    const points = values[place]!.map((value, column) => at(column, value))
    const outline = points.map((point) => point.map(n).join(",")).join(" ")
    const shapes = [
      spec.filled
        ? `<polygon points="${outline}" ${seriesPaint(painter, color, `series:${serie.index}`)} fill-opacity="0.85"/>`
        : `<polygon points="${outline}" fill="none" stroke="${color}" stroke-width="2.25"/>`,
      ...(spec.markers ? points.map(([x, y]) => `<circle cx="${n(x)}" cy="${n(y)}" r="3.4" fill="${color}"/>`) : []),
    ]
    painter.out.push(`<g data-chart-part="series:${serie.index}">${shapes.join("")}</g>`)
    if (spec.dataLabels !== "none") {
      values[place]!.forEach((value, column) => {
        const [x, y] = points[column]!
        labels.push(textLabel(painter, serie, { value, column }, x, y - 6))
      })
    }
  })
  if (labels.length) {
    painter.out.push(`<g data-chart-part="dataLabels">${labels.join("")}</g>`)
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------------------------------------------

/** The chart's parts as the Format tab's Current Selection lists them. */
export function chartParts(spec: ChartSpec): { id: string; label: string }[] {
  const round = spec.type === "pie" || spec.type === "doughnut"
  const parts = [{ id: "chartArea", label: "Chart Area" }]
  if (!round) {
    parts.push({ id: "plotArea", label: "Plot Area" })
  }
  if (spec.title.show) {
    parts.push({ id: "title", label: "Chart Title" })
  }
  if (!round) {
    if (spec.axes.category) {
      parts.push({
        id: "axis:category",
        label: spec.type === "bar" ? "Vertical (Category) Axis" : "Horizontal (Category) Axis",
      })
    }
    if (spec.axes.value) {
      parts.push({ id: "axis:value", label: spec.type === "bar" ? "Horizontal (Value) Axis" : "Vertical (Value) Axis" })
    }
    if (spec.axisTitles.category.show) {
      parts.push({ id: "axisTitle:category", label: "Category Axis Title" })
    }
    if (spec.axisTitles.value.show) {
      parts.push({ id: "axisTitle:value", label: "Value Axis Title" })
    }
    if (spec.gridlines.major || spec.gridlines.minor) {
      parts.push({ id: "gridlines", label: "Value Axis Major Gridlines" })
    }
  }
  if (spec.legend !== "none") {
    parts.push({ id: "legend", label: "Legend" })
  }
  if (spec.dataLabels !== "none") {
    parts.push({ id: "dataLabels", label: "Data Labels" })
  }
  if (spec.dataTable) {
    parts.push({ id: "dataTable", label: "Data Table" })
  }
  spec.series.forEach((serie, index) => {
    if (!serie.hidden) {
      parts.push({ id: `series:${index}`, label: `Series "${serie.name}"` })
    }
  })
  if (round) {
    spec.categories.forEach((name, index) => parts.push({ id: `point:${index}`, label: `Point "${name}"` }))
  }
  return parts
}

export function partLabel(spec: ChartSpec, id: string) {
  return chartParts(spec).find((part) => part.id === id)?.label ?? "Chart Area"
}

/** Whether a part holds text, for the font and text options. */
export function isTextPart(id: string) {
  return id === "title" || id === "legend" || id === "dataLabels" || id === "dataTable" || id.startsWith("axis")
}
