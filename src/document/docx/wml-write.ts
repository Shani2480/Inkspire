import { ORDER, writeChildren } from "@/document/docx/element-source"
import { MC_NS, REL_NS, WORD_NS } from "@/document/docx/mce"
import {
  docDefaultsFingerprint,
  styleFingerprint,
  COMPATIBILITY_URI,
  DEFAULT_SECTION,
  W14_NS,
  emptyNumbering,
  emptyParagraph,
  paragraphsIn,
  paragraphPropertiesInput,
  tablePropertiesInput,
  rowPropertiesInput,
  rowExceptionsInput,
  cellPropertiesInput,
  tableGrid,
  type AbstractNumbering,
  type Block,
  type Border,
  type BreakType,
  type CellMargins,
  type CommentExtensible,
  type CommentId,
  type CommentPart,
  type GlossaryPackage,
  type HeaderFooterRef,
  type Inline,
  type MediaPart,
  type Indent,
  type NotePart,
  type NumberingDefinitions,
  type NumberingLevel,
  type Paragraph,
  type PartLinks,
  type PeoplePart,
  type ParagraphProperties,
  type RootAttribute,
  type Run,
  type RunProperties,
  type SectionProps,
  type Shading,
  type Settings,
  type Spacing,
  type Style,
  type StyleCatalog,
  type Table,
  type TableCell,
  type TableLook,
  type TableRow,
  type WordDocument,
} from "@/document/docx/model"
import { CONTENT_TYPE_DOCUMENT, type OpcPackage, type OpcRelationship } from "@/document/docx/opc"
import { escapeXml, escapeXmlText, xmlBytes } from "@/document/docx/xml"

const CONTENT_TYPE_STYLES = "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"
const CONTENT_TYPE_SETTINGS = "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"
const CONTENT_TYPE_NUMBERING = "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"
const CONTENT_TYPE_HEADER = "application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"
const CONTENT_TYPE_FOOTER = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"
const CONTENT_TYPE_FOOTNOTES = "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"
const CONTENT_TYPE_ENDNOTES = "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml"
const CONTENT_TYPE_COMMENTS = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"
const CONTENT_TYPE_COMMENTS_EXTENDED =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"
const CONTENT_TYPE_COMMENTS_IDS = "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsIds+xml"
const CONTENT_TYPE_COMMENTS_EXTENSIBLE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtensible+xml"
const CONTENT_TYPE_PEOPLE = "application/vnd.openxmlformats-officedocument.wordprocessingml.people+xml"
const COMMENTS_EXTENDED_REL = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended"
const COMMENTS_IDS_REL = "http://schemas.microsoft.com/office/2016/09/relationships/commentsIds"
const COMMENTS_EXTENSIBLE_REL = "http://schemas.microsoft.com/office/2018/08/relationships/commentsExtensible"
const PEOPLE_REL = "http://schemas.microsoft.com/office/2011/relationships/people"
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
const W15_NS = "http://schemas.microsoft.com/office/word/2012/wordml"
const W16CID_NS = "http://schemas.microsoft.com/office/word/2016/wordml/cid"

type ParaIds = { used: Set<string>; next: number }

export function writeDocument(doc: WordDocument, fileName = "document.docx"): OpcPackage {
  const stylesXml = writeStyles(doc.styles)
  const numberingXml = writeNumberingPart(doc.numbering ?? emptyNumbering())
  const stories = collectStories(doc)
  assignStoryNames(stories)
  const reserved = new Set([...stories.map((story) => story.relId), ...rememberedIds(doc)])
  let nextId = 1
  const takeId = () => {
    while (reserved.has(`rId${nextId}`)) {
      nextId += 1
    }
    const id = `rId${nextId}`
    reserved.add(id)
    nextId += 1
    return id
  }
  ensureHyperlinkIds(doc, takeId)
  const parts = [
    {
      name: "/word/document.xml",
      contentType: CONTENT_TYPE_DOCUMENT,
      data: xmlBytes(writeDocumentElement(doc)),
    },
    {
      name: "/word/settings.xml",
      contentType: CONTENT_TYPE_SETTINGS,
      data: xmlBytes(writeSettings(doc.settings)),
    },
  ]
  const relationships: OpcRelationship[] = []
  if (stylesXml) {
    parts.push({
      name: "/word/styles.xml",
      contentType: CONTENT_TYPE_STYLES,
      data: xmlBytes(stylesXml),
    })
    relationships.push(relationship(takeId(), "styles", "styles.xml", "/word/styles.xml"))
  }
  relationships.push(relationship(takeId(), "settings", "settings.xml", "/word/settings.xml"))
  if (numberingXml) {
    parts.push({
      name: "/word/numbering.xml",
      contentType: CONTENT_TYPE_NUMBERING,
      data: xmlBytes(numberingXml),
    })
    relationships.push(relationship(takeId(), "numbering", "numbering.xml", "/word/numbering.xml"))
  }
  const seenPart = new Set<string>()
  const seenRel = new Set<string>()
  for (const story of stories) {
    const partName = story.partName ?? ""
    if (partName && !seenPart.has(partName)) {
      seenPart.add(partName)
      parts.push({
        name: partName,
        contentType: story.kind === "header" ? CONTENT_TYPE_HEADER : CONTENT_TYPE_FOOTER,
        data: xmlBytes(writeStory(story, doc.styles)),
      })
    }
    if (story.relId && !seenRel.has(story.relId)) {
      seenRel.add(story.relId)
      relationships.push(relationship(story.relId, story.kind, storyTarget(partName), partName))
    }
  }
  addNotePart(parts, relationships, doc.footnotes, "footnotes", CONTENT_TYPE_FOOTNOTES, doc.styles, takeId)
  addNotePart(parts, relationships, doc.endnotes, "endnotes", CONTENT_TYPE_ENDNOTES, doc.styles, takeId)
  addCommentParts(parts, relationships, doc.comments, doc.styles, takeId)
  addPeoplePart(parts, relationships, doc.people, takeId)
  const mediaGroups = addMedia(parts, relationships, doc.media)
  const glossaryGroups = addGlossary(parts, relationships, doc.glossary)
  const preservedGroups = addPreserved(parts, relationships, doc)
  relationships.push(...hyperlinkRelationships(doc))
  const storyGroups = storyPackages(doc, stories, parts)
  return {
    fileName,
    mainPartName: "/word/document.xml",
    parts,
    defaults: [],
    overrides: [],
    relationships: [
      {
        source: "",
        items: packageRelationships(doc),
      },
      { source: "/word/document.xml", items: relationships },
      ...mediaGroups,
      ...glossaryGroups,
      ...preservedGroups,
      ...storyGroups,
    ],
    warnings: [],
    zipEntries: [],
  }
}

function relationship(id: string, name: string, target: string, partName: string): OpcRelationship {
  return { id, type: `${OFFICE_REL}${name}`, target, targetMode: "Internal", partName }
}

function writeDocumentElement(doc: WordDocument) {
  return `<w:document ${declaredNamespaces(doc.rootAttributes, doc.blocks).join(" ")}>${writeBody(doc)}</w:document>`
}

function declaredNamespaces(attributes: RootAttribute[] | undefined, blocks: Block[]) {
  if (attributes && attributes.length > 0) {
    return attributes.map((item) => `${item.prefix ? `${item.prefix}:` : ""}${item.local}="${escapeXml(item.value)}"`)
  }
  const w14 = paragraphsIn(blocks).some((paragraph) => paragraph.paraId || paragraph.textId)
  const namespaces = [`xmlns:w="${WORD_NS}"`, `xmlns:r="${REL_NS}"`]
  if (w14) {
    namespaces.push(`xmlns:mc="${MC_NS}"`, `xmlns:w14="${W14_NS}"`, `mc:Ignorable="w14"`)
  }
  return namespaces
}

function collectStories(doc: WordDocument) {
  const stories: HeaderFooterRef[] = []
  const sections = [doc.section, ...paragraphsIn(doc.blocks).map((paragraph) => paragraph.sectionBreak)]
  for (const section of sections) {
    for (const ref of section?.references ?? []) {
      stories.push(ref)
    }
  }
  return stories
}

function assignStoryNames(stories: HeaderFooterRef[]) {
  const used = new Set(stories.map((story) => story.partName).filter((name): name is string => !!name))
  const next = { header: 1, footer: 1 }
  for (const story of stories) {
    if (story.partName) {
      continue
    }
    story.partName = nextStoryName(story.kind, next, used)
  }
}

