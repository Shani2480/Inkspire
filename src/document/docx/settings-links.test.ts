import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { openPackage, relationshipsFor } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"

const FIXTURE = path.resolve(process.cwd(), "tests/docx-fixtures/cases/r08_external_template.docx")

describe("the settings part's own links", () => {
  it("keeps the attached template's relationship, which settings.xml refers to by id", async () => {
    const opened = await openDocxBytes(new Uint8Array(readFileSync(FIXTURE)), "template.docx")
    const saved = await saveDocxBytes({
      json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "MARKER-BASE" }] }] },
      chrome: opened.view.chrome,
      props: opened.view.props,
      word: opened.word,
      unchanged: false,
      fileName: "template.docx",
    })
    const pkg = await openPackage(saved.bytes, "template.docx")
    const settings = pkg.parts.find((part) => part.name === "/word/settings.xml")!
    const id = /<w:attachedTemplate r:id="([^"]+)"/.exec(decodeXml(settings.data))?.[1]
    expect(id).toBeTruthy()
    expect(relationshipsFor(pkg, "/word/settings.xml")).toEqual([
      expect.objectContaining({ id, targetMode: "External", type: expect.stringMatching(/attachedTemplate$/) }),
    ])
  })
})
