import { describe, expect, it } from "vitest"
import { creatorName, insertedUrl, readStockResults, stockAltText, stockSearchUrl } from "@/editor/stock-images"

const result = (extra: Record<string, unknown>) => ({
  id: "a1",
  title: "Harbour at dawn",
  url: "https://live.staticflickr.com/1/2_b.jpg",
  thumbnail: "https://api.openverse.org/v1/images/a1/thumb/",
  width: 1024,
  height: 683,
  creator: "Sam Example",
  foreign_landing_url: "https://www.flickr.com/photos/example/2",
  license: "cc0",
  mature: false,
  ...extra,
})

describe("Stock Images", () => {
  it("asks Openverse for public-domain photos from Flickr and Wikimedia Commons only", () => {
    const url = new URL(stockSearchUrl("  red bicycle "))
    expect(url.origin + url.pathname).toBe("https://api.openverse.org/v1/images/")
    expect(url.searchParams.get("q")).toBe("red bicycle")
    expect(url.searchParams.get("license")).toBe("cc0,pdm")
    expect(url.searchParams.get("source")).toBe("flickr,wikimedia")
    expect(url.searchParams.get("mature")).toBe("false")
    expect(new URL(stockSearchUrl("")).searchParams.get("q")).toBe("nature")
  })

  it("keeps only public-domain pictures on the hosts the app may read", () => {
    const images = readStockResults({
      results: [
        result({}),
        result({ id: "a2", url: "https://example.com/x.jpg" }),
        result({ id: "a3", license: "by" }),
        result({ id: "a4", mature: true }),
        result({ id: "a5", title: null, creator: null, license: "pdm" }),
      ],
    })
    expect(images.map((image) => image.id)).toEqual(["a1", "a5"])
    expect(images[1]!.title).toBe("Photo")
    expect(readStockResults(null)).toEqual([])
  })

  it("inserts Commons' 1920-pixel copy of a larger Wikimedia picture", () => {
    const original = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Old_mill.jpg"
    expect(insertedUrl(original, 6000)).toBe(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Old_mill.jpg/1920px-Old_mill.jpg",
    )
    expect(insertedUrl(original, 1200)).toBe(original)
    expect(insertedUrl("https://live.staticflickr.com/1/2_b.jpg", 6000)).toBe("https://live.staticflickr.com/1/2_b.jpg")
  })

  it("keeps only the name of who took the picture", () => {
    expect(creatorName("Sam Example - 2 Million Views - Thank You")).toBe("Sam Example")
    expect(creatorName("  Riverside Library  ")).toBe("Riverside Library")
    expect(creatorName("x".repeat(60))).toBe(`${"x".repeat(39)}…`)
  })

  it("describes the picture with its title and who took it", () => {
    const [image] = readStockResults({ results: [result({})] })
    expect(stockAltText(image!)).toBe("Harbour at dawn, by Sam Example (public domain)")
  })
})