function nextStoryName(kind: "header" | "footer", next: { header: number; footer: number }, used: Set<string>) {
  let name = `/word/${kind}${next[kind]}.xml`
  next[kind] += 1
  while (used.has(name)) {
    name = `/word/${kind}${next[kind]}.xml`
    next[kind] += 1
  }
  used.add(name)
  return name
}

function storyTarget(partName: string) {
  const name = partName.replace(/^\/+/, "")
  return name.startsWith("word/") ? name.slice("word/".length) : name
}

function writeStory(ref: HeaderFooterRef, styles: StyleCatalog) {
  const tag = ref.kind === "header" ? "hdr" : "ftr"
  const ids = paraIdState()
  const blocks = ref.blocks.map((block) => writeBlock(block, styles, null, ids)).join("")
  return `<w:${tag} ${declaredNamespaces(ref.rootAttributes, ref.blocks).join(" ")}>${blocks || "<w:p/>"}</w:${tag}>`
}

type PackPart = { name: string; contentType: string; data: Uint8Array }

function rememberedIds(doc: WordDocument) {
  return [
    doc.footnotes?.relId,
    doc.endnotes?.relId,
    doc.comments?.relId,
    doc.comments?.extendedRelId,
    doc.comments?.idsRelId,
    doc.comments?.extensibleRelId,
    doc.people?.relId,
    ...(doc.media ?? []).map((item) => item.relId),
    doc.glossary?.relId,
    ...preservedDocumentIds(doc),
    ...hyperlinkIds(doc),
  ].filter((id): id is string => !!id)
}

function addMedia(parts: PackPart[], relationships: OpcRelationship[], media: MediaPart[] | undefined) {
  const groups: { source: string; items: OpcRelationship[] }[] = []
  for (const item of media ?? []) {
    parts.push({ name: item.name, contentType: item.contentType, data: item.data })
    relationships.push({
      id: item.relId,
      type: item.type,
      target: item.target,
      targetMode: "Internal",
      partName: item.name,
    })
    if (item.related?.length) {
      // A chart's workbook, related from the chart part itself.
      const items: OpcRelationship[] = []
      addMedia(parts, items, item.related)
      groups.push({ source: item.name, items })
    }
  }
  return groups
}

function addGlossary(parts: PackPart[], relationships: OpcRelationship[], glossary: GlossaryPackage | undefined) {
  if (!glossary) {
    return []
  }
  parts.push(...glossary.parts)
  relationships.push({
    id: glossary.relId,
    type: glossary.type,
    target: glossary.target,
    targetMode: "Internal",
    partName: glossary.partName,
  })
  return glossary.relationships
}

function preservedDocumentIds(doc: WordDocument) {
  return (doc.preserved?.relationships ?? [])
    .filter((group) => group.source === "/word/document.xml")
    .flatMap((group) => group.items.map((item) => item.id))
}

function packageRelationships(doc: WordDocument): OpcRelationship[] {
  const items = [relationship("rId1", "officeDocument", "word/document.xml", "/word/document.xml")]
  for (const group of doc.preserved?.relationships ?? []) {
    if (group.source !== "") {
      continue
    }
    for (const item of group.items) {
      if (item.type === items[0]?.type) {
        continue
      }
      // Nothing refers to package relationships by id, so a clash with rId1 just takes the next free id.
      let id = item.id
      for (let number = 1; items.some((existing) => existing.id === id); number += 1) {
        id = `rId${number}`
      }
      items.push({ ...item, id })
    }
  }
  return items
}

function addPreserved(parts: PackPart[], relationships: OpcRelationship[], doc: WordDocument) {
  const preserved = doc.preserved
  if (!preserved) {
    return []
  }
  parts.push(...preserved.parts.filter((part) => !parts.some((existing) => existing.name === part.name)))
  const extra: { source: string; items: OpcRelationship[] }[] = []
  for (const group of preserved.relationships) {
    if (group.source === "") {
      continue
    }
    if (group.source === "/word/document.xml") {
      for (const item of group.items) {
        if (!relationships.some((existing) => existing.id === item.id)) {
          relationships.push(item)
        }
      }
      continue
    }
    extra.push(group)
  }
  return extra
}

function hyperlinkIds(doc: WordDocument) {
  const ids: string[] = []
  visitInlines(doc, (inline) => {
    if (inline.kind === "hyperlink" && inline.relId) {
      ids.push(inline.relId)
    }
  })
  return ids
}

function ensureHyperlinkIds(doc: WordDocument, takeId: () => string) {
  visitInlines(doc, (inline) => {
    if (inline.kind === "hyperlink" && inline.target && !inline.relId) {
      inline.relId = takeId()
    }
  })
}

/** Inlines of the main document body. Headers, footers, notes, and comments have their own relationships. */
function visitInlines(doc: WordDocument, visit: (inline: Inline) => void) {
  for (const paragraph of paragraphsIn(doc.blocks)) {
    walkInlines(paragraph.inlines, visit)
  }
}

/**
 * Relationships of a header, footer, notes, or comments part: the ones it was read with (pictures, objects)
 * plus one per hyperlink in it. A hyperlink whose id is missing or taken gets a fresh one.
 */
function storyRelationships(blocks: Block[], links: PartLinks | undefined): OpcRelationship[] {
  const items: OpcRelationship[] = (links?.relationships ?? []).map((item) => ({ ...item }))
  const taken = new Set(items.map((item) => item.id))
  let next = 1
  const fresh = () => {
    while (taken.has(`rId${next}`)) {
      next += 1
    }
    taken.add(`rId${next}`)
    return `rId${next}`
  }
  const written = new Map<string, string>()
  for (const paragraph of paragraphsIn(blocks)) {
    walkInlines(paragraph.inlines, (inline) => {
      if (inline.kind !== "hyperlink" || !inline.target) {
        return
      }
      if (inline.relId && written.get(inline.relId) === inline.target) {
        return
      }
      if (!inline.relId || taken.has(inline.relId)) {
        inline.relId = fresh()
      }
      taken.add(inline.relId)
      written.set(inline.relId, inline.target)
      items.push({
        id: inline.relId,
        type: `${OFFICE_REL}hyperlink`,
        target: inline.target,
        targetMode: "External",
        partName: null,
      })
    })
  }
  return items
}

/** Relationship groups for every story part, and the pictures they point at that are not written yet. */
function storyPackages(doc: WordDocument, stories: HeaderFooterRef[], parts: PackPart[]) {
  const sources: { source: string; blocks: Block[]; links?: PartLinks }[] = []
  const seen = new Set<string>()
  for (const story of stories) {
    if (story.partName && !seen.has(story.partName)) {
      seen.add(story.partName)
      sources.push({ source: story.partName, blocks: story.blocks, links: story.links })
    }
  }
  for (const [part, name] of [
    [doc.footnotes, "/word/footnotes.xml"],
    [doc.endnotes, "/word/endnotes.xml"],
  ] as const) {
    if (part && part.items.length > 0) {
      sources.push({ source: name, blocks: part.items.flatMap((note) => note.blocks), links: part.links })
    }
  }
  if (doc.comments && doc.comments.items.length > 0) {
    sources.push({
      source: "/word/comments.xml",
      blocks: doc.comments.items.flatMap((comment) => comment.blocks),
      links: doc.comments.links,
    })
  }
  const names = new Set(parts.map((part) => part.name.toLowerCase()))
  const groups: { source: string; items: OpcRelationship[] }[] = []
  for (const { source, blocks, links } of sources) {
    for (const part of links?.parts ?? []) {
      if (!names.has(part.name.toLowerCase())) {
        names.add(part.name.toLowerCase())
        parts.push({ name: part.name, contentType: part.contentType, data: part.data })
      }
    }
    const items = storyRelationships(blocks, links)
    if (items.length > 0) {
      groups.push({ source, items })
    }
  }
  return groups
}

function walkInlines(inlines: Inline[], visit: (inline: Inline) => void) {
  for (const inline of inlines) {
    visit(inline)
    if ("inlines" in inline) {
      walkInlines(inline.inlines, visit)
    }
  }
}

function hyperlinkRelationships(doc: WordDocument): OpcRelationship[] {
  const seen = new Set<string>()
  const items: OpcRelationship[] = []
  visitInlines(doc, (inline) => {
    if (inline.kind !== "hyperlink" || !inline.relId || !inline.target || seen.has(inline.relId)) {
      return
    }
    seen.add(inline.relId)
    items.push({
      id: inline.relId,
      type: `${OFFICE_REL}hyperlink`,
      target: inline.target,
      targetMode: "External",
      partName: null,
    })
  })
  return items
}

