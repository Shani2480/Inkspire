/**
 * Keeps property elements (w:pPr, w:rPr, w:tblPr, w:trPr, w:tcPr, w:sectPr, …) as Word wrote them.
 *
 * The model covers the properties the editor understands. Everything else in such an element (borders, theme
 * colours, table-style conditional formatting, extension elements) would be lost if the element were rebuilt
 * from the model alone. So the reader keeps the element's children as written, with a snapshot of the model it
 * read from them. The writer then:
 *  - writes the children unchanged when the model still equals the snapshot,
 *  - otherwise regenerates only the children whose generated markup changed, keeps every other child as
 *    written, and puts newly needed children in schema order.
 */

/** A child element as written: its qualified name and markup. */
export type SourceChild = { name: string; xml: string }

/** The children of a property element as read, and a snapshot of the model they were read into. */
export type ElementSource = { children: SourceChild[]; model: string }

/**
 * Keys that never take part in a snapshot: sources themselves, editor anchors, and the header and footer stories
 * a section refers to (only their type and relationship id are written in w:sectPr).
 */
const TRANSIENT = new Set(["source", "exceptionSource", "key", "blocks", "links", "rootAttributes", "partName"])

/** A stable snapshot of a model value, without element sources and editor anchors. */
export function snapshot(value: unknown): string {
  return JSON.stringify(value, (key, item: unknown) => (TRANSIENT.has(key) ? undefined : item))
}

/** Top-level elements of a run of sibling markup, in order. */
export function childElements(xml: string): SourceChild[] {
  const children: SourceChild[] = []
  let depth = 0
  let open = { start: 0, name: "" }
  let index = 0
  while (index < xml.length) {
    const start = xml.indexOf("<", index)
    if (start < 0) {
      break
    }
    if (xml.startsWith("<!--", start)) {
      const close = xml.indexOf("-->", start + 4)
      index = close < 0 ? xml.length : close + 3
      continue
    }
    if (xml.startsWith("<?", start) || xml.startsWith("<!", start)) {
      const close = xml.indexOf(">", start + 2)
      index = close < 0 ? xml.length : close + 1
      continue
    }
    const end = tagEnd(xml, start)
    const closing = xml[start + 1] === "/"
    const selfClosing = !closing && xml[end - 2] === "/"
    if (closing) {
      depth -= 1
      if (depth === 0) {
        children.push({ name: open.name, xml: xml.slice(open.start, end) })
      }
    } else {
      if (depth === 0) {
        open = { start, name: /^<([A-Za-z0-9:_.-]+)/.exec(xml.slice(start, end))?.[1] ?? "" }
        if (selfClosing) {
          children.push({ name: open.name, xml: xml.slice(start, end) })
        }
      }
      if (!selfClosing) {
        depth += 1
      }
    }
    index = end
  }
  return children
}

/** Children of one element, given the element's markup. */
export function elementChildren(xml: string): SourceChild[] {
  const open = tagEnd(xml, xml.indexOf("<"))
  if (xml[open - 2] === "/") {
    return []
  }
  const close = xml.lastIndexOf("</")
  return childElements(xml.slice(open, close < open ? open : close))
}

function tagEnd(xml: string, start: number) {
  let quote = ""
  for (let cursor = start + 1; cursor < xml.length; cursor += 1) {
    const character = xml[cursor]
    if (quote) {
      if (character === quote) {
        quote = ""
      }
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === ">") {
      return cursor + 1
    }
  }
  return xml.length
}

/**
 * Children for a property element: as written where the model still says the same, regenerated where it
 * changed. `generate` turns a model value into the element's children; it is also run on the snapshot.
 */
export function writeChildren<T>(
  value: T,
  source: ElementSource | undefined,
  generate: (value: T) => string,
  order: readonly string[],
): string {
  if (source && snapshot(value) === source.model) {
    return inSchemaOrder(source.children, order)
      .map((child) => child.xml)
      .join("")
  }
  const current = generate(value)
  if (!source) {
    return current
  }
  const original = childElements(generate(JSON.parse(source.model) as T))
  const now = childElements(current)
  const take = (list: SourceChild[], name: string, used: Map<string, number>) => {
    const seen = used.get(name) ?? 0
    used.set(name, seen + 1)
    return list.filter((child) => child.name === name)[seen]
  }
  const usedOriginal = new Map<string, number>()
  const usedNow = new Map<string, number>()
  const out: SourceChild[] = []
  for (const child of source.children) {
    const before = take(original, child.name, usedOriginal)
    const after = take(now, child.name, usedNow)
    if (!before) {
      // The model does not cover this child, or could not read it: keep it unless the model now writes one.
      out.push(after ?? child)
    } else if (after) {
      out.push(before.xml === after.xml ? child : after)
    }
    // Generated before and not now: the property was removed.
  }
  const counted = new Map<string, number>()
  for (const child of now) {
    const index = counted.get(child.name) ?? 0
    counted.set(child.name, index + 1)
    if (index < (usedNow.get(child.name) ?? 0)) {
      continue
    }
    insertInOrder(out, child, order)
  }
  return inSchemaOrder(out, order)
    .map((child) => child.xml)
    .join("")
}

