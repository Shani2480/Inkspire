import { describe, expect, it } from "vitest"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { emptyChrome } from "@/document/header"
import { findPart, openPackage } from "@/document/docx/opc"
import { decodeXml } from "@/document/docx/xml"
import { checkPassword, hashPassword, protectionXml } from "@/document/protection"
import type { DocumentProtection } from "@/document/review"

const json = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] }

async function save(review: { trackRevisions: boolean; protection: DocumentProtection | null }, word = null) {
  const saved = await saveDocxBytes({ json, chrome: emptyChrome(), word, unchanged: false, fileName: "f.docx", review })
  const pkg = await openPackage(saved.bytes, "f.docx")
  return { bytes: saved.bytes, settings: decodeXml(findPart(pkg, "/word/settings.xml")!.data) }
}

describe("Restrict Editing password", () => {
  it("hashes with a salt and checks the password", async () => {
    const stored = await hashPassword("s3cret", 500)
    expect(stored).toMatchObject({ algorithm: "SHA-512", spinCount: 500 })
    expect(stored.hash).not.toContain("s3cret")
    expect(await checkPassword("s3cret", stored)).toBe(true)
    expect(await checkPassword("wrong", stored)).toBe(false)
    expect(await checkPassword("x", { algorithm: "legacy-sid-14", hash: "a", salt: "b", spinCount: 1 })).toBe("unknown")
    // Two hashes of one password differ (fresh salt).
    expect((await hashPassword("s3cret", 10)).salt).not.toBe((await hashPassword("s3cret", 10)).salt)
  })

  it("writes w:documentProtection as Word reads it", () => {
    expect(protectionXml({ edit: "readOnly", enforced: true, formatting: false })).toBe(
      '<w:documentProtection w:edit="readOnly" w:enforcement="1"/>',
    )
    expect(protectionXml(null)).toBe("")
  })
})

describe("Track Changes and protection in settings.xml", () => {
  it("saves and reads trackRevisions and documentProtection", async () => {
    const password = await hashPassword("pw", 50)
    const protection: DocumentProtection = { edit: "comments", enforced: true, formatting: true, password }
    const first = await save({ trackRevisions: true, protection })
    expect(first.settings).toContain("<w:trackRevisions/>")
    expect(first.settings).toMatch(
      /<w:documentProtection w:edit="comments" w:formatting="1" w:enforcement="1" w:algorithmName="SHA-512" w:hashValue="[^"]+" w:saltValue="[^"]+" w:spinCount="50"\/>/,
    )
    // Schema order: trackRevisions before documentProtection.
    expect(first.settings.indexOf("trackRevisions")).toBeLessThan(first.settings.indexOf("documentProtection"))
    const opened = await openDocxBytes(first.bytes, "f.docx")
    expect(opened.word.settings.trackRevisions).toBe(true)
    expect(opened.word.settings.protection).toMatchObject({ edit: "comments", enforced: true, formatting: true })
    expect(await checkPassword("pw", opened.word.settings.protection!.password!)).toBe(true)
    // Turned off in the app: both go.
    const second = await save({ trackRevisions: false, protection: null }, opened.word as never)
    expect(second.settings).not.toContain("trackRevisions")
    expect(second.settings).not.toContain("documentProtection")
  })

  it("keeps Word's own protection attributes while unchanged", async () => {
    const attributes = {
      edit: "readOnly",
      enforcement: "1",
      cryptProviderType: "rsaAES",
      cryptAlgorithmClass: "hash",
      cryptAlgorithmType: "typeAny",
      cryptAlgorithmSid: "14",
      cryptSpinCount: "100000",
      hash: "abc=",
      salt: "def=",
    }
    const protection: DocumentProtection = {
      edit: "readOnly",
      enforced: true,
      formatting: false,
      password: { algorithm: "legacy-sid-14", hash: "abc=", salt: "def=", spinCount: 100000 },
      source: JSON.stringify(attributes),
    }
    expect(protectionXml(protection)).toContain('w:cryptAlgorithmSid="14"')
    expect(protectionXml({ ...protection, enforced: false })).toBe(
      '<w:documentProtection w:edit="readOnly" w:enforcement="0"/>',
    )
  })
})
