import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage } from "@/document/docx/opc"
import { readShapeLook } from "@/document/docx/shape-import"
import { solid } from "@/document/docx/shape-write"
import { decodeXml } from "@/document/docx/xml"
import { paragraphsIn, type WordDocument } from "@/document/docx/model"
import { wordToEditor } from "@/document/docx/project"
import { DEFAULT_PAGE_SETUP, pageMetrics } from "@/document/page-setup"
import { createExtensions } from "@/editor/extensions"
import { pageClip } from "@/editor/objects"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

const editors: Editor[] = []

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

describe("a Word section break", () => {
  it("starts the next section on a new page in the editor and is saved once, from its paragraph", async () => {
    const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, "f15_sections.docx")))
    const opened = await openDocxBytes(bytes, "f15.docx")
    expect(opened.view.html).toMatch(
      /<\/p><div data-section-break="" data-kind="nextPage" data-section="[^"]+" class="section-break"><\/div>/,
    )

    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: opened.view.html })
    editors.push(editor)
    const kinds: string[] = []
    editor.state.doc.forEach((node) => kinds.push(node.type.name))
    expect(kinds.slice(0, 3)).toEqual(["paragraph", "paragraph", "sectionBreak"])

    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const pkg = await openPackage(saved.bytes, "edited.docx")
    const xml = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    // The section's own w:sectPr in its paragraph and the body's last one: nothing added for the editor's break.
    expect(xml.match(/<w:sectPr\b/g)).toHaveLength(2)
    expect(xml).not.toMatch(/<w:p\b[^>]*\/>\s*<w:p\b[^>]*><w:r><w:t>landscape/)
  })
})

describe("a shape filled with a colour shown through", () => {
  const shape = (fill: string) =>
    `<wps:wsp><wps:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}</wps:spPr></wps:wsp>`

  it("keeps Word's alpha as eight-digit hex and writes it back", () => {
    const look = readShapeLook(
      shape(`<a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="70000"/></a:srgbClr></a:solidFill>`),
      null,
    )
    expect(look.fill).toBe("#ffffffb3")
    expect(solid(look.fill)).toBe(
      `<a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="70000"/></a:srgbClr></a:solidFill>`,
    )
    expect(readShapeLook(shape(`<a:solidFill><a:srgbClr val="4472C4"/></a:solidFill>`), null).fill).toBe("#4472c4")
    expect(solid("#4472c4")).toBe(`<a:solidFill><a:srgbClr val="4472C4"/></a:solidFill>`)
  })
})

describe("a floating object past the page's edge", () => {
  const metrics = pageMetrics(DEFAULT_PAGE_SETUP)
  const node = (attrs: Record<string, unknown>) => ({ attrs }) as unknown as ProseNode

  it("is cut off at the sheet's edges, which are the margins out from the text's corner", () => {
    const clip = pageClip(node({ width: 1147, height: 1147 }), -142, 0, metrics)
    const left = Math.round(142 - metrics.marginLeft)
    const top = Math.round(-metrics.marginTop)
    expect(clip).toBe(
      `polygon(${left}px ${top}px, ${Math.round(left + metrics.width)}px ${top}px, ` +
        `${Math.round(left + metrics.width)}px ${Math.round(top + metrics.height)}px, ${left}px ${Math.round(top + metrics.height)}px)`,
    )
  })

  it("is drawn whole when it fits the page, or when it is turned", () => {
    expect(pageClip(node({ width: 200, height: 100 }), 10, 10, metrics)).toBe("")
    expect(pageClip(node({ width: 2000, height: 100, rotate: 15 }), -300, 10, metrics)).toBe("")
  })
})

describe("a section's own header", () => {
  /** f15 with f07's default header given to its first section (the one its paragraph's section break ends). */
  async function sectionWithHeader() {
    const sections = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, "f15_sections.docx"))))
    const headers = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, "f07_header_footer.docx"))))
    const word = sections.word!
    const header = headers.word!.section!.references!.find((ref) => ref.kind === "header" && ref.type === "default")!
    const breaking = paragraphsIn(word.blocks).find((paragraph) => paragraph.sectionBreak)!
    breaking.sectionBreak = { ...breaking.sectionBreak!, marginTop: 2880, references: [structuredClone(header)] }
    return { word, view: wordToEditor(word), key: breaking.key! }
  }

  async function save(word: WordDocument, view: ReturnType<typeof wordToEditor>, chrome = view.chrome) {
    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: view.html })
    editors.push(editor)
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome,
      props: view.props,
      word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const pkg = await openPackage(saved.bytes, "edited.docx")
    return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data), pkg }
  }

  it("opens with its own margins and header; the last section, which has none, shows it (Link to Previous)", async () => {
    const { view, key } = await sectionWithHeader()
    const section = view.chrome.sections!.find((item) => item.key === key)!
    expect(section.marginTop).toBeCloseTo(50.8, 1)
    expect(section.parts.header).toContain("HEADER-TEXT")
    expect(section.parts.footer).toBeUndefined()
    expect(view.chrome.header).toContain("HEADER-TEXT")
    expect(view.chrome.linked).toContain("header")
    expect(view.html).toContain(`data-section="${key}"`)
  })

  it("is saved as it was when untouched, and the last section stays linked to it", async () => {
    const { word, view } = await sectionWithHeader()
    const { xml } = await save(word, view)
    const sectPrs = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(sectPrs).toHaveLength(2)
    expect(sectPrs[0]).toMatch(/<w:headerReference w:type="default"/)
    expect(sectPrs[1]).not.toMatch(/headerReference/)
  })

  it("writes an edit into its own part, and reopens with it", async () => {
    const { word, view, key } = await sectionWithHeader()
    const sections = view.chrome.sections!.map((item) =>
      item.key === key
        ? { ...item, parts: { ...item.parts, header: "<p>EDITED HEADER</p>", footer: "<p>NEW FOOTER</p>" } }
        : item,
    )
    const { bytes, xml, pkg } = await save(word, view, { ...view.chrome, sections })
    const first = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/)![0]
    expect(first).toMatch(/<w:headerReference w:type="default"/)
    expect(first).toMatch(/<w:footerReference w:type="default"/)
    const parts = pkg.parts.filter((part) => /\/word\/(header|footer)\d+\.xml$/.test(part.name))
    const text = parts.map((part) => decodeXml(part.data)).join("")
    expect(text).toContain("EDITED HEADER")
    expect(text).toContain("NEW FOOTER")

    const reopened = await openDocxBytes(bytes, "edited.docx")
    const section = reopened.view.chrome.sections![0]!
    expect(section.parts.header).toContain("EDITED HEADER")
    expect(section.parts.footer).toContain("NEW FOOTER")
    // The last section has none of its own: it shows the first section's.
    expect(reopened.view.chrome.footer).toContain("NEW FOOTER")
  })
})
