/**
 * A SmartArt graphic saved as Word's own diagram (21.36): the data model (each item a point, joined to its parent),
 * a layout definition, Word's Simple Fill quick style and Colorful colours, and a drawing of the shapes as the app
 * shows them, which programs that do not lay diagrams out themselves show. Reading the data model back gives the
 * items and their outline levels.
 */
import { COLORS_ACCENT1_2, QUICK_STYLE_SIMPLE1 } from "@/document/docx/smartart-defs"
import { escapeXml, escapeXmlText } from "@/document/docx/xml"
import type { SmartArtItem } from "@/editor/smartart-model"

export const DIAGRAM_NS = "http://schemas.openxmlformats.org/drawingml/2006/diagram"
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
const DSP_NS = "http://schemas.microsoft.com/office/drawing/2008/diagram"
const RELATIONSHIPS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"

/** The relationship and content type of each diagram part. */
export const DIAGRAM_PARTS = {
  data: {
    type: `${RELATIONSHIPS}/diagramData`,
    contentType: "application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml",
    file: "data",
  },
  layout: {
    type: `${RELATIONSHIPS}/diagramLayout`,
    contentType: "application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml",
    file: "layout",
  },
  style: {
    type: `${RELATIONSHIPS}/diagramQuickStyle`,
    contentType: "application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml",
    file: "quickStyle",
  },
  colors: {
    type: `${RELATIONSHIPS}/diagramColors`,
    contentType: "application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml",
    file: "colors",
  },
  drawing: {
    type: "http://schemas.microsoft.com/office/2007/relationships/diagramDrawing",
    contentType: "application/vnd.ms-office.drawingml.diagramDrawing+xml",
    file: "drawing",
  },
} as const

const OFFICE_LAYOUT = "urn:microsoft.com/office/officeart/2005/8/layout/"
/** Layouts Word has no match for are saved under the app's own name, with the layout definition written here. */
const APP_LAYOUT = "urn:inkspire.app/smartart/layout/"

type LayoutKind = "grid" | "row" | "column" | "process" | "chevron" | "cycle" | "radial" | "venn" | "pyramid" | "tree"

/** Each app layout: the layout Word knows it as (`id`), its gallery category, and how it is laid out. */
export const WORD_LAYOUTS: Record<string, { id: string; category: string; kind: LayoutKind; shape: string }> = {
  list: { id: `${APP_LAYOUT}list`, category: "list", kind: "row", shape: "rect" },
  vlist: { id: `${OFFICE_LAYOUT}vList2`, category: "list", kind: "column", shape: "roundRect" },
  blocklist: { id: `${OFFICE_LAYOUT}default`, category: "list", kind: "grid", shape: "rect" },
  process: { id: `${OFFICE_LAYOUT}process1`, category: "process", kind: "process", shape: "roundRect" },
  chevron: { id: `${OFFICE_LAYOUT}chevron1`, category: "process", kind: "chevron", shape: "chevron" },
  stepup: {
    id: "urn:microsoft.com/office/officeart/2009/3/layout/StepUpProcess",
    category: "process",
    kind: "process",
    shape: "rect",
  },
  cycle: { id: `${OFFICE_LAYOUT}cycle2`, category: "cycle", kind: "cycle", shape: "ellipse" },
  hierarchy: { id: `${OFFICE_LAYOUT}hierarchy1`, category: "hierarchy", kind: "tree", shape: "roundRect" },
  relationship: { id: `${OFFICE_LAYOUT}radial1`, category: "relationship", kind: "radial", shape: "ellipse" },
  venn: { id: `${OFFICE_LAYOUT}venn1`, category: "relationship", kind: "venn", shape: "ellipse" },
  matrix: { id: `${APP_LAYOUT}matrix`, category: "matrix", kind: "grid", shape: "rect" },
  pyramid: { id: `${OFFICE_LAYOUT}pyramid1`, category: "pyramid", kind: "pyramid", shape: "trapezoid" },
  piclist: { id: `${APP_LAYOUT}piclist`, category: "picture", kind: "row", shape: "rect" },
  vpiclist: { id: `${APP_LAYOUT}vpiclist`, category: "picture", kind: "column", shape: "rect" },
}

