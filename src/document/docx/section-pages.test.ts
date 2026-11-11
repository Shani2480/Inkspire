import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { afterEach, describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { readShapeLook } from "@/document/docx/shape-import"
import { solid } from "@/document/docx/shape-write"
import { decodeXml } from "@/document/docx/xml"
import { paragraphsIn, type WordDocument } from "@/document/docx/model"
import { wordToEditor } from "@/document/docx/project"
import { DEFAULT_PAGE_SETUP, pageMetrics } from "@/document/page-setup"
import { sectionPageSetup } from "@/document/sections"
import { createExtensions } from "@/editor/extensions"
import { useDocumentStore } from "@/document/store"
import { applyColumnSection } from "@/editor/columns"
import { applyFrame, pageClip } from "@/editor/objects"
import { setDrawnPageKeys } from "@/document/page-frames"
import { placeObjectFrames } from "@/editor/page-grid"

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

  it("is cut at its own page's size, a landscape section's wider sheet", () => {
    const landscape = {
      key: "wide",
      marginTop: 25.4,
      marginBottom: 25.4,
      headerFromEdge: 12.7,
      footerFromEdge: 12.7,
      differentFirstPage: false,
      parts: {},
      opened: {},
      orientation: "landscape" as const,
    }
    const before = useDocumentStore.getState()
    useDocumentStore.setState({ pageSetup: DEFAULT_PAGE_SETUP, sections: [landscape] })
    setDrawnPageKeys(["wide"])
    try {
      const wide = pageMetrics(sectionPageSetup(DEFAULT_PAGE_SETUP, landscape))
      // From the sheet's left edge, wider than a portrait page but not than the landscape one.
      const picture = { type: { name: "image" }, attrs: { wrap: "square", width: 1000, height: 100, page: 1, y: 0 } }
      picture.attrs = { ...picture.attrs, x: -wide.marginLeft } as typeof picture.attrs
      const dom = document.createElement("div")
      dom.className = "image-frame object-frame"
      applyFrame(dom, picture as unknown as ProseNode)
      expect(wide.width).toBeGreaterThan(1000)
      expect(dom.style.clipPath).toBe("")
      // The pass after each layout places it on the same page, not the one-size grid's.
      const placed = dom.style.left
      const editor = document.createElement("div")
      editor.append(dom)
      dom.style.left = ""
      placeObjectFrames(editor, 1, pageMetrics(DEFAULT_PAGE_SETUP))
      expect(dom.style.left).toBe(placed)
    } finally {
      setDrawnPageKeys([])
      useDocumentStore.setState({ pageSetup: before.pageSetup, sections: before.sections })
    }
  })

  it("is not cut in a header or footer, whose editor is drawn off the page", () => {
    const editor = document.createElement("div")
    editor.className = "page-editor chrome-editor"
    const frame = document.createElement("div")
    editor.append(frame)
    // A footer picture a little above its paragraph, as the contract's cloud behind the page number, in a document
    // whose last section has no top margin: in the body it would be cut at the sheet's top.
    const flush = pageMetrics({ ...DEFAULT_PAGE_SETUP, marginTop: 0 })
    expect(pageClip(node({ width: 130, height: 47 }), 532, -17, flush)).not.toBe("")
    expect(pageClip(node({ width: 130, height: 47 }), 532, -17, flush, frame)).toBe("")
  })
})

