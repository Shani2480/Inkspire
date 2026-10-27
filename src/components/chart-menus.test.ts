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
})
