import { describe, expect, it } from "vitest"
import { loadMapCountries } from "@/editor/chart-map"
import {
  CHART_VARIANTS,
  QUICK_LAYOUTS,
  chartRotation,
  chartView3d,
  errorAmounts,
  chartSpecOf,
  defaultChartSpec,
  niceScale,
  ofPieSecond,
  ofPieSplit,
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

  it("draws every variant with its parts named", async () => {
    // A map is drawn once its country outlines are loaded.
    await loadMapCountries()
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

  it("draws 3-D charts with walls and sides, and an of-pie chart's second plot from its last points", () => {
    const count = (svg: string, text: string) => svg.split(text).length - 1
    const flat = renderChart(defaultChartSpec("column"), 576, 336)
    const deep = renderChart(withVariant(defaultChartSpec("column"), "column-3d"), 576, 336)
    // Each bar gains a side and a top; the plot area becomes back wall, side wall and floor.
    expect(count(deep, "<polygon")).toBe(count(flat, "<polygon") + 12 * 2 + 3)
    expect(deep).toMatch(/data-chart-part="plotArea"[^>]*><polygon/)
    const tilted = renderChart(defaultChartSpec("pie-3d"), 576, 336)
    expect(tilted).toMatch(/A[\d.]+ [\d.]+ 0 0 1/)
    const spec = defaultChartSpec("bar-of-pie")
    expect(ofPieSplit(spec, 4)).toBe(2)
    expect(ofPieSplit({ ...spec, ofPieSplit: 9 }, 4)).toBe(3)
    const svg = renderChart(spec, 576, 336)
    // The first two quarters and Other in the pie, the last two as the bar, and the two lines between them.
    expect(count(svg, "<path data-chart-part=\"point:")).toBe(3)
    expect(count(svg, "<rect data-chart-part=\"point:")).toBe(2)
    expect(svg).toContain('data-chart-part="point:other"')
    expect(svg).toMatch(/data-chart-part="lines"[^>]*><line[^>]*\/><line/)
  })

  it("turns a 3-D chart by its 3-D Rotation, Word's own view when it has none", () => {
    const column = withVariant(defaultChartSpec("column"), "column-3d")
    expect(chartRotation(column)).toEqual({ x: 15, y: 20 })
    expect(chartRotation(defaultChartSpec("pie-3d"))).toEqual({ x: 30, y: 0 })
    expect(chartRotation({ ...column, rotX: -120, rotY: -30 })).toEqual({ x: -90, y: 330 })
    expect(chartRotation({ type: "pie", rotX: -10 })).toEqual({ x: 0, y: 0 })
    const backWall = (svg: string) => /data-chart-part="plotArea"[^>]*><polygon points="([^"]+)"/.exec(svg)?.[1]
    const turned = renderChart({ ...column, rotX: 40, rotY: 45 }, 576, 336)
    expect(backWall(turned)).not.toBe(backWall(renderChart(column, 576, 336)))
    // Seen straight on, the walls have no depth, so the back wall starts at the plot's left; Word's view sets it back.
    const left = (svg: string) => Number(backWall(svg)!.split(",")[0])
    const ahead = renderChart({ ...column, rotX: 0, rotY: 0 }, 576, 336)
    expect(left(ahead)).toBeLessThan(left(renderChart(column, 576, 336)) - 20)
    expect(ahead).toMatch(/data-chart-part="plotArea"[^>]*><polygon points="[^"]+"[^>]*\/><polygon points="([\d.]+),[\d.]+ \1,/)
    expect(turned).not.toContain("NaN")
    // A pie seen from straight above is a circle; turning it moves its first slice.
    const pie = defaultChartSpec("pie-3d")
    const above = renderChart({ ...pie, rotX: 90 }, 576, 336)
    const radii = /A([\d.]+) ([\d.]+) 0/.exec(above)!
    expect(radii[1]).toBe(radii[2])
    expect(renderChart({ ...pie, rotY: 90 }, 576, 336)).not.toBe(renderChart(pie, 576, 336))
    // The rotation stays with another 3-D chart of the same kind, and goes when the chart is no longer one.
    const turnedColumn = { ...column, rotX: 40, rotY: 45 }
    expect(withVariant(turnedColumn, "column-3d-stacked").rotX).toBe(40)
    expect(withVariant(turnedColumn, "column").rotX).toBeUndefined()
    expect(withVariant(turnedColumn, "pie-3d").rotY).toBeUndefined()
  })

  it("splits an of-pie chart by position, value, percentage or the points picked, as Word's Split Series By", () => {
    const spec = defaultChartSpec("pie-of-pie")
    spec.categories = ["A", "B", "C", "D", "E"]
    spec.series = [{ name: "Sales", values: [40, 3, 30, 5, 22] }]
    expect(ofPieSecond(spec)).toEqual([false, false, false, true, true])
    // The small ones wherever they are, kept in their order.
    expect(ofPieSecond({ ...spec, ofPieSplitBy: "val", ofPieSplitValue: 10 })).toEqual([false, true, false, true, false])
    expect(ofPieSecond({ ...spec, ofPieSplitBy: "percent", ofPieSplitValue: 25 })).toEqual([false, true, false, true, true])
    // Unset, a tenth of the whole.
    expect(ofPieSecond({ ...spec, ofPieSplitBy: "val" })).toEqual([false, true, false, true, false])
    expect(ofPieSecond({ ...spec, ofPieSplitBy: "cust", ofPieCustom: [0, 2] })).toEqual([true, false, true, false, false])
    const count = (svg: string, text: string) => svg.split(text).length - 1
    const bar = renderChart({ ...spec, ofPie: "bar", ofPieSplitBy: "val", ofPieSplitValue: 10 }, 576, 336)
    expect(bar).toContain('<rect data-chart-part="point:1"')
    expect(bar).toContain('<rect data-chart-part="point:3"')
    expect(count(bar, '<path data-chart-part="point:')).toBe(4)
    // Nothing for the second plot: the pie is drawn whole.
    expect(renderChart({ ...spec, ofPieSplitBy: "val", ofPieSplitValue: 1 }, 576, 336)).not.toContain("point:other")
    // Second Plot Size: the second pie grows with it.
    const radius = (svg: string) => {
      // A slice of the second pie: from its centre to the rim.
      const [cx, cy, x, y] = /data-chart-part="point:4" d="M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/.exec(svg)!.slice(1).map(Number)
      return Math.hypot(x! - cx!, y! - cy!)
    }
    const small = renderChart({ ...spec, ofPieSize: 50 }, 576, 336)
    const large = renderChart({ ...spec, ofPieSize: 100 }, 576, 336)
    expect(radius(large)).toBeGreaterThan(radius(small))
  })

  it("names Other's label, and moves the second plot out by the Gap Width", () => {
    const spec = { ...defaultChartSpec("pie-of-pie"), dataLabels: "center" as const }
    spec.labelContent = { value: false, category: true, series: false, percent: false }
    expect(renderChart(spec, 576, 336)).toContain(">Other</text>")
    const centre = (svg: string) => Number(/<line x1="[\d.]+" y1="[\d.]+" x2="([\d.]+)"/.exec(svg)![1])
    // The join lines end at the second plot: further right with a wider gap.
    expect(centre(renderChart({ ...spec, ofPieGap: 300 }, 576, 336))).toBeGreaterThan(centre(renderChart({ ...spec, ofPieGap: 0 }, 576, 336)))
  })

  it("keeps a 3-D chart's view as Word has it, and draws deeper with Depth", () => {
    const column = withVariant(defaultChartSpec("column"), "column-3d")
    expect(chartView3d(column)).toEqual({ rightAngle: false, perspective: 15, depth: 100, height: undefined })
    expect(chartView3d(withVariant(defaultChartSpec("column"), "column-3d-clustered")).rightAngle).toBe(true)
    expect(chartView3d({ ...column, depthPercent: 5000, perspective: -3 })).toMatchObject({ depth: 2000, perspective: 0 })
    const backWall = (svg: string) => Number(/data-chart-part="plotArea"[^>]*><polygon points="([\d.]+)/.exec(svg)![1])
    expect(backWall(renderChart({ ...column, depthPercent: 200 }, 576, 336))).toBeGreaterThan(backWall(renderChart(column, 576, 336)))
  })

  it("draws Height (% of base): the front that share of its width tall, Autoscale filling the room", () => {
    const column = withVariant(defaultChartSpec("column"), "column-3d-clustered")
    expect(chartView3d({ ...column, heightPercent: 900 }).height).toBe(500)
    // The floor's front edge: its left and right ends, and the front's bottom.
    const front = (svg: string) => {
      const floor = /data-chart-part="plotArea"[^>]*><polygon points="[^"]+"\/><polygon points="[^"]+"\/><polygon points="([^"]+)"/.exec(svg)![1]!
      const corners = floor.split(" ").map((point) => point.split(",").map(Number))
      const [left, right] = [corners[0], corners[3]]
      return { width: right![0]! - left![0]!, bottom: left![1]! }
    }
    const back = (svg: string) => Number(/data-chart-part="plotArea"[^>]*><polygon points="[\d.]+,([\d.]+)/.exec(svg)![1])
    const tall = (svg: string) => front(svg).bottom - back(svg)
    const auto = renderChart(column, 576, 336)
    const flat = renderChart({ ...column, heightPercent: 20 }, 576, 336)
    expect(tall(flat)).toBeLessThan(tall(auto))
    // As tall as a fifth of its width, give or take the depth going back.
    expect(tall(flat)).toBeLessThan(front(flat).width * 0.3)
    // Taller than there is room for: narrower instead.
    expect(front(renderChart({ ...column, heightPercent: 500 }, 576, 336)).width).toBeLessThan(front(auto).width)
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