function addNotePart(
  parts: PackPart[],
  relationships: OpcRelationship[],
  part: NotePart | undefined,
  name: "footnotes" | "endnotes",
  contentType: string,
  styles: StyleCatalog,
  takeId: () => string,
) {
  if (!part || part.items.length === 0) {
    return
  }
  const partName = `/word/${name}.xml`
  parts.push({ name: partName, contentType, data: xmlBytes(writeNotes(part, name, styles)) })
  relationships.push(relationship(part.relId || takeId(), name, `${name}.xml`, partName))
}

function writeNotes(part: NotePart, name: "footnotes" | "endnotes", styles: StyleCatalog) {
  const item = name === "footnotes" ? "footnote" : "endnote"
  const ids = paraIdState()
  const notes = part.items
    .map((note) => {
      const type = note.type ? ` w:type="${note.type}"` : ""
      const blocks = note.blocks.map((block) => writeBlock(block, styles, null, ids)).join("") || "<w:p/>"
      return `<w:${item}${type} w:id="${note.id}">${blocks}</w:${item}>`
    })
    .join("")
  const blocks = part.items.flatMap((note) => note.blocks)
  return `<w:${name} ${declaredNamespaces(part.rootAttributes, blocks).join(" ")}>${notes}</w:${name}>`
}

function addCommentParts(
  parts: PackPart[],
  relationships: OpcRelationship[],
  part: CommentPart | undefined,
  styles: StyleCatalog,
  takeId: () => string,
) {
  if (!part || part.items.length === 0) {
    return
  }
  addXml(
    parts,
    relationships,
    "/word/comments.xml",
    CONTENT_TYPE_COMMENTS,
    part.relId || takeId(),
    `${OFFICE_REL}comments`,
    "comments.xml",
    writeComments(part, styles),
  )
  if (part.extended && part.extended.length > 0) {
    addXml(
      parts,
      relationships,
      "/word/commentsExtended.xml",
      CONTENT_TYPE_COMMENTS_EXTENDED,
      part.extendedRelId || takeId(),
      COMMENTS_EXTENDED_REL,
      "commentsExtended.xml",
      writeCommentExtended(part),
    )
  }
  if (part.ids && part.ids.length > 0) {
    addXml(
      parts,
      relationships,
      "/word/commentsIds.xml",
      CONTENT_TYPE_COMMENTS_IDS,
      part.idsRelId || takeId(),
      COMMENTS_IDS_REL,
      "commentsIds.xml",
      writeCommentIds(part),
    )
  }
  if (part.extensible && part.extensible.length > 0) {
    addXml(
      parts,
      relationships,
      "/word/commentsExtensible.xml",
      CONTENT_TYPE_COMMENTS_EXTENSIBLE,
      part.extensibleRelId || takeId(),
      COMMENTS_EXTENSIBLE_REL,
      "commentsExtensible.xml",
      writeCommentExtensible(part),
    )
  }
}

function addXml(
  parts: PackPart[],
  relationships: OpcRelationship[],
  partName: string,
  contentType: string,
  relId: string,
  relType: string,
  target: string,
  xml: string,
) {
  parts.push({ name: partName, contentType, data: xmlBytes(xml) })
  relationships.push({ id: relId, type: relType, target, targetMode: "Internal", partName })
}

function writeComments(part: CommentPart, styles: StyleCatalog) {
  const ids = paraIdState()
  const comments = part.items
    .map((comment) => {
      const author = comment.author ? ` w:author="${escapeXml(comment.author)}"` : ""
      const date = comment.date ? ` w:date="${escapeXml(comment.date)}"` : ""
      const initials = comment.initials ? ` w:initials="${escapeXml(comment.initials)}"` : ""
      const blocks = comment.blocks.map((block) => writeBlock(block, styles, null, ids)).join("") || "<w:p/>"
      return `<w:comment w:id="${comment.id}"${author}${date}${initials}>${blocks}</w:comment>`
    })
    .join("")
  const blocks = part.items.flatMap((comment) => comment.blocks)
  return `<w:comments ${declaredNamespaces(part.rootAttributes, blocks).join(" ")}>${comments}</w:comments>`
}

function writeCommentExtended(part: CommentPart) {
  const items = (part.extended ?? [])
    .map((item) => {
      const parent = item.parentParaId ? ` w15:paraIdParent="${escapeXml(item.parentParaId)}"` : ""
      const done = item.done === undefined ? "" : ` w15:done="${item.done ? "1" : "0"}"`
      return `<w15:commentEx w15:paraId="${escapeXml(item.paraId)}"${parent}${done}/>`
    })
    .join("")
  return `<w15:commentsEx ${declaredNamespaces(part.extendedRoot, []).join(" ")}>${items}</w15:commentsEx>`
}

function writeCommentIds(part: CommentPart) {
  const items = (part.ids ?? []).map((item) => commentIdMarkup(item)).join("")
  return `<w16cid:commentsIds ${declaredNamespaces(part.idsRoot, []).join(" ")}>${items}</w16cid:commentsIds>`
}

function commentIdMarkup(item: CommentId) {
  return `<w16cid:commentId w16cid:paraId="${escapeXml(item.paraId)}" w16cid:durableId="${escapeXml(item.durableId)}"/>`
}

function writeCommentExtensible(part: CommentPart) {
  const items = (part.extensible ?? []).map((item) => commentExtensibleMarkup(item)).join("")
  return `<w16cex:commentsExtensible ${declaredNamespaces(part.extensibleRoot, []).join(" ")}>${items}</w16cex:commentsExtensible>`
}

function commentExtensibleMarkup(item: CommentExtensible) {
  const date = item.dateUtc ? ` w16cex:dateUtc="${escapeXml(item.dateUtc)}"` : ""
  return `<w16cex:commentExtensible w16cex:durableId="${escapeXml(item.durableId)}"${date}/>`
}

function addPeoplePart(
  parts: PackPart[],
  relationships: OpcRelationship[],
  part: PeoplePart | undefined,
  takeId: () => string,
) {
  if (!part || part.items.length === 0) {
    return
  }
  addXml(
    parts,
    relationships,
    "/word/people.xml",
    CONTENT_TYPE_PEOPLE,
    part.relId || takeId(),
    PEOPLE_REL,
    "people.xml",
    writePeople(part),
  )
}

function writePeople(part: PeoplePart) {
  const people = part.items
    .map((person) => {
      const presence =
        person.providerId || person.userId
          ? `<w15:presenceInfo${person.providerId ? ` w15:providerId="${escapeXml(person.providerId)}"` : ""}${person.userId ? ` w15:userId="${escapeXml(person.userId)}"` : ""}/>`
          : ""
      return `<w15:person w15:author="${escapeXml(person.author)}">${presence}</w15:person>`
    })
    .join("")
  return `<w15:people ${declaredNamespaces(part.rootAttributes, []).join(" ")}>${people}</w15:people>`
}

function writeBody(doc: WordDocument) {
  const ids = paraIdState()
  const blocks = doc.blocks.map((block) => writeBlock(block, doc.styles, doc.section, ids)).join("")
  const trailing = doc.blocks.length === 0 || doc.blocks[doc.blocks.length - 1]?.kind === "table" ? "<w:p/>" : ""
  return `<w:body>${blocks}${trailing}${writeSection(doc.section ?? DEFAULT_SECTION)}</w:body>`
}

function writeBlock(block: Block, styles: StyleCatalog, section: SectionProps | null, ids: ParaIds): string {
  if (block.kind === "raw") {
    if (block.blocks && block.xml.includes("<w:sdtContent/>")) {
      const content = block.blocks.map((item) => writeBlock(item, styles, section, ids)).join("")
      return block.xml.replace("<w:sdtContent/>", `<w:sdtContent>${content}</w:sdtContent>`)
    }
    return block.xml
  }
  if (block.kind === "paragraph") {
    return writeParagraph(block, styles, ids)
  }
  return writeTable(block, styles, section, ids)
}

function writeParagraph(paragraph: Paragraph, styles: StyleCatalog, ids: ParaIds) {
  const attributes = paragraphAttributes(paragraph, ids)
  const properties = writeParagraphProperties(paragraph, styles)
  const inlines = paragraph.inlines.map((inline) => writeInline(inline)).join("")
  const inner = `${properties}${inlines}`
  if (!inner) {
    return attributes ? `<w:p ${attributes}/>` : "<w:p/>"
  }
  return `<w:p${attributes ? ` ${attributes}` : ""}>${inner}</w:p>`
}

