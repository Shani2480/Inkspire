import type { WordDocument } from "@/document/docx/model"
import { decodeXml } from "@/document/docx/xml"

/**
 * Fonts embedded in a Word document (File > Options > Save > Embed fonts in the file, ECMA-376 17.8.1): the font
 * table names each embedded face (`w:embedRegular`, `w:embedBold` …) with a relationship to an obfuscated font part
 * and its key (`w:fontKey`). Inkspire shows the document in them while it is open, as Word does; they are not
 * installed anywhere, and the parts are saved back as they were.
 */

export type EmbeddedFace = { family: string; weight: "400" | "700"; style: "normal" | "italic"; data: Uint8Array }

const FACES: Record<string, { weight: "400" | "700"; style: "normal" | "italic" }> = {
  embedRegular: { weight: "400", style: "normal" },
  embedBold: { weight: "700", style: "normal" },
  embedItalic: { weight: "400", style: "italic" },
  embedBoldItalic: { weight: "700", style: "italic" },
}

/**
 * Undoes Word's font obfuscation: the first 32 bytes are XOR-ed with the key, a GUID read as 16 bytes from its last
 * hex pair to its first.
 */
export function deobfuscateFont(data: Uint8Array, fontKey: string) {
  const hex = fontKey.replace(/[{}-]/g, "")
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    return null
  }
  const key = Array.from({ length: 16 }, (_, index) => Number.parseInt(hex.slice(30 - index * 2, 32 - index * 2), 16))
  const font = data.slice()
  for (let index = 0; index < Math.min(32, font.length); index += 1) {
    font[index] = font[index]! ^ key[index % 16]!
  }
  return font
}

/** Resolves a relationship target against the font table's folder (`fonts/font1.odttf` → `/word/fonts/font1.odttf`). */
function partName(target: string) {
  if (target.startsWith("/")) {
    return target
  }
  const parts = ["word"]
  for (const piece of target.split("/")) {
    if (piece === "..") {
      parts.pop()
    } else if (piece && piece !== ".") {
      parts.push(piece)
    }
  }
  return `/${parts.join("/")}`
}

/** The faces a document embeds, ready to register; none when it embeds none or they cannot be read. */
export function embeddedFonts(doc: WordDocument): EmbeddedFace[] {
  const parts = doc.preserved?.parts ?? []
  const table = parts.find((part) => part.name.toLowerCase() === "/word/fonttable.xml")
  if (!table) {
    return []
  }
  const links = new Map(
    (doc.preserved?.relationships ?? [])
      .filter((group) => group.source?.toLowerCase() === "/word/fonttable.xml")
      .flatMap((group) => group.items)
      .map((item) => [item.id, item.partName ?? partName(item.target)]),
  )
  const xml = decodeXml(table.data)
  const faces: EmbeddedFace[] = []
  for (const font of xml.matchAll(/<w:font\b[^>]*w:name="([^"]+)"[^>]*>([\s\S]*?)<\/w:font>/g)) {
    const family = font[1]!.replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    for (const embed of font[2]!.matchAll(/<w:(embed(?:Regular|Bold|Italic|BoldItalic))\b([^>]*)\/?>/g)) {
      const attrs = embed[2] ?? ""
      const id = /r:id="([^"]+)"/.exec(attrs)?.[1]
      const key = /w:fontKey="([^"]+)"/.exec(attrs)?.[1]
      const name = id ? links.get(id) : undefined
      const part = name ? parts.find((item) => item.name.toLowerCase() === name.toLowerCase()) : undefined
      const data = part && key ? deobfuscateFont(part.data, key) : null
      if (data) {
        faces.push({ family, ...FACES[embed[1]!]!, data })
      }
    }
  }
  return faces
}

const shown: FontFace[] = []

/** Shows the open document in its embedded fonts (those of the document opened before are removed). */
export function showEmbeddedFonts(doc: WordDocument | null) {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return 0
  }
  for (const face of shown.splice(0)) {
    document.fonts.delete(face)
  }
  for (const face of doc ? embeddedFonts(doc) : []) {
    const buffer = face.data.buffer.slice(face.data.byteOffset, face.data.byteOffset + face.data.byteLength)
    const font = new FontFace(face.family, buffer as ArrayBuffer, { weight: face.weight, style: face.style })
    document.fonts.add(font)
    void font.load().catch(() => {})
    shown.push(font)
  }
  return shown.length
}
