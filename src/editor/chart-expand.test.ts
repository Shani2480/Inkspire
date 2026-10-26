import { describe, expect, it } from "vitest"
import { expandSpec, histogramBins, waterfallPieces } from "@/editor/chart-expand"
import { CHART_VARIANTS, defaultChartSpec, renderChart, variantOf, withVariant } from "@/editor/chart-spec"
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
    expect(histogramBins([])).toEqual({ labels: [], counts: [] })
  })

  it("floats each waterfall bar from the running total", () => {
    const pieces = waterfallPieces([100, -30, 20])
    expect(pieces.map((piece) => piece.base)).toEqual([0, 70, 70])
    expect(pieces.map((piece) => piece.up)).toEqual([100, 0, 20])
    expect(pieces.map((piece) => piece.down)).toEqual([0, 30, 0])
    expect(pieces[2]!.total).toBe(90)
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
})
