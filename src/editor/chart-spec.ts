import { parseChartSheet, type ChartSheet } from "@/editor/chart-sheet"
import { boxGroups, chartTree, expandSpec, squarify, type TreeNode } from "@/editor/chart-expand"
import { THEME_ACCENTS, shade } from "@/editor/shape-style"

/**
 * Word's chart (20.8): the data, the elements and their formatting as one spec kept on the chart's node, drawn by
 * one SVG renderer whose every part can be clicked, and written to .docx as a real chart.
 */

export type ChartType =
  | "column"
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "doughnut"
  | "scatter"
  | "stock"
  | "radar"
  | "treemap"
  | "sunburst"
  | "surface"
  | "boxWhisker"
  | "histogram"
  | "waterfall"
  | "funnel"
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
  /** Stock (High-Low-Close): the value is a short tick to the right of the high-low line, as Word marks Close. */
  tick?: boolean
}

/**
 * Word's histogram bins: Automatic (Scott's rule), By Category (the values of each category added up), a Bin width
 * or a Number of bins; an Overflow bin takes every value above `overflow`, an Underflow bin every value at or below
 * `underflow`.
 */
export type HistogramBins = {
  by: "auto" | "category" | "width" | "count"
  width?: number
  count?: number
  overflow?: number
  underflow?: number
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
  /** Scatter: points joined by lines. Radar and Surface: filled (a Surface that is not is a wireframe). */
  lines: boolean
  filled: boolean
  /** Surface: seen from above as a contour map rather than in 3-D. */
  contour?: boolean
  /**
   * Word's 3-D charts (22.6): "front" draws the chart as it is, with depth (3-D Clustered, Stacked and 100% Stacked
   * Column and Bar, 3-D Stacked Area, 3-D Pie); "deep" puts each series in a row of its own, one behind another (3-D
   * Column, 3-D Line, 3-D Area).
   */
  threeD?: "front" | "deep"
  /**
   * A 3-D chart's 3-D Rotation (Format Chart Area): X tips it towards the viewer, Y turns it round; unset is Word's
   * own view (X 15°, Y 20°; a 3-D pie X 30°, Y 0°). See `chartRotation`.
   */
  rotX?: number
  rotY?: number
  /**
   * The rest of a 3-D chart's 3-D Rotation, unset as Word has it (see `chartView3d`): Right Angle Axes, the
   * Perspective in degrees when they are off, and the Depth as a percentage of the base.
   */
  rightAngleAxes?: boolean
  perspective?: number
  depthPercent?: number
  /**
   * Pie of Pie and Bar of Pie: some points drawn again as a second pie or a bar, chosen as Word's Split Series By
   * says (`ofPieSplitBy`, unset is Position): the last `ofPieSplit` points; those below `ofPieSplitValue`, or below
   * that percentage of the whole; or the categories in `ofPieCustom`. `ofPieSize` is the Second Plot Size, a
   * percentage of the first (75 unset).
   */
  ofPie?: "pie" | "bar"
  ofPieSplit?: number
  ofPieSplitBy?: "pos" | "val" | "percent" | "cust"
  ofPieSplitValue?: number
  ofPieCustom?: number[]
  ofPieSize?: number
  /** Pie of Pie and Bar of Pie: the Gap Width between the two plots, 0 to 500% (100 unset). */
  ofPieGap?: number
  /** Histogram: how the values go into bins (Format Axis → Bins); unset is Automatic. */
  bins?: HistogramBins
  /** Pareto: a histogram with its bins sorted from the largest down and a line of the running percentage. */
  pareto?: boolean
  /** Stock: the first series is the volume traded, drawn as columns on the left axis, the prices on a right one. */
  volume?: boolean
  categories: string[]
  /**
   * Treemap and Sunburst: the label columns before the category, outermost first (Branch, Stem), each a label per
   * row; the category is the innermost. A blank label is skipped, so a leaf can sit in an outer column as in Word.
   */
  levels?: string[][]
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
  contour?: boolean
  threeD?: "front" | "deep"
  ofPie?: "pie" | "bar"
  volume?: boolean
  pareto?: boolean
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
      { id: "column-3d-clustered", label: "3-D Clustered Column", type: "column", threeD: "front" },
      { id: "column-3d-stacked", label: "3-D Stacked Column", type: "column", grouping: "stacked", threeD: "front" },
      {
        id: "column-3d-percent",
        label: "3-D 100% Stacked Column",
        type: "column",
        grouping: "percent",
        threeD: "front",
      },
      { id: "column-3d", label: "3-D Column", type: "column", threeD: "deep" },
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
      { id: "line-3d", label: "3-D Line", type: "line", threeD: "deep" },
    ],
  },
  {
    id: "pie",
    label: "Pie",
    items: [
      { id: "pie", label: "Pie", type: "pie" },
      { id: "pie-3d", label: "3-D Pie", type: "pie", threeD: "front" },
      { id: "pie-of-pie", label: "Pie of Pie", type: "pie", ofPie: "pie" },
      { id: "bar-of-pie", label: "Bar of Pie", type: "pie", ofPie: "bar" },
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
      { id: "hbar-3d-clustered", label: "3-D Clustered Bar", type: "bar", threeD: "front" },
      { id: "hbar-3d-stacked", label: "3-D Stacked Bar", type: "bar", grouping: "stacked", threeD: "front" },
      { id: "hbar-3d-percent", label: "3-D 100% Stacked Bar", type: "bar", grouping: "percent", threeD: "front" },
    ],
  },
  {
    id: "area",
    label: "Area",
    items: [
      { id: "area", label: "Area", type: "area" },
      { id: "area-stacked", label: "Stacked Area", type: "area", grouping: "stacked" },
      { id: "area-percent", label: "100% Stacked Area", type: "area", grouping: "percent" },
      { id: "area-3d", label: "3-D Area", type: "area", threeD: "deep" },
      { id: "area-3d-stacked", label: "3-D Stacked Area", type: "area", grouping: "stacked", threeD: "front" },
      { id: "area-3d-percent", label: "3-D 100% Stacked Area", type: "area", grouping: "percent", threeD: "front" },
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
    id: "stock",
    label: "Stock",
    items: [
      { id: "stock-hlc", label: "High-Low-Close", type: "stock" },
      { id: "stock-ohlc", label: "Open-High-Low-Close", type: "stock" },
      { id: "stock-vhlc", label: "Volume-High-Low-Close", type: "stock", volume: true },
      { id: "stock-vohlc", label: "Volume-Open-High-Low-Close", type: "stock", volume: true },
    ],
  },
  {
    id: "surface",
    label: "Surface",
    items: [
      { id: "surface-3d", label: "3-D Surface", type: "surface", filled: true },
      { id: "surface-wireframe", label: "Wireframe 3-D Surface", type: "surface" },
      { id: "surface-contour", label: "Contour", type: "surface", filled: true, contour: true },
      { id: "surface-wireframe-contour", label: "Wireframe Contour", type: "surface", contour: true },
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
    id: "treemap",
    label: "Treemap",
    items: [{ id: "treemap", label: "Treemap", type: "treemap" }],
  },
  {
    id: "sunburst",
    label: "Sunburst",
    items: [{ id: "sunburst", label: "Sunburst", type: "sunburst" }],
  },
  {
    id: "histogram",
    label: "Histogram",
    items: [
      { id: "histogram", label: "Histogram", type: "histogram" },
      { id: "pareto", label: "Pareto", type: "histogram", pareto: true },
    ],
  },
  {
    id: "box-whisker",
    label: "Box & Whisker",
    items: [{ id: "box-whisker", label: "Box and Whisker", type: "boxWhisker" }],
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
  if (spec.type === "stock") {
    const prices = spec.series.filter((serie) => !serie.hidden).length - (spec.volume ? 1 : 0)
    return `stock-${spec.volume ? "v" : ""}${prices >= 4 ? "ohlc" : "hlc"}`
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
      (spec.type === "radar" || spec.type === "surface" ? Boolean(item.filled) === spec.filled : true) &&
      (spec.type === "surface" ? Boolean(item.contour) === Boolean(spec.contour) : true) &&
      item.threeD === spec.threeD &&
      item.ofPie === spec.ofPie &&
      Boolean(item.pareto) === Boolean(spec.pareto),
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
    contour: variant.contour || undefined,
    threeD: variant.threeD,
    // The rotation goes with a 3-D chart of the same kind: a pie's view is not a column's.
    ...(() => {
      const keep = variant.threeD && (variant.type === "pie") === (spec.type === "pie")
      return {
        rotX: keep ? spec.rotX : undefined,
        rotY: keep ? spec.rotY : undefined,
        rightAngleAxes: keep ? spec.rightAngleAxes : undefined,
        perspective: keep ? spec.perspective : undefined,
        depthPercent: keep ? spec.depthPercent : undefined,
      }
    })(),
    ofPie: variant.ofPie,
    volume: variant.volume,
    pareto: variant.pareto,
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
  if (variant.type === "stock") {
    // Word's sample: five trading days; Open-High-Low-Close adds the Open column first, and the Volume charts the
    // Volume column before that.
    const days = ["1/5/2002", "1/6/2002", "1/7/2002", "1/8/2002", "1/9/2002"]
    const prices = [
      { name: "High", values: [55, 57, 57, 58, 58] },
      { name: "Low", values: [11, 12, 13, 11, 25] },
      { name: "Close", values: [25, 38, 50, 35, 43] },
    ]
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Chart Title" },
        categories: days,
        series: [
          ...(variant.volume ? [{ name: "Volume", values: [70, 120, 150, 135, 148] }] : []),
          ...(variant.id.endsWith("ohlc") ? [{ name: "Open", values: [44, 25, 38, 50, 34] }] : []),
          ...prices,
        ],
      },
      variant.id,
    )
  }
  if (variant.pareto) {
    // Word's sample: how often each complaint came up, binned by category, the most frequent first.
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Chart Title" },
        legend: "none",
        bins: { by: "category" },
        categories: ["Late delivery", "Wrong item", "Damaged", "Billing", "Rude staff", "Other"],
        series: [{ name: "Complaints", values: [42, 25, 15, 8, 6, 4] }],
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
  if (variant.type === "treemap" || variant.type === "sunburst") {
    // Word's sample: branches, stems and leaves with a size; a blank stem puts the leaf straight under its branch.
    const rows: [string, string, string, number][] = [
      ["Branch 1", "Stem 1", "Leaf 1", 22],
      ["Branch 1", "Stem 1", "Leaf 2", 12],
      ["Branch 1", "Stem 1", "Leaf 3", 18],
      ["Branch 1", "Stem 2", "Leaf 4", 87],
      ["Branch 1", "Stem 2", "Leaf 5", 88],
      ["Branch 1", "Leaf 6", "", 25],
      ["Branch 1", "Leaf 7", "", 87],
      ["Branch 2", "Stem 3", "Leaf 8", 54],
      ["Branch 2", "Stem 3", "Leaf 9", 12],
      ["Branch 2", "Stem 3", "Leaf 10", 34],
      ["Branch 2", "Stem 4", "Leaf 11", 98],
      ["Branch 2", "Stem 4", "Leaf 12", 23],
      ["Branch 3", "Stem 5", "Leaf 13", 51],
      ["Branch 3", "Stem 5", "Leaf 14", 61],
      ["Branch 3", "Leaf 15", "", 41],
    ]
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Chart Title" },
        legend: variant.type === "treemap" ? "top" : "none",
        dataLabels: "center",
        labelContent: { value: false, category: true, series: false, percent: false },
        levels: [rows.map((row) => row[0]), rows.map((row) => row[1])],
        categories: rows.map((row) => row[2]),
        series: [{ name: "Size", values: rows.map((row) => row[3]) }],
      },
      variant.id,
    )
  }
  if (variant.type === "boxWhisker") {
    // Word's sample: test scores of three schools, one row per student, the course in the first column.
    const courses = [
      "English",
      "Physics",
      "English",
      "Math",
      "English",
      "Physics",
      "Math",
      "Physics",
      "Math",
      "English",
    ]
    return withVariant(
      {
        ...structuredClone(BASE),
        title: { show: true, text: "Chart Title" },
        categories: courses.flatMap((course) => [course, course]),
        series: [
          {
            name: "School A",
            values: [63, 61, 46, 58, 54, 60, 54, 57, 69, 54, 67, 70, 59, 60, 61, 65, 57, 66, 63, 60],
          },
          {
            name: "School B",
            values: [53, 46, 66, 67, 58, 59, 74, 62, 46, 54, 60, 65, 63, 59, 64, 52, 72, 61, 66, 50],
          },
          {
            name: "School C",
            values: [45, 52, 61, 55, 56, 63, 65, 62, 72, 50, 61, 59, 70, 71, 59, 60, 64, 67, 73, 63],
          },
        ],
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
    levels: value.levels?.map((level) => (level ?? []).map(String)),
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
    ...(isHierarchy(spec.type) ? { levels: (spec.levels ?? []).map((level) => [...level]) } : {}),
  }
}

/** Treemap and Sunburst: charts whose rows have a path of labels (`levels`) rather than one category. */
export function isHierarchy(type: ChartType) {
  return type === "treemap" || type === "sunburst"
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
    levels: sheet.levels ? sheet.levels.map((level) => [...level]) : spec.levels,
    hiddenCategories: spec.hiddenCategories.filter((index) => index < data.categories.length),
    series: data.series.map((serie, index) => ({ ...spec.series[index], ...serie })),
  }
}

/** Switch Row/Column: series become categories and categories series. */
export function switchRowColumn(spec: ChartSpec): ChartSpec {
  return {
    ...spec,
    categories: spec.series.map((serie) => serie.name),
    levels: undefined,
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

/** A side of a 3-D bar or area: its paint in a lighter (top) or darker (side) shade, with no shadow of its own. */
function facePaint(paint: string, color: string, amount: number) {
  return paint.replace(/fill="[^"]*"/, `fill="${shade(color, amount)}"`).replace(/ filter="[^"]*"/, "")
}

/** A 3-D bar: its right side, its top and its front, seen from above and to the right as Word's default view. */
function box3d(x: number, y: number, w: number, h: number, dx: number, dy: number, paint: string, color: string) {
  const side = `${n(x + w)},${n(y)} ${n(x + w + dx)},${n(y - dy)} ${n(x + w + dx)},${n(y + h - dy)} ${n(x + w)},${n(y + h)}`
  const top = `${n(x)},${n(y)} ${n(x + dx)},${n(y - dy)} ${n(x + w + dx)},${n(y - dy)} ${n(x + w)},${n(y)}`
  return (
    `<polygon points="${side}" ${facePaint(paint, color, -0.25)}/>` +
    `<polygon points="${top}" ${facePaint(paint, color, 0.25)}/>` +
    `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${paint}/>`
  )
}

/** The chart, as the markup inside an `<svg viewBox="0 0 width height">`. */
export function renderChart(source: ChartSpec, width: number, height: number) {
  // Box & Whisker, Treemap and Sunburst have their own painters; the other derived types are drawn as the chart they
  // expand to.
  const spec = source.type === "boxWhisker" || isHierarchy(source.type) ? source : expandSpec(source)
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
  const entries =
    spec.type === "surface"
      ? surfaceBands(spec).map((band, index) => ({
          name: band.name,
          color: pointColor(painter, index),
          index,
          line: !spec.filled,
        }))
      : isHierarchy(spec.type)
        ? chartTree(spec).children.map((node) => ({
            name: node.name,
            color: pointColor(painter, node.branch),
            index: node.branch,
            line: false,
          }))
        : round
          ? spec.categories
              .map((name, index) => ({ name, color: pointColor(painter, index), index, line: false }))
              .filter((entry) => !spec.hiddenCategories.includes(entry.index))
          : visibleSeries.map((serie) => ({
              name: serie.name,
              color: seriesColor(painter, serie.index),
              index: serie.index,
              line:
                (serie.type ?? spec.type) === "line" ||
                spec.type === "scatter" ||
                (spec.type === "radar" && !spec.filled),
              // A line series with its line off (a stock chart's prices) has no line in the key; Close keeps its tick.
              bare: spec.format[`series:${serie.index}`]?.line === "none",
              tick: Boolean(serie.tick),
            }))
  if (spec.legend !== "none" && !(spec.dataTable && !round)) {
    legend(painter, entries, box, spec.legend)
  }
  if (round) {
    pie(painter, box)
  } else if (spec.type === "radar") {
    radar(painter, box, visibleSeries)
  } else if (spec.type === "boxWhisker") {
    boxWhisker(painter, box)
  } else if (spec.type === "surface") {
    if (spec.contour) {
      contour(painter, box)
    } else {
      surface3d(painter, box)
    }
  } else if (spec.type === "treemap") {
    treemap(painter, box)
  } else if (spec.type === "sunburst") {
    sunburst(painter, box)
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

type LegendEntry = { name: string; color: string; line: boolean; bare?: boolean; tick?: boolean }

function legend(painter: Painter, entries: LegendEntry[], box: Box, at: string) {
  if (entries.length === 0) {
    return
  }
  const key = (entry: LegendEntry, x: number, y: number) =>
    entry.line && entry.bare
      ? entry.tick
        ? `<path d="M${n(x + 7)} ${n(y)}H${n(x + 13)}" stroke="${painter.look.text}" stroke-width="1.5"/>`
        : ""
      : entry.line
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
  // A Pareto's line is a running share: its axis goes from 0 to 100%.
  const scale2 = !secondary.length
    ? null
    : spec.pareto
      ? niceScale(0, 1, { min: 0, max: 1, major: 0.2 })
      : niceScale(low2!, high2!)
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
  // A 3-D chart: the plot area is its front, and the walls and floor go back up to the right by `depth`. A "deep"
  // chart puts each series in a row of its own, the first at the front.
  const threeD = scatter ? undefined : spec.threeD
  const rows = threeD === "deep" ? Math.max(1, series.length) : 1
  const depth = { x: 0, y: 0 }
  if (threeD) {
    // The depth drawn follows the 3-D Rotation, scaled from Word's own view (X 15°, Y 20°). The walls only go back
    // up to the right, so a view from below or from the left is drawn as seen straight on.
    const turn = chartRotation(spec)
    const deeper = Math.max(0.2, Math.min(3, chartView3d(spec).depth / 100))
    const base = Math.min(plot.w * (threeD === "deep" ? 0.3 : 0.08), threeD === "deep" ? 26 * rows : 18) * deeper
    const across = Math.max(0, Math.min(2, Math.sin((turn.y * Math.PI) / 180) / Math.sin((20 * Math.PI) / 180)))
    const up = Math.max(0, Math.min(2.5, Math.sin((turn.x * Math.PI) / 180) / Math.sin((15 * Math.PI) / 180)))
    depth.x = Math.min(base * across, plot.w * 0.45)
    depth.y = Math.min(base * 0.55 * up, plot.h * 0.4)
    plot.w = Math.max(10, plot.w - depth.x)
    plot.y += depth.y
    plot.h = Math.max(10, plot.h - depth.y)
  }
  const row = { x: depth.x / rows, y: depth.y / rows }
  const plotLine = partLine(painter, "plotArea", "none", 0.75)
  if (threeD) {
    const wall = partFill(painter, "plotArea", look.plot)
    const edge = plotLine.stroke === "none" ? look.grid : plotLine.stroke
    const right = plot.x + plot.w
    const bottom = plot.y + plot.h
    const back = `${n(plot.x + depth.x)},${n(plot.y - depth.y)} ${n(right + depth.x)},${n(plot.y - depth.y)} ${n(right + depth.x)},${n(bottom - depth.y)} ${n(plot.x + depth.x)},${n(bottom - depth.y)}`
    const side = `${n(plot.x)},${n(plot.y)} ${n(plot.x + depth.x)},${n(plot.y - depth.y)} ${n(plot.x + depth.x)},${n(bottom - depth.y)} ${n(plot.x)},${n(bottom)}`
    const floor = `${n(plot.x)},${n(bottom)} ${n(plot.x + depth.x)},${n(bottom - depth.y)} ${n(right + depth.x)},${n(bottom - depth.y)} ${n(right)},${n(bottom)}`
    painter.out.push(
      `<g data-chart-part="plotArea" fill="${wall === "none" ? "transparent" : wall}" stroke="${edge}" stroke-width="${plotLine.width}" pointer-events="all">` +
        `<polygon points="${back}"/><polygon points="${side}"/><polygon points="${floor}"/></g>`,
    )
  } else {
    painter.out.push(
      `<rect data-chart-part="plotArea" x="${n(plot.x)}" y="${n(plot.y)}" width="${n(plot.w)}" height="${n(plot.h)}" fill="${partFill(painter, "plotArea", look.plot)}" stroke="${plotLine.stroke}" stroke-width="${plotLine.width}" pointer-events="all"/>`,
    )
  }

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
    if (threeD) {
      // Across the floor (or up the side wall) and along the back wall.
      const bottom = plot.y + plot.h
      grid.push(
        horizontal
          ? `<path d="M${n(at)} ${n(bottom)}L${n(at + depth.x)} ${n(bottom - depth.y)}V${n(plot.y - depth.y)}" fill="none" stroke="${stroke}" stroke-width="${gridLine.width}"${dash}/>`
          : `<path d="M${n(plot.x)} ${n(at)}L${n(plot.x + depth.x)} ${n(at - depth.y)}H${n(plot.x + plot.w + depth.x)}" fill="none" stroke="${stroke}" stroke-width="${gridLine.width}"${dash}/>`,
      )
      return
    }
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
        // On the back wall of a 3-D chart.
        const [sx, sy] = [depth.x, -depth.y]
        grid.push(
          horizontal
            ? `<line x1="${n(plot.x + sx)}" y1="${n(at + sy)}" x2="${n(plot.x + plot.w + sx)}" y2="${n(at + sy)}" stroke="${gridLine.stroke}" stroke-width="${gridLine.width}"/>`
            : `<line x1="${n(at + sx)}" y1="${n(plot.y + sy)}" x2="${n(at + sx)}" y2="${n(plot.y + plot.h + sy)}" stroke="${gridLine.stroke}" stroke-width="${gridLine.width}"/>`,
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
      return `<text x="${n(plot.x + plot.w + 6)}" y="${n(at + 4)}" ${valueText}>${escapeXml(formatNumber(tick, spec.pareto ? "0%" : "General"))}</text>`
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
  const barCount = stacking || threeD === "deep" ? 1 : Math.max(1, bars.length)
  const barWidth = band / (1 + (barCount - 1) * (1 - overlap) + gap)
  const labelPosition = spec.dataLabels
  // How far back a 3-D bar or area goes: most of its row, or of the whole depth.
  const thick = threeD === "deep" ? { x: row.x * 0.7, y: row.y * 0.7 } : { x: depth.x * 0.85, y: depth.y * 0.85 }
  for (const kind of order) {
    let members = series.filter((item) => kindOf(item) === kind)
    // Farther rows first, so nearer ones cover them; a 3-D bar chart's series go down its band, so the lower first.
    if (threeD === "deep" || (threeD && horizontal && !stacking)) {
      members = [...members].reverse()
    }
    for (const serie of members) {
      const own = values.get(serie.index)!
      const stack = stacked.get(serie.index)
      const color = seriesColor(painter, serie.index)
      const current = serie.secondary && scale2 ? scale2 : scale
      const shapes: string[] = []
      const back = threeD === "deep" ? series.indexOf(serie) : 0
      const shift = { x: back * row.x, y: -back * row.y }
      const points = own.map((value, column) => {
        const top = stack ? stack.to[column]! : value
        const base = stack ? stack.from[column]! : Math.max(current.min, Math.min(current.max, 0))
        return {
          value,
          column,
          at: (scatter ? toX(xNumbers[column]!) : slot(column)) + shift.x,
          top: toValue(top, current) + shift.y,
          base: toValue(base, current) + shift.y,
        }
      })
      if (kind === "column") {
        const place = stacking || threeD === "deep" ? 0 : bars.indexOf(serie)
        const offset = -((barCount - 1) * (1 - overlap) * barWidth + barWidth) / 2 + place * (1 - overlap) * barWidth
        const paint = seriesPaint(painter, color, `series:${serie.index}`)
        for (const point of points) {
          const start = point.at + offset
          const from = Math.min(point.top, point.base)
          const length = Math.abs(point.top - point.base)
          shapes.push(
            threeD
              ? horizontal
                ? box3d(from, start, length, barWidth, thick.x, thick.y, paint, color)
                : box3d(start, from, barWidth, length, thick.x, thick.y, paint, color)
              : horizontal
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
        const paint = seriesPaint(painter, color, `series:${serie.index}`)
        if (threeD && points.length) {
          // Its top going back, its far end, then its front over them.
          points.slice(1).forEach((point, place) => {
            const before = points[place]!
            shapes.push(
              `<polygon points="${n(before.at)},${n(before.top)} ${n(before.at + thick.x)},${n(before.top - thick.y)} ${n(point.at + thick.x)},${n(point.top - thick.y)} ${n(point.at)},${n(point.top)}" ${facePaint(paint, color, 0.25)}/>`,
            )
          })
          const end = points[points.length - 1]!
          shapes.push(
            `<polygon points="${n(end.at)},${n(end.top)} ${n(end.at + thick.x)},${n(end.top - thick.y)} ${n(end.at + thick.x)},${n(end.base - thick.y)} ${n(end.at)},${n(end.base)}" ${facePaint(paint, color, -0.25)}/>`,
          )
        }
        shapes.push(`<polygon points="${[...top, ...base].join(" ")}" ${paint}/>`)
        if (labelPosition !== "none") {
          points.forEach((point) =>
            labels.push(textLabel(painter, serie, point, point.at, (point.top + point.base) / 2 + 4)),
          )
        }
      } else {
        const line = partLine(painter, `series:${serie.index}`, color, 2.25)
        const joined = !scatter || spec.lines
        if (threeD) {
          // 3-D Line: a ribbon going back from the line, lighter where it faces up.
          const paint = seriesPaint(painter, color, `series:${serie.index}`)
          points.slice(1).forEach((point, place) => {
            const before = points[place]!
            shapes.push(
              `<polygon points="${n(before.at)},${n(before.top)} ${n(before.at + thick.x)},${n(before.top - thick.y)} ${n(point.at + thick.x)},${n(point.top - thick.y)} ${n(point.at)},${n(point.top)}" ${point.top <= before.top ? paint : facePaint(paint, color, -0.2)}/>`,
            )
          })
          // Its front edge, a few pixels deep, so the ribbon reads as a tape standing on its side.
          const edge = 3
          if (points.length > 1) {
            const front = points.map((point) => `${n(point.at)},${n(point.top)}`)
            const under = [...points].reverse().map((point) => `${n(point.at)},${n(point.top + edge)}`)
            shapes.push(`<polygon points="${[...front, ...under].join(" ")}" ${facePaint(paint, color, -0.3)}/>`)
          }
        } else if (joined && points.length > 1) {
          const coords = points.map((point) => [point.at, point.top] as [number, number])
          const path = spec.smooth ? smoothPath(coords) : `M${coords.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L")}`
          shapes.push(
            `<path d="${path}" fill="none" stroke="${line.stroke}" stroke-width="${line.width}" stroke-linejoin="round" stroke-linecap="round"/>`,
          )
        }
        if (!threeD && (spec.markers || (scatter && !spec.lines))) {
          for (const point of points) {
            shapes.push(`<circle cx="${n(point.at)}" cy="${n(point.top)}" r="3.4" fill="${color}" stroke="${color}"/>`)
          }
        }
        if (serie.tick) {
          const reach = Math.max(4, Math.min(10, band * 0.2))
          for (const point of points) {
            shapes.push(
              `<path d="M${n(point.at)} ${n(point.top)}H${n(point.at + reach)}" stroke="${look.text}" stroke-width="1.5"/>`,
            )
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
    if (extras.length) {
      painter.out.push(
        `<g data-chart-part="lines" stroke="${look.axis}" stroke-width="1" stroke-dasharray="3 2">${extras.join("")}</g>`,
      )
    }
    // Word draws high-low lines solid and dark, from the lowest to the highest value at each category.
    if (spec.highLowLines && lined.length > 1) {
      const spans = categories.map((_, column) => {
        const ys = lined.map((serie) => at(serie, column))
        return `<line x1="${n(slot(column))}" y1="${n(Math.min(...ys))}" x2="${n(slot(column))}" y2="${n(Math.max(...ys))}"/>`
      })
      painter.out.push(`<g data-chart-part="highLowLines" stroke="${look.text}" stroke-width="1">${spans.join("")}</g>`)
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
    // Column -1 is Pie of Pie's Other, which Word names so.
    parts.push(column < 0 ? "Other" : (visible[column] ?? ""))
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
  if (spec.type === "pie" && spec.ofPie) {
    ofPie(painter, box, spec.ofPie)
    return
  }
  if (spec.type === "pie" && spec.threeD) {
    pie3d(painter, box)
    return
  }
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

/** The pie's series and its shown points, for the painters below. */
function pieData(spec: ChartSpec) {
  const serie = spec.series.map((item, index) => ({ ...item, index })).find((item) => !item.hidden)
  const shown = spec.categories.map((_, index) => index).filter((index) => !spec.hiddenCategories.includes(index))
  const values = serie ? shown.map((index) => Math.max(0, serie.values[index] ?? 0)) : []
  return { serie, shown, values, total: values.reduce((sum, value) => sum + value, 0) || 1 }
}

/** The angle ranges of [from, to] that face the viewer on a tilted pie: its lower half on screen. */
function frontArcs(from: number, to: number) {
  const arcs: [number, number][] = []
  for (let turn = -2; turn <= 3; turn += 1) {
    const low = Math.max(from, turn * Math.PI * 2)
    const high = Math.min(to, turn * Math.PI * 2 + Math.PI)
    if (high > low + 1e-6) {
      arcs.push([low, high])
    }
  }
  return arcs
}

/** 3-D Pie: the pie tilted back, as Word's default view (30°), with its rim showing at the front. */
function pie3d(painter: Painter, box: Box) {
  const { spec } = painter
  const { serie, shown, values, total } = pieData(spec)
  if (!serie) {
    return
  }
  const labels = spec.dataLabels !== "none"
  const outside = labels && spec.dataLabels === "outsideEnd" ? 18 : 4
  // X Rotation tips the pie: flatter and thicker towards 0°, a full circle seen from above at 90°.
  const turn = chartRotation(spec)
  const tilt = Math.max(0.04, Math.sin((turn.x * Math.PI) / 180))
  const side = 0.185 * Math.cos((turn.x * Math.PI) / 180)
  const rx = Math.max(4, Math.min(box.w / 2 - outside, (box.h - 2 * outside) / (2 * tilt + side)))
  const ry = rx * tilt
  const thick = rx * side
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2 - thick / 2
  const explode = (rx * spec.explosion) / 100
  const line = spec.style === 1 ? "#ffffff" : undefined
  const sides: string[] = []
  const tops: string[] = []
  const texts: string[] = []
  let angle = ((spec.firstSliceAngle + turn.y - 90) * Math.PI) / 180
  values.forEach((value, place) => {
    const index = shown[place]!
    const sweep = (value / total) * Math.PI * 2
    const start = angle
    angle += sweep
    const middle = start + sweep / 2
    const dx = Math.cos(middle) * explode
    const dy = Math.sin(middle) * explode * tilt
    const at = (a: number, lift = 0) => `${n(cx + dx + Math.cos(a) * rx)} ${n(cy + dy + Math.sin(a) * ry + lift)}`
    const color = pointColor(painter, index)
    let paint = seriesPaint(painter, color, `point:${index}`)
    if (line && !spec.format[`point:${index}`]?.line) {
      paint = paint.replace(/stroke="[^"]*" stroke-width="[^"]*"/, `stroke="${line}" stroke-width="1"`)
    }
    for (const [from, to] of frontArcs(start, angle)) {
      sides.push(
        `<path data-chart-part="point:${index}" d="M${at(from)} A${n(rx)} ${n(ry)} 0 0 1 ${at(to)} L${at(to, thick)} A${n(rx)} ${n(ry)} 0 0 0 ${at(from, thick)}Z" ${facePaint(paint, color, -0.3)}/>`,
      )
    }
    const full = sweep >= Math.PI * 2 - 1e-6
    const path = full
      ? `M${at(0)} A${n(rx)} ${n(ry)} 0 1 1 ${at(Math.PI)} A${n(rx)} ${n(ry)} 0 1 1 ${at(0)}Z`
      : `M${n(cx + dx)} ${n(cy + dy)} L${at(start)} A${n(rx)} ${n(ry)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${at(angle)}Z`
    tops.push(`<path data-chart-part="point:${index}" d="${path}" ${paint}/>`)
    if (labels) {
      const reach = spec.dataLabels === "outsideEnd" ? 1.18 : 0.62
      const text = labelText(spec, serie, value, place, value / total)
      texts.push(
        `<text x="${n(cx + dx + Math.cos(middle) * rx * reach)}" y="${n(cy + dy + Math.sin(middle) * ry * reach + 4)}" text-anchor="middle" ${textAttrs(painter, "dataLabels")}>${escapeXml(text)}</text>`,
      )
    }
  })
  painter.out.push(`<g data-chart-part="series:${serie.index}">${sides.join("")}${tops.join("")}</g>`)
  if (texts.length) {
    painter.out.push(`<g data-chart-part="dataLabels">${texts.join("")}</g>`)
  }
}

/** A 3-D chart's rotation in degrees, Word's own view where the chart has none: X -90 to 90 (a pie 0 to 90), Y 0 to 359. */
export function chartRotation(spec: Pick<ChartSpec, "type" | "rotX" | "rotY">) {
  const pie = spec.type === "pie"
  const x = Number.isFinite(spec.rotX) ? spec.rotX! : pie ? 30 : 15
  const y = Number.isFinite(spec.rotY) ? spec.rotY! : pie ? 0 : 20
  return {
    x: Math.round(Math.max(pie ? 0 : -90, Math.min(90, x))),
    y: Math.round(((y % 360) + 360) % 360),
  }
}

/** How many of the last points Pie of Pie and Bar of Pie draw again on their own: Word's split by position. */
export function ofPieSplit(spec: ChartSpec, count: number) {
  const asked = spec.ofPieSplit ?? Math.max(1, Math.min(3, Math.floor(count / 2)))
  return Math.max(1, Math.min(count - 1, Math.round(asked)))
}

/**
 * A 3-D chart's view beyond its rotation, Word's own where the chart has none: Right Angle Axes on, except for a
 * chart whose series sit one behind another (and a 3-D Line), which Word draws in perspective; Perspective 15°;
 * Depth 100% of the base. The app draws without perspective either way.
 */
export function chartView3d(spec: Pick<ChartSpec, "type" | "threeD" | "rightAngleAxes" | "perspective" | "depthPercent">) {
  const deep = spec.threeD === "deep" || spec.type === "line"
  const clamp = (value: number | undefined, low: number, high: number, fallback: number) =>
    Math.round(Math.max(low, Math.min(high, Number.isFinite(value) ? value! : fallback)) * 10) / 10
  return {
    rightAngle: spec.rightAngleAxes ?? !deep,
    perspective: clamp(spec.perspective, 0, 120, 15),
    depth: Math.round(clamp(spec.depthPercent, 20, 2000, 100)),
  }
}

/** The threshold Split by Value or Percentage value uses until one is typed: a tenth of the whole. */
export function ofPieThreshold(spec: ChartSpec) {
  if (Number.isFinite(spec.ofPieSplitValue)) {
    return spec.ofPieSplitValue!
  }
  return spec.ofPieSplitBy === "percent" ? 10 : Math.round(pieData(spec).total * 10) / 100
}

/** Which of the shown points Pie of Pie and Bar of Pie draw in the second plot, by Split Series By. */
export function ofPieSecond(spec: ChartSpec): boolean[] {
  const { shown, values, total } = pieData(spec)
  switch (spec.ofPieSplitBy ?? "pos") {
    case "val":
      return values.map((value) => value < ofPieThreshold(spec))
    case "percent":
      return values.map((value) => (value / total) * 100 < ofPieThreshold(spec))
    case "cust":
      return shown.map((index) => Boolean(spec.ofPieCustom?.includes(index)))
    default: {
      const split = ofPieSplit(spec, values.length)
      return values.map((_, place) => place >= values.length - split)
    }
  }
}

/** The Gap Width between the two plots of Pie of Pie and Bar of Pie, as a share: Word's 0 to 500%, 100 unset. */
export function ofPieGap(spec: ChartSpec) {
  return Math.max(0, Math.min(500, Number.isFinite(spec.ofPieGap) ? spec.ofPieGap! : 100)) / 100
}

/** The Second Plot Size, as a share of the first plot: Word's 5 to 200%, 75 unset. */
export function ofPieSize(spec: ChartSpec) {
  return Math.max(5, Math.min(200, Number.isFinite(spec.ofPieSize) ? spec.ofPieSize! : 75)) / 100
}

/**
 * Pie of Pie and Bar of Pie: the points of the first plot as a pie whose last slice, Other, gathers the rest, and
 * the rest again to its right as a smaller pie or a stacked bar, joined to Other by two lines.
 */
function ofPie(painter: Painter, box: Box, second: "pie" | "bar") {
  const { spec, look } = painter
  const { serie, shown, values } = pieData(spec)
  if (!serie || values.length < 2) {
    wholePie(painter, box)
    return
  }
  const inSecond = ofPieSecond(spec)
  const mainPlaces = values.map((_, place) => place).filter((place) => !inSecond[place])
  const restPlaces = values.map((_, place) => place).filter((place) => inSecond[place])
  if (!restPlaces.length) {
    wholePie(painter, box)
    return
  }
  const main = mainPlaces.map((place) => values[place]!)
  const rest = restPlaces.map((place) => values[place]!)
  const size = ofPieSize(spec)
  const other = rest.reduce((sum, value) => sum + value, 0)
  const total = main.reduce((sum, value) => sum + value, 0) + other || 1
  const labels = spec.dataLabels !== "none"
  // The two plots side by side and centred: the first pie, the Gap Width (100% is half its radius), the second.
  const gap = ofPieGap(spec) / 2
  const across = second === "pie" ? 2 * size : 0.45
  const r1 = Math.max(4, Math.min(box.h / 2 - 6, (box.w - 8) / (2 + gap + across)))
  const r2 = Math.min(r1 * size, box.h / 2 - 4)
  const barWidth = Math.max(10, r1 * 0.45)
  const cy = box.y + box.h / 2
  const cx1 = box.x + (box.w - r1 * (2 + gap + across)) / 2 + r1
  const cx2 = cx1 + r1 + r1 * gap + (second === "pie" ? r2 : barWidth / 2)
  const line = spec.style === 1 ? "#ffffff" : undefined
  const paintOf = (color: string, part: string) => {
    const paint = seriesPaint(painter, color, part)
    return line && !spec.format[part]?.line
      ? paint.replace(/stroke="[^"]*" stroke-width="[^"]*"/, `stroke="${line}" stroke-width="1.5"`)
      : paint
  }
  const slices: string[] = []
  const texts: string[] = []
  const label = (value: number, place: number, x: number, y: number) => {
    if (labels) {
      const text = labelText(spec, serie, value, place, value / total)
      texts.push(
        `<text x="${n(x)}" y="${n(y + 4)}" text-anchor="middle" ${textAttrs(painter, "dataLabels")}>${escapeXml(text)}</text>`,
      )
    }
  }
  const wedge = (cx: number, r: number, from: number, to: number, paint: string, part: string) => {
    const at = (a: number) => `${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`
    return to - from >= Math.PI * 2 - 1e-6
      ? `<circle data-chart-part="${part}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${paint}/>`
      : `<path data-chart-part="${part}" d="M${n(cx)} ${n(cy)} L${at(from)} A${n(r)} ${n(r)} 0 ${to - from > Math.PI ? 1 : 0} 1 ${at(to)}Z" ${paint}/>`
  }
  // Other faces the second plot: centred on the right.
  const otherSweep = (other / total) * Math.PI * 2
  let angle = otherSweep / 2
  main.forEach((value, offset) => {
    const place = mainPlaces[offset]!
    const index = shown[place]!
    const sweep = (value / total) * Math.PI * 2
    slices.push(wedge(cx1, r1, angle, angle + sweep, paintOf(pointColor(painter, index), `point:${index}`), `point:${index}`))
    const middle = angle + sweep / 2
    label(value, place, cx1 + Math.cos(middle) * r1 * 0.62, cy + Math.sin(middle) * r1 * 0.62)
    angle += sweep
  })
  const otherColor = paletteColor(spec, shown.length)
  slices.push(wedge(cx1, r1, -otherSweep / 2, otherSweep / 2, paintOf(otherColor, "point:other"), "point:other"))
  // Other's own category is none of the data's.
  label(other, -1, cx1 + r1 * 0.62, cy)
  const top = [cx1 + Math.cos(-otherSweep / 2) * r1, cy + Math.sin(-otherSweep / 2) * r1]
  const bottom = [cx1 + Math.cos(otherSweep / 2) * r1, cy + Math.sin(otherSweep / 2) * r1]
  let joins: [number, number][]
  if (second === "pie") {
    let from = Math.PI - ((rest[0]! / (other || 1)) * Math.PI * 2) / 2
    rest.forEach((value, offset) => {
      const place = restPlaces[offset]!
      const index = shown[place]!
      const sweep = (value / (other || 1)) * Math.PI * 2
      slices.push(wedge(cx2, r2, from, from + sweep, paintOf(pointColor(painter, index), `point:${index}`), `point:${index}`))
      const middle = from + sweep / 2
      label(value, place, cx2 + Math.cos(middle) * r2 * 0.6, cy + Math.sin(middle) * r2 * 0.6)
      from += sweep
    })
    joins = [
      [cx2, cy - r2],
      [cx2, cy + r2],
    ]
  } else {
    const height = Math.min(r1 * 1.6 * (size / 0.75), box.h - 8)
    const width = barWidth
    let y = cy - height / 2
    rest.forEach((value, offset) => {
      const place = restPlaces[offset]!
      const index = shown[place]!
      const tall = (value / (other || 1)) * height
      slices.push(
        `<rect data-chart-part="point:${index}" x="${n(cx2 - width / 2)}" y="${n(y)}" width="${n(width)}" height="${n(tall)}" ${paintOf(pointColor(painter, index), `point:${index}`)}/>`,
      )
      label(value, place, cx2, y + tall / 2)
      y += tall
    })
    joins = [
      [cx2 - width / 2, cy - height / 2],
      [cx2 - width / 2, cy + height / 2],
    ]
  }
  painter.out.push(`<g data-chart-part="series:${serie.index}">${slices.join("")}</g>`)
  painter.out.push(
    `<g data-chart-part="lines" stroke="${look.axis}" stroke-width="1">` +
      `<line x1="${n(top[0]!)}" y1="${n(top[1]!)}" x2="${n(joins[0]![0])}" y2="${n(joins[0]![1])}"/>` +
      `<line x1="${n(bottom[0]!)}" y1="${n(bottom[1]!)}" x2="${n(joins[1]![0])}" y2="${n(joins[1]![1])}"/></g>`,
  )
  if (texts.length) {
    painter.out.push(`<g data-chart-part="dataLabels">${texts.join("")}</g>`)
  }
}

/** A pie too small to split: drawn whole. */
function wholePie(painter: Painter, box: Box) {
  pie({ ...painter, spec: { ...painter.spec, ofPie: undefined } }, box)
}

/**
 * Box & Whisker: a box from the first to the third quartile per group and series, a line at the median, × at the
 * mean, whiskers out to the furthest values within 1.5 × the box's height, and the values beyond as points.
 */
function boxWhisker(painter: Painter, box: Box) {
  const { spec, look } = painter
  const groups = boxGroups(spec)
  const all = groups.flatMap((group) =>
    group.boxes.flatMap((stats) => (stats ? [stats.min, stats.max, ...stats.outliers] : [])),
  )
  const format = spec.valueAxis.numberFormat ?? "General"
  const scale = niceScale(Math.min(0, ...all), Math.max(1, ...all), spec.valueAxis, labelCount(box.h - 30, 22))
  const axisWidth = spec.axes.value
    ? Math.max(...scale.ticks.map((tick) => formatNumber(tick, format).length)) * CHAR + 8
    : 0
  const plot = {
    x: box.x + axisWidth,
    y: box.y + 6,
    w: box.w - axisWidth - 4,
    h: box.h - (spec.axes.category ? 26 : 8),
  }
  const toY = (value: number) => plot.y + plot.h - ((value - scale.min) / (scale.max - scale.min || 1)) * plot.h
  const parts: string[] = []
  if (spec.gridlines.major) {
    const lines = scale.ticks.map(
      (tick) =>
        `<line x1="${n(plot.x)}" y1="${n(toY(tick))}" x2="${n(plot.x + plot.w)}" y2="${n(toY(tick))}" stroke="${look.grid}" stroke-width="0.75"/>`,
    )
    parts.push(`<g data-chart-part="gridlines">${lines.join("")}</g>`)
  }
  if (spec.axes.value) {
    const labels = scale.ticks.map(
      (tick) =>
        `<text x="${n(plot.x - 6)}" y="${n(toY(tick) + 4)}" text-anchor="end" ${textAttrs(painter, "axis:value")}>${escapeXml(formatNumber(tick, format))}</text>`,
    )
    parts.push(`<g data-chart-part="axis:value">${labels.join("")}</g>`)
  }
  const band = plot.w / Math.max(1, groups.length)
  const shown = spec.series.map((serie, index) => ({ serie, index })).filter((item) => !item.serie.hidden)
  const width = Math.min(48, (band * 0.7) / Math.max(1, shown.length))
  const statLabels: string[] = []
  groups.forEach((group, column) => {
    shown.forEach(({ index }, place) => {
      const stats = group.boxes[index]
      if (!stats) {
        return
      }
      const color = seriesColor(painter, index)
      const center = plot.x + band * column + band / 2 + (place - (shown.length - 1) / 2) * width * 1.15
      const left = center - width / 2
      const cap = width / 4
      const top = toY(stats.q3)
      const bottom = toY(stats.q1)
      const mean = toY(stats.mean)
      const pieces = [
        `<path d="M${n(center)} ${n(top)}V${n(toY(stats.max))}M${n(center - cap)} ${n(toY(stats.max))}H${n(center + cap)}M${n(center)} ${n(bottom)}V${n(toY(stats.min))}M${n(center - cap)} ${n(toY(stats.min))}H${n(center + cap)}" stroke="${look.text}" stroke-width="1" fill="none"/>`,
        `<rect x="${n(left)}" y="${n(top)}" width="${n(width)}" height="${n(Math.max(1, bottom - top))}" ${seriesPaint(painter, color, `series:${index}`)}/>`,
        `<line x1="${n(left)}" y1="${n(toY(stats.median))}" x2="${n(left + width)}" y2="${n(toY(stats.median))}" stroke="#ffffff" stroke-width="1.5"/>`,
        `<path d="M${n(center - 3)} ${n(mean - 3)}l6 6m0 -6l-6 6" stroke="#ffffff" stroke-width="1.5"/>`,
        ...stats.outliers.map(
          (value) =>
            `<circle cx="${n(center)}" cy="${n(toY(value))}" r="2.5" fill="none" stroke="${color}" stroke-width="1"/>`,
        ),
      ]
      parts.push(`<g data-chart-part="series:${index}">${pieces.join("")}</g>`)
      if (spec.dataLabels !== "none") {
        // As in Word: each statistic of the box is labelled beside it.
        const values = [...new Set([stats.min, stats.q1, stats.median, stats.q3, stats.max, stats.mean])]
        statLabels.push(
          ...values.map(
            (value) =>
              `<text x="${n(left + width + 3)}" y="${n(toY(value) + 4)}" ${textAttrs(painter, "dataLabels")}>${escapeXml(formatNumber(Math.round(value * 100) / 100, format))}</text>`,
          ),
        )
      }
    })
  })
  const axisLine = partLine(painter, "axis:category", look.axis, 0.75)
  parts.push(
    `<line x1="${n(plot.x)}" y1="${n(plot.y + plot.h)}" x2="${n(plot.x + plot.w)}" y2="${n(plot.y + plot.h)}" stroke="${axisLine.stroke}" stroke-width="${axisLine.width}"/>`,
  )
  if (spec.axes.category) {
    const labels = groups.map(
      (group, column) =>
        `<text x="${n(plot.x + band * column + band / 2)}" y="${n(plot.y + plot.h + 16)}" text-anchor="middle" ${textAttrs(painter, "axis:category")}>${escapeXml(group.name)}</text>`,
    )
    parts.push(`<g data-chart-part="axis:category">${labels.join("")}</g>`)
  }
  if (statLabels.length) {
    parts.push(`<g data-chart-part="dataLabels">${statLabels.join("")}</g>`)
  }
  painter.out.push(...parts)
}

/** A Surface chart's grid: a value per category (across) and series (in depth), from the shown ones. */
function surfaceGrid(spec: ChartSpec) {
  const columns = spec.categories
    .map((name, index) => ({ name, index }))
    .filter((item) => !spec.hiddenCategories.includes(item.index))
  const rows = spec.series.filter((serie) => !serie.hidden)
  return {
    columns,
    rows,
    at: (column: number, row: number) => rows[row]?.values[columns[column]?.index ?? 0] ?? 0,
  }
}

/**
 * A Surface chart's colour bands: one per step of the value axis, as Word's legend lists them ("0-1", "1-2" …); band
 * `i` is drawn in the palette's `i`th colour (or its point format).
 */
export function surfaceBands(spec: ChartSpec) {
  const grid = surfaceGrid(spec)
  const values = grid.rows.flatMap((_, row) => grid.columns.map((_, column) => grid.at(column, row)))
  const scale = niceScale(Math.min(0, ...values), Math.max(1, ...values), spec.valueAxis, 6)
  const format = spec.valueAxis.numberFormat ?? "General"
  return scale.ticks.slice(0, -1).map((low, index) => ({
    low,
    high: scale.ticks[index + 1]!,
    name: `${formatNumber(low, format)}-${formatNumber(scale.ticks[index + 1]!, format)}`,
  }))
}

function bandIndex(bands: { low: number; high: number }[], value: number) {
  const found = bands.findIndex((band) => value < band.high)
  return found === -1 ? bands.length - 1 : Math.max(0, found)
}

/**
 * Contour: the surface seen from above, categories across and series up, the value interpolated between the points
 * and filled by band (Contour), or only the band edges drawn as lines (Wireframe Contour).
 */
function contour(painter: Painter, box: Box) {
  const { spec, look } = painter
  const grid = surfaceGrid(spec)
  const bands = surfaceBands(spec)
  const axisWidth = spec.axes.value ? Math.max(0, ...grid.rows.map((serie) => serie.name.length)) * CHAR + 8 : 0
  const plot = {
    x: box.x + axisWidth,
    y: box.y + 4,
    w: box.w - axisWidth - 8,
    h: box.h - (spec.axes.category ? 26 : 8),
  }
  const columns = grid.columns.length
  const rows = grid.rows.length
  const parts: string[] = []
  if (columns >= 2 && rows >= 2) {
    const toX = (column: number) => plot.x + (column / (columns - 1)) * plot.w
    const toY = (row: number) => plot.y + plot.h - (row / (rows - 1)) * plot.h
    if (spec.filled) {
      // Bilinear inside each cell, sampled finely and joined into runs of one band along each line.
      const across = (columns - 1) * 24
      const up = (rows - 1) * 24
      const cellW = plot.w / across
      const cellH = plot.h / up
      const tiles: string[] = []
      for (let y = 0; y < up; y += 1) {
        const v = ((y + 0.5) / up) * (rows - 1)
        const row = Math.min(rows - 2, Math.floor(v))
        const fy = v - row
        let start = 0
        let current = -1
        for (let x = 0; x <= across; x += 1) {
          let band = -1
          if (x < across) {
            const u = ((x + 0.5) / across) * (columns - 1)
            const column = Math.min(columns - 2, Math.floor(u))
            const fx = u - column
            const value =
              grid.at(column, row) * (1 - fx) * (1 - fy) +
              grid.at(column + 1, row) * fx * (1 - fy) +
              grid.at(column, row + 1) * (1 - fx) * fy +
              grid.at(column + 1, row + 1) * fx * fy
            band = bandIndex(bands, value)
          }
          if (band !== current) {
            if (current >= 0) {
              tiles.push(
                `<rect x="${n(plot.x + start * cellW)}" y="${n(plot.y + plot.h - (y + 1) * cellH)}" width="${n((x - start) * cellW + 0.4)}" height="${n(cellH + 0.4)}" fill="${pointColor(painter, current)}"/>`,
              )
            }
            start = x
            current = band
          }
        }
      }
      parts.push(`<g data-chart-part="plotArea">${tiles.join("")}</g>`)
    } else {
      // Marching squares: where each band edge crosses each cell.
      const lines: string[] = []
      bands.slice(1).forEach((band, index) => {
        const level = band.low
        const segments: string[] = []
        for (let row = 0; row < rows - 1; row += 1) {
          for (let column = 0; column < columns - 1; column += 1) {
            const corners = [
              [column, row],
              [column + 1, row],
              [column + 1, row + 1],
              [column, row + 1],
            ] as const
            const values = corners.map(([c, r]) => grid.at(c, r))
            const cross: [number, number][] = []
            for (let edge = 0; edge < 4; edge += 1) {
              const a = values[edge]!
              const b = values[(edge + 1) % 4]!
              if (a < level !== b < level) {
                const t = (level - a) / (b - a)
                const [ca, ra] = corners[edge]!
                const [cb, rb] = corners[(edge + 1) % 4]!
                cross.push([toX(ca + (cb - ca) * t), toY(ra + (rb - ra) * t)])
              }
            }
            const pairs =
              cross.length === 2
                ? [[0, 1]]
                : cross.length === 4
                  ? values.reduce((sum, value) => sum + value, 0) / 4 < level === values[0]! < level
                    ? [
                        [0, 1],
                        [2, 3],
                      ]
                    : [
                        [0, 3],
                        [1, 2],
                      ]
                  : []
            for (const [from, to] of pairs) {
              const [x1, y1] = cross[from!]!
              const [x2, y2] = cross[to!]!
              segments.push(`M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`)
            }
          }
        }
        if (segments.length) {
          lines.push(
            `<path d="${segments.join("")}" stroke="${pointColor(painter, index + 1)}" stroke-width="1.5" fill="none"/>`,
          )
        }
      })
      parts.push(`<g data-chart-part="plotArea">${lines.join("")}</g>`)
    }
    if (spec.gridlines.major) {
      const outline = partLine(painter, "axis:category", look.axis, 0.75)
      parts.push(
        `<rect x="${n(plot.x)}" y="${n(plot.y)}" width="${n(plot.w)}" height="${n(plot.h)}" fill="none" stroke="${outline.stroke}" stroke-width="${outline.width}"/>`,
      )
    }
    if (spec.axes.category) {
      const labels = grid.columns.map(
        (item, column) =>
          `<text x="${n(toX(column))}" y="${n(plot.y + plot.h + 16)}" text-anchor="middle" ${textAttrs(painter, "axis:category")}>${escapeXml(item.name)}</text>`,
      )
      parts.push(`<g data-chart-part="axis:category">${labels.join("")}</g>`)
    }
    if (spec.axes.value) {
      // The depth (series) axis stands up the left side of a contour.
      const labels = grid.rows.map(
        (serie, row) =>
          `<text x="${n(plot.x - 6)}" y="${n(toY(row) + 4)}" text-anchor="end" ${textAttrs(painter, "axis:value")}>${escapeXml(serie.name)}</text>`,
      )
      parts.push(`<g data-chart-part="axis:value">${labels.join("")}</g>`)
    }
  }
  painter.out.push(...parts)
}

/**
 * 3-D Surface: the grid in an oblique view, categories across the front, series going back to the right and the value
 * up, with the back and side walls and their gridlines, filled by band (or drawn as a band-coloured wire mesh).
 */
function surface3d(painter: Painter, box: Box) {
  const { spec, look } = painter
  const grid = surfaceGrid(spec)
  const bands = surfaceBands(spec)
  const low = bands[0]?.low ?? 0
  const high = bands[bands.length - 1]?.high ?? 1
  const format = spec.valueAxis.numberFormat ?? "General"
  const axisWidth = spec.axes.value
    ? Math.max(...bands.map((band) => formatNumber(band.high, format).length)) * CHAR + 10
    : 0
  const seriesWidth = spec.axes.value ? Math.max(0, ...grid.rows.map((serie) => serie.name.length)) * CHAR + 10 : 0
  const angle = Math.PI / 6
  const available = { w: box.w - axisWidth - seriesWidth, h: box.h - (spec.axes.category ? 30 : 8) }
  // The depth runs a third of the width back.
  const width = available.w / (1 + 0.35 * Math.cos(angle))
  const depthX = width * 0.35 * Math.cos(angle)
  const depthY = Math.min(width * 0.35 * Math.sin(angle), available.h * 0.35)
  const height = available.h - depthY
  const origin = { x: box.x + axisWidth, y: box.y + depthY + height }
  const columns = grid.columns.length
  const rows = grid.rows.length
  const at = (x: number, value: number, z: number) =>
    [origin.x + x * width + z * depthX, origin.y - ((value - low) / (high - low || 1)) * height - z * depthY] as const
  const point = (x: number, value: number, z: number) => {
    const [px, py] = at(x, value, z)
    return `${n(px)} ${n(py)}`
  }
  const parts: string[] = []
  const wall = partLine(painter, "gridlines", look.grid, 0.75)
  // Floor, back wall and side wall, with a gridline per band edge.
  const walls = [
    `M${point(0, low, 0)}L${point(1, low, 0)}L${point(1, low, 1)}L${point(0, low, 1)}Z`,
    `M${point(0, low, 1)}L${point(1, low, 1)}L${point(1, high, 1)}L${point(0, high, 1)}Z`,
    `M${point(0, low, 0)}L${point(0, low, 1)}L${point(0, high, 1)}L${point(0, high, 0)}Z`,
  ]
  const gridlines = spec.gridlines.major
    ? bands.slice(1).map((band) => `M${point(0, band.low, 0)}L${point(0, band.low, 1)}L${point(1, band.low, 1)}`)
    : []
  parts.push(
    `<g data-chart-part="gridlines"><path d="${[...walls, ...gridlines].join("")}" fill="none" stroke="${wall.stroke}" stroke-width="${wall.width}"/></g>`,
  )
  if (columns >= 2 && rows >= 2) {
    const steps = 6
    const valueAt = (u: number, v: number) => {
      const column = Math.min(columns - 2, Math.floor(u))
      const row = Math.min(rows - 2, Math.floor(v))
      const fx = u - column
      const fy = v - row
      return (
        grid.at(column, row) * (1 - fx) * (1 - fy) +
        grid.at(column + 1, row) * fx * (1 - fy) +
        grid.at(column, row + 1) * (1 - fx) * fy +
        grid.at(column + 1, row + 1) * fx * fy
      )
    }
    const xOf = (u: number) => u / (columns - 1)
    const zOf = (v: number) => v / (rows - 1)
    const pieces: string[] = []
    if (spec.filled) {
      // Back to front, so nearer parts of the surface cover farther ones.
      const total = (rows - 1) * steps
      for (let j = total - 1; j >= 0; j -= 1) {
        for (let i = 0; i < (columns - 1) * steps; i += 1) {
          const u0 = i / steps
          const u1 = (i + 1) / steps
          const v0 = j / steps
          const v1 = (j + 1) / steps
          const corners = [
            [u0, v0],
            [u1, v0],
            [u1, v1],
            [u0, v1],
          ] as const
          const values = corners.map(([u, v]) => valueAt(u, v))
          const color = pointColor(painter, bandIndex(bands, values.reduce((sum, value) => sum + value, 0) / 4))
          const d = corners
            .map(([u, v], index) => `${index ? "L" : "M"}${point(xOf(u), values[index]!, zOf(v))}`)
            .join("")
          pieces.push(`<path d="${d}Z" fill="${color}" stroke="${color}" stroke-width="0.5" stroke-linejoin="round"/>`)
        }
      }
    } else {
      // The grid's lines, each piece in the colour of its band.
      const line = (from: [number, number], to: [number, number]) => {
        for (let step = 0; step < steps; step += 1) {
          const a = step / steps
          const b = (step + 1) / steps
          const ua = from[0] + (to[0] - from[0]) * a
          const va = from[1] + (to[1] - from[1]) * a
          const ub = from[0] + (to[0] - from[0]) * b
          const vb = from[1] + (to[1] - from[1]) * b
          const color = pointColor(painter, bandIndex(bands, (valueAt(ua, va) + valueAt(ub, vb)) / 2))
          pieces.push(
            `<path d="M${point(xOf(ua), valueAt(ua, va), zOf(va))}L${point(xOf(ub), valueAt(ub, vb), zOf(vb))}" stroke="${color}" stroke-width="1.5"/>`,
          )
        }
      }
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
          line([column, row], [column + 1, row])
        }
      }
      for (let column = 0; column < columns; column += 1) {
        for (let row = 0; row < rows - 1; row += 1) {
          line([column, row], [column, row + 1])
        }
      }
    }
    parts.push(`<g data-chart-part="plotArea">${pieces.join("")}</g>`)
    if (spec.axes.category) {
      const labels = grid.columns.map((item, column) => {
        const [x, y] = at(xOf(column), low, 0)
        return `<text x="${n(x)}" y="${n(y + 16)}" text-anchor="middle" ${textAttrs(painter, "axis:category")}>${escapeXml(item.name)}</text>`
      })
      parts.push(`<g data-chart-part="axis:category">${labels.join("")}</g>`)
    }
    if (spec.axes.value) {
      const values = [low, ...bands.map((band) => band.high)].map((value) => {
        const [x, y] = at(0, value, 0)
        return `<text x="${n(x - 6)}" y="${n(y + 4)}" text-anchor="end" ${textAttrs(painter, "axis:value")}>${escapeXml(formatNumber(value, format))}</text>`
      })
      const depth = grid.rows.map((serie, row) => {
        const [x, y] = at(1, low, zOf(row))
        return `<text x="${n(x + 6)}" y="${n(y + 4)}" ${textAttrs(painter, "axis:value")}>${escapeXml(serie.name)}</text>`
      })
      parts.push(`<g data-chart-part="axis:value">${values.join("")}${depth.join("")}</g>`)
    }
  }
  painter.out.push(...parts)
}

/** A Treemap or Sunburst node's data label: its name and, when asked, its size. */
function nodeLabel(spec: ChartSpec, node: TreeNode) {
  const format = spec.valueAxis.numberFormat ?? "General"
  const parts = [
    spec.labelContent.category ? node.name : "",
    spec.labelContent.value ? formatNumber(node.value, format) : "",
  ].filter(Boolean)
  return parts.join(", ")
}

/**
 * Treemap: each branch a squarified block in its own colour, split into its stems and leaves, with Word's default
 * "overlapping" branch labels in the top-left corner of the branch and the leaf names in the corner of each leaf.
 */
function treemap(painter: Painter, box: Box) {
  const { spec } = painter
  const plot = { x: box.x + 2, y: box.y + 2, w: box.w - 4, h: box.h - 4 }
  const tiles: string[] = []
  const labels: string[] = []
  const show = spec.dataLabels !== "none"
  const fits = (text: string, rect: { w: number; h: number }, size: number) =>
    text.length * size * 0.55 + 6 <= rect.w && size + 4 <= rect.h
  const place = (node: TreeNode, rect: { x: number; y: number; w: number; h: number }, corner: boolean) => {
    if (node.children.length === 0) {
      const color = pointColor(painter, node.branch)
      tiles.push(
        `<rect x="${n(rect.x)}" y="${n(rect.y)}" width="${n(Math.max(0, rect.w))}" height="${n(Math.max(0, rect.h))}" fill="${color}" stroke="${painter.look.background}" stroke-width="1.5"/>`,
      )
      const text = nodeLabel(spec, node)
      // The branch's own label takes the first line of the leaf in its corner.
      const top = rect.y + (corner && node.depth > 1 ? 30 : 14)
      if (show && text && fits(text, { w: rect.w, h: rect.h - (top - rect.y) + 10 }, 12)) {
        labels.push(
          `<text x="${n(rect.x + 4)}" y="${n(top)}" fill="#ffffff" font-family="${CHART_FONT}" font-size="${spec.format.dataLabels?.fontSize ? n((spec.format.dataLabels.fontSize * 4) / 3) : 12}">${escapeXml(text)}</text>`,
        )
      }
      return
    }
    const rects = squarify(
      node.children.map((child) => child.value),
      rect,
    )
    node.children.forEach((child, index) => {
      const inner = rects[index]!
      place(child, inner, corner && index === 0)
    })
  }
  const root = chartTree(spec)
  const tops = squarify(
    root.children.map((child) => child.value),
    plot,
  )
  root.children.forEach((branch, index) => {
    const rect = tops[index]!
    place(branch, rect, true)
    if (show && branch.children.length && fits(branch.name, rect, 16)) {
      labels.push(
        `<text x="${n(rect.x + 4)}" y="${n(rect.y + 17)}" fill="#ffffff" font-family="${CHART_FONT}" font-size="16">${escapeXml(branch.name)}</text>`,
      )
    }
  })
  painter.out.push(`<g data-chart-part="series:0">${tiles.join("")}</g>`)
  if (labels.length) {
    painter.out.push(`<g data-chart-part="dataLabels">${labels.join("")}</g>`)
  }
}

/** Sunburst: one ring per level from a small hole outwards, each node's arc its share of its parent's, clockwise
 * from twelve o'clock, largest first, a branch in one colour. A leaf on an inner ring leaves the rings outside empty. */
function sunburst(painter: Painter, box: Box) {
  const { spec } = painter
  const root = chartTree(spec)
  const depth = (node: TreeNode): number => (node.children.length ? 1 + Math.max(...node.children.map(depth)) : 0)
  const rings = Math.max(1, depth(root))
  const radius = Math.max(4, Math.min(box.w, box.h) / 2 - 4)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const hole = radius * 0.1
  const ring = (radius - hole) / rings
  const arcs: string[] = []
  const labels: string[] = []
  const at = (r: number, angle: number) => [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const
  const sector = (r0: number, r1: number, a0: number, a1: number) => {
    const end = Math.min(a1, a0 + Math.PI * 2 - 1e-4)
    const large = end - a0 > Math.PI ? 1 : 0
    const [x0, y0] = at(r1, a0)
    const [x1, y1] = at(r1, end)
    const [x2, y2] = at(r0, end)
    const [x3, y3] = at(r0, a0)
    return `M${n(x0)} ${n(y0)}A${n(r1)} ${n(r1)} 0 ${large} 1 ${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}A${n(r0)} ${n(r0)} 0 ${large} 0 ${n(x3)} ${n(y3)}Z`
  }
  const draw = (node: TreeNode, from: number, span: number) => {
    let angle = from
    node.children.forEach((child) => {
      const share = node.value > 0 ? (span * child.value) / node.value : 0
      const r0 = hole + (child.depth - 1) * ring
      const r1 = r0 + ring
      arcs.push(
        `<path d="${sector(r0, r1, angle, angle + share)}" fill="${pointColor(painter, child.branch)}" stroke="${painter.look.background}" stroke-width="1.5"/>`,
      )
      const text = nodeLabel(spec, child)
      const middle = (r0 + r1) / 2
      if (spec.dataLabels !== "none" && text && share * middle >= text.length * CHAR * 0.85 && ring >= 14) {
        const [x, y] = at(middle, angle + share / 2)
        labels.push(
          `<text x="${n(x)}" y="${n(y + 4)}" text-anchor="middle" fill="#ffffff" font-family="${CHART_FONT}" font-size="${spec.format.dataLabels?.fontSize ? n((spec.format.dataLabels.fontSize * 4) / 3) : 11}">${escapeXml(text)}</text>`,
        )
      }
      draw(child, angle, share)
      angle += share
    })
  }
  draw(root, -Math.PI / 2, Math.PI * 2)
  painter.out.push(`<g data-chart-part="series:0">${arcs.join("")}</g>`)
  if (labels.length) {
    painter.out.push(`<g data-chart-part="dataLabels">${labels.join("")}</g>`)
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
  // Treemap and Sunburst have no axes, as pie charts have none.
  const round = spec.type === "pie" || spec.type === "doughnut" || isHierarchy(spec.type)
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
  if (isHierarchy(spec.type)) {
    // A branch is the point whose fill colours it and everything in it.
    chartTree(spec).children.forEach((node) =>
      parts.push({ id: `point:${node.branch}`, label: `Point "${node.name}"` }),
    )
  } else if (round) {
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