describe("a flipped picture", () => {
  async function flipped() {
    const pkg = await openPackage(
      new Uint8Array(readFileSync(path.join(AUTHORED, "f13_inline_image.docx"))),
      "f13.docx",
    )
    const part = findPart(pkg, pkg.mainPartName)!
    part.data = new TextEncoder().encode(decodeXml(part.data).replace(/<a:xfrm(?=[ >])/, '<a:xfrm flipH="1"'))
    return openDocxBytes(await writePackage(pkg), "f13.docx")
  }

  it("opens mirrored, keeps Word's drawing untouched, and writes a flip that was taken off", async () => {
    const opened = await flipped()
    expect(opened.view.html).toContain('data-flip-h="1"')
    const extensions = createExtensions().filter((extension) => extension.name !== "spellcheck")
    const editor = new Editor({ extensions, content: opened.view.html })
    editors.push(editor)
    const save = async () => {
      const saved = await saveDocxBytes({
        json: editor.getJSON(),
        chrome: opened.view.chrome,
        props: opened.view.props,
        word: opened.word,
        unchanged: false,
        fileName: "f13.docx",
      })
      const pkg = await openPackage(saved.bytes, "f13.docx")
      return decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    }
    expect(await save()).toMatch(/<a:xfrm[^>]*flipH="1"/)
    let at = -1
    editor.state.doc.descendants((child, pos) => {
      if (child.type.name === "image") {
        at = pos
      }
    })
    editor.view.dispatch(editor.state.tr.setNodeAttribute(at, "flipH", false))
    expect(await save()).not.toMatch(/flipH/)
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

  it("unlinked from the previous section, the last section saves its copy as its own part", async () => {
    const { word, view } = await sectionWithHeader()
    const linked = (view.chrome.linked ?? []).filter((slot) => slot !== "header")
    // Unlinked and not yet changed: the copy of the header it showed.
    const { bytes, xml } = await save(word, view, { ...view.chrome, linked })
    const [first, last] = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(first).toMatch(/<w:headerReference w:type="default"/)
    expect(last).toMatch(/<w:headerReference w:type="default"/)
    const reopened = await openDocxBytes(bytes, "edited.docx")
    expect(reopened.view.chrome.linked).not.toContain("header")
    expect(reopened.view.chrome.header).toContain("HEADER-TEXT")
  })

  it("linked to the previous section again, the last section's own part is dropped", async () => {
    const { word, view } = await sectionWithHeader()
    const unlinked = await save(word, view, {
      ...view.chrome,
      linked: (view.chrome.linked ?? []).filter((slot) => slot !== "header"),
    })
    const reopened = await openDocxBytes(unlinked.bytes, "unlinked.docx")
    const chrome = reopened.view.chrome
    const { xml } = await save(reopened.word!, reopened.view, {
      ...chrome,
      linked: [...(chrome.linked ?? []), "header"],
    })
    const [first, last] = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(first).toMatch(/<w:headerReference w:type="default"/)
    expect(last).not.toMatch(/headerReference/)
  })

  it("a section before the last that is linked again loses its own part", async () => {
    // The first section has nothing to link to in the app; its w:sectPr is the only one f15 has before the last.
    const { word, view, key } = await sectionWithHeader()
    const sections = view.chrome.sections!.map((item) => {
      if (item.key !== key) {
        return item
      }
      const parts = { ...item.parts }
      delete parts.header
      return { ...item, parts }
    })
    const { xml } = await save(word, view, { ...view.chrome, sections })
    const sectPrs = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(sectPrs.join("")).not.toMatch(/headerReference/)
  })
})

describe("a section's page setup and page numbers", () => {
  /** f15 with its first section's page numbers starting at 0 and its last section's restarting at 1, as a cover. */
  async function numbered() {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(path.join(AUTHORED, "f15_sections.docx"))))
    const word = opened.word!
    const breaking = paragraphsIn(word.blocks).find((paragraph) => paragraph.sectionBreak)!
    breaking.sectionBreak = { ...breaking.sectionBreak!, pageNumbers: { start: 0 } }
    word.section = { ...word.section!, pageNumbers: { start: 1, format: "lowerRoman" } }
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
    return { bytes: saved.bytes, xml: decodeXml(findPart(pkg, pkg.mainPartName)!.data) }
  }

  it("opens each section's page number start and format (w:pgNumType)", async () => {
    const { view, key } = await numbered()
    const section = view.chrome.sections!.find((item) => item.key === key)!
    expect(section.pageNumberStart).toBe(0)
    expect(section.pageNumberFormat).toBe("decimal")
    expect(view.chrome.pageSetup.pageNumberStart).toBe(1)
    expect(view.chrome.pageSetup.pageNumberFormat).toBe("lowerRoman")
  })

  it("keeps w:pgNumType as written when untouched", async () => {
    const { word, view } = await numbered()
    const { xml } = await save(word, view)
    const sectPrs = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(sectPrs[0]).toMatch(/<w:pgNumType w:start="0"\/>/)
    expect(sectPrs[1]).toMatch(/<w:pgNumType w:fmt="lowerRoman" w:start="1"\/>/)
  })

  it("opens each section's own paper, orientation and side margins", async () => {
    const { view, key } = await numbered()
    const section = view.chrome.sections!.find((item) => item.key === key)!
    expect(section).toMatchObject({ paper: "a4", orientation: "portrait", paperWidth: 0, paperHeight: 0 })
    expect(section.marginLeft).toBeCloseTo(25.4, 1)
    // The last section is landscape; Page Setup for the first shows the first's.
    expect(view.chrome.pageSetup.orientation).toBe("landscape")
    expect(sectionPageSetup(view.chrome.pageSetup, section).orientation).toBe("portrait")
    expect(sectionPageSetup(view.chrome.pageSetup, { ...section, orientation: undefined }).orientation).toBe(
      "landscape",
    )
  })

  it("writes a section's new paper and side margins into its own w:sectPr only", async () => {
    const { word, view, key } = await numbered()
    const sections = view.chrome.sections!.map((item) =>
      item.key === key
        ? { ...item, paper: "letter" as const, orientation: "landscape" as const, marginLeft: 30 }
        : item,
    )
    const { bytes, xml } = await save(word, view, { ...view.chrome, sections })
    const [first, last] = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(first).toMatch(/<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"\/>/)
    expect(first).toMatch(/<w:pgMar [^>]*w:right="1440"[^>]*w:left="1701"/)
    expect(last).toMatch(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/)
    expect(last).toMatch(/<w:pgMar [^>]*w:left="1440"/)

    const reopened = await openDocxBytes(bytes, "edited.docx")
    const section = reopened.view.chrome.sections![0]!
    expect(section).toMatchObject({ paper: "letter", orientation: "landscape", marginLeft: 30 })
  })

  it("opens each section's own columns, and writes a section's new ones into its own w:sectPr", async () => {
    const { word, view, key } = await numbered()
    const section = view.chrome.sections!.find((item) => item.key === key)!
    // f15: a one-column first section before the document's two columns.
    expect(section.columns).toBe(1)
    expect(view.chrome.pageSetup.columns).toBe(2)
    const untouched = await save(word, view)
    expect(untouched.xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)![0]).toMatch(/<w:cols w:space="708"\/>/)

    const sections = view.chrome.sections!.map((item) =>
      item.key === key ? { ...item, columns: 3, columnGap: 1, columnLine: true } : item,
    )
    const { bytes, xml } = await save(word, view, { ...view.chrome, sections })
    const [first, last] = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(first).toMatch(/<w:cols [^>]*w:num="3"/)
    expect(first).toMatch(/<w:cols [^>]*w:sep="1"/)
    expect(last).toMatch(/<w:cols w:num="2" w:space="708"\/>/)
    const reopened = await openDocxBytes(bytes, "edited.docx")
    expect(reopened.view.chrome.sections![0]).toMatchObject({ columns: 3, columnGap: 1, columnLine: true })
  })

  it("keeps a section's paper as written when untouched", async () => {
    const { word, view } = await numbered()
    const { xml } = await save(word, view)
    const [first] = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(first).toMatch(/<w:pgSz w:w="11906" w:h="16838"\/>/)
  })

  it("writes a section's new margins, first page and page numbers into its own w:sectPr", async () => {
    const { word, view, key } = await numbered()
    const sections = view.chrome.sections!.map((item) =>
      item.key === key
        ? { ...item, marginTop: 40, differentFirstPage: true, pageNumberStart: null, pageNumberFormat: "upperRoman" }
        : item,
    )
    const pageSetup = { ...view.chrome.pageSetup, pageNumberStart: 5, pageNumberFormat: "decimal" }
    const { bytes, xml } = await save(word, view, { ...view.chrome, sections, pageSetup })
    const [first, last] = xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)!
    expect(first).toMatch(/<w:pgMar [^>]*w:top="2268"/)
    expect(first).toMatch(/<w:titlePg\/>/)
    expect(first).toMatch(/<w:pgNumType w:fmt="upperRoman"\/>/)
    expect(last).toMatch(/<w:pgNumType w:start="5"\/>/)

    const reopened = await openDocxBytes(bytes, "edited.docx")
    const section = reopened.view.chrome.sections![0]!
    expect(section.marginTop).toBeCloseTo(40, 0)
    expect(section.differentFirstPage).toBe(true)
    expect(section.pageNumberStart).toBeNull()
    expect(section.pageNumberFormat).toBe("upperRoman")
    expect(reopened.view.chrome.pageSetup.pageNumberStart).toBe(5)
  })
})

