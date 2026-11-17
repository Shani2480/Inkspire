import { afterEach, describe, expect, it, vi } from "vitest"
import { OPTIONAL_FONTS, fontSize, officeFontsIn, standInFor, useOptionalFonts } from "@/document/optional-fonts"

describe("optional fonts (U39)", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("maps Office fonts to their stand-ins by name, any case and quoting", () => {
    expect(standInFor("Calibri")?.family).toBe("Carlito")
    expect(standInFor("'calibri light'")?.family).toBe("Carlito")
    expect(standInFor('"Times New Roman"')?.family).toBe("Tinos")
    expect(standInFor("Cambria")?.family).toBe("Caladea")
    expect(standInFor("Georgia")?.family).toBe("Gelasio")
    expect(standInFor("Aptos")).toBeUndefined()
  })

  it("finds the Office fonts named in style sheets and style attributes", () => {
    const sheet = ".ProseMirror p { font-family: 'Calibri', 'Carlito', sans-serif; }"
    const html = '<p><span style="font-family: &quot;Courier New&quot;, monospace">x</span></p>'
    expect(officeFontsIn(`${sheet}\n${html}`).sort()).toEqual(["Calibri", "Courier New"])
    expect(officeFontsIn("p { font-family: Verdana }")).toEqual([])
  })

  it("lists every file with a size and a SHA-256, from one pinned commit", () => {
    for (const font of OPTIONAL_FONTS) {
      expect(font.files.length).toBeGreaterThan(0)
      for (const file of font.files) {
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(file.size).toBeGreaterThan(10_000)
      }
    }
    const total = OPTIONAL_FONTS.reduce((sum, font) => sum + fontSize(font), 0)
    expect(total).toBeGreaterThan(5_000_000)
    expect(total).toBeLessThan(15_000_000)
  })

  it("refuses a file that is not the one expected, and fails without a connection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    )
    await useOptionalFonts.getState().download(["caladea"])
    expect(useOptionalFonts.getState().status.caladea).toBe("failed")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      }),
    )
    await useOptionalFonts.getState().download(["cousine"])
    expect(useOptionalFonts.getState().status.cousine).toBe("failed")
  })
})