function paragraphAttributes(paragraph: Paragraph, ids: ParaIds) {
  const attributes: string[] = []
  if (paragraph.rsidR) {
    attributes.push(`w:rsidR="${paragraph.rsidR}"`)
  }
  if (paragraph.rsidRPr) {
    attributes.push(`w:rsidRPr="${paragraph.rsidRPr}"`)
  }
  if (paragraph.rsidP) {
    attributes.push(`w:rsidP="${paragraph.rsidP}"`)
  }
  const paraId = takeParaId(ids, paragraph.paraId)
  if (paraId) {
    attributes.push(`w14:paraId="${paraId}"`)
  }
  const textId = validParaId(paragraph.textId)
  if (textId) {
    attributes.push(`w14:textId="${textId}"`)
  }
  return attributes.join(" ")
}

function writeInline(inline: Paragraph["inlines"][number]): string {
  if (inline.kind === "bookmarkStart") {
    return `<w:bookmarkStart w:id="${inline.id}" w:name="${escapeXml(inline.name)}"/>`
  }
  if (inline.kind === "bookmarkEnd") {
    return `<w:bookmarkEnd w:id="${inline.id}"/>`
  }
  if (inline.kind === "simpleField") {
    const inner = inline.inlines.map((item) => writeInline(item)).join("")
    return `<w:fldSimple w:instr="${escapeXml(inline.instr)}">${inner}</w:fldSimple>`
  }
  if (inline.kind === "hyperlink") {
    const attributes: string[] = []
    if (inline.relId && inline.target) {
      attributes.push(`r:id="${escapeXml(inline.relId)}"`)
    }
    if (inline.anchor) {
      attributes.push(`w:anchor="${escapeXml(inline.anchor)}"`)
    }
    if (inline.history !== undefined) {
      attributes.push(`w:history="${inline.history ? "1" : "0"}"`)
    }
    const inner = inline.inlines.map((item) => writeInline(item)).join("")
    return `<w:hyperlink${attributes.length > 0 ? ` ${attributes.join(" ")}` : ""}>${inner}</w:hyperlink>`
  }
  if (inline.kind === "commentRangeStart" || inline.kind === "commentRangeEnd") {
    const tag = inline.kind === "commentRangeStart" ? "commentRangeStart" : "commentRangeEnd"
    return `<w:${tag} w:id="${inline.id}"/>`
  }
  if (inline.kind === "ins" || inline.kind === "del") {
    const author = inline.author ? ` w:author="${escapeXml(inline.author)}"` : ""
    const date = inline.date ? ` w:date="${escapeXml(inline.date)}"` : ""
    const inner = inline.inlines.map((item) => writeInline(item)).join("")
    return `<w:${inline.kind} w:id="${inline.id}"${author}${date}>${inner}</w:${inline.kind}>`
  }
  if (inline.kind === "raw") {
    return inline.xml
  }
  if (inline.kind !== "run") {
    return ""
  }
  return writeRun(inline)
}

function writeRun(run: Run) {
  const properties = writeRunProperties(run.rPr)
  const content = run.content.map((item) => writeRunContent(item)).join("")
  if (!properties && !content) {
    return ""
  }
  const rsid = run.rsidR ? ` w:rsidR="${run.rsidR}"` : ""
  return `<w:r${rsid}>${properties ? `<w:rPr>${properties}</w:rPr>` : ""}${content}</w:r>`
}

function writeRunContent(content: Run["content"][number]) {
  if (content.kind === "drawing") {
    return content.xml
  }
  if (content.kind === "tab") {
    return "<w:tab/>"
  }
  if (content.kind === "break") {
    return writeBreak(content.breakType)
  }
  if (content.kind === "instrText") {
    return writeText("instrText", content.text)
  }
  if (content.kind === "delText") {
    return writeText("delText", content.text)
  }
  if (content.kind === "fldChar") {
    return `<w:fldChar w:fldCharType="${content.fieldType}"/>`
  }
  if (content.kind === "raw") {
    return content.xml
  }
  if (
    content.kind === "footnoteReference" ||
    content.kind === "endnoteReference" ||
    content.kind === "commentReference"
  ) {
    return `<w:${content.kind} w:id="${content.id}"/>`
  }
  if (
    content.kind === "footnoteRef" ||
    content.kind === "endnoteRef" ||
    content.kind === "separator" ||
    content.kind === "continuationSeparator" ||
    content.kind === "annotationRef"
  ) {
    return `<w:${content.kind}/>`
  }
  return writeText("t", content.text)
}

function writeBreak(type: BreakType) {
  return type === "textWrapping" ? "<w:br/>" : `<w:br w:type="${type}"/>`
}

function writeText(tag: "t" | "delText" | "instrText", text: string) {
  const space = /^[ \t\n\r]|[ \t\n\r]$/.test(text) ? ` xml:space="preserve"` : ""
  return `<w:${tag}${space}>${escapeXmlText(text)}</w:${tag}>`
}

function writeTable(table: Table, styles: StyleCatalog, section: SectionProps | null, ids: ParaIds): string {
  const grid = tableGrid(table, section)
    .map((column) => `<w:gridCol w:w="${column}"/>`)
    .join("")
  const rows: TableRow[] = table.rows.length > 0 ? table.rows : [{ cells: [{ blocks: [emptyParagraph()] }] }]
  const written = rows
    .map((row) => {
      const exceptions = writeChildren(rowExceptionsInput(row), row.exceptionSource, writeRowExceptions, ORDER.tblPrEx)
      const properties = writeChildren(rowPropertiesInput(row), row.source, writeRowProperties, ORDER.trPr)
      const cells = row.cells
        .map((cell) => {
          const blocks = cell.blocks.map((block) => writeBlock(block, styles, section, ids)).join("")
          // A cell must end with a paragraph.
          const closing = cell.blocks[cell.blocks.length - 1]?.kind === "paragraph" ? "" : "<w:p/>"
          return `<w:tc>${wrap("tcPr", writeCellProperties(cell))}${blocks}${closing}</w:tc>`
        })
        .join("")
      return `<w:tr>${wrap("tblPrEx", exceptions)}${wrap("trPr", properties)}${cells}</w:tr>`
    })
    .join("")
  return `<w:tbl><w:tblPr>${writeTableProperties(table)}</w:tblPr><w:tblGrid>${grid}</w:tblGrid>${written}</w:tbl>`
}

function wrap(name: string, inner: string) {
  return inner ? `<w:${name}>${inner}</w:${name}>` : ""
}

function writeRowExceptions(input: ReturnType<typeof rowExceptionsInput>) {
  return writeCellMargins(input.cellMargins)
}

function writeRowProperties(input: ReturnType<typeof rowPropertiesInput>) {
  const height = input.height
    ? `<w:trHeight w:val="${input.height.value}"${input.height.rule ? ` w:hRule="${input.height.rule}"` : ""}/>`
    : ""
  return `${input.cantSplit ? "<w:cantSplit/>" : ""}${height}${input.header ? "<w:tblHeader/>" : ""}`
}

function writeTableProperties(table: Table) {
  return writeChildren(
    tablePropertiesInput(table),
    table.source,
    (input) =>
      [
        input.styleId ? `<w:tblStyle w:val="${escapeXml(input.styleId)}"/>` : "",
        input.width ? `<w:tblW w:w="${input.width.value}" w:type="${input.width.type}"/>` : "",
        input.align ? `<w:jc w:val="${input.align}"/>` : "",
        input.cellSpacing
          ? `<w:tblCellSpacing w:w="${input.cellSpacing.value}" w:type="${input.cellSpacing.type}"/>`
          : "",
        input.indent ? `<w:tblInd w:w="${input.indent.value}" w:type="${input.indent.type}"/>` : "",
        writeBorders(input.borders),
        input.layout ? `<w:tblLayout w:type="${input.layout}"/>` : "",
        writeCellMargins(input.cellMargins),
        writeLook(input.look),
        input.caption ? `<w:tblCaption w:val="${escapeXml(input.caption)}"/>` : "",
        input.description ? `<w:tblDescription w:val="${escapeXml(input.description)}"/>` : "",
      ].join(""),
    ORDER.tblPr,
  )
}

