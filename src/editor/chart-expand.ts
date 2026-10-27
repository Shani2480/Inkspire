import type { ChartSeries, ChartSpec, HistogramBins } from "@/editor/chart-spec"

/**
 * Histogram, Waterfall and Funnel (22.6) are kept as the data the person typed and drawn, and saved to .docx, as the
 * ordinary chart that looks like them: binned columns, floating stacked columns, centred stacked bars. This is that
 * ordinary chart. Other types come back as they are.
 */
export function expandSpec(spec: ChartSpec): ChartSpec {
  if (spec.type === "histogram") {
    return histogram(spec)
  }
  if (spec.type === "waterfall") {
    return waterfall(spec)
  }
  if (spec.type === "funnel") {
    return funnel(spec)
  }
  if (spec.type === "stock") {
    return stock(spec)
  }
  if (spec.type === "boxWhisker") {
    return boxMedians(spec)
  }
  if (spec.type === "treemap" || spec.type === "sunburst") {
    return leaves(spec)
  }
  return spec
}

const hidden = { fill: "none", line: "none" }

function numbers(spec: ChartSpec) {
  const first = spec.series.find((serie) => !serie.hidden) ?? spec.series[0]
  const values = (first?.values ?? []).filter(
    (value, index) => Number.isFinite(value) && !spec.hiddenCategories.includes(index),
  )
  return {
    name: first?.name ?? "Series 1",
    values,
    /** The category of each value: a blank value leaves its category out too, so the two stay in step. */
    categories: (first?.values ?? []).flatMap((value, index) =>
      Number.isFinite(value) && !spec.hiddenCategories.includes(index) ? [spec.categories[index] ?? ""] : [],
    ),
  }
}

const label = (value: number) => String(Math.round(value * 100) / 100)

/** The most bins drawn, so a tiny bin width typed by hand cannot make thousands. */
const MOST_BINS = 500

/** Word's automatic bin width, Scott's normal reference rule: 3.49 standard deviations over the cube root of n. */
export function scottWidth(values: number[]) {
  if (values.length < 2) {
    return 0
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)
  return (3.49 * Math.sqrt(variance)) / Math.cbrt(values.length)
}

/**
 * The values in bins as Word's histogram puts them (`bins` from Format Axis): each bin takes the values above its
 * start up to and including its end, the first its start too. By Category adds up the values of each category,
 * in the order they first come.
 */
export function histogramBins(values: number[], bins: HistogramBins = { by: "auto" }, categories: string[] = []) {
  if (bins.by === "category") {
    const totals = new Map<string, number>()
    values.forEach((value, index) => {
      const name = categories[index] ?? ""
      totals.set(name, (totals.get(name) ?? 0) + value)
    })
    return { labels: [...totals.keys()], counts: [...totals.values()], width: 0, regular: totals.size }
  }
  if (values.length === 0) {
    return { labels: [] as string[], counts: [] as number[], width: 0, regular: 0 }
  }
  const low = Math.min(...values)
  const high = Math.max(...values)
  const under = Number.isFinite(bins.underflow) ? bins.underflow! : undefined
  const over = Number.isFinite(bins.overflow) && (under === undefined || bins.overflow! > under) ? bins.overflow! : undefined
  const start = under ?? low
  const end = Math.max(start, over ?? high)
  const span = end - start
  let width: number
  let count: number
  if (bins.by === "count" && Number(bins.count) >= 1) {
    count = Math.min(MOST_BINS, Math.round(bins.count!))
    width = span / count || 1
  } else {
    width = bins.by === "width" && Number(bins.width) > 0 ? bins.width! : scottWidth(values) || span || 1
    count = Math.max(1, Math.min(MOST_BINS, Math.ceil(span / width - 1e-9)))
  }
  const counts = Array.from({ length: count }, () => 0)
  let below = 0
  let above = 0
  for (const value of values) {
    if (under !== undefined && value <= under) {
      below += 1
    } else if (over !== undefined && value > over) {
      above += 1
    } else {
      counts[Math.max(0, Math.min(count - 1, Math.ceil((value - start) / width) - 1))]! += 1
    }
  }
  const labels = counts.map(
    (_, index) =>
      `${index === 0 && under === undefined ? "[" : "("}${label(start + index * width)}, ${label(start + (index + 1) * width)}]`,
  )
  return {
    labels: [...(under !== undefined ? [`≤${label(under)}`] : []), ...labels, ...(over !== undefined ? [`>${label(over)}`] : [])],
    counts: [...(under !== undefined ? [below] : []), ...counts, ...(over !== undefined ? [above] : [])],
    /** The bin width and the number of bins between the underflow and overflow bins, as chosen. */
    width,
    regular: count,
  }
}

