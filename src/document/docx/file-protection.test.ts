import { Editor } from "@tiptap/core"
import { writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { decryptPackage, isEncryptedPackage } from "@/document/docx/encryption"
import { openDocxBytes, saveDocxBytes } from "@/document/docx/io"
import { findPart, openPackage, writePackage } from "@/document/docx/opc"
import { decodeXml, xmlBytes } from "@/document/docx/xml"
import { emptyChrome } from "@/document/header"
import { createExtensions } from "@/editor/extensions"

const editors: Editor[] = []
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy())
})

function json(html: string) {
  const editor = new Editor({ extensions: createExtensions().filter((e) => e.name !== "spellcheck"), content: html })
  editors.push(editor)
  return editor.getJSON()
}

const OUT = process.env.PROTECT_OUT

async function save(name: string, extra: Partial<Parameters<typeof saveDocxBytes>[0]>) {
  const saved = await saveDocxBytes({
    json: json(`<h1>${name}</h1><p>Protect Document check.</p>`),
    chrome: emptyChrome(),
    word: null,
    unchanged: false,
    fileName: `${name}.docx`,
    props: { title: name },
    ...extra,
  })
  if (OUT) {
    writeFileSync(path.join(OUT, `${name}.docx`), saved.bytes)
  }
  return saved.bytes
}

describe("Protect Document in the saved file", { timeout: 60_000 }, () => {
  it("writes Always Open Read-Only into settings, and reads it back", async () => {
    const bytes = await save("read-only", { protection: { readOnlyRecommended: true, markedFinal: false } })
    const settings = decodeXml(findPart(await openPackage(bytes, "a.docx"), "/word/settings.xml")!.data)
    expect(settings).toContain('<w:writeProtection w:recommended="1"/>')
    const opened = await openDocxBytes(bytes, "a.docx")
    expect(opened.protection).toEqual({ readOnlyRecommended: true, markedFinal: false })
    // Turned off again: the element goes.
    const off = await saveDocxBytes({
      json: opened.view.json as never,
      chrome: emptyChrome(),
      word: opened.word,
      unchanged: true,
      fileName: "a.docx",
      protection: { readOnlyRecommended: false, markedFinal: false },
    })
    expect(decodeXml(findPart(await openPackage(off.bytes, "a.docx"), "/word/settings.xml")!.data)).not.toContain("writeProtection")
  })

  it("writes Mark as Final as Word does (_MarkAsFinal, Status Final), keeping other custom properties", async () => {
    const bytes = await save("final", { protection: { readOnlyRecommended: false, markedFinal: true } })
    const pkg = await openPackage(bytes, "a.docx")
    expect(decodeXml(findPart(pkg, "/docProps/custom.xml")!.data)).toContain(
      'name="_MarkAsFinal"><vt:bool>true</vt:bool></property>',
    )
    expect(decodeXml(findPart(pkg, "/docProps/core.xml")!.data)).toContain("<cp:contentStatus>Final</cp:contentStatus>")
    const opened = await openDocxBytes(bytes, "a.docx")
    expect(opened.protection.markedFinal).toBe(true)

    // A custom property of the user's survives Edit Anyway, which takes _MarkAsFinal out.
    const custom = findPart(pkg, "/docProps/custom.xml")!
    custom.data = xmlBytes(
      decodeXml(custom.data)
        .replace(/^<\?xml[^>]*\?>\s*/, "")
        .replace("</Properties>", '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="Client"><vt:lpwstr>Example Ltd</vt:lpwstr></property></Properties>'),
    )
    const edited = await openDocxBytes(await writePackage(pkg), "a.docx")
    const again = await saveDocxBytes({
      json: edited.view.json as never,
      chrome: emptyChrome(),
      word: edited.word,
      unchanged: true,
      fileName: "a.docx",
      protection: { readOnlyRecommended: false, markedFinal: false },
    })
    const out = await openPackage(again.bytes, "a.docx")
    const xml = decodeXml(findPart(out, "/docProps/custom.xml")!.data)
    expect(xml).not.toContain("_MarkAsFinal")
    expect(xml).toContain('name="Client"')
    expect(decodeXml(findPart(out, "/docProps/core.xml")!.data)).not.toContain("contentStatus")
  })

  it("encrypts the file with the password", async () => {
    const bytes = await save("encrypted", { password: "Example 1", protection: { readOnlyRecommended: false, markedFinal: false } })
    expect(isEncryptedPackage(bytes)).toBe(true)
    const opened = await openDocxBytes(await decryptPackage(bytes, "Example 1"), "a.docx")
    expect(opened.view.html).toContain("Protect Document check.")
  })

  it("combines a password, Always Open Read-Only and Mark as Final", async () => {
    const bytes = await save("all-three", { password: "Example 1", protection: { readOnlyRecommended: true, markedFinal: true } })
    const opened = await openDocxBytes(await decryptPackage(bytes, "Example 1"), "a.docx")
    expect(opened.protection).toEqual({ readOnlyRecommended: true, markedFinal: true })
  })

  it("leaves out the digital signatures of the file as it was", async () => {
    const bytes = await save("signed", {})
    const pkg = await openPackage(bytes, "a.docx")
    pkg.parts.push({
      name: "/_xmlsignatures/sig1.xml",
      contentType: "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml",
      data: xmlBytes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#"/>'),
    })
    pkg.parts.push({
      name: "/_xmlsignatures/origin.sigs",
      contentType: "application/vnd.openxmlformats-package.digital-signature-origin",
      data: new Uint8Array(0),
    })
    pkg.relationships.find((group) => group.source === "")!.items.push({
      id: "rIdSig",
      type: "http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/origin",
      target: "_xmlsignatures/origin.sigs",
      targetMode: "Internal",
      partName: "/_xmlsignatures/origin.sigs",
    })
    pkg.relationships.push({
      source: "/_xmlsignatures/origin.sigs",
      items: [
        {
          id: "rId1",
          type: "http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/signature",
          target: "sig1.xml",
          targetMode: "Internal",
          partName: "/_xmlsignatures/sig1.xml",
        },
      ],
    } as never)
    const signed = await writePackage(pkg)
    const opened = await openDocxBytes(signed, "a.docx")
    expect(opened.signatures).toBe(1)
    const resaved = await saveDocxBytes({
      json: opened.view.json as never,
      chrome: emptyChrome(),
      word: opened.word,
      unchanged: true,
      fileName: "a.docx",
    })
    const out = await openPackage(resaved.bytes, "a.docx")
    expect(out.parts.some((part) => part.name.startsWith("/_xmlsignatures/"))).toBe(false)
    expect((await openDocxBytes(resaved.bytes, "a.docx")).signatures).toBe(0)
  })
})