function writeBorders(borders: Table["borders"]) {
  if (!borders) {
    return ""
  }
  const sides = (["top", "left", "bottom", "right", "insideH", "insideV"] as const)
    .map((side) => writeBorder(side, borders[side]))
    .join("")
  return sides ? `<w:tblBorders>${sides}</w:tblBorders>` : ""
}

function writeBorder(name: string, border: Border | undefined) {
  if (!border) {
    return ""
  }
  const attributes = [`w:val="${border.value}"`]
  if (border.sz !== undefined) {
    attributes.push(`w:sz="${border.sz}"`)
  }
  if (border.space !== undefined) {
    attributes.push(`w:space="${border.space}"`)
  }
  if (border.color) {
    attributes.push(`w:color="${border.color}"`)
  }
  if (border.shadow) {
    attributes.push(`w:shadow="1"`)
  }
  if (border.frame) {
    attributes.push(`w:frame="1"`)
  }
  return `<w:${name} ${attributes.join(" ")}/>`
}

function writeLook(look: TableLook | undefined) {
  if (!look) {
    return ""
  }
  const attributes: string[] = []
  if (look.val) {
    attributes.push(`w:val="${look.val}"`)
  }
  pushBit(attributes, "w:firstRow", look.firstRow)
  pushBit(attributes, "w:lastRow", look.lastRow)
  pushBit(attributes, "w:firstColumn", look.firstColumn)
  pushBit(attributes, "w:lastColumn", look.lastColumn)
  pushBit(attributes, "w:noHBand", look.noHBand)
  pushBit(attributes, "w:noVBand", look.noVBand)
  return attributes.length > 0 ? `<w:tblLook ${attributes.join(" ")}/>` : ""
}

function writeCellProperties(cell: TableCell) {
  return writeChildren(cellPropertiesInput(cell), cell.source, generateCellProperties, ORDER.tcPr)
}

function generateCellProperties(cell: ReturnType<typeof cellPropertiesInput>) {
  const width = cell.width ? `<w:tcW w:w="${cell.width.value}" w:type="${cell.width.type}"/>` : ""
  const span = cell.gridSpan !== undefined && cell.gridSpan > 1 ? `<w:gridSpan w:val="${cell.gridSpan}"/>` : ""
  const merge =
    cell.vMerge === "restart" ? `<w:vMerge w:val="restart"/>` : cell.vMerge === "continue" ? "<w:vMerge/>" : ""
  const sides = (["top", "left", "bottom", "right", "tl2br", "tr2bl"] as const)
    .map((side) => writeBorder(side, cell.borders?.[side]))
    .join("")
  const borders = sides ? `<w:tcBorders>${sides}</w:tcBorders>` : ""
  const shading = cell.shading
    ? `<w:shd w:val="${cell.shading.value}"${cell.shading.color ? ` w:color="${cell.shading.color}"` : ""}${cell.shading.fill ? ` w:fill="${cell.shading.fill}"` : ""}/>`
    : ""
  const vAlign = cell.vAlign ? `<w:vAlign w:val="${cell.vAlign}"/>` : ""
  const noWrap = cell.noWrap ? "<w:noWrap/>" : ""
  const margins = writeCellMargins(cell.margins, "tcMar")
  const fit = cell.fitText ? "<w:tcFitText/>" : ""
  return `${width}${span}${merge}${borders}${shading}${noWrap}${margins}${fit}${vAlign}`
}

function writeCellMargins(margins: CellMargins | undefined, name = "tblCellMar") {
  if (!margins) {
    return ""
  }
  const edges = (["top", "left", "bottom", "right"] as const)
    .map((side) => {
      const edge = margins[side]
      return edge ? `<w:${side} w:w="${edge.value}" w:type="${edge.type}"/>` : ""
    })
    .join("")
  return edges ? `<w:${name}>${edges}</w:${name}>` : ""
}

function writeNumberingPart(numbering: NumberingDefinitions) {
  if (numbering.abstracts.length === 0 && numbering.instances.length === 0) {
    return ""
  }
  const usesW15 = numbering.abstracts.some((item) => item.restartAfterBreak !== undefined)
  const usesCid = numbering.instances.some((item) => item.durableId)
  const ignorable = [usesW15 ? "w15" : "", usesCid ? "w16cid" : ""].filter(Boolean)
  const namespaces = [`xmlns:w="${WORD_NS}"`]
  if (ignorable.length > 0) {
    namespaces.push(`xmlns:mc="${MC_NS}"`)
    if (usesW15) {
      namespaces.push(`xmlns:w15="${W15_NS}"`)
    }
    if (usesCid) {
      namespaces.push(`xmlns:w16cid="${W16CID_NS}"`)
    }
    namespaces.push(`mc:Ignorable="${ignorable.join(" ")}"`)
  }
  const abstracts = numbering.abstracts.map((item) => writeAbstract(item)).join("")
  const instances = numbering.instances.map((item) => writeNumber(item)).join("")
  const declared = numbering.rootAttributes?.length
    ? numbering.rootAttributes.map(
        (item) => `${item.prefix ? `${item.prefix}:` : ""}${item.local}="${escapeXml(item.value)}"`,
      )
    : namespaces
  return `<w:numbering ${declared.join(" ")}>${abstracts}${instances}</w:numbering>`
}

function writeAbstract(item: AbstractNumbering) {
  const restart =
    item.restartAfterBreak === undefined
      ? ""
      : ` w15:restartNumberingAfterBreak="${item.restartAfterBreak ? "1" : "0"}"`
  const nsid = item.nsid ? `<w:nsid w:val="${item.nsid}"/>` : ""
  const kind = item.multiLevelType ? `<w:multiLevelType w:val="${item.multiLevelType}"/>` : ""
  const tmpl = item.tmpl ? `<w:tmpl w:val="${item.tmpl}"/>` : ""
  const levels = item.levels.map((level) => writeLevel(level)).join("")
  return `<w:abstractNum w:abstractNumId="${item.id}"${restart}>${nsid}${kind}${tmpl}${levels}</w:abstractNum>`
}

function numberingJustify(value: string) {
  if (value === "start") {
    return "left"
  }
  if (value === "end") {
    return "right"
  }
  return value
}

function writeLevel(level: NumberingLevel) {
  const start = level.start !== undefined ? `<w:start w:val="${level.start}"/>` : ""
  const format = level.format ? `<w:numFmt w:val="${level.format}"/>` : ""
  const text = level.text !== undefined ? `<w:lvlText w:val="${escapeXml(level.text)}"/>` : ""
  const justify = level.justify ? `<w:lvlJc w:val="${numberingJustify(level.justify)}"/>` : ""
  const paragraph = writeLooseParagraphProperties(level.pPr)
  const run = writeRunProperties(level.rPr)
  return `<w:lvl w:ilvl="${level.ilvl}">${start}${format}${text}${justify}${paragraph ? `<w:pPr>${paragraph}</w:pPr>` : ""}${run ? `<w:rPr>${run}</w:rPr>` : ""}</w:lvl>`
}

function writeNumber(item: NumberingDefinitions["instances"][number]) {
  const durable = item.durableId ? ` w16cid:durableId="${escapeXml(item.durableId)}"` : ""
  return `<w:num w:numId="${item.id}"${durable}><w:abstractNumId w:val="${item.abstractNumId}"/></w:num>`
}

function writeSection(section: SectionProps) {
  return `<w:sectPr>${writeChildren(section, section.source, generateSection, ORDER.sectPr)}</w:sectPr>`
}

