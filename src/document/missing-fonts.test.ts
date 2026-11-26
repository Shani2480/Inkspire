import { describe, expect, it } from "vitest"
import { documentFontNames, fontOffer, offerText } from "@/document/missing-fonts"

const CSS =
  'p { font-family: "Lato Light", sans-serif } .a { font-family: Calibri, Carlito, sans-serif } ' +
  '.b { font-family: "Avenir LT Std 35 Light", sans-serif } .c { font-family: Aptos, Carlito, sans-serif } ' +
  '.d { font-family: Arial, "Liberation Sans" } .e { font-family: Symbol } .f { font-family: var(--x) }'

describe("the fonts a document is missing", () => {
  it("are the first font of each of its font lists, once each, not generic ones or symbol fonts", () => {
    expect(documentFontNames(CSS)).toEqual(["Lato Light", "Calibri", "Avenir LT Std 35 Light", "Aptos", "Arial"])
  })

  it("are offered as Google's font, a same-width stand-in, Microsoft's Aptos, or a similar font", async () => {
    const offer = await fontOffer(CSS, { carlito: "missing" }, {}, (name) => name === "Arial")
    expect(offer.missing).toEqual(["Lato Light", "Calibri", "Avenir LT Std 35 Light", "Aptos"])
    expect(offer.web.map((font) => [font.name, font.family, font.weight])).toEqual([["Lato Light", "Lato", 300]])
    expect(offer.standIns.map((font) => font.family)).toEqual(["Carlito"])
    expect(offer.aptos).toBe(true)
    expect(offerText(offer)).toBe(
      "This document uses Lato Light, Calibri, Avenir LT Std 35 Light and Aptos, which are not on this device. " +
        "Download Lato Light free from Google Fonts and Carlito, a free font with the same widths, so it looks as in " +
        "Word? Avenir LT Std 35 Light and Aptos are shown in a similar font.",
    )
  })

  it("leave out what is installed, downloaded already, or drawn in its installed stand-in", async () => {
    const offer = await fontOffer(
      CSS,
      { carlito: "installed" },
      { "Lato Light": { name: "Lato Light", family: "Lato", weight: 300, bold: false, italic: true } },
      (name) => name !== "Avenir LT Std 35 Light",
    )
    expect(offer.missing).toEqual(["Avenir LT Std 35 Light"])
    expect(offerText(offer)).toBe(
      "This document uses Avenir LT Std 35 Light, which is not on this device. It is shown in a similar font.",
    )
  })

  it("say how commercial fonts are shown", async () => {
    const offer = await fontOffer('a { font-family: "Arial Nova" } b { font-family: Batang }', {}, {}, () => false)
    expect(offerText(offer)).toBe(
      "This document uses Arial Nova and Batang, which are not on this device. They are shown in similar fonts.",
    )
  })

  it("offer Roboto Condensed for Arial Nova Cond, which wraps where Word's lines do", async () => {
    const offer = await fontOffer('a { font-family: "Arial Nova Cond" }', {}, {}, () => false)
    expect(offer.standIns.map((font) => font.family)).toEqual(["Roboto Condensed"])
  })
})