describe("sections made in the editor and continuous ones", () => {
  const extensions = () => createExtensions().filter((extension) => extension.name !== "spellcheck")
  const body = (xml: string) => xml.replace(/^.*<w:body>/s, "")

  async function save(editor: Editor, opened: Awaited<ReturnType<typeof openDocxBytes>>, word = opened.word) {
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: opened.view.chrome,
      props: opened.view.props,
      word,
      unchanged: false,
      fileName: "edited.docx",
    })
    const pkg = await openPackage(saved.bytes, "edited.docx")
    return { bytes: saved.bytes, xml: body(decodeXml(findPart(pkg, pkg.mainPartName)!.data)) }
  }

  /** f15's package with a one-column title, a continuous break and two columns, as Word writes it. */
  async function titleAboveColumns() {
    const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, "f15_sections.docx"))), "f15.docx")
    const part = findPart(pkg, pkg.mainPartName)!
    const paper =
      '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>'
    const text = (value: string) => `<w:p><w:r><w:t>${value}</w:t></w:r></w:p>`
    const xml = decodeXml(part.data).replace(
      /<w:body>.*<\/w:body>/s,
      `<w:body><w:p><w:pPr><w:sectPr>${paper}<w:cols w:space="708"/></w:sectPr></w:pPr><w:r><w:t>TITLE</w:t></w:r></w:p>` +
        ["One", "Two", "Three"].map(text).join("") +
        `<w:sectPr><w:type w:val="continuous"/>${paper}<w:cols w:num="2" w:space="708"/></w:sectPr></w:body>`,
    )
    part.data = new TextEncoder().encode(xml)
    return openDocxBytes(await writePackage(pkg), "title.docx")
  }

  it("opens a title of one column above a continuous break as a block of one column, without a new page", async () => {
    const opened = await titleAboveColumns()
    expect(opened.view.html).toMatch(
      /^<div data-column-section="" data-columns="1" data-gap="1.25" class="column-section"><p[^>]*>.*TITLE/,
    )
    expect(opened.view.html).not.toContain("data-section-break")
    expect(opened.view.chrome.pageSetup.columns).toBe(2)
    const editor = new Editor({ extensions: extensions(), content: opened.view.html })
    editors.push(editor)
    // Saved as it was: Word's two w:sectPr, the body's continuous, nothing added.
    const { xml } = await save(editor, opened)
    expect(xml.match(/<w:sectPr\b/g)).toHaveLength(2)
    expect(xml).toMatch(/TITLE<\/w:t>/)
    expect(xml).toMatch(/<w:sectPr><w:type w:val="continuous"\/>.*<w:cols w:num="2"/)
    expect(xml).not.toMatch(/<w:p\b[^>]*\/>/)
  })

  it("saves a section break made in the editor, the break on the next section's w:type", async () => {
    const opened = await openDocxBytes(
      new Uint8Array(readFileSync(path.join(AUTHORED, "f15_sections.docx"))),
      "f15.docx",
    )
    for (const kind of ["nextPage", "continuous"] as const) {
      const editor = new Editor({ extensions: extensions(), content: "<p>one</p><p>two</p>" })
      editors.push(editor)
      editor.commands.setTextSelection(4)
      editor.commands.insertSectionBreak(kind)
      const { xml, bytes } = await save(
        editor,
        { ...opened, view: { ...opened.view, chrome: { ...opened.view.chrome, sections: [] } } },
        null as never,
      )
      // The section before the break ends at "one"; the body's section starts as the break says.
      expect(xml).toMatch(/<w:p><w:pPr><w:sectPr>(?!<w:type).*<\/w:sectPr><\/w:pPr><w:r><w:t>one/)
      expect(/<w:sectPr><w:type w:val="continuous"\/>[^]*<\/w:body>/.test(xml)).toBe(kind === "continuous")
      const back = await openDocxBytes(bytes, "back.docx")
      expect(back.view.html).toMatch(new RegExp(`one</span></p><div data-section-break="" data-kind="${kind}"`))
    }
  })

  it("saves Columns > Selected text as a continuous section of its own, and opens it as the block again", async () => {
    const opened = await openDocxBytes(
      new Uint8Array(readFileSync(path.join(AUTHORED, "f15_sections.docx"))),
      "f15.docx",
    )
    const editor = new Editor({ extensions: extensions(), content: opened.view.html })
    editors.push(editor)
    // "BEFORE" only, inside the first section.
    editor.commands.setTextSelection({ from: 2, to: 4 })
    applyColumnSection(editor, 3)
    const { xml, bytes } = await save(editor, opened)
    // Nothing lost: the block's text and the section break after it are there.
    expect(xml).toContain("BEFORE")
    expect(xml).toContain("portrait section")
    // The block's section has its 3 columns; the rest of the first section starts after it on the same page.
    expect(xml).toMatch(/<w:cols w:num="3"[^]*?BEFORE[^]*?<w:type w:val="continuous"\/>[^]*?portrait section/)
    const back = await openDocxBytes(bytes, "back.docx")
    expect(back.view.html).toMatch(
      /<div data-column-section="" data-columns="3"[^>]*><p[^>]*><span[^>]*>BEFORE<\/span><\/p><\/div><p/,
    )
    expect(back.view.html).toMatch(/portrait section.*data-kind="nextPage"/)
  })
})

