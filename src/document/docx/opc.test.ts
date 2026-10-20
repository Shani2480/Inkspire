import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  CONTENT_TYPE_DOCUMENT,
  findPart,
  openPackage,
  relationshipsFor,
  writePackage,
  type OpcError,
} from "@/document/docx/opc"
import { readZip, writeZip, ZIP_FIXED_DOS_STAMP } from "@/document/docx/zip"

const CASES = path.resolve(process.cwd(), "tests/docx-fixtures/cases")
const RESULTS = path.resolve(process.cwd(), "tests/docx-fixtures/results")

function caseFile(id: string) {
  const match = readdirSync(CASES).find((name) => name.startsWith(`${id}_`) && name.endsWith(".docx"))
  if (!match) {
    throw new Error(`Missing fixture ${id}`)
  }
  return match
}

function caseBytes(id: string) {
  return new Uint8Array(readFileSync(path.join(CASES, caseFile(id))))
}

function openCase(id: string) {
  const file = caseFile(id)
  return openPackage(caseBytes(id), file)
}

async function openError(id: string) {
  try {
    await openCase(id)
  } catch (error) {
    return error as OpcError
  }
  throw new Error(`${id} opened`)
}

describe("docx package", () => {
  it("opens every case Word opens", async () => {
    const files = readdirSync(CASES).filter((name) => name.endsWith(".docx"))
    const failures: string[] = []
    for (const file of files) {
      const verdict = JSON.parse(
        readFileSync(path.join(RESULTS, file.replace(/\.docx$/, ".json")), "utf8").replace(/^\uFEFF/, ""),
      ) as {
        open: { ok: boolean }
      }
      if (!verdict.open.ok) {
        continue
      }
      try {
        const pkg = await openPackage(new Uint8Array(readFileSync(path.join(CASES, file))), file)
        if (!findPart(pkg, pkg.mainPartName)) {
          failures.push(`${file} has no main part`)
        }
      } catch (error) {
        failures.push(`${file}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    expect(failures).toEqual([])
  })

  it("00", async () => {
    const pkg = await openCase("00")
    expect(pkg.mainPartName).toBe("/word/document.xml")
    expect(findPart(pkg, pkg.mainPartName)?.contentType).toBe(CONTENT_TYPE_DOCUMENT)
    expect(relationshipsFor(pkg, "").some((item) => item.partName === "/word/document.xml")).toBe(true)
  })

  it("z01", async () => {
    const pkg = await openCase("z01")
    expect(pkg.zipEntries.length).toBeGreaterThan(0)
    expect(pkg.zipEntries.every((entry) => entry.compressionMethod === 0)).toBe(true)
  })

  it("z02", async () => {
    const pkg = await openCase("z02")
    expect(pkg.zipEntries.some((entry) => entry.dataDescriptor)).toBe(true)
    expect(findPart(pkg, "/word/document.xml")?.data.length).toBeGreaterThan(0)
  })

  it("z03", async () => {
    const pkg = await openCase("z03")
    expect(pkg.zipEntries.every((entry) => entry.zip64)).toBe(true)
  })

  it("z04", async () => {
    const pkg = await openCase("z04")
    expect(pkg.warnings.some((warning) => warning.code === "crc" && warning.partName === "/word/document.xml")).toBe(
      true,
    )
    expect(findPart(pkg, "/word/document.xml")?.data.length).toBeGreaterThan(0)
  })

  it("z05", async () => {
    const pkg = await openCase("z05")
    expect(pkg.warnings.some((warning) => warning.code === "crc" && warning.partName === "/word/styles.xml")).toBe(true)
    expect(pkg.warnings.some((warning) => warning.code === "crc" && warning.partName === "/word/document.xml")).toBe(
      false,
    )
  })

  it("z06", async () => {
    const pkg = await openCase("z06")
    expect(pkg.zipEntries.some((entry) => entry.name.includes("\\"))).toBe(true)
    expect(pkg.parts.every((part) => !part.name.includes("\\"))).toBe(true)
    expect(findPart(pkg, "/word/document.xml")).toBeTruthy()
    expect(findPart(pkg, "/word/styles.xml")).toBeTruthy()
  })

  it("z07", async () => {
    const pkg = await openCase("z07")
    expect(pkg.zipEntries.at(-1)?.normalizedName).toBe("[Content_Types].xml")
    expect(pkg.mainPartName).toBe("/word/document.xml")
  })

  it("c01", async () => {
    const error = await openError("c01")
    expect(error.code).toBe("missing-content-types")
  })

  it("c02", async () => {
    const error = await openError("c02")
    expect(error.code).toBe("content-type-mismatch")
  })

  it("c03", async () => {
    const error = await openError("c03")
    expect(error.code).toBe("content-type-mismatch")
  })

  it("c04", async () => {
    const error = await openError("c04")
    expect(error.code).toBe("content-type-mismatch")
  })

  it("c05", async () => {
    const pkg = await openCase("c05")
    expect(findPart(pkg, "/word/document.xml")?.contentType).toBe(CONTENT_TYPE_DOCUMENT)
  })

  it("c06", async () => {
    const pkg = await openCase("c06")
    expect(
      pkg.warnings.some(
        (warning) => warning.code === "missing-content-type" && warning.partName === "/word/styles.xml",
      ),
    ).toBe(true)
    expect(findPart(pkg, "/word/styles.xml")?.data.length).toBeGreaterThan(0)
  })

  it("r01", async () => {
    const pkg = await openCase("r01")
    const office = relationshipsFor(pkg, "").find((item) => item.partName === "/word/document.xml")
    expect(office?.target).toBe("/word/document.xml")
  })

  it("r02", async () => {
    const pkg = await openCase("r02")
    expect(pkg.mainPartName).toBe("/content/main.xml")
    expect(findPart(pkg, "/word/document.xml")).toBeUndefined()
  })

  it("r03", async () => {
    const pkg = await openCase("r03")
    expect(pkg.warnings.some((warning) => warning.code === "unsafe-part-name")).toBe(true)
    expect(findPart(pkg, "/word/my styles.xml")).toBeTruthy()
    const styles = relationshipsFor(pkg, "/word/document.xml").find((item) => item.target === "my%20styles.xml")
    expect(styles?.partName).toBe("/word/my styles.xml")
  })

  it("r04", async () => {
    const pkg = await openCase("r04")
    const styles = relationshipsFor(pkg, "/word/document.xml").find((item) => item.target === "Styles.XML")
    expect(styles?.partName).toBe("/word/styles.xml")
  })

  it("r05", async () => {
    const pkg = await openCase("r05")
    expect(pkg.mainPartName).toBe("/word/document.xml")
  })

  it("r06", async () => {
    const pkg = await openCase("r06")
    const styles = relationshipsFor(pkg, "/word/document.xml").find((item) => item.type.endsWith("/styles"))
    expect(styles?.partName).toBeNull()
    expect(findPart(pkg, "/word/styles.xml")).toBeUndefined()
    expect(findPart(pkg, "/word/settings.xml")).toBeTruthy()
  })

  it("r07", async () => {
    const pkg = await openCase("r07")
    expect(pkg.warnings.some((warning) => warning.code === "duplicate-relationship-id")).toBe(true)
    const items = relationshipsFor(pkg, "/word/document.xml")
    expect(items.filter((item) => item.id === "rId1")).toHaveLength(2)
  })

  it("r08", async () => {
    const pkg = await openCase("r08")
    const template = relationshipsFor(pkg, "/word/settings.xml").find((item) => item.type.endsWith("/attachedTemplate"))
    expect(template?.targetMode).toBe("External")
    expect(template?.target).toContain("file://")
    expect(template?.partName).toBeNull()
  })

  it("r09", async () => {
    const pkg = await openCase("r09")
    const blob = findPart(pkg, "/word/probe/blob.xml")
    expect(blob?.contentType).toBe("application/vnd.example.probe+xml")
    const rel = relationshipsFor(pkg, "/word/document.xml").find((item) => item.partName === "/word/probe/blob.xml")
    expect(rel?.id).toBe("rId3")
    const written = await writePackage(pkg)
    const again = await openPackage(written, "r09_unknown_part_preserved.docx")
    expect(findPart(again, "/word/probe/blob.xml")?.data).toEqual(blob?.data)
    expect(findPart(again, "/word/probe/blob.xml")?.contentType).toBe("application/vnd.example.probe+xml")
    expect(again.zipEntries.map((entry) => entry.normalizedName).at(-1)).toBe("word/probe/blob.xml")
  })

  it("r10", async () => {
    const pkg = await openCase("r10")
    const root = relationshipsFor(pkg, "").find((item) => item.partName === "/probe/root.xml")
    expect(root?.type).toBe("http://example.com/probe/relationships/root")
    expect(findPart(pkg, "/probe/root.xml")?.contentType).toBe("application/vnd.example.root+xml")
  })

  it("writes deflate xml, stored images, and no zip64", async () => {
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
    const bytes = await writeZip([
      { name: "word/document.xml", data: new TextEncoder().encode("<w:document/>"), stored: false },
      { name: "word/media/picture.png", data: png, stored: true },
    ])
    const entries = await readZip(bytes)
    expect(entries.map((entry) => entry.normalizedName)).toEqual(["word/document.xml", "word/media/picture.png"])
    expect(entries[0]?.compressionMethod).toBe(8)
    expect(entries[0]?.rawBitFlag & 0x0006).toBe(0x0006)
    expect(entries[1]?.compressionMethod).toBe(0)
    expect(entries.every((entry) => !entry.zip64 && !entry.dataDescriptor)).toBe(true)
    expect(entries.every((entry) => entry.rawLastModDate === ZIP_FIXED_DOS_STAMP)).toBe(true)
    expect(entries[1]?.data).toEqual(png)
  })

  it("writes content types first and keeps the main part", async () => {
    const pkg = await openCase("00")
    const bytes = await writePackage(pkg)
    const entries = await readZip(bytes)
    expect(entries.map((entry) => entry.normalizedName).slice(0, 4)).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/_rels/document.xml.rels",
    ])
    const again = await openPackage(bytes, "00_baseline.docx")
    expect(again.mainPartName).toBe("/word/document.xml")
    expect(findPart(again, "/word/document.xml")?.data).toEqual(findPart(pkg, "/word/document.xml")?.data)
    expect(again.warnings.filter((warning) => warning.code === "crc")).toEqual([])
  })
})
