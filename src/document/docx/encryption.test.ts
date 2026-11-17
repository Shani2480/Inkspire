import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { isCompoundFile, readCompoundFile, writeCompoundFile } from "@/document/docx/cfb"
import { decryptPackage, encryptPackage, EncryptionError, isEncryptedPackage } from "@/document/docx/encryption"
import { openDocxBytes } from "@/document/docx/io"
import { sha512 } from "@/document/docx/sha512"

function bytes(length: number, seed = 1) {
  const out = new Uint8Array(length)
  let value = seed
  for (let i = 0; i < length; i += 1) {
    value = (value * 1103515245 + 12345) >>> 0
    out[i] = value >>> 24
  }
  return out
}

describe("SHA-512", () => {
  it("matches the standard digest at every padding boundary", () => {
    for (const length of [0, 1, 64, 111, 112, 127, 128, 129, 1000]) {
      const data = bytes(length, length + 1)
      expect(Buffer.from(sha512(data)).toString("hex")).toBe(createHash("sha512").update(data).digest("hex"))
    }
  })
})

describe("compound files", () => {
  it("writes small and large streams, in storages, and reads them back", () => {
    const streams = new Map([
      ["Small", bytes(100)],
      ["Empty", new Uint8Array(0)],
      ["Exactly4096", bytes(4096, 7)],
      ["Large", bytes(70_000, 3)],
      ["\u0006DataSpaces/Version", bytes(76, 4)],
      ["\u0006DataSpaces/TransformInfo/StrongEncryptionTransform/\u0006Primary", bytes(200, 5)],
    ])
    const file = writeCompoundFile(streams)
    expect(isCompoundFile(file)).toBe(true)
    const read = readCompoundFile(file)
    for (const [path, data] of streams) {
      expect(read.get(path), path).toEqual(data)
    }
  })

  it("chains the FAT through DIFAT sectors past 109 FAT sectors (about 7 MB)", () => {
    const big = bytes(8_000_000, 9)
    const read = readCompoundFile(writeCompoundFile(new Map([["Big", big]])))
    expect(read.get("Big")!.length).toBe(big.length)
    expect(read.get("Big")!.subarray(7_999_000)).toEqual(big.subarray(7_999_000))
  })
})

// Each password is hashed 100,000 times, as Word does; slow under a full parallel run.
describe("Encrypt with Password", { timeout: 60_000 }, () => {
  it("encrypts a package and opens it with the password only", async () => {
    const pkg = bytes(10_000, 11)
    const file = await encryptPackage(pkg, "Pässword 1")
    expect(isEncryptedPackage(file)).toBe(true)
    const streams = readCompoundFile(file)
    expect([...streams.keys()].sort()).toEqual([
      "\u0006DataSpaces/DataSpaceInfo/StrongEncryptionDataSpace",
      "\u0006DataSpaces/DataSpaceMap",
      "\u0006DataSpaces/TransformInfo/StrongEncryptionTransform/\u0006Primary",
      "\u0006DataSpaces/Version",
      "EncryptedPackage",
      "EncryptionInfo",
    ])
    expect(streams.get("\u0006DataSpaces/TransformInfo/StrongEncryptionTransform/\u0006Primary")!.length).toBe(200)
    expect(streams.get("\u0006DataSpaces/DataSpaceMap")!.length).toBe(112)
    expect(await decryptPackage(file, "Pässword 1")).toEqual(pkg)
    await expect(decryptPackage(file, "password 1")).rejects.toMatchObject({ code: "wrong-password" })
    await expect(decryptPackage(file, "")).rejects.toBeInstanceOf(EncryptionError)
  })

  it("keeps a package that is not a whole number of segments or blocks", async () => {
    for (const length of [1, 15, 4096, 4097, 8195]) {
      const pkg = bytes(length, length)
      expect(await decryptPackage(await encryptPackage(pkg, "x"), "x")).toEqual(pkg)
    }
  })
})

describe("a document Word encrypted", { timeout: 60_000 }, () => {
  const file = new Uint8Array(readFileSync(path.resolve(process.cwd(), "tests/docx-fixtures/encrypted/word-password-Wordpass.docx")))

  it("opens with Word's password, and not without it", async () => {
    expect(isEncryptedPackage(file)).toBe(true)
    await expect(decryptPackage(file, "wordpass")).rejects.toMatchObject({ code: "wrong-password" })
    const { view } = await openDocxBytes(await decryptPackage(file, "Wordpass"), "word.docx")
    expect(view.html).toContain("Secret text from Inkspire.")
  })
})
