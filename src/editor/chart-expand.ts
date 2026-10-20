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