/** The numbers a histogram bins: its first shown series, without blanks and hidden categories. */
export function histogramValues(spec: ChartSpec) {
  return numbers(spec).values
}

function histogram(spec: ChartSpec): ChartSpec {
  const { name, values, categories } = numbers(spec)
  const { labels, counts } = histogramBins(values, spec.bins, categories)
  return {
    ...spec,
    type: "column",
    grouping: "clustered",
    categories: labels,
    hiddenCategories: [],
    series: [{ name, values: counts }],
    legend: "none",
    gapWidth: 0,
    overlap: 0,
  }
}

/** The running total after each change, with the stacked pieces that float each bar at its start. */
export function waterfallPieces(deltas: number[]) {
  let total = 0
  return deltas.map((delta) => {
    const start = total
    total += delta
    const low = Math.min(start, total)
    // A bar that crosses zero is drawn from zero, as a stacked chart cannot float a bar over it.
    const base = low > 0 ? low : 0
    return { base, up: delta > 0 ? Math.abs(delta) : 0, down: delta < 0 ? Math.abs(delta) : 0, total }
  })
}

function waterfall(spec: ChartSpec): ChartSpec {
  const { name, values, categories } = numbers(spec)
  const pieces = waterfallPieces(values)
  const end = pieces.length ? pieces[pieces.length - 1]!.total : 0
  const columns = [...categories.slice(0, values.length), "Total"]
  const series: ChartSeries[] = [
    { name: "Base", values: [...pieces.map((piece) => piece.base), 0] },
    { name: `Increase`, values: [...pieces.map((piece) => piece.up), 0] },
    { name: "Decrease", values: [...pieces.map((piece) => piece.down), 0] },
    { name: "Total", values: [...pieces.map(() => 0), end] },
  ]
  void name
  return {
    ...spec,
    type: "column",
    grouping: "stacked",
    categories: columns,
    hiddenCategories: [],
    series,
    format: {
      ...spec.format,
      "series:0": hidden,
      "series:1": { fill: "#2e7d32" },
      "series:2": { fill: "#c62828" },
      "series:3": { fill: "#5f6b7a" },
    },
    legend: "none",
    gapWidth: 50,
    overlap: 100,
  }
}

function funnel(spec: ChartSpec): ChartSpec {
  const { name, values, categories } = numbers(spec)
  const widest = Math.max(0, ...values)
  // A bar chart draws its first category at the bottom, so the funnel is built from the last category up.
  const order = values.map((_, index) => index).reverse()
  return {
    ...spec,
    type: "bar",
    grouping: "stacked",
    categories: order.map((index) => categories[index] ?? ""),
    hiddenCategories: [],
    series: [
      { name: "Spacer", values: order.map((index) => (widest - (values[index] ?? 0)) / 2) },
      { name, values: order.map((index) => values[index] ?? 0) },
    ],
    format: { ...spec.format, "series:0": hidden },
    legend: "none",
    gapWidth: 30,
    overlap: 100,
  }
}

/**
 * Stock: the series are the prices in Word's order (Open, High, Low, Close; or High, Low, Close), drawn as a line
 * chart with no lines, a high-low line at each category, and with Open the up/down bars from Open to Close (white
 * when the price rose, dark when it fell). With three series Close is a tick on the line. Saved as `c:stockChart`;
 * with Volume, a `c:barChart` of the volume and the `c:stockChart` on the second axes, as Word has them.
 */