/** Word's layouts the app opens as one of its own, beside those it saves under (`WORD_LAYOUTS`). */
const OPENED_AS: Record<string, string> = {
  [`${OFFICE_LAYOUT}hList1`]: "list",
  [`${OFFICE_LAYOUT}lProcess2`]: "list",
  [`${OFFICE_LAYOUT}vList5`]: "vlist",
  [`${OFFICE_LAYOUT}vList6`]: "vlist",
  [`${OFFICE_LAYOUT}process2`]: "process",
  [`${OFFICE_LAYOUT}hProcess9`]: "process",
  [`${OFFICE_LAYOUT}chevron2`]: "chevron",
  [`${OFFICE_LAYOUT}cycle1`]: "cycle",
  [`${OFFICE_LAYOUT}cycle3`]: "cycle",
  [`${OFFICE_LAYOUT}orgChart1`]: "hierarchy",
  [`${OFFICE_LAYOUT}hierarchy2`]: "hierarchy",
  [`${OFFICE_LAYOUT}hierarchy3`]: "hierarchy",
  [`${OFFICE_LAYOUT}radial3`]: "relationship",
  [`${OFFICE_LAYOUT}matrix3`]: "matrix",
  [`${OFFICE_LAYOUT}pyramid2`]: "pyramid",
}

/** The app layout a diagram's layout id opens as, or null when the app has none like it. */
export function appLayoutOf(layoutId: string) {
  const own = Object.entries(WORD_LAYOUTS).find(([, layout]) => layout.id === layoutId)?.[0]
  return own ?? OPENED_AS[layoutId] ?? null
}

/** Model ids for the points: GUIDs, numbered so the same graphic is written the same each time. */
function modelId(seed: number, index: number) {
  const hex = (value: number, width: number) => (value >>> 0).toString(16).toUpperCase().padStart(width, "0")
  return `{${hex(seed, 8)}-${hex(index, 4)}-4${hex(index >> 16, 3)}-8000-${hex(index * 2654435761, 12).slice(-12)}}`
}

const paragraphs = (text: string, lang = "en-US") =>
  `<dgm:t><a:bodyPr/><a:lstStyle/>${text
    .split("\n")
    .map((line) =>
      line
        ? `<a:p><a:r><a:rPr lang="${lang}"/><a:t>${escapeXmlText(line)}</a:t></a:r></a:p>`
        : `<a:p><a:endParaRPr lang="${lang}"/></a:p>`,
    )
    .join("")}</dgm:t>`

const EMPTY_TEXT = `<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t>`

/**
 * The data model (`dgm:dataModel`): the document point naming the layout, quick style and colours; a point per item;
 * and for each item the connection to its parent (the item above it one level up, or the document) with the
 * transition points Word keeps for it. `drawingRelId` names the drawing part Word shows the graphic from.
 */
