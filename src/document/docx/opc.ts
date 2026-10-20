import { attribute, decodeXml, escapeXml, parseElements, xmlBytes, XmlError } from "@/document/docx/xml"
import { readZip, writeZip, type ZipEntry } from "@/document/docx/zip"

export const CONTENT_TYPE_RELS = "application/vnd.openxmlformats-package.relationships+xml"
export const CONTENT_TYPE_XML = "application/xml"
export const CONTENT_TYPE_DOCUMENT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
export const CONTENT_TYPE_MACRO = "application/vnd.ms-word.document.macroEnabled.main+xml"
export const CONTENT_TYPE_TEMPLATE = "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml"
export const CONTENT_TYPE_MACRO_TEMPLATE = "application/vnd.ms-word.template.macroEnabledTemplate.main+xml"

const MAIN_BY_EXTENSION: Record<string, string> = {
  docx: CONTENT_TYPE_DOCUMENT,
  docm: CONTENT_TYPE_MACRO,
  dotx: CONTENT_TYPE_TEMPLATE,
  dotm: CONTENT_TYPE_MACRO_TEMPLATE,
}

const OFFICE_DOCUMENT_TYPES = new Set([
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
  "http://purl.oclc.org/ooxml/officeDocument/relationships/officeDocument",
])

const IMAGE_EXTENSIONS = new Set(["png", "jpeg", "jpg", "gif", "bmp", "tif", "tiff", "emf", "wmf"])

const CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
const RELATIONSHIPS_NS = "http://schemas.openxmlformats.org/package/2006/relationships"

export class OpcError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "OpcError"
    this.code = code
  }
}

export type OpcWarningCode =
  "crc" | "missing-content-type" | "duplicate-relationship-id" | "unsafe-part-name" | "broken-part"

export type OpcWarning = {
  code: OpcWarningCode
  message: string
  partName?: string
}

export type ContentTypeDefault = {
  extension: string
  contentType: string
}

export type ContentTypeOverride = {
  partName: string
  contentType: string
}

export type OpcRelationship = {
  id: string
  type: string
  target: string
  targetMode: "Internal" | "External"
  /** Resolved part, or null for an external target or a missing part. */
  partName: string | null
}

export type OpcPart = {
  /** Leading slash, forward slashes, spelling taken from the zip entry. */
  name: string
  contentType: string
  data: Uint8Array
}

export type RelationshipGroup = {
  /** Leading-slash source part, or "" for the package relationships. */
  source: string
  items: OpcRelationship[]
}

export type OpcPackage = {
  fileName: string
  mainPartName: string
  parts: OpcPart[]
  defaults: ContentTypeDefault[]
  overrides: ContentTypeOverride[]
  relationships: RelationshipGroup[]
  warnings: OpcWarning[]
  zipEntries: ZipEntry[]
}

export function partKey(name: string) {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "")
  try {
    return decodeURIComponent(normalized).toLowerCase()
  } catch {
    return normalized.toLowerCase()
  }
}

export function findPart(pkg: OpcPackage, name: string) {
  const key = partKey(name)
  return pkg.parts.find((part) => partKey(part.name) === key)
}

export function relationshipsFor(pkg: OpcPackage, source: string) {
  const key = source === "" ? "" : partKey(source)
  return pkg.relationships.find((group) => (group.source === "" ? "" : partKey(group.source)) === key)?.items ?? []
}

