import {
  BIBLIOGRAPHY_NS,
  parseCitation,
  readSourcesXml,
  sourcesXml,
  type BibSource,
  type BibStyleId,
} from "@/document/bibliography"
import type { OpcPackage } from "@/document/docx/opc"
import type { WordDocument } from "@/document/docx/model"
import { decodeXml } from "@/document/docx/xml"

/** The parts carry their own XML declaration, as Word writes them. */
const bytes = (xml: string) => new TextEncoder().encode(xml)

/**
 * The document's sources, as Word keeps them: a custom XML data part (customXml/itemN.xml) holding b:Sources, with
 * its properties part naming the bibliography schema, related from the main document.
 */

const ITEM = /^\/customXml\/item(\d+)\.xml$/i
const CUSTOM_XML_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml"
const CUSTOM_XML_PROPS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps"
const PROPS_TYPE = "application/vnd.openxmlformats-officedocument.customXmlProperties+xml"

const isSourcesXml = (xml: string) => xml.includes(BIBLIOGRAPHY_NS) && /<(?:\w+:)?Sources\b/.test(xml)

/** The opened document's sources part, read; null when it has none. */
export function readSourcesPart(word: WordDocument | null) {
  for (const part of word?.preserved?.parts ?? []) {
    if (!ITEM.test(part.name)) {
      continue
    }
    const xml = decodeXml(part.data)
    if (isSourcesXml(xml)) {
      return readSourcesXml(xml)
    }
  }
  return null
}

type JsonNode = { type?: string; attrs?: Record<string, unknown>; content?: JsonNode[] }

/** The sources cited in the document, in the order first cited (IEEE's numbers, Word's RefOrder). */
export function citationOrder(json: JsonNode) {
  const order: string[] = []
  const visit = (node: JsonNode) => {
    if (node.type === "wordField") {
      order.push(...(parseCitation(String(node.attrs?.instr ?? ""))?.tags ?? []))
    }
    node.content?.forEach(visit)
  }
  visit(json)
  return order
}

/** Writes the sources into the saved package: over the part they were read from, or as a new custom XML part. */
export function writeSourcesPart(pkg: OpcPackage, sources: BibSource[], style: BibStyleId, order: string[]) {
  const data = bytes(sourcesXml(sources, style, order))
  const existing = pkg.parts.find((part) => ITEM.test(part.name) && isSourcesXml(decodeXml(part.data)))
  if (existing) {
    existing.data = data
    return
  }
  const taken = new Set(pkg.parts.map((part) => Number(ITEM.exec(part.name)?.[1] ?? 0)))
  let n = 1
  while (taken.has(n)) {
    n += 1
  }
  const item = `/customXml/item${n}.xml`
  const props = `/customXml/itemProps${n}.xml`
  const guid = `{${crypto.randomUUID().toUpperCase()}}`
  pkg.parts.push({ name: item, contentType: "application/xml", data })
  pkg.parts.push({
    name: props,
    contentType: PROPS_TYPE,
    data: bytes(
      `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\r\n<ds:datastoreItem ds:itemID="${guid}" ` +
        `xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs>` +
        `<ds:schemaRef ds:uri="${BIBLIOGRAPHY_NS}"/></ds:schemaRefs></ds:datastoreItem>`,
    ),
  })
  pkg.relationships.push({
    source: item,
    items: [
      { id: "rId1", type: CUSTOM_XML_PROPS_REL, target: `itemProps${n}.xml`, targetMode: "Internal", partName: props },
    ],
  })
  const main = pkg.relationships.find((group) => group.source === pkg.mainPartName)
  if (main) {
    const used = new Set(main.items.map((rel) => rel.id))
    let id = 1
    while (used.has(`rId${id}`)) {
      id += 1
    }
    main.items.push({
      id: `rId${id}`,
      type: CUSTOM_XML_REL,
      target: `../customXml/item${n}.xml`,
      targetMode: "Internal",
      partName: item,
    })
  }
}