describe("a section made in the editor", () => {
  afterEach(() => useDocumentStore.setState({ sections: [], linkedSlots: [] }))

  it("has the Page Setup and headers of the section it was put in, its own from then on, and is saved so", async () => {
    useDocumentStore.setState({
      sections: [],
      linkedSlots: [],
      pageSetup: { ...DEFAULT_PAGE_SETUP, paper: "a4", orientation: "portrait" },
      headerHtml: "<p>HEAD</p>",
    })
    const editor = new Editor({
      extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
      content: "<p>cover</p><p>body</p>",
    })
    editors.push(editor)
    editor.commands.setTextSelection(6)
    editor.commands.insertSectionBreak("nextPage")
    const state = useDocumentStore.getState()
    expect(state.sections).toHaveLength(1)
    const cover = state.sections[0]!
    expect(cover).toMatchObject({ orientation: "portrait", parts: { header: "<p>HEAD</p>" } })
    // Its own Page Setup now: the cover landscape, the rest as it was.
    state.setSectionSetup(cover.key, { orientation: "landscape", marginLeft: 30 })
    const now = useDocumentStore.getState()
    const saved = await saveDocxBytes({
      json: editor.getJSON(),
      chrome: {
        header: now.headerHtml,
        footer: now.footerHtml,
        differentFirstPage: now.differentFirstPage,
        firstHeader: now.firstHeaderHtml,
        evenHeader: now.evenHeaderHtml,
        firstFooter: now.firstFooterHtml,
        evenFooter: now.evenFooterHtml,
        pageSetup: now.pageSetup,
        sections: now.sections,
        linked: now.linkedSlots,
      },
      props: {},
      word: null,
      unchanged: false,
      fileName: "new.docx",
    })
    const pkg = await openPackage(saved.bytes, "new.docx")
    const xml = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
    const [first, body] = [...xml.matchAll(/<w:sectPr\b[^]*?<\/w:sectPr>/g)].map((match) => match[0])
    expect(first).toMatch(/w:orient="landscape"/)
    expect(first).toMatch(/w:left="1701"/)
    expect(first).toMatch(/<w:headerReference w:type="default"/)
    expect(body).not.toMatch(/landscape/)
    const back = await openDocxBytes(saved.bytes, "new.docx")
    expect(back.view.chrome.sections?.[0]).toMatchObject({
      orientation: "landscape",
      parts: { header: expect.stringContaining("HEAD") },
    })
  })
})