export async function openPackage(bytes: Uint8Array, fileName = "document.docx"): Promise<OpcPackage> {
  const zipEntries = await readZip(bytes)
  const warnings: OpcWarning[] = []
  for (const entry of zipEntries) {
    if (entry.crcWarning) {
      warnings.push({ code: "crc", message: entry.crcWarning, partName: `/${entry.normalizedName}` })
    }
    if (entry.normalizedName.includes(" ")) {
      warnings.push({
        code: "unsafe-part-name",
        message: `Part name ${entry.normalizedName} contains a space. OPC stores that character percent-encoded.`,
        partName: `/${entry.normalizedName}`,
      })
    }
  }

  const contentTypesEntry = zipEntries.find((entry) => partKey(entry.normalizedName) === "[content_types].xml")
  if (!contentTypesEntry) {
    throw new OpcError("missing-content-types", "The package has no [Content_Types].xml part.")
  }

  let parsed: { defaults: ContentTypeDefault[]; overrides: ContentTypeOverride[] }
  try {
    parsed = parseContentTypes(decodeXml(contentTypesEntry.data))
  } catch (error) {
    throw new OpcError("broken-content-types", xmlFailure(error, "[Content_Types].xml"))
  }
  const defaults = parsed.defaults
  const overrides = parsed.overrides

  const parts: OpcPart[] = []
  const seen = new Set<string>()
  for (const entry of zipEntries) {
    if (isContentTypesName(entry.normalizedName) || isRelsZipPath(entry.normalizedName)) {
      continue
    }
    const key = partKey(entry.normalizedName)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    const name = `/${entry.normalizedName}`
    const contentType = contentTypeFor(name, defaults, overrides)
    parts.push({ name, contentType: contentType ?? "", data: entry.data })
  }

  const relationships = parseAllRelationships(zipEntries, parts, warnings)
  const main = relationshipsForSource(relationships, "").find(
    (item) => item.targetMode === "Internal" && OFFICE_DOCUMENT_TYPES.has(item.type) && item.partName,
  )
  if (!main?.partName) {
    throw new OpcError("missing-main-part", "The package relationships do not point at an office document.")
  }

  const extension = fileExtension(fileName)
  const expected = MAIN_BY_EXTENSION[extension]
  if (!expected) {
    throw new OpcError("unsupported-extension", `Cannot open a .${extension || "unknown"} package as a Word document.`)
  }
  const mainType = contentTypeFor(main.partName, defaults, overrides)
  if (mainType !== expected) {
    throw new OpcError(
      "content-type-mismatch",
      `A .${extension} file must use ${expected}. This package uses ${mainType ?? "no content type"}.`,
    )
  }

  for (const part of parts) {
    if (part.name === main.partName) {
      continue
    }
    const extensionName = fileExtension(part.name)
    if (extensionName !== "xml") {
      continue
    }
    if (!hasOverride(part.name, overrides)) {
      warnings.push({
        code: "missing-content-type",
        message: `${part.name} has no content-type Override.`,
        partName: part.name,
      })
    }
  }

  return {
    fileName,
    mainPartName: main.partName,
    parts,
    defaults,
    overrides,
    relationships,
    warnings,
    zipEntries,
  }
}

export async function writePackage(pkg: OpcPackage): Promise<Uint8Array> {
  const extension = fileExtension(pkg.fileName)
  const expected = MAIN_BY_EXTENSION[extension]
  if (!expected) {
    throw new OpcError("unsupported-extension", `Cannot save a .${extension || "unknown"} Word package.`)
  }
  const main = findPart(pkg, pkg.mainPartName)
  if (!main) {
    throw new OpcError("missing-main-part", "The package has no main document part.")
  }
  if (main.contentType !== expected) {
    throw new OpcError(
      "content-type-mismatch",
      `A .${extension} file must use ${expected}. This package uses ${main.contentType}.`,
    )
  }

  for (const part of pkg.parts) {
    if (!part.contentType) {
      throw new OpcError("missing-content-type", `${part.name} has no content type.`)
    }
    if (partNameNeedsEscaping(part.name)) {
      throw new OpcError("unsafe-part-name", `Part name ${part.name} needs percent-encoding. Rename it before saving.`)
    }
  }
  for (const group of pkg.relationships) {
    const ids = new Set<string>()
    for (const item of group.items) {
      if (ids.has(item.id)) {
        throw new OpcError("duplicate-relationship-id", `Relationship id ${item.id} is used twice.`)
      }
      ids.add(item.id)
      if (item.targetMode === "Internal" && !item.partName) {
        throw new OpcError("dangling-relationship", `Relationship ${item.id} does not point at a part.`)
      }
    }
  }

  const defaults = defaultsForWrite(pkg)
  const overrides = overridesForWrite(pkg)
  const entries = [
    { name: "[Content_Types].xml", data: contentTypesBytes(defaults, overrides), stored: false, unknown: false },
    ...relationshipEntries(pkg),
    ...pkg.parts.map((part) => ({
      name: zipPath(part.name),
      data: part.data,
      stored: IMAGE_EXTENSIONS.has(fileExtension(part.name)),
      unknown: isUnknownPart(part),
    })),
  ]
  const mainZip = zipPath(pkg.mainPartName)
  entries.sort((left, right) => rank(left, mainZip) - rank(right, mainZip) || left.name.localeCompare(right.name))
  return writeZip(entries)
}

