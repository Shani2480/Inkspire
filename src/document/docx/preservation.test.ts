import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { findPart, openPackage, relationshipsFor, writePackage } from "@/document/docx/opc"
import { readDocument } from "@/document/docx/wml-read"
import { writeDocument } from "@/document/docx/wml-write"

const CASES = path.resolve(process.cwd(), "tests/docx-fixtures/cases")
const AUTHORED = path.resolve(process.cwd(), "tests/docx-fixtures/authored")
const WRITTEN = path.resolve(process.cwd(), "tmp/docx-written")

async function roundTrip(name: string) {
  const bytes = new Uint8Array(readFileSync(path.join(CASES, name)))
  const original = await openPackage(bytes, name)
  const doc = readDocument(original)
  const written = await openPackage(await writePackage(writeDocument(doc, name)), name)
  return { original, written }
}

describe("preserved parts", () => {
  it("r09", async () => {
    const { original, written } = await roundTrip("r09_unknown_part_preserved.docx")
    const blob = findPart(written, "/word/probe/blob.xml")
    expect(blob?.contentType).toBe("application/vnd.example.probe+xml")
    expect(blob?.data).toEqual(findPart(original, "/word/probe/blob.xml")?.data)
    expect(relationshipsFor(written, "/word/document.xml").find((item) => item.id === "rId3")).toMatchObject({
      type: "http://example.com/probe/relationships/blob",
      target: "probe/blob.xml",
      partName: "/word/probe/blob.xml",
    })
    expect(written.zipEntries[written.zipEntries.length - 1]?.normalizedName).toBe("word/probe/blob.xml")
  })

  it("r10", async () => {
    const { original, written } = await roundTrip("r10_unknown_package_part.docx")
    const root = findPart(written, "/probe/root.xml")
    expect(root?.contentType).toBe("application/vnd.example.root+xml")
    expect(root?.data).toEqual(findPart(original, "/probe/root.xml")?.data)
    expect(relationshipsFor(written, "").find((item) => item.id === "rId2")).toMatchObject({
      type: "http://example.com/probe/relationships/root",
      target: "probe/root.xml",
      partName: "/probe/root.xml",
    })
    expect(written.zipEntries[written.zipEntries.length - 1]?.normalizedName).toBe("probe/root.xml")
  })

  it("writes every document the reader accepts", async () => {
    rmSync(WRITTEN, { recursive: true, force: true })
    mkdirSync(WRITTEN, { recursive: true })
    const files = [CASES, AUTHORED].flatMap((directory) =>
      readdirSync(directory)
        .filter((name) => name.endsWith(".docx"))
        .map((name) => path.join(directory, name)),
    )
    let count = 0
    for (const file of files) {
      const name = path.basename(file)
      let opened: Awaited<ReturnType<typeof openPackage>>
      try {
        opened = await openPackage(new Uint8Array(readFileSync(file)), name)
      } catch {
        continue
      }
      let doc: ReturnType<typeof readDocument>
      try {
        doc = readDocument(opened)
      } catch {
        continue
      }
      writeFileSync(path.join(WRITTEN, name), await writePackage(writeDocument(doc, name)))
      count += 1
    }
    expect(count).toBeGreaterThan(20)
  })
})
