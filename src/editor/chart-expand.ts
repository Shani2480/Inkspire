import type { ChartSeries, ChartSpec } from "@/editor/chart-spec"

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
    categories: spec.categories.filter((_, index) => !spec.hiddenCategories.includes(index)),
  }
}

const label = (value: number) => String(Math.round(value * 100) / 100)

/** Bins by the square-root-of-two rule Word's Sturges-style automatic setting gives: ceil(log2(n) + 1) bins. */
export function histogramBins(values: number[]) {
  if (values.length === 0) {
    return { labels: [] as string[], counts: [] as number[] }
  }
  const low = Math.min(...values)
  const high = Math.max(...values)
  const bins = Math.max(1, Math.ceil(Math.log2(values.length) + 1))
  const width = (high - low) / bins || 1
  const counts = Array.from({ length: bins }, () => 0)
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor((value - low) / width))
    counts[index]! += 1
  }
  const labels = counts.map(
    (_, index) => `${index === 0 ? "[" : "("}${label(low + index * width)}, ${label(low + (index + 1) * width)}]`,
  )
  return { labels, counts }
}

function histogram(spec: ChartSpec): ChartSpec {
  const { name, values } = numbers(spec)
  const { labels, counts } = histogramBins(values)
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
 * when the price rose, dark when it fell). With three series Close is a tick on the line. Saved as `c:stockChart`.
 */
function stock(spec: ChartSpec): ChartSpec {
  const shown = spec.series.map((serie, index) => ({ serie, index })).filter((item) => !item.serie.hidden)
  const withOpen = shown.length >= 4
  const close = shown[shown.length - 1]?.index
  const format = { ...spec.format }
  spec.series.forEach((_, index) => {
    format[`series:${index}`] = { ...format[`series:${index}`], line: "none" }
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