function parseContentTypes(xml: string) {
  const defaults: ContentTypeDefault[] = []
  const overrides: ContentTypeOverride[] = []
  parseElements(xml, (element) => {
    const name = element.name.toLowerCase()
    if (name === "default") {
      const extension = attribute(element, "Extension")
      const contentType = attribute(element, "ContentType")
      if (extension && contentType) {
        defaults.push({ extension, contentType })
      }
    }
    if (name === "override") {
      const partName = attribute(element, "PartName")
      const contentType = attribute(element, "ContentType")
      if (partName && contentType) {
        overrides.push({ partName, contentType })
      }
    }
  })
  return { defaults, overrides }
}

function parseAllRelationships(entries: ZipEntry[], parts: OpcPart[], warnings: OpcWarning[]) {
  const groups: RelationshipGroup[] = []
  for (const entry of entries) {
    if (!isRelsZipPath(entry.normalizedName)) {
      continue
    }
    const source = sourcePartForRels(entry.normalizedName)
    try {
      const items = parseRelationships(decodeXml(entry.data), source, parts)
      const seen = new Set<string>()
      for (const item of items) {
        if (seen.has(item.id)) {
          warnings.push({
            code: "duplicate-relationship-id",
            message: `Relationship id ${item.id} is repeated in ${entry.normalizedName}.`,
            partName: source || "/",
          })
        }
        seen.add(item.id)
      }
      groups.push({ source, items })
    } catch (error) {
      if (source === "") {
        throw new OpcError("broken-relationships", xmlFailure(error, entry.normalizedName))
      }
      warnings.push({
        code: "broken-part",
        message: xmlFailure(error, entry.normalizedName),
        partName: `/${entry.normalizedName}`,
      })
    }
  }
  return groups
}

function parseRelationships(xml: string, source: string, parts: OpcPart[]) {
  const items: OpcRelationship[] = []
  parseElements(xml, (element) => {
    if (element.name.toLowerCase() !== "relationship") {
      return
    }
    const id = attribute(element, "Id")
    const type = attribute(element, "Type")
    const target = attribute(element, "Target")
    if (!id || !type || !target) {
      return
    }
    const targetMode = attribute(element, "TargetMode").toLowerCase() === "external" ? "External" : "Internal"
    items.push({
      id,
      type,
      target,
      targetMode,
      partName: targetMode === "External" ? null : resolveInternalTarget(source, target, parts),
    })
  })
  return items
}

function resolveInternalTarget(source: string, target: string, parts: OpcPart[]) {
  const resolved = resolvePartName(source, target)
  return parts.find((part) => partKey(part.name) === partKey(resolved))?.name ?? null
}