function generateSection(section: SectionProps) {
  const parts: string[] = []
  for (const ref of section.references ?? []) {
    const tag = ref.kind === "header" ? "headerReference" : "footerReference"
    parts.push(`<w:${tag} w:type="${ref.type}" r:id="${escapeXml(ref.relId)}"/>`)
  }
  if (section.type) {
    parts.push(`<w:type w:val="${section.type}"/>`)
  }
  const size = [`w:w="${section.pageWidth ?? ""}"`, `w:h="${section.pageHeight ?? ""}"`].filter(
    (item) => !item.endsWith('=""'),
  )
  if (section.orient === "landscape") {
    size.push(`w:orient="landscape"`)
  }
  if (size.length > 0) {
    parts.push(`<w:pgSz ${size.join(" ")}/>`)
  }
  const margins = marginAttributes(section)
  if (margins) {
    parts.push(`<w:pgMar ${margins}/>`)
  }
  if (section.lineNumbers) {
    const lines = section.lineNumbers
    const attributes: string[] = []
    pushNumber(attributes, "w:countBy", lines.countBy)
    pushNumber(attributes, "w:start", lines.start)
    pushNumber(attributes, "w:distance", lines.distance)
    if (lines.restart) {
      attributes.push(`w:restart="${lines.restart}"`)
    }
    parts.push(`<w:lnNumType${attributes.length ? ` ${attributes.join(" ")}` : ""}/>`)
  }
  if (section.pageBorders) {
    const borders = section.pageBorders
    const attributes = [
      borders.zOrder ? `w:zOrder="${borders.zOrder}"` : "",
      borders.display ? `w:display="${borders.display}"` : "",
      borders.offsetFrom ? `w:offsetFrom="${borders.offsetFrom}"` : "",
    ].filter(Boolean)
    const sides = (["top", "left", "bottom", "right"] as const).map((side) => writeBorder(side, borders[side])).join("")
    parts.push(`<w:pgBorders${attributes.length ? ` ${attributes.join(" ")}` : ""}>${sides}</w:pgBorders>`)
  }
  const columns: string[] = []
  if (section.columnCount !== undefined) {
    columns.push(`w:num="${section.columnCount}"`)
  }
  if (section.columnSpace !== undefined) {
    columns.push(`w:space="${section.columnSpace}"`)
  }
  if (section.columnSeparator !== undefined) {
    columns.push(`w:sep="${section.columnSeparator ? 1 : 0}"`)
  }
  if (columns.length > 0) {
    parts.push(`<w:cols ${columns.join(" ")}/>`)
  }
  if (section.titlePg) {
    parts.push("<w:titlePg/>")
  }
  if (section.linePitch !== undefined) {
    parts.push(`<w:docGrid w:linePitch="${section.linePitch}"/>`)
  }
  return parts.join("")
}

function marginAttributes(section: SectionProps) {
  const attributes: string[] = []
  pushNumber(attributes, "w:top", section.marginTop)
  pushNumber(attributes, "w:right", section.marginRight)
  pushNumber(attributes, "w:bottom", section.marginBottom)
  pushNumber(attributes, "w:left", section.marginLeft)
  pushNumber(attributes, "w:header", section.header)
  pushNumber(attributes, "w:footer", section.footer)
  pushNumber(attributes, "w:gutter", section.gutter)
  return attributes.join(" ")
}

function writeParagraphProperties(paragraph: Paragraph, styles: StyleCatalog) {
  const known = paragraph.styleId === undefined || styles.styles.some((style) => style.id === paragraph.styleId)
  const source = paragraph.pPr.source
  const inner = writeChildren(
    paragraphPropertiesInput(paragraph),
    // A style the document does not define is dropped, as Word does.
    known || !source ? source : { ...source, children: source.children.filter((child) => child.name !== "w:pStyle") },
    (input) => generateParagraphProperties(input, styles),
    ORDER.pPr,
  )
  return inner ? `<w:pPr>${inner}</w:pPr>` : ""
}

function generateParagraphProperties(paragraph: ReturnType<typeof paragraphPropertiesInput>, styles: StyleCatalog) {
  const known = paragraph.styleId !== undefined && styles.styles.some((style) => style.id === paragraph.styleId)
  return [
    known ? `<w:pStyle w:val="${escapeXml(paragraph.styleId ?? "")}"/>` : "",
    onOff("keepNext", paragraph.pPr.keepNext),
    onOff("keepLines", paragraph.pPr.keepLines),
    onOff("pageBreakBefore", paragraph.pPr.pageBreakBefore),
    onOff("widowControl", paragraph.pPr.widowControl),
    writeNumbering(paragraph.pPr),
    onOff("suppressLineNumbers", paragraph.pPr.suppressLineNumbers),
    writeParagraphBox(paragraph.pPr),
    writeTabs(paragraph.pPr.tabs),
    onOff("suppressAutoHyphens", paragraph.pPr.suppressAutoHyphens),
    writeSpacing(paragraph.pPr.spacing),
    writeIndent(paragraph.pPr.ind),
    onOff("contextualSpacing", paragraph.pPr.contextualSpacing),
    onOff("mirrorIndents", paragraph.pPr.mirrorIndents),
    paragraph.pPr.jc ? `<w:jc w:val="${paragraph.pPr.jc}"/>` : "",
    paragraph.pPr.textboxTightWrap ? `<w:textboxTightWrap w:val="${paragraph.pPr.textboxTightWrap}"/>` : "",
    paragraph.pPr.outlineLvl !== undefined ? `<w:outlineLvl w:val="${paragraph.pPr.outlineLvl}"/>` : "",
    wrapRunProperties(paragraph.markRPr),
    paragraph.sectionBreak ? writeSection(paragraph.sectionBreak) : "",
  ].join("")
}

/** w:pBdr and w:shd of a paragraph, in the order the schema wants them. */
function writeParagraphBox(props: ParagraphProperties) {
  const sides = (["top", "left", "bottom", "right"] as const)
    .map((side) => writeBorder(side, props.borders?.[side]))
    .join("")
  return `${sides ? `<w:pBdr>${sides}</w:pBdr>` : ""}${writeShading(props.shading)}`
}

function writeShading(shading: Shading | undefined) {
  return shading
    ? `<w:shd w:val="${shading.value}"${shading.color ? ` w:color="${shading.color}"` : ""}${shading.fill ? ` w:fill="${shading.fill}"` : ""}/>`
    : ""
}

function writeTabs(tabs: ParagraphProperties["tabs"]) {
  if (!tabs || tabs.length === 0) {
    return ""
  }
  const stops = tabs
    .map((tab) => {
      const leader = tab.leader ? ` w:leader="${tab.leader}"` : ""
      return `<w:tab w:val="${tab.val}"${leader} w:pos="${tab.pos}"/>`
    })
    .join("")
  return `<w:tabs>${stops}</w:tabs>`
}

function writeNumbering(props: ParagraphProperties) {
  if (!props.numPr) {
    return ""
  }
  const ilvl = props.numPr.ilvl !== undefined ? `<w:ilvl w:val="${props.numPr.ilvl}"/>` : ""
  const numId = props.numPr.numId !== undefined ? `<w:numId w:val="${props.numPr.numId}"/>` : ""
  return ilvl || numId ? `<w:numPr>${ilvl}${numId}</w:numPr>` : ""
}

function writeSpacing(spacing: Spacing | undefined) {
  if (!spacing) {
    return ""
  }
  const attributes: string[] = []
  pushNumber(attributes, "w:before", spacing.before)
  pushNumber(attributes, "w:after", spacing.after)
  pushNumber(attributes, "w:line", spacing.line)
  if (spacing.lineRule) {
    attributes.push(`w:lineRule="${spacing.lineRule}"`)
  }
  return attributes.length > 0 ? `<w:spacing ${attributes.join(" ")}/>` : ""
}

function writeIndent(indent: Indent | undefined) {
  if (!indent) {
    return ""
  }
  const attributes: string[] = []
  pushNumber(attributes, "w:left", indent.left)
  pushNumber(attributes, "w:right", indent.right)
  pushNumber(attributes, "w:hanging", indent.hanging)
  pushNumber(attributes, "w:firstLine", indent.firstLine)
  return attributes.length > 0 ? `<w:ind ${attributes.join(" ")}/>` : ""
}

function wrapRunProperties(props: RunProperties) {
  const inner = writeRunProperties(props)
  return inner ? `<w:rPr>${inner}</w:rPr>` : ""
}

function writeRunProperties(props: RunProperties): string {
  return writeChildren(props, props.source, generateRunProperties, ORDER.rPr)
}

