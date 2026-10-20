import { describe, expect, it } from "vitest"
import { placeChartSheet } from "@/components/chart-sheet-place"

const sheet = { width: 400, height: 300 }
const view = { width: 1200, height: 800 }

describe("placeChartSheet", () => {
  it("sits to the right of the chart when there is room", () => {
    const place = placeChartSheet({ left: 100, top: 200, width: 400, height: 250 }, sheet, view)
    expect(place).toEqual({ left: 508, top: 200, side: "right" })
  })

  it("goes to the left at the right edge of the window", () => {
    const place = placeChartSheet({ left: 700, top: 100, width: 400, height: 250 }, sheet, view)
    expect(place.side).toBe("left")
    expect(place.left).toBe(292)
  })

  it("goes under the chart when neither side fits", () => {
    const place = placeChartSheet({ left: 100, top: 50, width: 1000, height: 200 }, sheet, view)
    expect(place).toEqual({ left: 100, top: 258, side: "below" })
  })

  it("goes over the chart when it is at the bottom", () => {
    const place = placeChartSheet({ left: 100, top: 520, width: 1000, height: 250 }, sheet, view)
    expect(place).toEqual({ left: 100, top: 212, side: "above" })
  })

  it("stays inside the window when nothing fits", () => {
    const place = placeChartSheet({ left: 0, top: 0, width: 1200, height: 800 }, sheet, view)
    expect(place.left).toBeGreaterThanOrEqual(8)
    expect(place.top + sheet.height).toBeLessThanOrEqual(view.height - 8)
  })

  it("keeps the top inside the window when the chart is partly scrolled off", () => {
    const place = placeChartSheet({ left: 100, top: -120, width: 400, height: 250 }, sheet, view)
    expect(place.top).toBe(8)
  })
})
