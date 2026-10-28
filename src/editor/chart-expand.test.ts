import { describe, expect, it } from "vitest"
import {
  boxGroups,
  boxStats,
  chartTree,
  expandSpec,
  histogramBins,
  scottWidth,
  setWaterfallTotal,
  squarify,
  waterfallPieces,
} from "@/editor/chart-expand"
import { gridToSheet, sheetToGrid } from "@/editor/chart-sheet"
import {
  CHART_VARIANTS,
  chartParts,
  surfaceBands,
  defaultChartSpec,
  renderChart,
  specToSheet,
  variantOf,
  withSheet,
  withVariant,
} from "@/editor/chart-spec"
import { chartSpaceXml, chartWorkbook, readChartSpace } from "@/document/docx/chart-xml"

describe("Histogram, Waterfall and Funnel (22.6)", () => {
  it("lists the three in Insert Chart", () => {
    const ids = CHART_VARIANTS.map((item) => item.id)
    expect(ids).toEqual(expect.arrayContaining(["histogram", "waterfall", "funnel"]))
  })

  it("bins values so every value is counted once", () => {
    const { labels, counts } = histogramBins([1, 2, 2, 3, 9, 10])
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6)
    expect(labels).toHaveLength(counts.length)
    expect(labels[0]!.startsWith("[1,")).toBe(true)
    expect(histogramBins([])).toMatchObject({ labels: [], counts: [] })
  })

  it("bins as Word does: Automatic by Scott's rule, a bin width, a number of bins, overflow and underflow", () => {
    const sample = [4, 7, 9, 10, 12, 12, 13, 15, 18, 21, 22, 30]
    const auto = histogramBins(sample)
    expect(auto.width).toBeCloseTo(scottWidth(sample), 6)
    expect(auto.regular).toBe(3)
    expect(auto.counts).toEqual([8, 3, 1])
    const tens = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // Each bin takes the values above its start up to its end; the first takes its start too.
    expect(histogramBins(tens, { by: "width", width: 3 })).toMatchObject({
      labels: ["[1, 4]", "(4, 7]", "(7, 10]"],
      counts: [4, 3, 3],
    })
    expect(histogramBins(tens, { by: "count", count: 2 })).toMatchObject({ counts: [5, 5], width: 4.5 })
    expect(histogramBins(tens, { by: "width", width: 2, underflow: 2, overflow: 8 })).toMatchObject({
      labels: ["≤2", "(2, 4]", "(4, 6]", "(6, 8]", ">8"],
      counts: [2, 2, 2, 2, 2],
      regular: 3,
    })
    expect(histogramBins([1, 2, 3], { by: "category" }, ["a", "b", "a"])).toMatchObject({
      labels: ["a", "b"],
      counts: [4, 2],
    })
    // A bin width typed by hand too small for the data is held to a number of bins that can be drawn.
    expect(histogramBins(tens, { by: "width", width: 0.000001 }).regular).toBe(500)
  })

  it("keeps each value with its own category when a value is blank", () => {
    const spec = defaultChartSpec("waterfall")
    spec.categories = ["A", "B", "C"]
    spec.series = [{ name: "Change", values: [10, Number.NaN, -4] }]
    // A chart from before Set as total, with the total the app adds after the last point.
    spec.waterfallTotals = undefined
    expect(expandSpec(spec).categories).toEqual(["A", "C", "Total"])
    expect(expandSpec(spec).pointColumns).toEqual([0, 2, -1])
    const histogram = { ...defaultChartSpec("histogram"), bins: { by: "category" as const } }
    histogram.categories = ["x", "y", "x"]
    histogram.series = [{ name: "Values", values: [Number.NaN, 2, 5] }]
    expect(expandSpec(histogram)).toMatchObject({ categories: ["y", "x"], series: [{ values: [2, 5] }] })
  })

  it("floats each waterfall bar from the running total", () => {
    const pieces = waterfallPieces([100, -30, 20])
    expect(pieces.map((piece) => piece.base)).toEqual([0, 70, 70])
    expect(pieces.map((piece) => piece.up)).toEqual([100, 0, 20])
    expect(pieces.map((piece) => piece.down)).toEqual([0, 30, 0])
    expect(pieces[2]!.total).toBe(90)
  })

  it("draws a point set as total from zero to its value, and runs on from there", () => {
    const pieces = waterfallPieces([100, -30, 80, 20], [false, false, true, false])
    expect(pieces[2]).toMatchObject({ base: 0, up: 0, down: 0, sum: 80, total: 80 })
    expect(pieces[3]).toMatchObject({ base: 80, up: 20, total: 100 })
    // Below zero a bar hangs from a base over it; across zero it is a piece each side.
    const low = waterfallPieces([-10, -5, 20])
    expect(low[0]).toMatchObject({ base: 0, downBelow: -10 })
    expect(low[1]).toMatchObject({ base: -10, downBelow: -5, down: 0 })
    expect(low[2]).toMatchObject({ base: 0, up: 5, upBelow: -15 })
    const expanded = expandSpec({
      ...defaultChartSpec("waterfall"),
      categories: ["A", "B", "C"],
      series: [{ name: "x", values: [-10, -5, 20] }],
      waterfallTotals: [],
    })
    expect(expanded.series.map((serie) => serie.name)).toEqual([
      "Base",
      "Increase",
      "Decrease",
      "Total",
      "Increase",
      "Decrease",
    ])
    expect(expanded.format["series:5"]).toEqual({ fill: "#c62828" })
    const spec = defaultChartSpec("waterfall")
    expect(spec.waterfallTotals).toEqual([5])
    const drawn = expandSpec(spec)
    // The total is a point of the chart, not one added after it.
    expect(drawn.categories).toEqual(spec.categories)
    expect(drawn.series[3]!.values).toEqual([0, 0, 0, 0, 0, 120])
    expect(drawn.pointColumns).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("sets a point as total, turning a chart from before Set as total into one with its total as a row", () => {
    const old = { ...defaultChartSpec("waterfall"), waterfallTotals: undefined }
    old.categories = ["A", "B", "C"]
    old.series = [{ name: "Change", values: [10, 5, -4] }]
    const set = setWaterfallTotal(old, 1, true)
    expect(set.categories).toEqual(["A", "B", "C", "Total"])
    expect(set.series[0]!.values).toEqual([10, 5, -4, 11])
    expect(set.waterfallTotals).toEqual([1, 3])
    // It looks as it did: the end total is where the app drew it.
    expect(expandSpec(setWaterfallTotal(old, 1, false)).series[3]!.values).toEqual([0, 0, 0, 11])
    expect(setWaterfallTotal(set, 3, false).waterfallTotals).toEqual([1])
  })

  it("lets a Waterfall's bars be picked and coloured as points", () => {
    const spec = defaultChartSpec("waterfall")
    expect(chartParts(spec).map((part) => part.id)).toContain("point:2")
    spec.format = { ...spec.format, "point:2": { fill: "#123456" } }
    const svg = renderChart(spec, 400, 300)
    expect(svg).toMatch(/<rect data-chart-part="point:2" [^>]*fill="#123456"/)
    expect(svg).toContain('data-chart-part="point:5"')
  })

  it("expands each to an ordinary chart and leaves other charts alone", () => {
    const column = defaultChartSpec("column")
    expect(expandSpec(column)).toBe(column)
    expect(expandSpec(defaultChartSpec("histogram"))).toMatchObject({ type: "column", gapWidth: 0 })
    const waterfall = expandSpec(defaultChartSpec("waterfall"))
    expect(waterfall).toMatchObject({ type: "column", grouping: "stacked" })
    expect(waterfall.categories.at(-1)).toBe("Total")
    const funnel = expandSpec(defaultChartSpec("funnel"))
    expect(funnel).toMatchObject({ type: "bar", grouping: "stacked" })
    // The first category (Visits) ends up on top: it is the last bar a bar chart draws.
    expect(funnel.categories.at(-1)).toBe("Visits")
  })

  it("draws and saves each one, and a chart can be changed to one", () => {
    for (const id of ["histogram", "waterfall", "funnel"]) {
      const spec = defaultChartSpec(id)
      expect(renderChart(spec, 480, 300)).toContain("<rect")
      expect(chartSpaceXml(spec)).toContain("<c:barChart>")
      expect(chartWorkbook(spec).length).toBeGreaterThan(100)
    }
    expect(withVariant(defaultChartSpec("column"), "funnel").type).toBe("funnel")
  })
})

describe("Stock (22.6)", () => {
  it("lists High-Low-Close and Open-High-Low-Close with Word's sample prices", () => {
    expect(CHART_VARIANTS.map((item) => item.id)).toEqual(expect.arrayContaining(["stock-hlc", "stock-ohlc"]))
    expect(defaultChartSpec("stock-hlc").series.map((serie) => serie.name)).toEqual(["High", "Low", "Close"])
    expect(defaultChartSpec("stock-ohlc").series.map((serie) => serie.name)).toEqual(["Open", "High", "Low", "Close"])
  })

  it("draws prices as high-low lines, Close as a tick, Open to Close as up/down bars", () => {
    const hlc = expandSpec(defaultChartSpec("stock-hlc"))
    expect(hlc).toMatchObject({ type: "line", highLowLines: true, upDownBars: false, markers: false })
    expect(hlc.series.map((serie) => Boolean(serie.tick))).toEqual([false, false, true])
    expect(hlc.format["series:0"]?.line).toBe("none")
    const ohlc = expandSpec(defaultChartSpec("stock-ohlc"))
    expect(ohlc).toMatchObject({ upDownBars: true })
    expect(ohlc.series.some((serie) => serie.tick)).toBe(false)

    const svg = renderChart(defaultChartSpec("stock-ohlc"), 480, 300)
    expect(svg).toContain('data-chart-part="highLowLines"')
    expect(svg).toContain('data-chart-part="upDownBars"')
    expect(renderChart(defaultChartSpec("stock-hlc"), 480, 300)).toMatch(/<path d="M[\d.]+ [\d.]+H/)
  })

  it("saves as Word's c:stockChart and reads back as Stock", () => {
    for (const id of ["stock-hlc", "stock-ohlc"]) {
      const spec = defaultChartSpec(id)
      const xml = chartSpaceXml(spec)
      expect(xml).toContain("<c:stockChart>")
      expect(xml).not.toContain("<c:lineChart>")
      expect(xml).toContain("<c:hiLowLines>")
      expect(xml.includes("<c:upDownBars>")).toBe(id === "stock-ohlc")
      expect(xml.includes('<c:symbol val="dash"/>')).toBe(id === "stock-hlc")
      const back = readChartSpace(xml)!
      expect(back.type).toBe("stock")
      expect(back.series.map((serie) => serie.values)).toEqual(spec.series.map((serie) => serie.values))
      expect(back.categories).toEqual(spec.categories)
      expect(variantOf(back)).toBe(id)
    }
  })

  it("draws Volume as columns on the left axis and the prices on a right one", () => {
    expect(defaultChartSpec("stock-vhlc").series.map((serie) => serie.name)).toEqual(["Volume", "High", "Low", "Close"])
    expect(defaultChartSpec("stock-vohlc").series.map((serie) => serie.name)).toEqual([
      "Volume",
      "Open",
      "High",
      "Low",
      "Close",
    ])
    const vhlc = expandSpec(defaultChartSpec("stock-vhlc"))
    expect(vhlc.series.map((serie) => [serie.type ?? null, Boolean(serie.secondary), Boolean(serie.tick)])).toEqual([
      ["column", false, false],
      [null, true, false],
      [null, true, false],
      [null, true, true],
    ])
    expect(vhlc.format["series:0"]?.line).toBeUndefined()
    expect(expandSpec(defaultChartSpec("stock-vohlc")).upDownBars).toBe(true)
    const svg = renderChart(defaultChartSpec("stock-vohlc"), 480, 300)
    expect(svg).toContain('data-chart-part="axis:secondary"')
    expect(svg).toContain('data-chart-part="upDownBars"')
    expect(svg).toMatch(/data-chart-part="series:0"><rect/)
  })

  it("saves Volume as Word's bar group with the stock group on the second axes, and reads it back", () => {
    for (const id of ["stock-vhlc", "stock-vohlc"]) {
      const spec = defaultChartSpec(id)
      const xml = chartSpaceXml(spec)
      expect(xml).toMatch(
        /<c:barChart>.*<c:axId val="1"\/><c:axId val="2"\/><\/c:barChart><c:stockChart>.*<c:axId val="3"\/><c:axId val="4"\/><\/c:stockChart>/,
      )
      expect(xml.includes("<c:upDownBars>")).toBe(id === "stock-vohlc")
      const back = readChartSpace(xml)!
      expect(back.type).toBe("stock")
      expect(back.volume).toBe(true)
      expect(back.series.every((serie) => !serie.type && !serie.secondary)).toBe(true)
      expect(back.series.map((serie) => serie.values)).toEqual(spec.series.map((serie) => serie.values))
      expect(variantOf(back)).toBe(id)
    }
  })
})

describe("Box & Whisker (22.6)", () => {
  it("takes quartiles with Word's exclusive median, and leaves far values out of the whiskers", () => {
    // Odd count: the median (6) is in neither half.
    expect(boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toMatchObject({ q1: 3, median: 6, q3: 9, min: 1, max: 11 })
    // Even count: the halves split evenly.
    expect(boxStats([1, 2, 3, 4, 5, 6, 7, 8])).toMatchObject({ q1: 2.5, median: 4.5, q3: 6.5, mean: 4.5 })
    const far = boxStats([10, 11, 12, 13, 14, 15, 60])!
    expect(far.outliers).toEqual([60])
    expect(far.max).toBe(15)
    expect(far.inner).toEqual([10, 11, 12, 13, 14, 15])
    expect(boxStats([])).toBeNull()
  })

  it("takes inclusive quartiles too: the median of an odd count is in both halves", () => {
    expect(boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "inclusive")).toMatchObject({ q1: 3.5, median: 6, q3: 8.5 })
    expect(boxStats([1, 2, 3, 4, 5, 6, 7, 8], "inclusive")).toMatchObject({ q1: 2.5, q3: 6.5 })
  })

  it("draws the Series Options: inner points, outliers, mean markers and the mean line", () => {
    const spec = defaultChartSpec("box-whisker")
    const circles = (svg: string) => (svg.match(/<circle /g) ?? []).length
    const plain = renderChart(spec, 400, 300)
    const inner = renderChart({ ...spec, box: { innerPoints: true } }, 400, 300)
    expect(circles(inner)).toBeGreaterThan(circles(plain))
    expect(circles(renderChart({ ...spec, box: { outliers: false } }, 400, 300))).toBeLessThanOrEqual(circles(plain))
    const marks = (svg: string) => (svg.match(/l6 6m0 -6l-6 6/g) ?? []).length
    expect(marks(plain)).toBeGreaterThan(0)
    expect(marks(renderChart({ ...spec, box: { meanMarkers: false } }, 400, 300))).toBe(0)
    expect(renderChart({ ...spec, box: { meanLine: true } }, 400, 300)).toMatch(
      /<path data-chart-part="series:0" d="M[\d.]+ [\d.]+L/,
    )
    const quartiles = boxGroups({ ...spec, box: { quartiles: "inclusive" } })
    expect(quartiles).toHaveLength(boxGroups(spec).length)
  })

  it("groups rows by their category label, one box per series", () => {
    const spec = defaultChartSpec("box-whisker")
    const groups = boxGroups(spec)
    expect(groups.map((group) => group.name)).toEqual(["English", "Physics", "Math"])
    expect(groups[0]!.boxes).toHaveLength(3)
    expect(variantOf(spec)).toBe("box-whisker")
  })

  it("draws boxes, and gives Word the medians as columns", () => {
    const spec = defaultChartSpec("box-whisker")
    const svg = renderChart(spec, 480, 300)
    expect(svg.match(/data-chart-part="series:\d"/g)).toHaveLength(9)
    expect(svg).toContain(">English<")
    const word = expandSpec(spec)
    expect(word).toMatchObject({ type: "column", categories: ["English", "Physics", "Math"] })
    expect(word.series[0]!.values[0]).toBe(boxGroups(spec)[0]!.boxes[0]!.median)
    expect(chartSpaceXml(spec)).toContain("<c:barChart>")
  })
})

describe("Treemap and Sunburst (22.6)", () => {
  it("builds the tree from each row's labels, skipping a blank stem, largest first", () => {
    const tree = chartTree(defaultChartSpec("treemap"))
    expect(tree.children.map((node) => node.name)).toEqual(["Branch 1", "Branch 2", "Branch 3"])
    const branch = tree.children[0]!
    expect(branch.value).toBe(22 + 12 + 18 + 87 + 88 + 25 + 87)
    // Leaf 6 and Leaf 7 sit straight under Branch 1; Stem 2 (175) comes before Leaf 7 (87).
    expect(branch.children.map((node) => node.name)).toEqual(["Stem 2", "Leaf 7", "Stem 1", "Leaf 6"])
    expect(branch.children[1]!.children).toEqual([])
    expect(tree.children[2]!.children.map((node) => node.branch)).toEqual([2, 2])
  })

  it("leaves out hidden rows and rows with no positive size", () => {
    const spec = defaultChartSpec("treemap")
    spec.hiddenCategories = [0]
    spec.series[0]!.values[1] = 0
    const stem = chartTree(spec).children[0]!.children.find((node) => node.name === "Stem 1")!
    expect(stem.children.map((node) => node.name)).toEqual(["Leaf 3"])
  })

  it("lays out squarified tiles that fill the box in proportion", () => {
    const rects = squarify([6, 6, 4, 3, 2, 2, 1], { x: 0, y: 0, w: 600, h: 400 })
    const area = rects.reduce((sum, rect) => sum + rect.w * rect.h, 0)
    expect(area).toBeCloseTo(240000, 3)
    expect(rects[0]!.w * rects[0]!.h).toBeCloseTo(240000 * (6 / 24), 3)
    for (const rect of rects) {
      expect(rect.x + rect.w).toBeLessThanOrEqual(600.0001)
      expect(rect.y + rect.h).toBeLessThanOrEqual(400.0001)
      // Squarified: no sliver.
      expect(Math.max(rect.w / rect.h, rect.h / rect.w)).toBeLessThan(3)
    }
  })

  it("draws a tile per leaf and a ring arc per node, with branch labels and a branch legend", () => {
    const treemap = renderChart(defaultChartSpec("treemap"), 576, 336)
    expect(treemap.match(/<rect x=/g)!.length).toBeGreaterThanOrEqual(15)
    expect(treemap).toContain(">Branch 1<")
    expect(treemap).toContain('data-chart-part="legend"')
    const sunburst = renderChart(defaultChartSpec("sunburst"), 576, 336)
    // One arc per node: 3 branches, 5 stems, 15 leaves.
    expect(sunburst.match(/<path d="M/g)).toHaveLength(3 + 5 + 15)
    expect(sunburst).not.toContain("NaN")
    expect(variantOf(defaultChartSpec("sunburst"))).toBe("sunburst")
    expect(chartParts(defaultChartSpec("treemap")).map((part) => part.id)).not.toContain("axis:value")
  })

  it("gives Word the leaves: columns for a Treemap, a doughnut for a Sunburst", () => {
    const word = expandSpec(defaultChartSpec("treemap"))
    expect(word).toMatchObject({ type: "column", levels: undefined })
    expect(word.categories).toHaveLength(15)
    expect(word.categories[0]).toBe("Leaf 5")
    expect(expandSpec(defaultChartSpec("sunburst")).type).toBe("doughnut")
    expect(chartSpaceXml(defaultChartSpec("sunburst"))).toContain("<c:doughnutChart>")
  })

  it("edits the Branch and Stem columns in the data sheet", () => {
    const spec = defaultChartSpec("treemap")
    const grid = sheetToGrid(specToSheet(spec), 7, 20)
    expect(grid[0]!.slice(0, 4)).toEqual(["", "", "", "Size"])
    expect(grid[6]!.slice(0, 4)).toEqual(["Branch 1", "Leaf 6", "", "25"])
    grid[1]![1] = "Stem 9"
    const next = withSheet(spec, gridToSheet(grid, 3))
    expect(next.levels![1]![0]).toBe("Stem 9")
    expect(next.categories[5]).toBe("")
    expect(next.series[0]!.values).toEqual(spec.series[0]!.values)
    // Other charts keep one label column.
    expect(gridToSheet(sheetToGrid(specToSheet(defaultChartSpec("column")))).levels).toBeUndefined()
  })
})

describe("Surface (22.6)", () => {
  it("colours by value band, one per step of the value axis, as Word's legend lists them", () => {
    const spec = defaultChartSpec("surface-3d")
    expect(surfaceBands(spec).map((band) => band.name)).toEqual(["0-1", "1-2", "2-3", "3-4", "4-5", "5-6"])
    const svg = renderChart(spec, 576, 336)
    expect(svg).toContain(">0-1<")
    expect(svg).toContain(">Series 3<")
    expect(svg).not.toContain("NaN")
  })

  it("draws a contour from above, filled or as band edges", () => {
    const filled = renderChart(defaultChartSpec("surface-contour"), 576, 336)
    expect(filled.match(/<rect x=/g)!.length).toBeGreaterThan(20)
    const wire = renderChart(defaultChartSpec("surface-wireframe-contour"), 576, 336)
    expect(wire).toMatch(/<path d="M[\d. ]+L/)
    expect(wire).not.toContain("NaN")
  })

  it("saves each variant as Word's surface chart and reads it back as the same variant", () => {
    for (const id of ["surface-3d", "surface-wireframe", "surface-contour", "surface-wireframe-contour"]) {
      const spec = defaultChartSpec(id)
      const xml = chartSpaceXml(spec)
      expect(xml, id).toContain(id.includes("contour") ? "<c:surfaceChart>" : "<c:surface3DChart>")
      expect(xml, id).toContain(`<c:wireframe val="${id.includes("wireframe") ? 1 : 0}"/>`)
      expect(xml, id).toContain("<c:serAx>")
      expect(xml, id).toContain(id.includes("contour") ? '<c:rotX val="90"/>' : '<c:rotX val="15"/>')
      const back = readChartSpace(xml)!
      expect(variantOf(back), id).toBe(id)
      expect(
        back.series.map((serie) => serie.values),
        id,
      ).toEqual(spec.series.map((serie) => serie.values))
      expect(back.axes, id).toEqual(spec.axes)
    }
  })
})
