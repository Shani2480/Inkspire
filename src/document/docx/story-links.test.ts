import { readFileSync } from "node:fs"
import path from "node:path"
import { Editor } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { chromeText, pageFieldHtml } from "@/document/chrome-html"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, relationshipsFor, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { createExtensions } from "@/editor/extensions"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
const HYPERLINK_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"
// A 1×1 transparent PNG.
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (char) => char.charCodeAt(0),
)

/** A floating picture as Word writes one in a header: anchored to the column, 4 cm × 2 cm, 12 cm from the left. */
const FLOATING_LOGO =
  `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="1" ` +
  `behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/>` +
  `<wp:positionH relativeFrom="column"><wp:posOffset>4320000</wp:posOffset></wp:positionH>` +
  `<wp:positionV relativeFrom="paragraph"><wp:posOffset>-180000</wp:posOffset></wp:positionV>` +
  `<wp:extent cx="1440000" cy="720000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/>` +
  `<wp:docPr id="7" name="Logo"/><wp:cNvGraphicFramePr/>` +
  `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
  `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
  `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.png"/>` +
  `<pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
  `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1440000" cy="720000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/>` +
  `</a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`

const editors: Editor[] = []

/** Drops revision and paragraph ids, which Word regenerates anyway. */
function normalize(xml: string) {
  return xml.replace(/<([A-Za-z0-9:]+)((?:\s+[A-Za-z0-9:]+="[^"]*")*)\s*(\/?)>/g, (_match, name, attrs, slash) => {
    const kept = String(attrs)
      .replace(/\s+(?:w:rsid[A-Za-z0-9]*|w14:paraId|w14:textId)="[^"]*"/g, "")
      .trim()
    return `<${name}${kept ? ` ${kept}` : ""}${slash}>`
  })
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

/** f07 with a floating logo in the default header and an external link in the default footer. */
export async function headerWithLogo() {
  const name = "f07_header_footer.docx"
  const pkg = await openPackage(new Uint8Array(readFileSync(path.join(AUTHORED, name))), name)
  const edit = (partName: string, insert: string) => {
    const part = findPart(pkg, partName)!
    const xml = decodeXml(part.data).replace(/(<w:p\b[^>]*>(?:<w:pPr>.*?<\/w:pPr>)?)/, `$1${insert}`)
    part.data = new TextEncoder().encode(xml)
  }
  const header = defaultStory(pkg, "header")
  const footer = defaultStory(pkg, "footer")
  edit(header, FLOATING_LOGO)
  edit(footer, `<w:hyperlink r:id="rId1"><w:r><w:t>example.com</w:t></w:r></w:hyperlink>`)
  pkg.parts.push({ name: "/word/media/logo.png", contentType: "image/png", data: PNG } as (typeof pkg.parts)[number])
  pkg.relationships.push(
    {
      source: header,
      items: [
        {
          id: "rId1",
          type: IMAGE_REL,
          target: "media/logo.png",
          targetMode: "Internal",
          partName: "/word/media/logo.png",
        },
      ],
    },
    {
      source: footer,
      items: [
        { id: "rId1", type: HYPERLINK_REL, target: "https://example.com/", targetMode: "External", partName: null },
      ],
    },
  )
  return { bytes: await writePackage(pkg), header, footer }
}

/** Part name of the default header or footer, from the body's final sectPr. */
function defaultStory(pkg: Awaited<ReturnType<typeof openPackage>>, kind: "header" | "footer") {
  const xml = decodeXml(findPart(pkg, pkg.mainPartName)!.data)
  const sectPr = xml.slice(xml.lastIndexOf("<w:sectPr"))
  const id = new RegExp(`<w:${kind}Reference w:type="default" r:id="([^"]+)"`).exec(sectPr)?.[1]
  return relationshipsFor(pkg, pkg.mainPartName).find((item) => item.id === id)!.partName!
}

async function editAndSave(
  bytes: Uint8Array,
  change?: (chrome: Awaited<ReturnType<typeof openDocxBytes>>["view"]["chrome"]) => void,
) {
  const opened = await openDocxBytes(bytes, "story.docx")
  const editor = new Editor({
    extensions: createExtensions().filter((extension) => extension.name !== "spellcheck"),
    content: opened.view.html,
  })
  editors.push(editor)
  editor
    .chain()
    .insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: "edited" }] })
    .run()
  const chrome = structuredClone(opened.view.chrome)
  change?.(chrome)
  const saved = await saveDocxBytes({
    json: editor.getJSON(),
    chrome,
    props: opened.view.props,
    word: opened.word,
    unchanged: false,
    fileName: "story.docx",
  })
  return openPackage(saved.bytes, "story.docx")
}

