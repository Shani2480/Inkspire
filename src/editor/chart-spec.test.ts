import { describe, expect, it } from "vitest"
import {
  CHART_VARIANTS,
  QUICK_LAYOUTS,
  errorAmounts,
  chartSpecOf,
  defaultChartSpec,
  niceScale,
  renderChart,
  serializeChartSpec,
  switchRowColumn,
  trendline,
  variantOf,
  withSheet,
  withStyle,
  withVariant,
} from "@/editor/chart-spec"

describe("chart spec", () => {
  it("turns a chart from before 20.8 into a spec", () => {
    const spec = chartSpecOf({
      variant: "hbar-stacked",
      values: "|Sales|Costs\nQ1|12|8\nQ2|18|11",
      accent: "#ff0000",
      chrome: "axes,title,labels",
    })
    expect(spec.type).toBe("bar")
    expect(spec.grouping).toBe("stacked")
    expect(spec.categories).toEqual(["Q1", "Q2"])
    expect(spec.series).toEqual([
      { name: "Sales", values: [12, 18] },
      { name: "Costs", values: [8, 11] },
    ])
    expect(spec.title.show).toBe(true)
    expect(spec.dataLabels).toBe("outsideEnd")
    expect(spec.format["series:0"]?.fill).toBe("#ff0000")
  })

  it("reads the spec it saved", () => {
    const spec = withStyle(defaultChartSpec("line-markers"), 8)
    expect(chartSpecOf({ chart: serializeChartSpec(spec) })).toEqual(spec)
  })

  it("knows the variant of every chart it can draw", () => {
    for (const variant of CHART_VARIANTS) {
      expect(variantOf(withVariant(defaultChartSpec(variant.id), variant.id)), variant.id).toBe(variant.id)
    }
  })

  it("draws every variant with its parts named", () => {
    for (const variant of CHART_VARIANTS) {
      const spec = { ...withVariant(defaultChartSpec(variant.id), variant.id), dataLabels: "center" as const }
      const svg = renderChart(spec, 576, 336)
      expect(svg, variant.id).toContain('data-chart-part="chartArea"')
      expect(svg, variant.id).toContain('data-chart-part="title"')
      if (variant.type === "surface") {
        // Word gives a surface no series of its own to format and no data labels: it is coloured by value band.
        expect(svg, variant.id).toContain('data-chart-part="plotArea"')
      } else {
        expect(svg, variant.id).toContain('data-chart-part="series:0"')
        expect(svg, variant.id).toContain('data-chart-part="dataLabels"')
      }
      expect(svg, variant.id).not.toContain("NaN")
    }
  })

  it("applies Quick Layouts and leaves out hidden series and categories", () => {
    const table = QUICK_LAYOUTS[4]!.apply(defaultChartSpec("column"))
    expect(table.dataTable).toBe(true)
    expect(renderChart(table, 576, 336)).toContain('data-chart-part="dataTable"')
    const filtered = defaultChartSpec("column")
    filtered.series[1]!.hidden = true
    filtered.hiddenCategories = [0]
    const svg = renderChart(filtered, 576, 336)
    expect(svg).not.toContain('data-chart-part="series:1"')
    expect(svg).not.toContain(">Category 1<")
  })

  it("switches rows and columns and keeps series options through Edit Data", () => {
    const spec = defaultChartSpec("column")
    const switched = switchRowColumn(spec)
    expect(switched.categories).toEqual(["Series 1", "Series 2", "Series 3"])
    expect(switched.series[0]).toEqual({ name: "Category 1", values: [4.3, 2.4, 2] })
    spec.series[0]!.trendline = "linear"
    const edited = withSheet(spec, {
      series: ["A", "B"],
      categories: ["x", "y"],
      rows: [
        [1, 2],
        [3, 4],
      ],
    })
    expect(edited.series).toEqual([
      { name: "A", values: [1, 3], trendline: "linear" },
      { name: "B", values: [2, 4] },
    ])
  })

  it("keeps the axis labels apart as the chart shrinks", () => {
    const labelsOf = (svg: string, part: string) =>
      [...(new RegExp(`data-chart-part="${part}">(.*?)</g>`, "s").exec(svg)?.[1] ?? "").matchAll(/<text/g)].length
    const spec = defaultChartSpec("column")
    const wide = renderChart(spec, 576, 336)
    const small = renderChart(spec, 576, 90)
    expect(labelsOf(small, "axis:value")).toBeLessThan(labelsOf(wide, "axis:value"))
    expect(labelsOf(small, "axis:value")).toBeGreaterThanOrEqual(2)
    const narrow = renderChart(spec, 60, 336)
    expect(labelsOf(narrow, "axis:category")).toBeLessThan(labelsOf(wide, "axis:category"))
    // A step the user set wins over the automatic one.
    const set = renderChart({ ...spec, valueAxis: { ...spec.valueAxis, major: 1, min: 0, max: 8 } }, 576, 90)
    expect(labelsOf(set, "axis:value")).toBe(9)
  })

  it("picks round axis ticks and fits trendlines", () => {
    expect(niceScale(0, 4.5).ticks).toEqual([0, 1, 2, 3, 4, 5])
    expect(niceScale(0, 4.5, { max: 10, major: 2.5 }).ticks).toEqual([0, 2.5, 5, 7.5, 10])
    expect(
      trendline("linear", [
        [1, 2],
        [2, 4],
        [3, 6],
      ]),
    ).toEqual([
      [1, 2],
      [3, 6],
    ])
  })
})

describe("error bars and extra lines", () => {
  it("draws them and works out their size", () => {
    const spec = { ...defaultChartSpec("line"), errorBars: { kind: "fixed" as const, amount: 2 }, dropLines: true }
    const svg = renderChart(spec, 400, 300)
    expect(svg).toContain('data-chart-part="errorBars:0"')
    expect(svg).toContain('data-chart-part="lines"')
    expect(errorAmounts("fixed", 2, [1, 2, 3])).toEqual([2, 2, 2])
    expect(errorAmounts("percent", 10, [10, 20])).toEqual([1, 2])
  })
})
