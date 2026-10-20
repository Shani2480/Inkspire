import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { paragraphText, paragraphsIn, type Paragraph, type RunContent } from "@/document/docx/model"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"

const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")

async function roundTrip(name: string) {
  const bytes = new Uint8Array(readFileSync(path.join(AUTHORED, name)))
  const original = await openPackage(bytes, name)
  const doc = readDocument(original)
  const written = await openPackage(await writePackage(writeDocument(doc)), name)
  return { doc, original, written }
}

function partXml(pkg: Awaited<ReturnType<typeof openPackage>>, partName: string) {
  const part = findPart(pkg, partName)
  if (!part) {
    throw new Error(`Missing part ${partName}`)
  }
  return decodeXml(part.data)
}

/** Drop revision and paragraph ids. Everything else in the part has to match Word. */
function normalize(xml: string) {
  return xml.replace(/<([A-Za-z0-9:]+)((?:\s+[A-Za-z0-9:]+="[^"]*")*)\s*(\/?)>/g, (_match, name, attrs, slash) => {
    const kept = String(attrs).replace(/\s+(?:w:rsid[A-Za-z0-9]*|w14:paraId|w14:textId)="[^"]*"/g, "")
    const trimmed = kept.trim()
    return `<${name}${trimmed ? ` ${trimmed}` : ""}${slash}>`
  })
}

function expectParts(
  original: Awaited<ReturnType<typeof openPackage>>,
  written: Awaited<ReturnType<typeof openPackage>>,
  names: string[],
) {
  for (const name of names) {
    expect(normalize(partXml(written, name)), name).toBe(normalize(partXml(original, name)))
  }
}

function contentKinds(paragraph: Paragraph) {
  const kinds: RunContent["kind"][] = []
  for (const inline of paragraph.inlines) {
    if (inline.kind !== "run") {
      continue
    }
    for (const content of inline.content) {
      kinds.push(content.kind)
    }
  }
  return kinds
}

describe("notes, comments, revisions and links", () => {
  it("f08", async () => {
    const { doc, original, written } = await roundTrip("f08_footnote_endnote.docx")
    expectParts(original, written, ["/word/document.xml", "/word/footnotes.xml", "/word/endnotes.xml"])
    const body = paragraphsIn(doc.blocks)
    expect(body.map(paragraphText)).toEqual(["BEFORE", "text with footnote and endnote", "AFTER"])
    expect(contentKinds(body[1]!)).toEqual(["text", "footnoteReference", "text", "endnoteReference"])
    expect(doc.settings.footnotePr).toEqual([-1, 0])
    expect(doc.settings.endnotePr).toEqual([-1, 0])
    expect(doc.footnotes?.items.map((note) => note.type ?? note.id)).toEqual(["separator", "continuationSeparator", 1])
    expect(paragraphText(paragraphsIn(doc.footnotes?.items[2]?.blocks ?? [])[0]!)).toBe(" FOOTNOTE-TEXT")
    expect(paragraphText(paragraphsIn(doc.endnotes?.items[2]?.blocks ?? [])[0]!)).toBe(" ENDNOTE-TEXT")
  })

  it("f09", async () => {
    const { doc, original, written } = await roundTrip("f09_comment.docx")
    expectParts(original, written, [
      "/word/document.xml",
      "/word/comments.xml",
      "/word/commentsExtended.xml",
      "/word/commentsIds.xml",
      "/word/commentsExtensible.xml",
      "/word/people.xml",
    ])
    const commented = paragraphsIn(doc.blocks)[1]
    expect(paragraphText(commented!)).toBe("commented text")
    expect(
      commented?.inlines.filter((inline) => inline.kind === "commentRangeStart").map((inline) => inline.id),
    ).toEqual([0, 1])
    expect(doc.comments?.items.map((comment) => paragraphText(paragraphsIn(comment.blocks)[0]!))).toEqual([
      "COMMENT-TEXT",
      "REPLY-TEXT",
    ])
    expect(doc.comments?.extended).toEqual([
      { paraId: "47789C69", done: false },
      { paraId: "304E9895", parentParaId: "47789C69", done: false },
    ])
    expect(doc.comments?.ids).toEqual([
      { paraId: "47789C69", durableId: "0D0FF904" },
      { paraId: "304E9895", durableId: "17B4194B" },
    ])
    expect(doc.comments?.extensible?.map((item) => item.dateUtc)).toEqual([
      "2026-10-17T10:08:00Z",
      "2026-10-17T10:08:00Z",
    ])
    expect(doc.people?.items).toEqual([
      { author: "Author Name", providerId: "Windows Live", userId: "0000000000000000" },
    ])
  })

  it("f10", async () => {
    const { doc, original, written } = await roundTrip("f10_tracked_changes.docx")
    expectParts(original, written, ["/word/document.xml", "/word/people.xml"])
    const changed = paragraphsIn(doc.blocks)[1]
    expect(paragraphText(changed!)).toBe("keep delete-me keep INSERTED")
    const deletion = changed?.inlines.find((inline) => inline.kind === "del")
    const insertion = changed?.inlines.find((inline) => inline.kind === "ins")
    expect(deletion?.kind === "del" && deletion.id).toBe(1)
    expect(insertion?.kind === "ins" && insertion.author).toBe("Author Name")
    const formatted = changed?.inlines.find((inline) => inline.kind === "run")
    expect(formatted?.kind === "run" && formatted.rPr.rPrChange?.id).toBe(0)
    expect(formatted?.kind === "run" && formatted.rPr.rPrChange?.rPr).toEqual({})
    const after = paragraphsIn(doc.blocks)[2]
    expect(after?.markRPr.rPrChange?.id).toBe(6)
    expect(doc.people?.items[0]?.author).toBe("Author Name")
  })

  it("f11", async () => {
    const { doc, original, written } = await roundTrip("f11_hyperlink_bookmark.docx")
    expectParts(original, written, ["/word/document.xml"])
    const paragraphs = paragraphsIn(doc.blocks)
    expect(paragraphs.map(paragraphText)).toEqual(["BEFORE", "external link", "bookmarked", "internal link", "AFTER"])
    const external = paragraphs[1]?.inlines[0]
    expect(external?.kind).toBe("hyperlink")
    if (external?.kind === "hyperlink") {
      expect(external.relId).toBe("rId4")
      expect(external.target).toBe("https://example.com/probe?a=1&b=2")
      expect(external.history).toBe(true)
    }
    const bookmark = paragraphs[2]?.inlines.find((inline) => inline.kind === "bookmarkStart")
    expect(bookmark?.kind === "bookmarkStart" && bookmark.name).toBe("ProbeMark")
    const internal = paragraphs[3]?.inlines[0]
    expect(internal?.kind === "hyperlink" && internal.anchor).toBe("ProbeMark")
  })
})
