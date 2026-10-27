import { describe, expect, it } from "vitest"
import { drawMap, loadMapCountries, matchCountry, mixColor } from "@/editor/chart-map"
import { chartParts, defaultChartSpec, mapColors, renderChart, variantOf } from "@/editor/chart-spec"

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
    const fill = (index: number) => new RegExp(`data-chart-part="point:${index}" d="[^"]+" fill="([^"]+)"`).exec(svg)![1]
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
      const shape = drawMap([{ index: 0, name: "Japan", value: 1 }], { x: 0, y: 0, w: 400, h: 300 }, { area, projection })!
      const xs = [...shape.shapes[0]!.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => Number(match[1]))
      return Math.max(...xs) - Math.min(...xs)
    }
    expect(size("data")).toBeGreaterThan(size("world") * 5)
    for (const projection of ["mercator", "miller", "robinson"] as const) {
      expect(size("world", projection)).toBeGreaterThan(0)
    }
  })
})