export function diagramDataXml(
  items: SmartArtItem[],
  layout: string,
  drawingRelId?: string,
  /** The layout Word named, kept for a graphic opened from Word. */
  layoutId?: string,
  seed = 0x5a17a000,
) {
  const word = WORD_LAYOUTS[layout] ?? WORD_LAYOUTS.list!
  const docId = modelId(seed, 0)
  const ids = items.map((_item, index) => modelId(seed, index + 1))
  const points = [
    `<dgm:pt modelId="${docId}" type="doc"><dgm:prSet loTypeId="${escapeXml(layoutId || word.id)}" loCatId="${word.category}" ` +
      `qsTypeId="urn:microsoft.com/office/officeart/2005/8/quickstyle/simple1" qsCatId="simple" ` +
      `csTypeId="urn:microsoft.com/office/officeart/2005/8/colors/accent1_2" csCatId="accent1" phldr="0"/>` +
      `<dgm:spPr/>${EMPTY_TEXT}</dgm:pt>`,
  ]
  const connections: string[] = []
  const order = new Map<string, number>()
  items.forEach((item, index) => {
    let parent = docId
    for (let above = index - 1; above >= 0; above -= 1) {
      if (items[above]!.level < item.level) {
        parent = ids[above]!
        break
      }
    }
    const id = ids[index]!
    const cxnId = modelId(seed + 1, index)
    const parTrans = modelId(seed + 2, index)
    const sibTrans = modelId(seed + 3, index)
    const position = order.get(parent) ?? 0
    order.set(parent, position + 1)
    points.push(
      `<dgm:pt modelId="${id}"><dgm:prSet/><dgm:spPr/>${paragraphs(item.text)}</dgm:pt>`,
      `<dgm:pt modelId="${parTrans}" type="parTrans" cxnId="${cxnId}"><dgm:prSet/><dgm:spPr/>${EMPTY_TEXT}</dgm:pt>`,
      `<dgm:pt modelId="${sibTrans}" type="sibTrans" cxnId="${cxnId}"><dgm:prSet/><dgm:spPr/>${EMPTY_TEXT}</dgm:pt>`,
    )
    connections.push(
      `<dgm:cxn modelId="${cxnId}" srcId="${parent}" destId="${id}" srcOrd="${position}" destOrd="0" ` +
        `parTransId="${parTrans}" sibTransId="${sibTrans}"/>`,
    )
  })
  const extension = drawingRelId
    ? `<dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram">` +
      `<dsp:dataModelExt xmlns:dsp="${DSP_NS}" relId="${escapeXml(drawingRelId)}" minVer="${DIAGRAM_NS}"/>` +
      `</a:ext></dgm:extLst>`
    : ""
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<dgm:dataModel xmlns:dgm="${DIAGRAM_NS}" xmlns:a="${A_NS}"><dgm:ptLst>${points.join("")}</dgm:ptLst>` +
    `<dgm:cxnLst>${connections.join("")}</dgm:cxnLst><dgm:bg/><dgm:whole/>${extension}</dgm:dataModel>`
  )
}

function attribute(tag: string, name: string) {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1]
}

function unescape(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

/**
 * The items of a diagram's data model in reading order, each at its depth under the document point, and the ids of
 * its layout and colours. Null when the part has no document point.
 */
export function readDiagramData(xml: string) {
  const points = new Map<string, { type: string; text: string; prSet: string }>()
  for (const match of xml.matchAll(/<(?:\w+:)?pt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?pt>)/g)) {
    const id = attribute(match[1] ?? "", "modelId")
    if (!id) {
      continue
    }
    const body = match[2] ?? ""
    const lines = [...body.matchAll(/<a:p\b[\s\S]*?<\/a:p>|<a:p\/>/g)].map((paragraph) =>
      [...paragraph[0].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((run) => unescape(run[1] ?? "")).join(""),
    )
    points.set(id, {
      type: attribute(match[1] ?? "", "type") ?? "node",
      text: lines.join("\n").replace(/\n+$/, ""),
      prSet: /<(?:\w+:)?prSet\b[^>]*>/.exec(body)?.[0] ?? "",
    })
  }
  const doc = [...points].find(([, point]) => point.type === "doc")
  if (!doc) {
    return null
  }
  const children = new Map<string, { id: string; order: number }[]>()
  for (const match of xml.matchAll(/<(?:\w+:)?cxn\b([^>]*?)\/?>/g)) {
    const tag = match[1] ?? ""
    const type = attribute(tag, "type") ?? "parOf"
    const src = attribute(tag, "srcId")
    const dest = attribute(tag, "destId")
    if (type !== "parOf" || !src || !dest || points.get(dest)?.type !== "node") {
      continue
    }
    const list = children.get(src) ?? []
    list.push({ id: dest, order: Number(attribute(tag, "srcOrd")) || 0 })
    children.set(src, list)
  }
  const items: SmartArtItem[] = []
  const seen = new Set<string>()
  const walk = (id: string, level: number) => {
    for (const child of [...(children.get(id) ?? [])].sort((a, b) => a.order - b.order)) {
      if (seen.has(child.id)) {
        continue
      }
      seen.add(child.id)
      items.push({ text: points.get(child.id)!.text, level: Math.min(4, level) })
      walk(child.id, level + 1)
    }
  }
  walk(doc[0], 0)
  return {
    items,
    layoutId: attribute(doc[1].prSet, "loTypeId") ?? "",
    colorsId: attribute(doc[1].prSet, "csTypeId") ?? "",
  }
}

// --- Layout definitions ---------------------------------------------------------------------------------------------

const shape = (type = "", extra = "") =>
  `<dgm:shape${type ? ` type="${type}"` : ""} r:blip=""${extra}><dgm:adjLst/></dgm:shape>`

const MARGINS =
  `<dgm:constr type="tMarg" refType="primFontSz" fact="0.3"/><dgm:constr type="bMarg" refType="primFontSz" fact="0.3"/>` +
  `<dgm:constr type="lMarg" refType="primFontSz" fact="0.3"/><dgm:constr type="rMarg" refType="primFontSz" fact="0.3"/>`

/** A shape holding an item's text, and (`below`) the text of the items under it as its bullets. */
const textNode = (name: string, type: string, below = true, label = "node1") =>
  `<dgm:layoutNode name="${name}" styleLbl="${label}"><dgm:varLst><dgm:bulletEnabled val="1"/></dgm:varLst>` +
  `<dgm:alg type="tx"/>${shape(type)}<dgm:presOf axis="${below ? "desOrSelf" : "self"}" ptType="node"/>` +
  `<dgm:constrLst>${MARGINS}</dgm:constrLst><dgm:ruleLst><dgm:rule type="primFontSz" val="5" fact="NaN" max="NaN"/>` +
  `</dgm:ruleLst></dgm:layoutNode>`

const space = `<dgm:forEach name="spaceForEach" axis="followSib" ptType="sibTrans" cnt="1"><dgm:layoutNode name="space"><dgm:alg type="sp"/>${shape()}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/></dgm:layoutNode></dgm:forEach>`

/** The arrow between two items of a process or cycle, drawn by Word as the transition point. */
const arrow =
  `<dgm:forEach name="arrowForEach" axis="followSib" ptType="sibTrans" cnt="1"><dgm:layoutNode name="sibTrans" styleLbl="sibTrans2D1">` +
  `<dgm:alg type="conn"/>${shape("conn")}<dgm:presOf axis="self"/><dgm:constrLst><dgm:constr type="h" refType="w" fact="0.62"/>` +
  `<dgm:constr type="connDist"/><dgm:constr type="begPad" refType="connDist" fact="0.25"/>` +
  `<dgm:constr type="endPad" refType="connDist" fact="0.22"/></dgm:constrLst><dgm:ruleLst/></dgm:layoutNode></dgm:forEach>`

function algorithm(kind: LayoutKind) {
  switch (kind) {
    case "grid":
      return (
        `<dgm:alg type="snake"><dgm:param type="grDir" val="tL"/><dgm:param type="flowDir" val="row"/>` +
        `<dgm:param type="contDir" val="sameDir"/><dgm:param type="off" val="ctr"/></dgm:alg>`
      )
    case "column":
      return `<dgm:alg type="lin"><dgm:param type="linDir" val="fromT"/><dgm:param type="vertAlign" val="mid"/></dgm:alg>`
    case "cycle":
    case "venn":
      return `<dgm:alg type="cycle"><dgm:param type="stAng" val="0"/><dgm:param type="spanAng" val="360"/></dgm:alg>`
    case "radial":
      return (
        `<dgm:alg type="cycle"><dgm:param type="stAng" val="0"/><dgm:param type="spanAng" val="360"/>` +
        `<dgm:param type="ctrShpMap" val="fNode"/></dgm:alg>`
      )
    case "pyramid":
      return (
        `<dgm:alg type="pyra"><dgm:param type="linDir" val="fromT"/><dgm:param type="txDir" val="fromT"/>` +
        `<dgm:param type="pyraAcctPos" val="bef"/><dgm:param type="pyraAcctTxMar" val="step"/></dgm:alg>`
      )
    default:
      return `<dgm:alg type="lin"><dgm:param type="linDir" val="fromL"/><dgm:param type="nodeVertAlign" val="mid"/></dgm:alg>`
  }
}

/** The size of each shape and the room between them, for the layout's algorithm. */
function sizes(kind: LayoutKind) {
  const node = (w: string, h: string) =>
    `<dgm:constr type="w" for="ch" forName="node" refType="w"${w}/>` +
    `<dgm:constr type="h" for="ch" forName="node" refType="w" refFor="ch" refForName="node"${h}/>`
  const gap = (fact: string) =>
    `<dgm:constr type="w" for="ch" forName="space" refType="w" refFor="ch" refForName="node" fact="${fact}"/>` +
    `<dgm:constr type="h" for="ch" forName="space" refType="h" refFor="ch" refForName="node" fact="${fact}"/>` +
    `<dgm:constr type="w" for="ch" forName="sibTrans" refType="w" refFor="ch" refForName="node" fact="0.3"/>`
  const font = `<dgm:constr type="primFontSz" for="ch" forName="node" op="equ" val="65"/>`
  switch (kind) {
    case "grid":
      return node("", ` fact="0.6"`) + gap("0.1") + font
    case "column":
      return node("", ` fact="0.2"`) + gap("0.08") + font
    case "cycle":
    case "radial":
      return node(` fact="0.3"`, "") + gap("0.1") + `<dgm:constr type="diam" refType="w" fact="0.65"/>` + font
    case "venn":
      return node(` fact="0.45"`, "") + gap("0") + `<dgm:constr type="diam" refType="w" fact="0.35"/>` + font
    case "pyramid":
      return (
        `<dgm:constr type="w" for="ch" forName="node" refType="w"/><dgm:constr type="h" for="ch" forName="node" refType="h"/>` +
        font
      )
    default:
      return node("", ` fact="0.6"`) + gap(kind === "chevron" ? "-0.1" : "0.1") + font
  }
}

/** Hierarchy: each item over its children, joined by elbow lines (Word's hierRoot and hierChild). */
function treeLayout() {
  const line =
    `<dgm:forEach name="lineForEach" axis="precedSib" ptType="parTrans" st="-1" cnt="1"><dgm:layoutNode name="line" styleLbl="parChTrans1D2">` +
    `<dgm:alg type="conn"><dgm:param type="dim" val="1D"/><dgm:param type="endSty" val="noArr"/>` +
    `<dgm:param type="connRout" val="bend"/><dgm:param type="begPts" val="bCtr"/><dgm:param type="endPts" val="tCtr"/></dgm:alg>` +
    `${shape("conn")}<dgm:presOf axis="self"/><dgm:constrLst><dgm:constr type="begPad"/><dgm:constr type="endPad"/></dgm:constrLst>` +
    `<dgm:ruleLst/></dgm:layoutNode></dgm:forEach>`
  return (
    `<dgm:alg type="hierChild"/>${shape()}<dgm:presOf/><dgm:constrLst>` +
    `<dgm:constr type="w" for="des" forName="item" refType="w" fact="0.22"/>` +
    `<dgm:constr type="h" for="des" forName="item" refType="w" refFor="des" refForName="item" fact="0.6"/>` +
    `<dgm:constr type="sp" for="des" forName="branch" refType="h" refFor="des" refForName="item" fact="0.4"/>` +
    `<dgm:constr type="sibSp" for="des" forName="children" refType="w" refFor="des" refForName="item" fact="0.2"/>` +
    `<dgm:constr type="primFontSz" for="des" forName="item" op="equ" val="65"/></dgm:constrLst><dgm:ruleLst/>` +
    `<dgm:forEach name="branchForEach" axis="ch" ptType="node">${line}` +
    `<dgm:layoutNode name="branch"><dgm:alg type="hierRoot"/>${shape()}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/>` +
    textNode("item", "roundRect", false) +
    `<dgm:layoutNode name="children"><dgm:alg type="hierChild"/>${shape()}<dgm:presOf/><dgm:constrLst/><dgm:ruleLst/>` +
    `<dgm:forEach name="nextForEach" ref="branchForEach"/></dgm:layoutNode></dgm:layoutNode></dgm:forEach>`
  )
}

/** The layout definition (`dgm:layoutDef`) the graphic is saved with. */
export function diagramLayoutXml(layout: string) {
  const word = WORD_LAYOUTS[layout] ?? WORD_LAYOUTS.list!
  const kind = word.kind
  const between = kind === "process" || kind === "cycle" ? arrow : space
  const body =
    kind === "tree"
      ? treeLayout()
      : `${algorithm(kind)}${shape()}<dgm:presOf/><dgm:constrLst>${sizes(kind)}</dgm:constrLst><dgm:ruleLst/>` +
        `<dgm:forEach name="nodesForEach" axis="ch" ptType="node">` +
        textNode("node", word.shape, kind !== "pyramid", kind === "venn" ? "vennNode1" : "node1") +
        (kind === "pyramid" || kind === "venn" || kind === "radial" ? "" : between) +
        `</dgm:forEach>`
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<dgm:layoutDef xmlns:dgm="${DIAGRAM_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}" uniqueId="${word.id}">` +
    `<dgm:title val=""/><dgm:desc val=""/><dgm:catLst><dgm:cat type="${word.category}" pri="1000"/></dgm:catLst>` +
    `<dgm:layoutNode name="diagram"><dgm:varLst><dgm:dir/><dgm:resizeHandles val="exact"/></dgm:varLst>${body}` +
    `</dgm:layoutNode></dgm:layoutDef>`
  )
}