/**
 * Word refuses property elements whose children are out of schema order, which some producers write. Children
 * the schema orders are sorted among the places they hold; any others stay where they are.
 */
function inSchemaOrder(children: SourceChild[], order: readonly string[]) {
  const places = children.flatMap((child, index) => (Number.isFinite(rank(child.name, order)) ? [index] : []))
  const sorted = places
    .map((index) => children[index]!)
    .sort((left, right) => rank(left.name, order) - rank(right.name, order))
  const result = [...children]
  places.forEach((place, index) => {
    result[place] = sorted[index]!
  })
  return result
}

/** Elements the schema lets appear in any order among each other, ranked as the first of their group. */
const SAME_PLACE: Record<string, string> = { footerReference: "headerReference" }

function rank(name: string, order: readonly string[]) {
  const [prefix, local] = name.includes(":") ? name.split(":") : ["", name]
  const index = prefix === "w" ? order.indexOf(SAME_PLACE[local!] ?? local!) : -1
  return index < 0 ? Number.POSITIVE_INFINITY : index
}

function insertInOrder(list: SourceChild[], child: SourceChild, order: readonly string[]) {
  const own = rank(child.name, order)
  const at = list.findIndex((item) => rank(item.name, order) > own)
  if (at < 0) {
    list.push(child)
  } else {
    list.splice(at, 0, child)
  }
}

/** Schema order of each property element's children (ECMA-376 Part 1), by local name. */
export const ORDER = {
  pPr: [
    "pStyle",
    "keepNext",
    "keepLines",
    "pageBreakBefore",
    "framePr",
    "widowControl",
    "numPr",
    "suppressLineNumbers",
    "pBdr",
    "shd",
    "tabs",
    "suppressAutoHyphens",
    "kinsoku",
    "wordWrap",
    "overflowPunct",
    "topLinePunct",
    "autoSpaceDE",
    "autoSpaceDN",
    "bidi",
    "adjustRightInd",
    "snapToGrid",
    "spacing",
    "ind",
    "contextualSpacing",
    "mirrorIndents",
    "suppressOverlap",
    "jc",
    "textDirection",
    "textAlignment",
    "textboxTightWrap",
    "outlineLvl",
    "divId",
    "cnfStyle",
    "rPr",
    "sectPr",
    "pPrChange",
  ],
  rPr: [
    "ins",
    "del",
    "moveFrom",
    "moveTo",
    "rStyle",
    "rFonts",
    "b",
    "bCs",
    "i",
    "iCs",
    "caps",
    "smallCaps",
    "strike",
    "dstrike",
    "outline",
    "shadow",
    "emboss",
    "imprint",
    "noProof",
    "snapToGrid",
    "vanish",
    "webHidden",
    "color",
    "spacing",
    "w",
    "kern",
    "position",
    "sz",
    "szCs",
    "highlight",
    "u",
    "effect",
    "bdr",
    "shd",
    "fitText",
    "vertAlign",
    "rtl",
    "cs",
    "em",
    "lang",
    "eastAsianLayout",
    "specVanish",
    "oMath",
    "rPrChange",
  ],
  tblPr: [
    "tblStyle",
    "tblpPr",
    "tblOverlap",
    "bidiVisual",
    "tblStyleRowBandSize",
    "tblStyleColBandSize",
    "tblW",
    "jc",
    "tblCellSpacing",
    "tblInd",
    "tblBorders",
    "shd",
    "tblLayout",
    "tblCellMar",
    "tblLook",
    "tblCaption",
    "tblDescription",
    "tblPrChange",
  ],
  tblPrEx: [
    "tblW",
    "jc",
    "tblCellSpacing",
    "tblInd",
    "tblBorders",
    "shd",
    "tblLayout",
    "tblCellMar",
    "tblLook",
    "tblPrExChange",
  ],
  trPr: [
    "cnfStyle",
    "divId",
    "gridBefore",
    "gridAfter",
    "wBefore",
    "wAfter",
    "cantSplit",
    "trHeight",
    "tblHeader",
    "tblCellSpacing",
    "jc",
    "hidden",
    "ins",
    "del",
    "trPrChange",
  ],
  tcPr: [
    "cnfStyle",
    "tcW",
    "gridSpan",
    "hMerge",
    "vMerge",
    "tcBorders",
    "shd",
    "noWrap",
    "tcMar",
    "textDirection",
    "tcFitText",
    "vAlign",
    "hideMark",
    "headers",
    "cellIns",
    "cellDel",
    "cellMerge",
    "tcPrChange",
  ],
  sectPr: [
    "headerReference",
    "footnotePr",
    "endnotePr",
    "type",
    "pgSz",
    "pgMar",
    "paperSrc",
    "pgBorders",
    "lnNumType",
    "pgNumType",
    "cols",
    "formProt",
    "vAlign",
    "noEndnote",
    "titlePg",
    "textDirection",
    "bidi",
    "rtlGutter",
    "docGrid",
    "printerSettings",
    "sectPrChange",
  ],
} as const
