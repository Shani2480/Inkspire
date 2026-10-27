import { describe, expect, it } from "vitest"
import { textAsBars } from "@/components/chart-menus"
import { defaultChartSpec, renderChart } from "@/editor/chart-spec"

describe("chart thumbnails", () => {
  it("draws each piece of text as a bar where it sits, keeping its part, colour and turn", () => {
    expect(
      textAsBars(
        '<text data-chart-part="title" x="100" y="20" text-anchor="middle" font-size="20" fill="#595959">Sales</text>',
      ),
    ).toBe(
      '<rect data-chart-part="title" x="75.0" y="6.4" width="50.0" height="11.0" rx="3.0" fill="#595959" fill-opacity="0.55"/>',
    )
    expect(textAsBars('<text x="50" y="10" text-anchor="end" font-size="10">A &amp; B</text>')).toContain('x="25.0"')
    expect(textAsBars('<text transform="translate(5 9) rotate(-90)" font-size="10">Axis</text>')).toContain(
      'transform="translate(5 9) rotate(-90)"',
    )
    expect(textAsBars('<text x="1" y="1"> </text>')).toBe("")
    const svg = textAsBars(renderChart(defaultChartSpec("column"), 320, 200))
    expect(svg).not.toContain("<text")
    expect(svg).toContain('data-chart-part="series:0"')
  })
})