export function resolvePartName(source: string, target: string) {
  const raw = target.replace(/\\/g, "/")
  const base = source ? (source.startsWith("/") ? source : `/${source}`) : "/"
  const combined = raw.startsWith("/") ? raw : `${base.slice(0, base.lastIndexOf("/") + 1)}${raw}`
  const segments: string[] = []
  for (const segment of combined.split("/")) {
    if (segment === "" || segment === ".") {
      continue
    }
    if (segment === "..") {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join("/")}`
}

function contentTypeFor(partName: string, defaults: ContentTypeDefault[], overrides: ContentTypeOverride[]) {
  const override = overrides.find((item) => partKey(item.partName) === partKey(partName))
  if (override) {
    return override.contentType
  }
  const extension = fileExtension(partName)
  return defaults.find((item) => item.extension.toLowerCase() === extension)?.contentType ?? null
}

function hasOverride(partName: string, overrides: ContentTypeOverride[]) {
  const key = partKey(partName)
  return overrides.some((item) => partKey(item.partName) === key)
}

function defaultsForWrite(pkg: OpcPackage) {
  const defaults: ContentTypeDefault[] = [
    { extension: "rels", contentType: CONTENT_TYPE_RELS },
    { extension: "xml", contentType: CONTENT_TYPE_XML },
  ]
  const seen = new Set(defaults.map((item) => item.extension.toLowerCase()))
  for (const item of pkg.defaults) {
    const extension = item.extension.toLowerCase()
    if (seen.has(extension)) {
      continue
    }
    seen.add(extension)
    defaults.push({ extension: item.extension, contentType: item.contentType })
  }
  for (const part of pkg.parts) {
    const extension = fileExtension(part.name)
    if (!IMAGE_EXTENSIONS.has(extension) || seen.has(extension)) {
      continue
    }
    seen.add(extension)
    defaults.push({ extension, contentType: part.contentType })
  }
  return defaults
}

function overridesForWrite(pkg: OpcPackage) {
  const overrides: ContentTypeOverride[] = []
  const seen = new Set<string>()
  for (const part of pkg.parts) {
    const extension = fileExtension(part.name)
    if (IMAGE_EXTENSIONS.has(extension)) {
      continue
    }
    const key = partKey(part.name)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    overrides.push({ partName: part.name, contentType: part.contentType })
  }
  return overrides
}

function contentTypesBytes(defaults: ContentTypeDefault[], overrides: ContentTypeOverride[]) {
  const children = [
    ...defaults.map(
      (item) => `<Default Extension="${escapeXml(item.extension)}" ContentType="${escapeXml(item.contentType)}"/>`,
    ),
    ...overrides.map(
      (item) => `<Override PartName="${escapeXml(item.partName)}" ContentType="${escapeXml(item.contentType)}"/>`,
    ),
  ]
  return xmlBytes(`<Types xmlns="${CONTENT_TYPES_NS}">${children.join("")}</Types>`)
}

function relationshipEntries(pkg: OpcPackage) {
  return pkg.relationships
    .filter((group) => group.items.length > 0)
    .map((group) => {
      const sourcePart = group.source ? findPart(pkg, group.source) : undefined
      return {
        name: relsZipPath(group.source),
        data: relationshipsBytes(group.items),
        stored: false,
        unknown: sourcePart ? isUnknownPart(sourcePart) : false,
      }
    })
}

function relationshipsBytes(items: OpcRelationship[]) {
  const children = items.map((item) => {
    const mode = item.targetMode === "External" ? ` TargetMode="External"` : ""
    return `<Relationship Id="${escapeXml(item.id)}" Type="${escapeXml(item.type)}" Target="${escapeXml(item.target)}"${mode}/>`
  })
  return xmlBytes(`<Relationships xmlns="${RELATIONSHIPS_NS}">${children.join("")}</Relationships>`)
}

function rank(entry: { name: string; unknown: boolean }, mainZip: string) {
  if (entry.name === "[Content_Types].xml") {
    return 0
  }
  if (entry.name === "_rels/.rels") {
    return 1
  }
  if (entry.name === mainZip) {
    return 2
  }
  if (entry.name === relsZipPath(`/${mainZip}`)) {
    return 3
  }
  const source = sourceOfRels(entry.name)
  const named = source ?? entry.name
  const base = partRank(named) + (source ? 0.5 : 0)
  return entry.unknown ? 1000 + base : base
}

function partRank(name: string) {
  if (/^word\/footnotes\.xml$/i.test(name)) return 10
  if (/^word\/endnotes\.xml$/i.test(name)) return 11
  if (/^word\/header\d*\.xml$/i.test(name)) return 12
  if (/^word\/footer\d*\.xml$/i.test(name)) return 13
  if (/^word\/media\//i.test(name)) return 14
  if (/^word\/theme\//i.test(name)) return 20
  if (/^word\/settings\.xml$/i.test(name)) return 21
  if (/^word\/numbering\.xml$/i.test(name)) return 22
  if (/^word\/styles\.xml$/i.test(name)) return 23
  if (/^word\/webSettings\.xml$/i.test(name)) return 24
  if (/^word\/fontTable\.xml$/i.test(name)) return 25
  if (/^docProps\/core\.xml$/i.test(name)) return 30
  if (/^docProps\/app\.xml$/i.test(name)) return 31
  if (/^docProps\//i.test(name)) return 32
  return 40
}

/** Office parts the reader does not interpret but Word keeps on save: theme, font table, properties, custom XML. */
const PASSTHROUGH_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.theme+xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.webSettings+xml",
  "application/vnd.openxmlformats-package.core-properties+xml",
  "application/vnd.openxmlformats-officedocument.extended-properties+xml",
  "application/vnd.openxmlformats-officedocument.custom-properties+xml",
  "application/vnd.openxmlformats-officedocument.customXmlProperties+xml",
])

export function isPassthroughPart(part: OpcPart) {
  return PASSTHROUGH_TYPES.has(part.contentType) || part.name.toLowerCase().startsWith("/customxml/")
}

export function isUnknownPart(part: OpcPart) {
  const type = part.contentType
  return !(
    type.startsWith("application/vnd.openxmlformats-") ||
    type.startsWith("application/vnd.ms-") ||
    type.startsWith("image/") ||
    type === CONTENT_TYPE_XML
  )
}

function relsZipPath(source: string) {
  if (!source) {
    return "_rels/.rels"
  }
  const path = zipPath(source)
  const slash = path.lastIndexOf("/")
  const directory = slash === -1 ? "" : path.slice(0, slash + 1)
  const file = slash === -1 ? path : path.slice(slash + 1)
  return `${directory}_rels/${file}.rels`
}

function sourceOfRels(name: string) {
  if (name === "_rels/.rels") {
    return ""
  }
  const match = /^(.*\/)?_rels\/([^/]+)\.rels$/i.exec(name)
  if (!match) {
    return null
  }
  return `${match[1] ?? ""}${match[2]}`
}

function sourcePartForRels(normalizedName: string) {
  const source = sourceOfRels(normalizedName)
  if (!source) {
    return ""
  }
  return `/${source}`
}

function relationshipsForSource(groups: RelationshipGroup[], source: string) {
  const key = source === "" ? "" : partKey(source)
  return groups.find((group) => (group.source === "" ? "" : partKey(group.source)) === key)?.items ?? []
}

function isContentTypesName(name: string) {
  return partKey(name) === "[content_types].xml"
}

function isRelsZipPath(name: string) {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "")
  return normalized.toLowerCase() === "_rels/.rels" || /(?:^|\/)_rels\/[^/]+\.rels$/i.test(normalized)
}

function zipPath(partName: string) {
  return partName.replace(/\\/g, "/").replace(/^\/+/, "")
}

function partNameNeedsEscaping(partName: string) {
  return zipPath(partName).includes(" ") || /[#[\]?]/.test(partName)
}

function fileExtension(fileName: string) {
  const base = fileName.replace(/\\/g, "/").split("/").pop() ?? fileName
  const dot = base.lastIndexOf(".")
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase()
}

function xmlFailure(error: unknown, partName: string) {
  if (error instanceof XmlError || error instanceof Error) {
    return `${partName} is not well-formed XML. ${error.message}`
  }
  return `${partName} is not well-formed XML.`
}
