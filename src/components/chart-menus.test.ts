import { describe, expect, it } from "vitest"
import { chartElements } from "@/components/chart-menus"
import { defaultChartSpec, withVariant } from "@/editor/chart-spec"

const offered = (id: string) =>
  chartElements(withVariant(defaultChartSpec(id), id))
    .filter((element) => !element.disabled)
    .map((element) => element.id)

describe("Add Chart Element", () => {
  it("offers only what each kind of chart has, as Word does", () => {
    expect(offered("column")).toEqual([
      "axes",
      "axisTitles",
      "title",
      "dataLabels",
      "dataTable",
      "gridlines",
      "legend",
      "errorBars",
      "trendline",
    ])
    // Word's 2016 kinds: no error bars, data table or trendline; Treemap, Sunburst and Map have no axes either.
    expect(offered("waterfall")).toEqual(["axes", "axisTitles", "title", "dataLabels", "gridlines", "legend"])
    expect(offered("box-whisker")).toEqual(["axes", "axisTitles", "title", "dataLabels", "gridlines", "legend"])
    expect(offered("treemap")).toEqual(["title", "dataLabels", "legend"])
    expect(offered("sunburst")).toEqual(["title", "dataLabels", "legend"])
    expect(offered("filled-map")).toEqual(["title", "dataLabels", "legend"])
  })

  it("lists Word's four gridlines in Word's order, the bar chart's too, and adds Primary Minor Vertical", () => {
    const labels = (id: string) =>
      chartElements(withVariant(defaultChartSpec(id), id))
        .find((element) => element.id === "gridlines")!
        .choices.map((choice) => choice.label)
    const order = [
      "Primary Major Horizontal",
      "Primary Major Vertical",
      "Primary Minor Horizontal",
      "Primary Minor Vertical",
    ]
    expect(labels("column")).toEqual(order)
    expect(labels("bar")).toEqual(order)
    const column = withVariant(defaultChartSpec("column"), "column")
    const minor = chartElements(column)
      .find((element) => element.id === "gridlines")!
      .choices.find((choice) => choice.label === "Primary Minor Vertical")!
    expect(minor.change(column).gridlines.minorVertical).toBe(true)
  })

  it("gives Funnel its one axis and Pareto its percentage axis", () => {
    expect(offered("funnel")).toEqual(["axes", "title", "dataLabels", "legend"])
    const funnel = withVariant(defaultChartSpec("funnel"), "funnel")
    const axes = chartElements(funnel).find((element) => element.id === "axes")!
    expect(axes.choices.map((choice) => choice.label)).toEqual(["Primary Vertical"])
    expect(axes.choices[0]!.change(funnel).axes.category).toBe(false)
    const pareto = withVariant(defaultChartSpec("pareto"), "pareto")
    const paretoAxes = chartElements(pareto).find((element) => element.id === "axes")!
    const second = paretoAxes.choices.find((choice) => choice.label === "Secondary Vertical")!
    expect(second.on(pareto)).toBe(true)
    expect(second.change(pareto).axes.secondary).toBe(false)
    expect(chartElements(withVariant(defaultChartSpec("histogram"), "histogram"))[0]!.choices).toHaveLength(2)
  })
})