export const diagramStyleXml = () => QUICK_STYLE_SIMPLE1
export const diagramColorsXml = () => COLORS_ACCENT1_2

// --- The drawing Word and other programs show ------------------------------------------------------------------------

/** A shape of the graphic as the app draws it, in px from the graphic's top left corner. */
export type DiagramShape = {
  x: number
  y: number
  w: number
  h: number
  text: string
  /** Word's preset for its outline: rect, roundRect, ellipse, hexagon, diamond, parallelogram, chevron... */
  preset: string
  fill: string
  line: string
  color: string
  /** Its text size in points. */
  size: number
}

const EMU_PER_PX = 9525
const emu = (px: number) => Math.max(0, Math.round(px * EMU_PER_PX))
const hex = (color: string) => (/^#[0-9a-f]{6}$/i.test(color) ? color.slice(1).toUpperCase() : "")
const fillOf = (color: string) =>
  hex(color) ? `<a:solidFill><a:srgbClr val="${hex(color)}"/></a:solidFill>` : "<a:noFill/>"

/** The drawing part (`dsp:drawing`): each shape at its place, with its fill, outline and text. */
export function diagramDrawingXml(shapes: DiagramShape[], seed = 0x5a17a000) {
  const shapesXml = shapes
    .map((item, index) => {
      const lines = item.text.split("\n")
      const size = Math.round(Math.max(1, item.size) * 100)
      const text = lines
        .map(
          (line) =>
            `<a:p><a:pPr algn="ctr"/>${
              line
                ? `<a:r><a:rPr lang="en-US" sz="${size}" kern="1200">${fillOf(item.color)}</a:rPr><a:t>${escapeXmlText(line)}</a:t></a:r>`
                : `<a:endParaRPr lang="en-US" sz="${size}" kern="1200"/>`
            }</a:p>`,
        )
        .join("")
      const off = `<a:off x="${emu(item.x)}" y="${emu(item.y)}"/><a:ext cx="${emu(item.w)}" cy="${emu(item.h)}"/>`
      return (
        `<dsp:sp modelId="${modelId(seed + 7, index)}"><dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>` +
        `<dsp:spPr><a:xfrm>${off}</a:xfrm><a:prstGeom prst="${item.preset}"><a:avLst/></a:prstGeom>${fillOf(item.fill)}` +
        `<a:ln w="12700">${fillOf(item.line)}</a:ln></dsp:spPr>` +
        `<dsp:txBody><a:bodyPr spcFirstLastPara="0" vert="horz" wrap="square" lIns="45720" tIns="45720" rIns="45720" ` +
        `bIns="45720" numCol="1" spcCol="1270" anchor="ctr" anchorCtr="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>${text}` +
        `</dsp:txBody><dsp:txXfrm>${off}</dsp:txXfrm></dsp:sp>`
      )
    })
    .join("")
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<dsp:drawing xmlns:dgm="${DIAGRAM_NS}" xmlns:dsp="${DSP_NS}" xmlns:a="${A_NS}"><dsp:spTree>` +
    `<dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>${shapesXml}` +
    `</dsp:spTree></dsp:drawing>`
  )
}

/** The relationship ids of a diagram frame's four parts, from its `dgm:relIds`. */
export function diagramRelIds(drawingXml: string) {
  const tag = /<(?:\w+:)?relIds\b[^>]*>/.exec(drawingXml)?.[0]
  if (!tag) {
    return null
  }
  const id = (name: string) => new RegExp(`\\br:${name}="([^"]+)"`).exec(tag)?.[1]
  return { data: id("dm"), layout: id("lo"), style: id("qs"), colors: id("cs") }
}

/** The `a:graphicData` of a diagram frame, naming its four parts by relationship id. */
export function diagramGraphic(ids: { data: string; layout: string; style: string; colors: string }) {
  return (
    `<a:graphicData uri="${DIAGRAM_NS}"><dgm:relIds xmlns:dgm="${DIAGRAM_NS}" xmlns:r="${R_NS}" ` +
    `r:dm="${ids.data}" r:lo="${ids.layout}" r:qs="${ids.style}" r:cs="${ids.colors}"/></a:graphicData>`
  )
}
