import { afterEach, describe, expect, it } from "vitest"
import { defaultChartSpec, variantOf, withStyle, withVariant } from "@/editor/chart-spec"
import {
  TEMPLATES_KEY,
  applyChartTemplate,
  chartTemplate,
  deleteChartTemplate,
  loadChartTemplates,
  saveChartTemplate,
} from "@/editor/chart-templates"

afterEach(() => {
  localStorage.removeItem(TEMPLATES_KEY)
})

describe("chart templates (Save as Template…)", () => {
  it("saves, replaces one of the same name, finds and deletes templates", () => {
    const pie = defaultChartSpec("pie-3d")
    const first = saveChartTemplate("  Board pie ", pie)!
    expect(first.name).toBe("Board pie")
    expect(saveChartTemplate("", pie)).toBeNull()
    const again = saveChartTemplate("board PIE", withStyle(pie, 3))!
    expect(again.id).toBe(first.id)
    expect(loadChartTemplates()).toHaveLength(1)
    expect(chartTemplate(`template:${first.id}`)?.spec.style).toBe(3)
    deleteChartTemplate(first.id)
    expect(loadChartTemplates()).toEqual([])
  })

  it("ignores saved templates that are not the right shape", () => {
    localStorage.setItem(
      TEMPLATES_KEY,
      JSON.stringify([{ id: 1 }, null, { id: "a", name: "A", spec: { type: "line" } }]),
    )
    expect(loadChartTemplates().map((item) => [item.id, item.spec.type])).toEqual([["a", "line"]])
    localStorage.setItem(TEMPLATES_KEY, "{")
    expect(loadChartTemplates()).toEqual([])
  })

  it("draws a chart by a template with the chart's own data, titles and series", () => {
    const template = {
      ...withStyle(withVariant(defaultChartSpec("combo-column-line-secondary"), "combo-column-line-secondary"), 5),
      legend: "top" as const,
    }
    template.format["series:1"] = { fill: "#ff0000" }
    template.series[0]!.trendline = "linear"
    const chart = defaultChartSpec("column")
    chart.title.text = "Sales by region"
    chart.series.push({ name: "Series 4", values: [1, 2, 3, 4] })
    const applied = applyChartTemplate(chart, template)
    expect(variantOf(applied)).toBe("combo-column-line-secondary")
    expect([applied.style, applied.legend, applied.format["series:1"]?.fill]).toEqual([5, "top", "#ff0000"])
    expect(applied.title.text).toBe("Sales by region")
    expect(applied.categories).toEqual(chart.categories)
    expect(applied.series.map((serie) => serie.name)).toEqual(chart.series.map((serie) => serie.name))
    expect(applied.series.map((serie) => serie.values)).toEqual(chart.series.map((serie) => serie.values))
    // Each series takes its place's options; the extra one those of the template's last series.
    expect(applied.series.map((serie) => [serie.type ?? null, Boolean(serie.secondary)])).toEqual([
      [null, false],
      ["line", false],
      ["line", true],
      ["line", true],
    ])
    expect(applied.series[0]!.trendline).toBe("linear")
  })
})