function stock(spec: ChartSpec): ChartSpec {
  const shown = spec.series.map((serie, index) => ({ serie, index })).filter((item) => !item.serie.hidden)
  // With Volume, the first series is the volume: columns on the left axis, the prices on a right one.
  const volume = spec.volume && shown.length > 1 ? shown[0]!.index : undefined
  const withOpen = shown.length - (volume === undefined ? 0 : 1) >= 4
  const close = shown[shown.length - 1]?.index
  const format = { ...spec.format }
  spec.series.forEach((_, index) => {
    if (index !== volume) {
      format[`series:${index}`] = { ...format[`series:${index}`], line: "none" }
    }
  })
  return {
    ...spec,
    type: "line",
    grouping: "clustered",
    markers: false,
    smooth: false,
    highLowLines: true,
    upDownBars: withOpen,
    series: spec.series.map((serie, index) => {
      const { type: _type, secondary: _secondary, ...rest } = serie
      if (volume !== undefined) {
        return index === volume
          ? { ...rest, type: "column" as const }
          : { ...rest, secondary: true, ...(!withOpen && index === close ? { tick: true } : {}) }
      }
      return !withOpen && index === close ? { ...rest, tick: true } : rest
    }),
    format,
  }
}

export type BoxStats = {
  min: number
  q1: number
  median: number
  q3: number
  max: number
  mean: number
  /** Values beyond 1.5 × the interquartile range from the box: drawn as points, the whiskers stop short of them. */
  outliers: number[]
}

function medianOf(sorted: number[]) {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Word's Box & Whisker with its default "exclusive median" quartiles: the median is left out of both halves. */
export function boxStats(values: number[]): BoxStats | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) {
    return null
  }
  const half = Math.floor(sorted.length / 2)
  const lower = sorted.length > 1 ? sorted.slice(0, half) : sorted
  const upper = sorted.length > 1 ? sorted.slice(sorted.length % 2 ? half + 1 : half) : sorted
  const q1 = medianOf(lower)
  const q3 = medianOf(upper)
  const reach = 1.5 * (q3 - q1)
  const inside = sorted.filter((value) => value >= q1 - reach && value <= q3 + reach)
  return {
    min: inside[0] ?? sorted[0]!,
    q1,
    median: medianOf(sorted),
    q3,
    max: inside[inside.length - 1] ?? sorted[sorted.length - 1]!,
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    outliers: sorted.filter((value) => value < q1 - reach || value > q3 + reach),
  }
}

/**
 * The boxes of a Box & Whisker chart: rows with the same category label are one group, as in Word's sheet, and each
 * series gives one box per group from its values in those rows.
 */
export function boxGroups(spec: ChartSpec) {
  const names: string[] = []
  const rows = new Map<string, number[]>()
  spec.categories.forEach((name, index) => {
    if (spec.hiddenCategories.includes(index)) {
      return
    }
    if (!rows.has(name)) {
      rows.set(name, [])
      names.push(name)
    }
    rows.get(name)!.push(index)
  })
  return names.map((name) => ({
    name,
    boxes: spec.series.map((serie) =>
      serie.hidden ? null : boxStats(rows.get(name)!.map((row) => serie.values[row] ?? Number.NaN)),
    ),
  }))
}

/** What Word is given for a Box & Whisker chart (it has no such chart outside `chartex`): the medians as columns. */
function boxMedians(spec: ChartSpec): ChartSpec {
  const groups = boxGroups(spec)
  return {
    ...spec,
    type: "column",
    grouping: "clustered",
    categories: groups.map((group) => group.name),
    hiddenCategories: [],
    series: spec.series.map((serie, index) => ({
      ...serie,
      values: groups.map((group) => group.boxes[index]?.median ?? 0),
    })),
  }
}