/** Child order is ECMA-376-1 CT_RPr. */
function generateRunProperties(props: RunProperties): string {
  return [
    props.rStyle ? `<w:rStyle w:val="${escapeXml(props.rStyle)}"/>` : "",
    writeFonts(props),
    onOff("b", props.b),
    onOff("bCs", props.bCs),
    onOff("i", props.i),
    onOff("iCs", props.iCs),
    onOff("caps", props.caps),
    onOff("smallCaps", props.smallCaps),
    onOff("strike", props.strike),
    onOff("dstrike", props.dstrike),
    onOff("outline", props.outline),
    onOff("shadow", props.shadow),
    onOff("emboss", props.emboss),
    onOff("imprint", props.imprint),
    onOff("noProof", props.noProof),
    onOff("vanish", props.vanish),
    props.color ? `<w:color w:val="${props.color}"/>` : "",
    props.spacing !== undefined ? `<w:spacing w:val="${props.spacing}"/>` : "",
    props.w !== undefined ? `<w:w w:val="${props.w}"/>` : "",
    props.kern !== undefined ? `<w:kern w:val="${props.kern}"/>` : "",
    props.position !== undefined ? `<w:position w:val="${props.position}"/>` : "",
    props.sz !== undefined ? `<w:sz w:val="${props.sz}"/>` : "",
    props.szCs !== undefined ? `<w:szCs w:val="${props.szCs}"/>` : "",
    props.highlight ? `<w:highlight w:val="${props.highlight}"/>` : "",
    writeUnderline(props),
    writeBorder("bdr", props.bdr),
    writeShading(props.shd),
    props.vertAlign ? `<w:vertAlign w:val="${props.vertAlign}"/>` : "",
    writeLanguage(props),
    writePropertyChange(props),
  ].join("")
}

function writePropertyChange(props: RunProperties): string {
  const change = props.rPrChange
  if (!change) {
    return ""
  }
  const author = change.author ? ` w:author="${escapeXml(change.author)}"` : ""
  const date = change.date ? ` w:date="${escapeXml(change.date)}"` : ""
  const inner = writeRunProperties(change.rPr)
  const body = inner ? `<w:rPr>${inner}</w:rPr>` : "<w:rPr/>"
  return `<w:rPrChange w:id="${change.id}"${author}${date}>${body}</w:rPrChange>`
}

function writeFonts(props: RunProperties) {
  const fonts = props.rFonts
  if (!fonts) {
    return ""
  }
  const attributes: string[] = []
  if (fonts.ascii) {
    attributes.push(`w:ascii="${escapeXml(fonts.ascii)}"`)
  }
  if (fonts.hAnsi) {
    attributes.push(`w:hAnsi="${escapeXml(fonts.hAnsi)}"`)
  }
  if (fonts.cs) {
    attributes.push(`w:cs="${escapeXml(fonts.cs)}"`)
  }
  if (fonts.eastAsia) {
    attributes.push(`w:eastAsia="${escapeXml(fonts.eastAsia)}"`)
  }
  if (fonts.hint) {
    attributes.push(`w:hint="${fonts.hint}"`)
  }
  if (fonts.asciiTheme) {
    attributes.push(`w:asciiTheme="${escapeXml(fonts.asciiTheme)}"`)
  }
  if (fonts.hAnsiTheme) {
    attributes.push(`w:hAnsiTheme="${escapeXml(fonts.hAnsiTheme)}"`)
  }
  if (fonts.eastAsiaTheme) {
    attributes.push(`w:eastAsiaTheme="${escapeXml(fonts.eastAsiaTheme)}"`)
  }
  if (fonts.csTheme) {
    attributes.push(`w:cstheme="${escapeXml(fonts.csTheme)}"`)
  }
  return attributes.length > 0 ? `<w:rFonts ${attributes.join(" ")}/>` : ""
}

function writeUnderline(props: RunProperties) {
  if (!props.u) {
    return ""
  }
  const color = props.u.color ? ` w:color="${props.u.color}"` : ""
  return `<w:u w:val="${props.u.value}"${color}/>`
}

function writeLanguage(props: RunProperties) {
  const lang = props.lang
  if (!lang) {
    return ""
  }
  const attributes: string[] = []
  if (lang.val) {
    attributes.push(`w:val="${escapeXml(lang.val)}"`)
  }
  if (lang.eastAsia) {
    attributes.push(`w:eastAsia="${escapeXml(lang.eastAsia)}"`)
  }
  if (lang.bidi) {
    attributes.push(`w:bidi="${escapeXml(lang.bidi)}"`)
  }
  return attributes.length > 0 ? `<w:lang ${attributes.join(" ")}/>` : ""
}

function writeStyles(catalog: StyleCatalog) {
  if (catalog.raw) {
    return writeStylesFromSource(catalog, catalog.raw)
  }
  const defaults = writeDocDefaults(catalog)
  const styles = catalog.styles.map((style) => writeStyle(style)).join("")
  if (!defaults && !styles) {
    return ""
  }
  return `<w:styles xmlns:w="${WORD_NS}">${defaults}${styles}</w:styles>`
}

/** Keeps latentStyles and every unedited style as Word wrote it; edited and added styles come from the model. */
function writeStylesFromSource(catalog: StyleCatalog, raw: NonNullable<StyleCatalog["raw"]>) {
  const pending = [...catalog.styles]
  const children: string[] = []
  for (const child of raw.children) {
    if (child.name === "w:docDefaults") {
      children.push(docDefaultsFingerprint(catalog) === raw.docDefaults ? child.xml : writeDocDefaults(catalog))
      continue
    }
    if (child.name !== "w:style") {
      children.push(child.xml)
      continue
    }
    const index = pending.findIndex((style) => style.raw?.xml === child.xml)
    if (index < 0) {
      continue
    }
    const [style] = pending.splice(index, 1)
    if (style) {
      children.push(writeStyle(style))
    }
  }
  children.push(...pending.map((style) => writeStyle(style)))
  const attributes = raw.rootAttributes.map(
    (item) => `${item.prefix ? `${item.prefix}:` : ""}${item.local}="${escapeXml(item.value)}"`,
  )
  return `<w:styles ${attributes.join(" ")}>${children.join("")}</w:styles>`
}

function writeDocDefaults(catalog: StyleCatalog) {
  const rPr = writeRunProperties(catalog.docDefaults.rPr)
  const pPr = writeLooseParagraphProperties(catalog.docDefaults.pPr)
  if (!rPr && !pPr) {
    return ""
  }
  const run = rPr ? `<w:rPrDefault><w:rPr>${rPr}</w:rPr></w:rPrDefault>` : ""
  const paragraph = pPr ? `<w:pPrDefault><w:pPr>${pPr}</w:pPr></w:pPrDefault>` : ""
  return `<w:docDefaults>${run}${paragraph}</w:docDefaults>`
}

function writeStyle(style: Style) {
  if (style.raw && style.raw.model === styleFingerprint(style)) {
    return style.raw.xml
  }
  const attributes = [`w:type="${style.type}"`]
  if (style.default) {
    attributes.push(`w:default="1"`)
  }
  attributes.push(`w:styleId="${escapeXml(style.id)}"`)
  const name = style.name ? `<w:name w:val="${escapeXml(style.name)}"/>` : ""
  const basedOn = style.basedOn ? `<w:basedOn w:val="${escapeXml(style.basedOn)}"/>` : ""
  const next = style.next ? `<w:next w:val="${escapeXml(style.next)}"/>` : ""
  const link = style.link ? `<w:link w:val="${escapeXml(style.link)}"/>` : ""
  const pPr = writeLooseParagraphProperties(style.pPr)
  const rPr = writeRunProperties(style.rPr)
  return `<w:style ${attributes.join(" ")}>${name}${basedOn}${next}${link}${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}</w:style>`
}

function writeLooseParagraphProperties(props: ParagraphProperties) {
  return [
    onOff("keepNext", props.keepNext),
    onOff("keepLines", props.keepLines),
    onOff("pageBreakBefore", props.pageBreakBefore),
    onOff("widowControl", props.widowControl),
    writeNumbering(props),
    onOff("suppressLineNumbers", props.suppressLineNumbers),
    writeParagraphBox(props),
    writeTabs(props.tabs),
    onOff("suppressAutoHyphens", props.suppressAutoHyphens),
    writeSpacing(props.spacing),
    writeIndent(props.ind),
    onOff("contextualSpacing", props.contextualSpacing),
    onOff("mirrorIndents", props.mirrorIndents),
    props.jc ? `<w:jc w:val="${props.jc}"/>` : "",
    props.textboxTightWrap ? `<w:textboxTightWrap w:val="${props.textboxTightWrap}"/>` : "",
    props.outlineLvl !== undefined ? `<w:outlineLvl w:val="${props.outlineLvl}"/>` : "",
  ].join("")
}

