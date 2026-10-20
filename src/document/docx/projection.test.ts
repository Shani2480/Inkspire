import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes } from "@/document/docx/io"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

async function open(name: string) {
  return openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
}

function body(html: string) {
  return new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild as HTMLElement
}

describe("docx to editor projection of Word-authored files", () => {
  it("f01 keeps run size, colour, font, and emphasis", async () => {
    const root = body((await open("f01_runs.docx")).view.html)
    const styled = (text: string) =>
      [...root.querySelectorAll<HTMLElement>("span[style]")].find((span) => span.textContent === text)!
    const red = styled("italic-red-14pt")
    expect(red.style.fontSize).toBe("14pt")
    expect(red.style.color).toBe("rgb(255, 0, 0)")
    expect(red.querySelector("em strong")).not.toBeNull()
    const arial = styled("underline-arial")
    // The Word font first, then metric-compatible stand-ins for systems without it.
    expect(arial.style.fontFamily.split(",")[0]?.replace(/["']/g, "")).toBe("Arial")
    expect(arial.style.fontFamily).toContain("Liberation Sans")
    expect(arial.querySelector("u")).not.toBeNull()
    expect(root.querySelector("br")).not.toBeNull()
  })

  it("f03 applies paragraph alignment in document order", async () => {
    const root = body((await open("f03_para_format.docx")).view.html)
    expect([...root.querySelectorAll("p")].map((p) => p.style.textAlign)).toEqual(["", "center", "center"])
  })

  it("f06 keeps merged cells as colspan and rowspan without nesting", async () => {
    const root = body((await open("f06_table.docx")).view.html)
    expect(root.querySelectorAll("table")).toHaveLength(1)
    expect(root.querySelector("td[colspan='2']")?.textContent).toBe("c11c12")
    expect(root.querySelector("td[rowspan='2']")?.textContent).toBe("c23c33")
  })

  it("f13 sizes an inline image from wp:extent in EMU", async () => {
    const image = body((await open("f13_inline_image.docx")).view.html).querySelector("img")!
    expect([image.getAttribute("width"), image.getAttribute("height")]).toEqual(["64", "32"])
    expect(image.getAttribute("src")).toMatch(/^data:image\/png;base64,/)
  })

  it("f07 isolates first-page and default headers and honours titlePg", async () => {
    const { chrome } = (await open("f07_header_footer.docx")).view
    expect(chrome.differentFirstPage).toBe(true)
    expect(chrome.header).toBe("HEADER-TEXT")
    expect(chrome.firstHeader).toBe("FIRST-PAGE-HEADER")
    expect(chrome.header).not.toContain("FIRST-PAGE")
  })

  it("f03 projects spacing, line height, indents, and keep flags", async () => {
    const paragraph = body((await open("f03_para_format.docx")).view.html).querySelectorAll("p")[1]!
    expect(paragraph.style.marginTop).toBe("12pt")
    expect(paragraph.style.marginBottom).toBe("6pt")
    expect(paragraph.style.lineHeight).toBe("1.5")
    expect(paragraph.getAttribute("data-indent")).toBe("2")
    expect(paragraph.getAttribute("data-special")).toBe("first:0.64")
    expect(paragraph.getAttribute("data-keep-next")).toBe("1")
  })

  it("f06 projects tblGrid column widths in pixels and anchors the table", async () => {
    const root = body((await open("f06_table.docx")).view.html)
    expect(root.querySelector("table")?.getAttribute("data-docx")).toMatch(/^[a-z0-9]+-t\d+$/)
    expect(root.querySelector("td[colspan='2']")?.getAttribute("colwidth")).toMatch(/^\d+,\d+$/)
  })

  it("gives each open its own anchor scope", async () => {
    const first = body((await open("f01_runs.docx")).view.html)
      .querySelector("p")!
      .getAttribute("data-docx")
    const second = body((await open("f01_runs.docx")).view.html)
      .querySelector("p")!
      .getAttribute("data-docx")
    expect(first).not.toBe(second)
  })
})
