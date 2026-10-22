import { describe, expect, it } from "vitest"
import { paperSize, placeCopy, printCopy, printPages } from "@/document/print-copy"

/** A page canvas as the editor lays one out: two sheets with a header and a footer each, and the body over them. */
function canvas(sheets = 2) {
  const root = document.createElement("div")
  root.id = "page-canvas"
  root.className = "page-canvas formatting-marks is-chrome-editing"
  root.dataset.layout = "web"
  for (let index = 0; index < sheets; index += 1) {
    const sheet = document.createElement("div")
    sheet.className = "page-sheet"
    sheet.style.width = "794px"
    sheet.style.height = "1123px"
    sheet.style.left = "0px"
    sheet.style.top = `${index * 1147}px`
    sheet.innerHTML =
      `<div class="page-chrome-zone is-header"></div><label class="page-first">First page</label>` +
      `<div class="page-header chrome-box has-content"><div class="page-editor chrome-editor ProseMirror">` +
      `<p><img src="logo.png" alt="Logo"> Report</p></div></div>` +
      `<div class="page-footer chrome-box has-content"><div class="page-editor chrome-editor ProseMirror">` +
      `<p style="text-align: center"><span data-page-field="page">${index + 1}</span></p></div></div>`
    root.append(sheet)
  }
  const toolbar = document.createElement("div")
  toolbar.className = "table-handles"
  root.append(toolbar)
  const body = document.createElement("div")
  body.innerHTML = `<div class="page-editor ProseMirror" contenteditable="true"><p class="spell-error">Body</p></div>`
  root.append(body)
  return root
}

describe("printing the laid-out pages (rich header and footer leftovers)", () => {
  it("copies the sheets with their headers, footers and fields, without the editing marks", () => {
    const copy = printCopy(canvas())
    expect(copy).not.toBeNull()
    expect(copy?.classList.contains("is-print-copy")).toBe(true)
    expect(copy?.classList.contains("formatting-marks")).toBe(false)
    expect(copy?.classList.contains("is-chrome-editing")).toBe(false)
    expect(copy?.dataset.layout).toBe("print")
    expect(copy?.id).toBe("")
    expect(copy?.querySelectorAll(".page-sheet")).toHaveLength(2)
    expect(copy?.querySelectorAll(".page-header img")).toHaveLength(2)
    expect(copy?.querySelector("[data-page-field]")?.textContent).toBe("1")
    expect(copy?.querySelector(".page-first")).toBeNull()
    expect(copy?.querySelector(".table-handles")).toBeNull()
    expect(copy?.querySelector("[contenteditable]")).toBeNull()
    expect(copy?.querySelector(".spell-error")).toBeNull()
    expect(copy?.querySelector(".page-editor:not(.chrome-editor) p")?.textContent).toBe("Body")
  })

  it("has nothing to copy before the editor has drawn pages", () => {
    const root = document.createElement("div")
    root.className = "page-canvas"
    expect(printCopy(root)).toBeNull()
    expect(printPages(root)).toBeNull()
    expect(paperSize(root)).toBeNull()
  })

  it("moves the copy so the asked-for page sits at the corner", () => {
    const copy = printCopy(canvas(3))!
    placeCopy(copy, 2)
    expect(copy.style.left).toBe("0px")
    expect(copy.style.top).toBe("-2294px")
    placeCopy(copy, 0)
    expect(copy.style.top).toBe("0px")
  })

  it("makes one paper-sized page per sheet, each showing its own page with its own page number", () => {
    const source = canvas(3)
    const pages = printPages(source)!
    expect(pages.className).toBe("print-pages")
    expect(pages.dataset.keepLight).toBe("")
    const boxes = [...pages.querySelectorAll<HTMLElement>(":scope > .print-page")]
    expect(boxes).toHaveLength(3)
    expect(boxes[0].style.width).toBe("794px")
    expect(boxes[0].style.height).toBe("1123px")
    expect(boxes.map((box) => box.firstElementChild?.getAttribute("style"))).toEqual([
      expect.stringContaining("top: 0px"),
      expect.stringContaining("top: -1147px"),
      expect.stringContaining("top: -2294px"),
    ])
    // Each box holds its own page sheet only: the second page's footer field is in the second copy.
    expect(boxes.map((box) => box.querySelectorAll(".page-sheet").length)).toEqual([1, 1, 1])
    expect(boxes[1].querySelector(".page-footer [data-page-field]")?.textContent).toBe("2")
    // The body is in every copy; without a layout (here) no block is known to be off its page, so none is hidden.
    expect(boxes.map((box) => box.querySelector(".page-editor:not(.chrome-editor) p")?.textContent)).toEqual([
      "Body",
      "Body",
      "Body",
    ])
    expect(boxes[2].querySelector<HTMLElement>(".page-editor:not(.chrome-editor) p")?.style.visibility).toBe("")
    expect(paperSize(source)).toEqual({ width: "794px", height: "1123px" })
  })

  it("hides the body blocks that are on other pages in each page's copy, so their text is not behind the clip", () => {
    const source = canvas(2)
    document.body.append(source)
    const body = source.querySelector<HTMLElement>(".page-editor:not(.chrome-editor)")!
    body.innerHTML = "<p>First</p><p>Both</p><p>Second</p><p><span class='object-frame'></span>Floating</p>"
    const rects: Record<string, { top: number; bottom: number }> = {
      First: { top: 100, bottom: 400 },
      Both: { top: 1000, bottom: 1300 },
      Second: { top: 1400, bottom: 1700 },
      Floating: { top: 1800, bottom: 1900 },
    }
    source.getBoundingClientRect = () =>
      ({ top: 0, bottom: 2300, left: 0, right: 794, height: 2300, width: 794 }) as DOMRect
    body.querySelectorAll<HTMLElement>("p").forEach((block) => {
      const rect = rects[block.textContent ?? ""]
      block.getBoundingClientRect = () =>
        ({ ...rect, left: 0, right: 794, width: 794, height: rect.bottom - rect.top }) as DOMRect
    })
    const boxes = [...printPages(source)!.querySelectorAll<HTMLElement>(":scope > .print-page")]
    const shown = (box: HTMLElement) =>
      [...box.querySelectorAll<HTMLElement>(".page-editor:not(.chrome-editor) p")]
        .filter((block) => block.style.visibility !== "hidden")
        .map((block) => block.textContent)
    expect(shown(boxes[0])).toEqual(["First", "Both", "Floating"])
    expect(shown(boxes[1])).toEqual(["Both", "Second", "Floating"])
    source.remove()
  })
})
