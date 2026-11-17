import { describe, expect, it } from "vitest"
import { saveDocxBytes } from "@/document/docx/io"
import { openPackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { emptyChrome } from "@/document/header"
import { defaultStyles } from "@/document/styles"

// A document made in the app is drawn with Normal (12 pt, 9 pt after, 1.65 lines) in the theme's body font, Aptos.
// Before, the save wrote an empty Normal and no default font, so Word and the app's own reopening drew other
// sizes, spacing and fonts than the page did while it was written.
async function saveNew() {
  const json = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Body" }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
    ],
  }
  const saved = await saveDocxBytes({
    json: json as never,
    chrome: emptyChrome(),
    word: null,
    styles: defaultStyles(),
    unchanged: false,
    fileName: "new.docx",
  })
  return readDocument(await openPackage(saved.bytes, "new.docx"))
}

describe("a new document's styles", () => {
  it("writes Normal's size and spacing", async () => {
    const doc = await saveNew()
    const normal = doc.styles.styles.find((style) => style.id === "Normal")!
    expect(normal.rPr.sz).toBe(24)
    expect(normal.pPr.spacing).toMatchObject({ before: 0, after: 180, line: 396, lineRule: "auto" })
  })

  it("names the theme's body font as the document's font", async () => {
    const doc = await saveNew()
    expect(doc.styles.docDefaults.rPr.rFonts).toMatchObject({ asciiTheme: "minorHAnsi", hAnsiTheme: "minorHAnsi" })
  })
})