export type TreeNode = {
  name: string
  value: number
  children: TreeNode[]
  /** The top-level branch the node is in, which gives its colour. */
  branch: number
  depth: number
}

/**
 * The tree of a Treemap or Sunburst chart: each row's labels, outermost first (`levels`, then the category), with the
 * blank ones left out, are its path, as in Word's sheet where a leaf can sit in the Stem column. A row's size is its
 * value in the first shown series; rows with no positive size are left out, as Word does. Children are largest first.
 */
export function chartTree(spec: ChartSpec): TreeNode {
  const root: TreeNode = { name: "", value: 0, children: [], branch: -1, depth: 0 }
  const serie = spec.series.find((item) => !item.hidden)
  spec.categories.forEach((category, row) => {
    const size = serie?.values[row] ?? 0
    if (spec.hiddenCategories.includes(row) || !(size > 0)) {
      return
    }
    const path = [...(spec.levels ?? []).map((level) => level[row] ?? ""), category]
      .map((label) => label.trim())
      .filter(Boolean)
    if (path.length === 0) {
      return
    }
    let node = root
    node.value += size
    path.forEach((name, depth) => {
      let child = node.children.find((item) => item.name === name)
      if (!child) {
        child = {
          name,
          value: 0,
          children: [],
          branch: depth === 0 ? root.children.length : node.branch,
          depth: depth + 1,
        }
        node.children.push(child)
      }
      child.value += size
      node = child
    })
  })
  const sort = (node: TreeNode) => {
    node.children.sort((a, b) => b.value - a.value)
    node.children.forEach(sort)
  }
  sort(root)
  return root
}

export type Rect = { x: number; y: number; w: number; h: number }

/** Squarified treemap layout (Bruls, Huizing, van Wijk): the values, largest first, as rectangles filling `box`. */
export function squarify(values: number[], box: Rect): Rect[] {
  const total = values.reduce((sum, value) => sum + value, 0)
  const out: Rect[] = []
  if (total <= 0 || box.w <= 0 || box.h <= 0) {
    return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }))
  }
  const scale = (box.w * box.h) / total
  const areas = values.map((value) => value * scale)
  let free = { ...box }
  let start = 0
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((a, b) => a + b, 0)
    const max = Math.max(...row)
    const min = Math.min(...row)
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
  }
  while (start < areas.length) {
    const side = Math.min(free.w, free.h)
    let end = start + 1
    while (end < areas.length && worst(areas.slice(start, end + 1), side) <= worst(areas.slice(start, end), side)) {
      end += 1
    }
    const row = areas.slice(start, end)
    const sum = row.reduce((a, b) => a + b, 0)
    if (free.w >= free.h) {
      // A column along the left edge.
      const width = sum / free.h
      let y = free.y
      row.forEach((area) => {
        const height = area / width
        out.push({ x: free.x, y, w: width, h: height })
        y += height
      })
      free = { x: free.x + width, y: free.y, w: free.w - width, h: free.h }
    } else {
      const height = sum / free.w
      let x = free.x
      row.forEach((area) => {
        const width = area / height
        out.push({ x, y: free.y, w: width, h: height })
        x += width
      })
      free = { x: free.x, y: free.y + height, w: free.w, h: free.h - height }
    }
    start = end
  }
  return out
}

/** What Word is given for a Treemap or Sunburst (it has neither outside `chartex`): the leaves' sizes. */
function leaves(spec: ChartSpec): ChartSpec {
  const found: TreeNode[] = []
  const walk = (node: TreeNode) => (node.children.length ? node.children.forEach(walk) : found.push(node))
  chartTree(spec).children.forEach(walk)
  const name = spec.series.find((serie) => !serie.hidden)?.name ?? "Series 1"
  return {
    ...spec,
    type: spec.type === "sunburst" ? "doughnut" : "column",
    grouping: "clustered",
    levels: undefined,
    categories: found.map((node) => node.name),
    hiddenCategories: [],
    series: [{ name, values: found.map((node) => node.value) }],
  }
}
