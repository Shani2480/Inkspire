import { describe, expect, it } from "vitest"
import { drawMap, loadMapCountries, matchCountry, matchState, mixColor } from "@/editor/chart-map"
import { gridToSheet, sheetToGrid } from "@/editor/chart-sheet"
import {
  chartParts,
  defaultChartSpec,
  mapColors,
  renderChart,
  specToSheet,
  variantOf,
  withSheet,
} from "@/editor/chart-spec"

describe("Filled Map (22.6)", () => {
  it("shows a note until the country outlines are loaded, then draws each country with data", async () => {
    const spec = defaultChartSpec("filled-map")
    expect(variantOf(spec)).toBe("filled-map")
    expect(renderChart(spec, 576, 336)).toContain("Loading map…")
    await loadMapCountries()
    const svg = renderChart(spec, 576, 336)
    expect(svg).not.toContain("Loading map…")
    // One outline per country in the sample, as points that can be picked and coloured.
    for (const [index] of spec.categories.entries()) {
      expect(svg).toContain(`data-chart-part="point:${index}"`)
    }
    expect(chartParts(spec).map((part) => part.id)).toEqual(expect.arrayContaining(["point:0", "legend"]))
    expect(chartParts(spec).map((part) => part.id)).not.toContain("axis:value")
    // The scale is the legend: from the Minimum colour to the Maximum, with the lowest and highest values.
    const colors = mapColors(spec)
    expect(svg).toContain(`stop-color="${colors.min}"`)
    expect(svg).toMatch(/data-chart-part="legend"[^]*>120<[^]*>30</)
  })

  it("colours by value along the scale, and a point's own fill wins", async () => {
    await loadMapCountries()
    const spec = { ...defaultChartSpec("filled-map"), mapColors: { min: "#000000", max: "#ffffff" } }
    spec.categories = ["France", "Spain", "Italy"]
    spec.series = [{ name: "x", values: [0, 50, 100] }]
    const svg = renderChart(spec, 576, 336)
    const fill = (index: number) =>
      new RegExp(`data-chart-part="point:${index}" d="[^"]+" fill="([^"]+)"`).exec(svg)![1]
    expect([fill(0), fill(1), fill(2)]).toEqual(["#000000", "#808080", "#ffffff"])
    spec.format = { ...spec.format, "point:1": { fill: "#ff0000" } }
    expect(renderChart(spec, 576, 336)).toMatch(/data-chart-part="point:1" d="[^"]+" fill="#ff0000"/)
    expect(mixColor("#000000", "#ffffff", 0.25)).toBe("#404040")
  })

  it("matches countries by their names and common other ones, and leaves the rest out", async () => {
    await loadMapCountries()
    for (const [typed, name] of [
      ["USA", "United States of America"],
      ["the United Kingdom", "United Kingdom"],
      ["Czech Republic", "Czechia"],
      ["Cote d'Ivoire", "Côte d'Ivoire"],
      ["DR Congo", "Dem. Rep. Congo"],
      ["bosnia & herzegovina", "Bosnia and Herz."],
      ["japan", "Japan"],
    ]) {
      expect(matchCountry(typed!)?.properties.name).toBe(name)
    }
    expect(matchCountry("Atlantis")).toBeNull()
    const drawn = drawMap(
      [
        { index: 0, name: "Japan", value: 1 },
        { index: 1, name: "Atlantis", value: 2 },
      ],
      { x: 0, y: 0, w: 400, h: 300 },
      {},
    )!
    expect(drawn.shapes.map((shape) => shape.point.name)).toEqual(["Japan"])
    expect(drawn.unmatched).toEqual(["Atlantis"])
    // Only regions with data: Japan fills the box; the whole world draws it small.
    const size = (area: "data" | "world", projection?: "mercator" | "miller" | "robinson") => {
      const shape = drawMap(
        [{ index: 0, name: "Japan", value: 1 }],
        { x: 0, y: 0, w: 400, h: 300 },
        { area, projection },
      )!
      const xs = [...shape.shapes[0]!.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => Number(match[1]))
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(size("data")).toBeGreaterThan(size("world") * 5)
    for (const projection of ["mercator", "miller", "robinson"] as const) {
      expect(size("world", projection)).toBeGreaterThan(0)
    }
  })

  it("draws the states of the United States when the categories name states, on Albers", async () => {
    await loadMapCountries()
    expect(matchState("TX")?.properties.name).toBe("Texas")
    expect(matchState("new york")?.properties.name).toBe("New York")
    expect(matchState("Washington DC")?.properties.name).toBe("District of Columbia")
    expect(matchState("Narnia")).toBeNull()
    const box = { x: 0, y: 0, w: 400, h: 300 }
    const drawn = drawMap(
      ["California", "TX", "Alaska", "Hawaii", "Georgia"].map((name, index) => ({ index, name, value: index })),
      box,
      {},
    )!
    // Georgia is a state here, as most of the categories are states.
    expect(drawn.shapes.map((shape) => shape.point.name)).toEqual(["California", "TX", "Alaska", "Hawaii", "Georgia"])
    // Albers brings Alaska and Hawaii in under the others: every state inside the box.
    for (const shape of drawn.shapes) {
      expect(shape.at[0]).toBeGreaterThan(0)
      expect(shape.at[0]).toBeLessThan(400)
      expect(shape.at[1]).toBeGreaterThan(0)
      expect(shape.at[1]).toBeLessThan(300)
    }
    // The rest of the country is drawn round them.
    expect(drawn.rest.length).toBeGreaterThan(1000)
  })

  it("colours through a midpoint on a diverging scale, and by text for values typed as text", async () => {
    await loadMapCountries()
    const spec = {
      ...defaultChartSpec("filled-map"),
      mapDiverging: true,
      mapColors: { min: "#000000", mid: "#ff0000", max: "#ffffff" },
    }
    spec.categories = ["France", "Spain", "Italy", "Germany"]
    spec.series = [{ name: "x", values: [0, 20, 40, 100] }]
    const fills = (svg: string) =>
      spec.categories.map(
        (_, index) => new RegExp(`data-chart-part="point:${index}" d="[^"]+" fill="([^"]+)"`).exec(svg)?.[1],
      )
    // The midpoint halfway (50) unless set; here at 40, which is red.
    expect(fills(renderChart(spec, 576, 336))).toEqual(["#000000", "#660000", "#cc0000", "#ffffff"])
    const set = renderChart({ ...spec, mapMidpoint: 40 }, 576, 336)
    expect(fills(set)).toEqual(["#000000", "#800000", "#ff0000", "#ffffff"])
    expect(set).toMatch(/<stop offset="0.4" stop-color="#ff0000"\/>/)
    // Text values: a colour per different text, and a legend of them.
    const typed = { ...spec, series: [{ name: "x", values: [0, 0, 0, 0], texts: ["Yes", "No", "Yes", ""] }] }
    const svg = renderChart(typed, 576, 336)
    const [france, spain, italy, germany] = fills(svg)
    expect(france).toBe(italy)
    expect(france).not.toBe(spain)
    expect(germany).toBeUndefined()
    expect(svg).toMatch(/data-chart-part="legend"[^]*>Yes<[^]*>No</)
  })

  it("keeps values typed as text through the data sheet", () => {
    const spec = defaultChartSpec("filled-map")
    const grid = sheetToGrid(specToSheet(spec))
    grid[1]![1] = "Gold"
    const next = withSheet(spec, gridToSheet(grid))
    expect(next.series[0]!.texts?.[0]).toBe("Gold")
    expect(next.series[0]!.texts?.[1]).toBe("")
    expect(sheetToGrid(specToSheet(next))[1]![1]).toBe("Gold")
    // Back to numbers: no texts.
    grid[1]![1] = "5"
    expect(withSheet(next, gridToSheet(grid)).series[0]!.texts).toBeUndefined()
  })

  it("writes names where they fit with Best Fit, and on every region with Show all", async () => {
    await loadMapCountries()
    const spec = { ...defaultChartSpec("filled-map"), mapArea: "world" as const }
    spec.categories = ["Russia", "Luxembourg"]
    spec.series = [{ name: "x", values: [1, 2] }]
    const names = (svg: string) => [...svg.matchAll(/<text[^>]*>(Russia|Luxembourg)<\/text>/g)].map((match) => match[1])
    expect(names(renderChart({ ...spec, mapLabels: "show" }, 576, 336))).toEqual(["Russia", "Luxembourg"])
    expect(names(renderChart({ ...spec, mapLabels: "bestFit" }, 576, 336))).toEqual(["Russia"])
  })
})