describe("headers and footers keep their own relationships", () => {
  it("keeps a header picture and a footer link after an edit in the body", async () => {
    const { bytes, header, footer } = await headerWithLogo()
    const original = await openPackage(bytes, "story.docx")
    const saved = await editAndSave(bytes)
    for (const part of [header, footer]) {
      expect(normalize(decodeXml(findPart(saved, part)!.data)), part).toBe(
        normalize(decodeXml(findPart(original, part)!.data)),
      )
    }
    const picture = relationshipsFor(saved, header).find((item) => item.id === "rId1")
    expect(picture?.type).toBe(IMAGE_REL)
    expect(findPart(saved, picture!.partName!)?.data).toEqual(PNG)
    const link = relationshipsFor(saved, footer).find((item) => item.id === "rId1")
    expect(link).toMatchObject({ type: HYPERLINK_REL, target: "https://example.com/", targetMode: "External" })
    const body = relationshipsFor(saved, "/word/document.xml")
    expect(body.some((item) => item.target === "https://example.com/")).toBe(false)
  })

  it("keeps the header picture when the header text is edited", async () => {
    const { bytes, header } = await headerWithLogo()
    const saved = await editAndSave(bytes, (chrome) => {
      expect(chrome.header).toContain("HEADER-TEXT")
      chrome.header = chrome.header.replace("HEADER-TEXT", "New header text")
    })
    const xml = decodeXml(findPart(saved, header)!.data)
    expect(xml).toContain("New header text")
    expect(xml).toContain('r:embed="rId1"')
    expect(relationshipsFor(saved, header).find((item) => item.id === "rId1")?.type).toBe(IMAGE_REL)
  })

  it("shows a header picture in the header as a picture, as in the body", async () => {
    const { bytes } = await headerWithLogo()
    const opened = await openDocxBytes(bytes, "story.docx")
    const root = new DOMParser().parseFromString(opened.view.chrome.header, "text/html")
    const logo = root.querySelector("img")!
    expect(logo.getAttribute("src")?.startsWith("data:image/png;base64,")).toBe(true)
    // 4 cm × 2 cm.
    expect(Number(logo.getAttribute("width"))).toBeCloseTo(1440000 / 9525, 0)
    expect(Number(logo.getAttribute("height"))).toBeCloseTo(720000 / 9525, 0)
    expect(opened.view.chrome.header).toContain("HEADER-TEXT")
  })

  it("keeps a floating header picture floating, where it was, and sends it behind the text when asked", async () => {
    const { bytes, header } = await headerWithLogo()
    const opened = await openDocxBytes(bytes, "story.docx")
    expect(opened.view.chrome.header).toMatch(/data-wrap="front"/)
    const saved = await editAndSave(bytes, (chrome) => {
      chrome.header = chrome.header.replace('data-wrap="front"', 'data-wrap="behind"')
    })
    const xml = decodeXml(findPart(saved, header)!.data)
    expect(xml).toContain("<wp:anchor")
    expect(xml).toContain('behindDoc="1"')
    // The offsets come back to the pixel: 12 cm across, a little above its paragraph.
    const offsets = [...xml.matchAll(/<wp:posOffset>(-?\d+)<\/wp:posOffset>/g)].map((match) => Number(match[1]))
    expect(offsets[0]).toBeCloseTo(4320000, -5)
    expect(offsets[1]).toBeCloseTo(-180000, -5)
  })

  it("saves page number, page count and date fields as Word's fields, and shows them again as fields", async () => {
    const { bytes, footer } = await headerWithLogo()
    const date = '<span data-date-field data-date-format="date" class="date-field">1/1/2026</span>'
    const saved = await editAndSave(bytes, (chrome) => {
      chrome.footer = `<p>Page ${pageFieldHtml("page")} of ${pageFieldHtml("pages")} on ${date}</p>`
    })
    const xml = decodeXml(findPart(saved, footer)!.data)
    expect(xml).toMatch(/<w:fldSimple[^>]*w:instr=" PAGE "/)
    expect(xml).toMatch(/<w:fldSimple[^>]*w:instr=" NUMPAGES "/)
    expect(xml).toMatch(/<w:fldSimple[^>]*w:instr=" DATE \\@ &quot;M\/d\/yyyy&quot; "/)
    const again = await openDocxBytes(await writePackage(saved), "story.docx")
    expect(again.view.chrome.footer).toContain('data-page-field="page"')
    expect(again.view.chrome.footer).toContain('data-page-field="pages"')
  })

  it("saves a picture added to a header as a picture of that header part", async () => {
    const { bytes, header, footer } = await headerWithLogo()
    const added = `<p>Footer</p><img src="data:image/png;base64,${btoa(String.fromCharCode(...PNG))}" width="40" height="20">`
    const saved = await editAndSave(bytes, (chrome) => {
      chrome.footer = added
    })
    const xml = decodeXml(findPart(saved, footer)!.data)
    expect(xml).toContain("<w:drawing")
    const picture = relationshipsFor(saved, footer).find((item) => item.type === IMAGE_REL)
    expect(findPart(saved, picture!.partName!)?.data).toEqual(PNG)
    const names = new Set(saved.parts.map((part) => part.name))
    expect(names.size).toBe(saved.parts.length)
    expect(relationshipsFor(saved, header).some((item) => item.type === IMAGE_REL)).toBe(true)
  })

  it("shows the page number field of a footer and keeps it when its text is edited", async () => {
    const { bytes, footer } = await headerWithLogo()
    const opened = await openDocxBytes(bytes, "story.docx")
    // The number is a field in the footer, drawn as the number of the page it is on.
    expect(chromeText(opened.view.chrome.footer)).toBe("example.comPage 1")
    expect(opened.view.chrome.footer).toContain('data-page-field="page"')
    expect(opened.view.chrome.pageSetup.pageNumber).toBe("none")
    const saved = await editAndSave(bytes, (chrome) => {
      chrome.footer = chrome.footer.replace(">example.com<", ">Sheet<")
    })
    const xml = decodeXml(findPart(saved, footer)!.data)
    expect(xml).toContain("Sheet")
    expect(xml).toMatch(/PAGE/)
    expect(xml).toContain('<w:t xml:space="preserve">Page </w:t>')
  })
})
