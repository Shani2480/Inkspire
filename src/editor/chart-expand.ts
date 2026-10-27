import { boxOptions, type ChartSeries, type ChartSpec, type HistogramBins } from "@/editor/chart-spec"

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
    /** The row of each value. */
    rows: (first?.values ?? []).flatMap((value, index) =>
      Number.isFinite(value) && !spec.hiddenCategories.includes(index) ? [index] : [],
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
  if (spec.pareto) {
    // The bins from the largest down, and a line on a second axis of the share counted so far.
    const order = counts.map((_, index) => index).sort((a, b) => counts[b]! - counts[a]! || a - b)
    const total = counts.reduce((sum, count) => sum + count, 0) || 1
    let running = 0
    return {
      ...spec,
      type: "column",
      grouping: "clustered",
      categories: order.map((index) => labels[index]!),
      hiddenCategories: [],
      series: [
        { name, values: order.map((index) => counts[index]!) },
        {
          name: "Cumulative %",
          type: "line",
          secondary: true,
          values: order.map((index) => (running += counts[index]!) / total),
        },
      ],
      markers: false,
      legend: "none",
      gapWidth: 0,
      overlap: 0,
    }
  }
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

/**
 * The running total after each change, with the stacked pieces that float each bar at its start. A point set as a
 * total stands from zero to its own value, and the running total is that value from there on.
 */
export function waterfallPieces(deltas: number[], totals: boolean[] = []) {
  let total = 0
  return deltas.map((delta, index) => {
    if (totals[index]) {
      total = delta
      return { base: 0, up: 0, down: 0, upBelow: 0, downBelow: 0, total, sum: delta }
    }
    const start = total
    total += delta
    const low = Math.min(start, total)
    const high = Math.max(start, total)
    // Positive and negative values stack apart, from zero out: a bar above zero floats on a hidden base under it, one
    // below zero hangs from a hidden base over it, and one across zero is a piece each side of it.
    const base = low > 0 ? low : high < 0 ? high : 0
    const above = low > 0 ? high - low : high < 0 ? 0 : high
    const below = high < 0 ? low - high : low > 0 ? 0 : low
    const rising = delta > 0
    return {
      base,
      up: rising ? above : 0,
      down: rising ? 0 : above,
      upBelow: rising ? below : 0,
      downBelow: rising ? 0 : below,
      total,
      sum: 0,
    }
  })
}

/**
 * Set as total on a Waterfall's point, or off. A chart from before Set as total gets the total it drew after its
 * last point as a row of its own first, so it looks the same.
 */
export function setWaterfallTotal(spec: ChartSpec, index: number, on: boolean): ChartSpec {
  let next = spec
  if (!next.waterfallTotals) {
    const first = next.series.find((serie) => !serie.hidden) ?? next.series[0]
    const sum = numbers(next).values.reduce((total, value) => total + value, 0)
    next = {
      ...next,
      categories: [...next.categories, "Total"],
      series: next.series.map((item) => ({
        ...item,
        values: [...item.values, ...Array(next.categories.length - item.values.length).fill(Number.NaN), item === first ? sum : Number.NaN],
      })),
      waterfallTotals: [next.categories.length],
    }
  }
  const others = next.waterfallTotals!.filter((item) => item !== index)
  return { ...next, waterfallTotals: on ? [...others, index].sort((a, b) => a - b) : others }
}

function waterfall(spec: ChartSpec): ChartSpec {
  const { values, categories, rows } = numbers(spec)
  const own = Boolean(spec.waterfallTotals)
  const pieces = waterfallPieces(
    values,
    rows.map((row) => Boolean(spec.waterfallTotals?.includes(row))),
  )
  const end = pieces.length ? pieces[pieces.length - 1]!.total : 0
  // Totals set on points are drawn where they are; a chart with none set gets one after its last point.
  const after = (value: number) => (own ? [] : [value])
  const columns = [...categories.slice(0, values.length), ...(own ? [] : ["Total"])]
  const series: ChartSeries[] = [
    { name: "Base", values: [...pieces.map((piece) => piece.base), ...after(0)] },
    { name: `Increase`, values: [...pieces.map((piece) => piece.up), ...after(0)] },
    { name: "Decrease", values: [...pieces.map((piece) => piece.down), ...after(0)] },
    { name: "Total", values: [...pieces.map((piece) => piece.sum), ...after(end)] },
  ]
  // Bars below zero, only when there are any, in the same colours.
  const below = pieces.some((piece) => piece.upBelow || piece.downBelow)
  if (below) {
    series.push(
      { name: "Increase", values: [...pieces.map((piece) => piece.upBelow), ...after(0)] },
      { name: "Decrease", values: [...pieces.map((piece) => piece.downBelow), ...after(0)] },
    )
  }
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
      ...(below ? { "series:4": { fill: "#2e7d32" }, "series:5": { fill: "#c62828" } } : {}),
    },
    legend: "none",
    gapWidth: 50,
    overlap: 100,
    pointColumns: [...rows, ...after(-1)],
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
  /** The values within the whiskers, for Show inner points. */
  inner: number[]
}

function medianOf(sorted: number[]) {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** Word's Box & Whisker statistics, by its exclusive median quartiles (the default) or the inclusive ones. */
export function boxStats(values: number[], quartiles: "exclusive" | "inclusive" = "exclusive"): BoxStats | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (sorted.length === 0) {
    return null
  }
  // With an odd count, the exclusive median leaves the middle value out of both halves; the inclusive one keeps
  // it in both.
  const half = Math.floor(sorted.length / 2)
  const odd = sorted.length % 2 === 1
  const lower = sorted.length > 1 ? sorted.slice(0, odd && quartiles === "inclusive" ? half + 1 : half) : sorted
  const upper = sorted.length > 1 ? sorted.slice(odd && quartiles === "exclusive" ? half + 1 : half) : sorted
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
    inner: inside,
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
      serie.hidden
        ? null
        : boxStats(
            rows.get(name)!.map((row) => serie.values[row] ?? Number.NaN),
            boxOptions(spec).quartiles,
          ),
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