function writeSettings(settings: Settings) {
  const modelled = new Map<string, string>([
    [
      "w:defaultTabStop",
      settings.defaultTabStop !== undefined ? `<w:defaultTabStop w:val="${settings.defaultTabStop}"/>` : "",
    ],
    ["w:evenAndOddHeaders", settings.evenAndOddHeaders ? "<w:evenAndOddHeaders/>" : ""],
    ["w:alignBordersAndEdges", settings.alignBordersAndEdges ? "<w:alignBordersAndEdges/>" : ""],
    ["w:bordersDoNotSurroundHeader", settings.bordersDoNotSurroundHeader ? "<w:bordersDoNotSurroundHeader/>" : ""],
    ["w:bordersDoNotSurroundFooter", settings.bordersDoNotSurroundFooter ? "<w:bordersDoNotSurroundFooter/>" : ""],
    ["w:footnotePr", writeNotePr("footnote", settings.footnotePr)],
    ["w:endnotePr", writeNotePr("endnote", settings.endnotePr)],
    ["w:compat", writeCompat(settings.raw?.children.find((child) => child.name === "w:compat")?.xml)],
    ["w:rsids", writeRsids(settings)],
  ])
  if (!settings.raw) {
    return `<w:settings xmlns:w="${WORD_NS}">${[...modelled.values()].join("")}</w:settings>`
  }
  const children = settings.raw.children.map((child) => {
    const replacement = modelled.get(child.name)
    if (replacement === undefined) {
      return child
    }
    modelled.delete(child.name)
    return { name: child.name, xml: replacement }
  })
  // Elements the source did not have (say, odd/even headers switched on) go in at their schema position.
  for (const [name, xml] of modelled) {
    if (!xml) {
      continue
    }
    const rank = settingsRank(name)
    const at = children.findIndex((child) => settingsRank(child.name) > rank)
    children.splice(at < 0 ? children.length : at, 0, { name, xml })
  }
  const attributes = settings.raw.rootAttributes.map(
    (item) => `${item.prefix ? `${item.prefix}:` : ""}${item.local}="${escapeXml(item.value)}"`,
  )
  return `<w:settings ${attributes.join(" ")}>${children.map((child) => child.xml).join("")}</w:settings>`
}

/** Writes compatibilityMode 15 and keeps every other compat setting from the source. */
function writeCompat(source: string | undefined) {
  const mode = `<w:compatSetting w:name="compatibilityMode" w:uri="${COMPATIBILITY_URI}" w:val="15"/>`
  if (!source || /^<w:compat\s*\/>$/.test(source)) {
    return `<w:compat>${mode}</w:compat>`
  }
  const existing = /<w:compatSetting\b[^>]*w:name="compatibilityMode"[^>]*\/>/
  if (existing.test(source)) {
    return source.replace(existing, mode)
  }
  return source.replace(/<\/w:compat>$/, `${mode}</w:compat>`)
}

function writeRsids(settings: Settings) {
  const ids = [
    settings.rsidRoot ? `<w:rsidRoot w:val="${settings.rsidRoot}"/>` : "",
    ...settings.rsids.map((id) => `<w:rsid w:val="${id}"/>`),
  ].join("")
  return ids ? `<w:rsids>${ids}</w:rsids>` : ""
}

/** CT_Settings child order from the schema. Extension elements (w14:, w15:…) come after all of these. */
const SETTINGS_ORDER = [
  "w:writeProtection",
  "w:view",
  "w:zoom",
  "w:removePersonalInformation",
  "w:removeDateAndTime",
  "w:doNotDisplayPageBoundaries",
  "w:displayBackgroundShape",
  "w:printPostScriptOverText",
  "w:printFractionalCharacterWidth",
  "w:printFormsData",
  "w:embedTrueTypeFonts",
  "w:embedSystemFonts",
  "w:saveSubsetFonts",
  "w:saveFormsData",
  "w:mirrorMargins",
  "w:alignBordersAndEdges",
  "w:bordersDoNotSurroundHeader",
  "w:bordersDoNotSurroundFooter",
  "w:gutterAtTop",
  "w:hideSpellingErrors",
  "w:hideGrammaticalErrors",
  "w:activeWritingStyle",
  "w:proofState",
  "w:formsDesign",
  "w:attachedTemplate",
  "w:linkStyles",
  "w:stylePaneFormatFilter",
  "w:stylePaneSortMethod",
  "w:documentType",
  "w:mailMerge",
  "w:revisionView",
  "w:trackRevisions",
  "w:doNotTrackMoves",
  "w:doNotTrackFormatting",
  "w:documentProtection",
  "w:autoFormatOverride",
  "w:styleLockTheme",
  "w:styleLockQFSet",
  "w:defaultTabStop",
  "w:autoHyphenation",
  "w:consecutiveHyphenLimit",
  "w:hyphenationZone",
  "w:doNotHyphenateCaps",
  "w:showEnvelope",
  "w:summaryLength",
  "w:clickAndTypeStyle",
  "w:defaultTableStyle",
  "w:evenAndOddHeaders",
  "w:bookFoldRevPrinting",
  "w:bookFoldPrinting",
  "w:bookFoldPrintingSheets",
  "w:drawingGridHorizontalSpacing",
  "w:drawingGridVerticalSpacing",
  "w:displayHorizontalDrawingGridEvery",
  "w:displayVerticalDrawingGridEvery",
  "w:doNotUseMarginsForDrawingGridOrigin",
  "w:drawingGridHorizontalOrigin",
  "w:drawingGridVerticalOrigin",
  "w:doNotShadeFormData",
  "w:noPunctuationKerning",
  "w:characterSpacingControl",
  "w:printTwoOnOne",
  "w:strictFirstAndLastChars",
  "w:noLineBreaksAfter",
  "w:noLineBreaksBefore",
  "w:savePreviewPicture",
  "w:doNotValidateAgainstSchema",
  "w:saveInvalidXml",
  "w:ignoreMixedContent",
  "w:alwaysShowPlaceholderText",
  "w:doNotDemarcateInvalidXml",
  "w:saveXmlDataOnly",
  "w:useXSLTWhenSaving",
  "w:saveThroughXslt",
  "w:showXMLTags",
  "w:alwaysMergeEmptyNamespace",
  "w:updateFields",
  "w:hdrShapeDefaults",
  "w:footnotePr",
  "w:endnotePr",
  "w:compat",
  "w:docVars",
  "w:rsids",
  "m:mathPr",
  "w:attachedSchema",
  "w:themeFontLang",
  "w:clrSchemeMapping",
  "w:doNotIncludeSubdocsInStats",
  "w:doNotAutoCompressPictures",
  "w:forceUpgrade",
  "w:captions",
  "w:readModeInkLockDown",
  "w:smartTagType",
  "sl:schemaLibrary",
  "w:shapeDefaults",
  "w:doNotEmbedSmartTags",
  "w:decimalSymbol",
  "w:listSeparator",
]

function settingsRank(name: string) {
  const rank = SETTINGS_ORDER.indexOf(name)
  return rank < 0 ? SETTINGS_ORDER.length : rank
}

function writeNotePr(local: "footnote" | "endnote", ids: number[] | undefined) {
  if (!ids || ids.length === 0) {
    return ""
  }
  const items = ids.map((id) => `<w:${local} w:id="${id}"/>`).join("")
  const tag = local === "footnote" ? "footnotePr" : "endnotePr"
  return `<w:${tag}>${items}</w:${tag}>`
}

function onOff(name: string, value: boolean | undefined) {
  if (value === undefined) {
    return ""
  }
  return value ? `<w:${name}/>` : `<w:${name} w:val="0"/>`
}

function pushBit(attributes: string[], name: string, value: boolean | undefined) {
  if (value !== undefined) {
    attributes.push(`${name}="${value ? "1" : "0"}"`)
  }
}

function pushNumber(attributes: string[], name: string, value: number | undefined) {
  if (value !== undefined) {
    attributes.push(`${name}="${value}"`)
  }
}

function paraIdState(): ParaIds {
  return { used: new Set<string>(), next: 1 }
}

function takeParaId(state: ParaIds, value: string | undefined) {
  const valid = validParaId(value)
  if (valid && !state.used.has(valid)) {
    state.used.add(valid)
    return valid
  }
  if (!value) {
    return undefined
  }
  let number = state.next
  while (number < 0x80000000) {
    const id = number.toString(16).toUpperCase().padStart(8, "0")
    number += 1
    if (!state.used.has(id)) {
      state.used.add(id)
      state.next = number
      return id
    }
  }
  return undefined
}

function validParaId(value: string | undefined) {
  if (!value || !/^[0-9A-Fa-f]{8}$/.test(value)) {
    return undefined
  }
  const hex = value.toUpperCase()
  return Number.parseInt(hex, 16) < 0x80000000 ? hex : undefined
}
