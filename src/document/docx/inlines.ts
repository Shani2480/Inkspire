import {
  CHART_CONTENT_TYPE,
  CHART_NS,
  CHART_RELATIONSHIP,
  PACKAGE_RELATIONSHIP,
  WORKBOOK_CONTENT_TYPE,
  chartRelId,
  chartSpaceXml,
  chartWorkbook,
  readChartSpace,
} from "@/document/docx/chart-xml"
import { decodeXml } from "@/document/docx/xml"
import { readWordShape, shapeLook, wordShapeMark } from "@/document/docx/shape-import"
import { wordShapeGraphic } from "@/document/docx/shape-write"
import { diagramDataRelId, diagramDrawingRelId, renderDiagramDrawing } from "@/document/docx/smartart-import"
import { shapeMarkup } from "@/editor/insert-blocks"
import { hasPictureFormat } from "@/editor/picture-format"
import { fontOf, fontStack, themeFontsOf, type ThemeFonts } from "@/document/docx/word-styles"
import { chartSpecOf, renderChart, serializeChartSpec, variantOf, type ChartSpec } from "@/editor/chart-spec"
import { DATE_PICTURES, dateFormat, formatDate } from "@/editor/formula"
import {
  INKSPIRE_OBJECT_NS,
  paragraphsIn,
  paragraphText,
  type Block,
  type Comment,
  type CommentEx,
  type CommentPart,
  type DrawingLayout,
  type Hyperlink,
  type Inline,
  type MediaPart,
  type Paragraph,
  type Revision,
  type Run,
  type RunContent,
  type RunProperties,
  type PreservedPackage,
  type SectionProps,
  type WordDocument,
} from "@/document/docx/model"

const EMU_PER_PX = 914400 / 96

export type JsonMark = { type?: string; attrs?: Record<string, unknown> }
export type JsonNode = {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: JsonMark[]
  content?: JsonNode[]
}

// ---------------------------------------------------------------------------------------------------------------
// Word → editor
// ---------------------------------------------------------------------------------------------------------------

type CommentReply = { id: string; author: string; text: string; created: string }

/** A comment as the editor's comment mark holds it. Replies are Word comments whose parent is this one. */
export type CommentView = {
  author: string
  text: string
  created: string
  resolved: boolean
  replies: CommentReply[]
}

/** State carried through one document while it is turned into editor HTML. */
export type Projection = {
  doc: WordDocument
  comments: Map<number, CommentView>
  /** Reply comment ids; their own ranges duplicate the parent's and are not shown. */
  replies: Set<number>
  /** Main comments whose range is open at the current point, in document order. */
  open: Set<number>
  notes: { footnote: number; endnote: number }
  theme: ThemeFonts
  /** Top-level items of each numbering instance shown so far; Word keeps counting across interruptions. */
  listItems: Map<number, number>
  /** The paragraph being shown has text of its own, so a shape in it stays in place (21.35). */
  textParagraph?: boolean
}

export function projectionFor(doc: WordDocument): Projection {
  const { views, replies } = commentViews(doc.comments)
  return {
    doc,
    comments: views,
    replies,
    open: new Set(),
    notes: { footnote: 0, endnote: 0 },
    theme: themeFontsOf(doc),
    listItems: new Map(),
  }
}

/** Main comments with their replies, from comments.xml and the commentsExtended threading. */
export function commentViews(part: CommentPart | undefined) {
  const views = new Map<number, CommentView>()
  const replies = new Set<number>()
  if (!part) {
    return { views, replies }
  }
  const byParaId = new Map<string, Comment>()
  for (const item of part.items) {
    const paraId = lastParaId(item)
    if (paraId) {
      byParaId.set(paraId, item)
    }
  }
  const extended = new Map((part.extended ?? []).map((entry) => [entry.paraId, entry]))
  const parentOf = (item: Comment) => {
    const parentParaId = extended.get(lastParaId(item) ?? "")?.parentParaId
    return parentParaId ? byParaId.get(parentParaId) : undefined
  }
  for (const item of part.items) {
    if (parentOf(item)) {
      replies.add(item.id)
      continue
    }
    views.set(item.id, {
      author: item.author ?? "",
      text: commentText(item),
      created: item.date ?? "",
      resolved: extended.get(lastParaId(item) ?? "")?.done === true,
      replies: [],
    })
  }
  for (const item of part.items) {
    const parent = parentOf(item)
    const view = parent ? views.get(parent.id) : undefined
    view?.replies.push({
      id: String(item.id),
      author: item.author ?? "",
      text: commentText(item),
      created: item.date ?? "",
    })
  }
  return { views, replies }
}

function commentText(item: Comment) {
  return paragraphsIn(item.blocks)
    .map((paragraph) => paragraphText(paragraph))
    .join("\n")
}

function lastParaId(item: Comment) {
  const paragraphs = paragraphsIn(item.blocks)
  return paragraphs[paragraphs.length - 1]?.paraId
}

/** Editor HTML for a paragraph's inlines. Complex fields that start and end in the paragraph become one atom. */
export function inlinesHtml(inlines: Inline[], ctx: Projection): string {
  let html = ""
  for (let index = 0; index < inlines.length; index += 1) {
    const end = fieldEnd(inlines, index)
    if (end >= 0) {
      const field = inlines.slice(index, end + 1)
      html += wrapComments(atomHtml("field", field, visibleText(field)), ctx)
      index = end
      continue
    }
    html += inlineHtml(inlines[index]!, ctx)
  }
  return html
}

/** Index of the run that closes a complex field begun at `start`, or -1. */
function fieldEnd(inlines: Inline[], start: number) {
  const first = inlines[start]
  if (first?.kind !== "run" || !first.content.some((item) => item.kind === "fldChar" && item.fieldType === "begin")) {
    return -1
  }
  let depth = 0
  for (let index = start; index < inlines.length; index += 1) {
    const inline = inlines[index]
    if (inline?.kind !== "run") {
      continue
    }
    for (const content of inline.content) {
      if (content.kind !== "fldChar") {
        continue
      }
      depth += content.fieldType === "begin" ? 1 : content.fieldType === "end" ? -1 : 0
      if (depth === 0) {
        return index
      }
    }
  }
  return -1
}

function inlineHtml(inline: Inline, ctx: Projection): string {
  switch (inline.kind) {
    case "run":
      return runHtml(inline, ctx)
    case "hyperlink": {
      const href = inline.target ?? (inline.anchor ? `#${inline.anchor}` : "")
      const attrs = href ? ` href="${escapeHtml(href)}"` : ""
      return `<a${attrs}>${inlinesHtml(inline.inlines, ctx)}</a>`
    }
    case "ins":
    case "del":
      return revisionHtml(inline, ctx)
    case "simpleField":
      return wrapComments(atomHtml("field", [inline], visibleText([inline])), ctx)
    case "raw":
      return wrapComments(atomHtml("raw", [inline], inline.text), ctx)
    case "bookmarkStart":
    case "bookmarkEnd":
      return atomHtml("bookmark", [inline], "")
    case "commentRangeStart":
      if (!ctx.replies.has(inline.id) && ctx.comments.has(inline.id)) {
        ctx.open.add(inline.id)
      }
      return ""
    case "commentRangeEnd":
      ctx.open.delete(inline.id)
      return ""
  }
}

function revisionHtml(revision: Revision, ctx: Projection) {
  const kind = revision.kind === "ins" ? "data-insertion" : "data-deletion"
  const attrs = [
    kind,
    `data-id="${revision.id}"`,
    `data-author="${escapeHtml(revision.author ?? "")}"`,
    `data-time="${escapeHtml(revision.date ?? "")}"`,
  ]
  return `<span ${attrs.join(" ")}>${inlinesHtml(revision.inlines, ctx)}</span>`
}

function runHtml(run: Run, ctx: Projection) {
  if (run.content.some((item) => item.kind === "footnoteReference" || item.kind === "endnoteReference")) {
    const footnote = run.content.some((item) => item.kind === "footnoteReference")
    const number = footnote ? ++ctx.notes.footnote : ++ctx.notes.endnote
    return wrapComments(atomHtml("note", [run], footnote ? String(number) : romanNumeral(number)), ctx)
  }
  const chart = chartPictureHtml(run, ctx)
  if (chart) {
    return wrapComments(chart, ctx)
  }
  const shape = shapePictureHtml(run, ctx)
  if (shape) {
    return wrapComments(shape, ctx)
  }
  const diagram = diagramPictureHtml(run, ctx)
  if (diagram) {
    return wrapComments(diagram, ctx)
  }
  const model = modelPictureHtml(run, ctx)
  if (model) {
    return wrapComments(model, ctx)
  }
  if (run.content.some((item) => item.kind === "drawing" && !mediaFor(ctx.doc, item.relId))) {
    // Shapes and text boxes have no picture to show; keep them whole and show their text.
    const text = run.content.map((item) => (item.kind === "drawing" ? drawingText(item) : "")).join("")
    return wrapComments(atomHtml("raw", [run], text), ctx)
  }
  if (run.content.some((item) => item.kind === "raw")) {
    // Symbols, non-breaking hyphens, embedded objects: the run stays whole and shows its text.
    return wrapComments(atomHtml("raw", [run], visibleText([run])), ctx)
  }
  const inner = run.content.map((content) => runContentHtml(content, run, ctx)).join("")
  if (!inner) {
    // Field characters of a field that spans paragraphs (a TOC) and other content with nothing to show: keep the
    // run in place as an invisible atom so the field still opens and closes where it did.
    // Comment references are written again from the comment marks on save.
    if (run.content.every((item) => item.kind === "commentReference")) {
      return ""
    }
    const field = run.content.some((item) => item.kind === "fldChar" || item.kind === "instrText")
    return wrapComments(atomHtml(field ? "field" : "raw", [run], ""), ctx)
  }
  // Word keeps every space in w:t; HTML parsing would collapse runs of them unless told otherwise.
  const spaced = run.content.some((item) => "text" in item && /^ | $| {2}/.test(String(item.text)))
  const style = spaced ? ` style="white-space: pre-wrap"` : ""
  // The character style is shown by the document stylesheet (data-word-rstyle); saving keeps it from the source.
  const rstyle = run.rPr.rStyle ? ` data-word-rstyle="${escapeHtml(run.rPr.rStyle)}"` : ""
  const anchored =
    run.key || spaced || rstyle ? `<span data-docx-run="${run.key ?? ""}"${rstyle}${style}>${inner}</span>` : inner
  return wrapComments(anchored, ctx)
}

function runContentHtml(content: RunContent, run: Run, ctx: Projection) {
  switch (content.kind) {
    case "break":
      return content.breakType === "page" ? "" : wrapText("<br>", run.rPr, ctx.theme)
    case "tab":
      return wrapText(`<span data-tab="1"></span>`, run.rPr, ctx.theme)
    case "drawing": {
      const media = mediaFor(ctx.doc, content.relId)
      if (!media) {
        return ""
      }
      const layout = content.layout ? floatingLayout(content.layout, content.cx, ctx.doc.section, content.cy) : null
      return imageHtml(
        media,
        content.cx,
        content.cy,
        content.name,
        run.key,
        layout,
        content.rot,
        content.object,
        content.crop,
      )
    }
    case "text":
    case "delText":
      return wrapText(escapeHtml(content.text), run.rPr, ctx.theme)
    default:
      return ""
  }
}

function wrapComments(html: string, ctx: Projection) {
  if (!html) {
    return html
  }
  let wrapped = html
  for (const id of ctx.open) {
    const view = ctx.comments.get(id)
    if (!view) {
      continue
    }
    const attrs = [
      `data-comment-id="${id}"`,
      `data-author="${escapeHtml(view.author)}"`,
      `data-comment="${encodeURIComponent(view.text)}"`,
      `data-time="${escapeHtml(view.created)}"`,
      `data-resolved="${view.resolved ? "true" : "false"}"`,
      `data-replies="${encodeURIComponent(JSON.stringify(view.replies))}"`,
    ]
    wrapped = `<span ${attrs.join(" ")}>${wrapped}</span>`
  }
  return wrapped
}

/** A drawing's text, or a stand-in naming a chart or SmartArt graphic, which has no text of its own to show. */
function drawingText(drawing: Extract<RunContent, { kind: "drawing" }>) {
  if (drawing.text) {
    return drawing.text
  }
  if (drawing.xml.includes("drawingml/2006/chart") || drawing.xml.includes("drawing/2014/chartex")) {
    return `[${drawing.name || "Chart"}]`
  }
  if (drawing.xml.includes("drawingml/2006/diagram")) {
    return `[${drawing.name || "SmartArt"}]`
  }
  return ""
}

/** The chart part a drawing in the main document shows, from the parts kept whole on open. */
function chartPart(doc: WordDocument, drawing: Extract<RunContent, { kind: "drawing" }>) {
  const relId = chartRelId(drawing.xml)
  if (!relId) {
    return null
  }
  const group = doc.preserved?.relationships.find((item) => item.source === "/word/document.xml")
  const partName = group?.items.find((item) => item.id === relId)?.partName
  const part = partName ? doc.preserved?.parts.find((item) => item.name === partName) : undefined
  return part ? decodeXml(part.data) : null
}

function decodeObjectJson(data: string | undefined): JsonNode | null {
  if (!data) {
    return null
  }
  try {
    const binary = atob(data)
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))) as JsonNode
  } catch {
    return null
  }
}

function encodeObjectJson(value: unknown) {
  return encodeBase64(new TextEncoder().encode(JSON.stringify(value)))
}

/** Whether two specs hold the same data: Word changed nothing a chart shows from its sheet. */
function sameChartData(left: ChartSpec, right: ChartSpec) {
  const shown = (spec: ChartSpec) =>
    JSON.stringify({
      categories: spec.categories.filter((_, index) => !spec.hiddenCategories.includes(index)),
      series: spec.series
        .filter((serie) => !serie.hidden)
        .map((serie) => [serie.name, serie.values.filter((_, index) => !spec.hiddenCategories.includes(index))]),
    })
  return shown(left) === shown(right)
}

/**
 * A Word chart, drawn from its chart part and shown as a picture carrying the chart object, which opens as an
 * editable chart (20.8). A chart this app saved keeps its own options while Word left its data as it was.
 */
function chartPictureHtml(run: Run, ctx: Projection) {
  const drawings = run.content.filter((item) => item.kind === "drawing")
  const drawing = drawings.length === 1 ? drawings[0] : undefined
  if (drawing?.kind !== "drawing" || mediaFor(ctx.doc, drawing.relId)) {
    return null
  }
  const xml = chartPart(ctx.doc, drawing)
  if (xml === null) {
    return null
  }
  const read = readChartSpace(xml)
  const saved = decodeObjectJson(drawing.object)
  const savedChart = saved?.type === "figure" && saved.attrs?.kind === "chart" ? saved : null
  const own = savedChart ? chartSpecOf(savedChart.attrs ?? {}) : null
  const spec =
    own && (!read || sameChartData(own, read))
      ? own
      : read
        ? { ...read, ...(own ? { style: own.style, palette: own.palette } : {}) }
        : null
  if (!spec) {
    return null
  }
  const width = Math.max(1, Math.round((drawing.cx ?? 5486400) / EMU_PER_PX))
  const height = Math.max(1, Math.round((drawing.cy ?? 3200400) / EMU_PER_PX))
  const chart = serializeChartSpec(spec)
  const figure = {
    ...(savedChart ?? {}),
    type: "figure",
    attrs: {
      ...(savedChart?.attrs ?? {}),
      kind: "chart",
      variant: variantOf(spec),
      chart,
      wordChart: chart,
      width,
      height,
      alt: drawing.name && !/^Chart \d+$/.test(drawing.name) ? drawing.name : (savedChart?.attrs?.alt ?? ""),
    },
    shown: [width, height],
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${renderChart(spec, width, height)}</svg>`
  const picture: MediaPart = {
    relId: "",
    type: "",
    target: "",
    name: "",
    contentType: "image/svg+xml",
    data: new TextEncoder().encode(svg),
  }
  const layout = drawing.layout ? floatingLayout(drawing.layout, drawing.cx, ctx.doc.section, drawing.cy) : null
  return imageHtml(
    picture,
    drawing.cx,
    drawing.cy,
    drawing.name,
    run.key,
    layout,
    drawing.rot,
    encodeObjectJson(figure),
  )
}

/** The model part's relationship id in a 3-D model drawing (`am3d:model3d r:embed`). */
function modelRelId(xml: string) {
  return /<(?:\w+:)?model3d\b[^>]*\br:embed="([^"]+)"/.exec(xml)?.[1]
}

const modelUrls = new WeakMap<Uint8Array, string>()

/**
 * A 3-D model Word saved (21.38), opened as the app's own model: the `.glb` is the model, Word's fallback picture is
 * what shows until it loads. The `.glb` is handed to the viewer as a blob, not copied into the page, as models run
 * to tens of megabytes. Not turned, it goes back as Word's drawing and model part (`modelRun`).
 */
function modelPictureHtml(run: Run, ctx: Projection) {
  const drawings = run.content.filter((item) => item.kind === "drawing")
  const drawing = drawings.length === 1 ? drawings[0] : undefined
  if (drawing?.kind !== "drawing" || typeof URL.createObjectURL !== "function") {
    return null
  }
  const picture = mediaFor(ctx.doc, drawing.relId)
  const part = relatedPart(ctx.doc, "/word/document.xml", modelRelId(drawing.xml))
  if (!picture || !part) {
    return null
  }
  let url = modelUrls.get(part.data)
  if (!url) {
    url = URL.createObjectURL(new Blob([part.data.slice().buffer as ArrayBuffer], { type: "model/gltf-binary" }))
    modelUrls.set(part.data, url)
  }
  const width = Math.max(1, Math.round((drawing.cx ?? 0) / EMU_PER_PX))
  const height = Math.max(1, Math.round((drawing.cy ?? 0) / EMU_PER_PX))
  const alt = /<wp:docPr\b[^>]*\bdescr="([^"]*)"/.exec(drawing.xml)?.[1] ?? ""
  const figure = {
    type: "threeDModel",
    attrs: {
      preset: "cube",
      src: url,
      snapshot: `data:${picture.contentType || "image/png"};base64,${encodeBase64(picture.data)}`,
      width,
      height,
      yaw: 0,
      pitch: 0,
      roll: 0,
      alt: alt
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&"),
      wordModel: "0,0",
    },
    shown: [width, height],
  }
  const layout = drawing.layout ? floatingLayout(drawing.layout, drawing.cx, ctx.doc.section, drawing.cy) : null
  return imageHtml(
    picture,
    drawing.cx,
    drawing.cy,
    drawing.name,
    run.key,
    layout,
    drawing.rot,
    encodeObjectJson(figure),
  )
}

/** A part of the document the reader keeps whole, by the relationship id a drawing or another part gives. */
function relatedPart(doc: WordDocument, source: string, relId: string | undefined) {
  if (!relId) {
    return null
  }
  const group = doc.preserved?.relationships.find((item) => item.source === source)
  const partName = group?.items.find((item) => item.id === relId)?.partName
  return partName ? (doc.preserved?.parts.find((item) => item.name === partName) ?? null) : null
}

/**
 * A SmartArt graphic (21.36), shown from the drawing Word saved with it, as a picture the size of its frame. The
 * diagram's parts stay as written (`diagramRun`).
 */
function diagramPictureHtml(run: Run, ctx: Projection) {
  const drawings = run.content.filter((item) => item.kind === "drawing")
  const drawing = drawings.length === 1 ? drawings[0] : undefined
  if (drawing?.kind !== "drawing") {
    return null
  }
  const svg = diagramSvg(ctx.doc, drawing)
  if (!svg) {
    return null
  }
  const picture: MediaPart = {
    relId: "",
    type: "",
    target: "",
    name: "",
    contentType: "image/svg+xml",
    data: new TextEncoder().encode(svg),
  }
  const layout = drawing.layout ? floatingLayout(drawing.layout, drawing.cx, ctx.doc.section, drawing.cy) : null
  return imageHtml(picture, drawing.cx, drawing.cy, drawing.name, run.key, layout, drawing.rot)
}

/** The SVG of a SmartArt drawing from the pre-rendered drawing part, or null when the file has none. */
export function diagramSvg(doc: WordDocument, drawing: Extract<RunContent, { kind: "drawing" }>) {
  if (mediaFor(doc, drawing.relId) || !drawing.xml.includes("drawingml/2006/diagram")) {
    return null
  }
  const data = relatedPart(doc, "/word/document.xml", diagramDataRelId(drawing.xml))
  if (!data) {
    return null
  }
  const shown = relatedPart(doc, "/word/document.xml", diagramDrawingRelId(decodeXml(data.data)))
  const theme = doc.preserved?.parts.find((item) => item.name.toLowerCase() === "/word/theme/theme1.xml")
  return shown
    ? renderDiagramDrawing(
        decodeXml(shown.data),
        theme ? decodeXml(theme.data) : null,
        drawing.cx ?? 5486400,
        drawing.cy ?? 3200400,
      )
    : null
}

/**
 * A shape Word drew (21.35), shown as the app's own shape: a picture carrying the shape object, which opens as an
 * editable shape with Word's preset, size, place, fill and outline. A shape the app has no preset for, or a text
 * box, stays whole and shows its text.
 */
function shapePictureHtml(run: Run, ctx: Projection) {
  const drawings = run.content.filter((item) => item.kind === "drawing")
  const drawing = drawings.length === 1 ? drawings[0] : undefined
  // A floating shape opens as a block before its paragraph; beside text that would move it in the source.
  if (ctx.textParagraph || drawing?.kind !== "drawing" || mediaFor(ctx.doc, drawing.relId)) {
    return null
  }
  const theme = ctx.doc.preserved?.parts.find((item) => item.name.toLowerCase() === "/word/theme/theme1.xml")
  const shape = readWordShape(drawing.xml, theme ? decodeXml(theme.data) : null)
  if (!shape) {
    return null
  }
  const width = Math.max(1, Math.round((drawing.cx ?? 0) / EMU_PER_PX))
  const height = Math.max(1, Math.round((drawing.cy ?? 0) / EMU_PER_PX))
  const figure = {
    type: "figure",
    attrs: {
      kind: "shape",
      variant: shape.variant,
      fill: shape.fill === "none" ? "transparent" : shape.fill,
      stroke: shape.stroke === "none" ? "transparent" : shape.stroke,
      strokeWidth: shape.strokeWidth,
      text: shape.text,
      textColor: shape.textColor,
      textFont: shape.textFont,
      textSize: shape.textSize,
      textBold: shape.textBold,
      strokeDash: shape.dash,
      fillGradient: shape.gradient,
      shadow: shape.shadow,
      glow: shape.glow,
      softEdge: shape.softEdge,
      reflection: shape.reflection,
      wordShape: wordShapeMark(shape),
      width,
      height,
      alt: drawing.name && !/^[A-Za-z ]+ \d+$/.test(drawing.name) ? drawing.name : "",
    },
    shown: [width, height],
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56" width="${width}" height="${height}" ` +
    `preserveAspectRatio="none">${shapeMarkup(shape.variant)}</svg>`
  const picture: MediaPart = {
    relId: "",
    type: "",
    target: "",
    name: "",
    contentType: "image/svg+xml",
    data: new TextEncoder().encode(svg),
  }
  const layout = drawing.layout ? floatingLayout(drawing.layout, drawing.cx, ctx.doc.section, drawing.cy) : null
  return imageHtml(
    picture,
    drawing.cx,
    drawing.cy,
    drawing.name,
    run.key,
    layout,
    drawing.rot,
    encodeObjectJson(figure),
  )
}

function atomHtml(role: string, payload: unknown, text: string) {
  const tag = role === "note" ? "sup" : "span"
  const attrs = [
    "data-word-inline",
    `data-role="${role}"`,
    `data-payload="${escapeHtml(JSON.stringify(payload))}"`,
    `data-text="${escapeHtml(text)}"`,
  ]
  const page = role === "field" ? pageFieldOf(payload) : ""
  if (page) {
    attrs.push(`data-page-field="${page}"`)
  }
  return `<${tag} ${attrs.join(" ")}>${escapeHtml(text)}</${tag}>`
}

/** `page` or `pages` for a PAGE or NUMPAGES field (simple or complex), else nothing. */
function pageFieldOf(payload: unknown) {
  const match = /"(?:instr|text)":"\s*(NUMPAGES|PAGE)\b/.exec(JSON.stringify(payload))
  return match ? (match[1] === "PAGE" ? "page" : "pages") : ""
}

/** A block content control or display equation, kept whole. */
export function blockAtomHtml(block: Block, text: string) {
  const attrs = [
    "data-word-block",
    `data-role="raw"`,
    `data-payload="${escapeHtml(JSON.stringify(block))}"`,
    `data-text="${escapeHtml(text)}"`,
  ]
  return `<div ${attrs.join(" ")}>${text
    .split("\n")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")}</div>`
}

/** Text a reader sees: field results without their codes, deleted text left out. */
function visibleText(inlines: Inline[]) {
  let text = ""
  let depth = 0
  const inCode: boolean[] = []
  const visit = (inline: Inline) => {
    if (inline.kind === "run") {
      for (const content of inline.content) {
        if (content.kind === "fldChar") {
          if (content.fieldType === "begin") {
            depth += 1
            inCode[depth] = true
          } else if (content.fieldType === "separate") {
            inCode[depth] = false
          } else {
            depth = Math.max(0, depth - 1)
          }
        } else if (content.kind === "text" && !(depth > 0 && inCode[depth])) {
          text += content.text
        } else if (content.kind === "tab" && !(depth > 0 && inCode[depth])) {
          text += "\t"
        } else if (content.kind === "raw" && !(depth > 0 && inCode[depth])) {
          text += content.text
        }
      }
      return
    }
    if (inline.kind === "hyperlink" || inline.kind === "ins" || inline.kind === "simpleField") {
      inline.inlines.forEach(visit)
    } else if (inline.kind === "raw") {
      text += inline.text
    }
  }
  inlines.forEach(visit)
  return text
}

export function mediaFor(doc: WordDocument, relId: string | undefined) {
  return relId ? doc.media?.find((item) => item.relId === relId) : undefined
}

/** A floating picture as the editor places it: its wrap, and where it sits from its paragraph or the margins. */
export type FloatingLayout = {
  wrap: "square" | "tight" | "through" | "topBottom" | "behind" | "front"
  x: number
  dy: number
  relative: "paragraph" | "margin"
  z: number
  /** Layout > Text Wrapping: the sides text flows on, and the distances from text in pixels. */
  side?: "both" | "left" | "right" | "largest"
  dist?: { t: number; b: number; l: number; r: number }
  allowOverlap?: boolean
  locked?: boolean
  /** The alignment the place was set by, kept while the object is still there, and what x is measured from. */
  alignH?: string
  alignV?: string
  fromH?: "margin" | "page"
}

const SIDE_FROM_WORD: Record<string, NonNullable<FloatingLayout["side"]>> = {
  bothSides: "both",
  left: "left",
  right: "right",
  largest: "largest",
}

const SIDE_TO_WORD: Record<NonNullable<FloatingLayout["side"]>, string> = {
  both: "bothSides",
  left: "left",
  right: "right",
  largest: "largest",
}

/** The page's size and margins in pixels, from the section (Letter with 1" margins when it says nothing). */
function pageBox(section: SectionProps | null | undefined) {
  const pageWidth = (section?.pageWidth ?? 12240) * PX_PER_TWIP
  const pageHeight = (section?.pageHeight ?? 15840) * PX_PER_TWIP
  const marginLeft = (section?.marginLeft ?? 1440) * PX_PER_TWIP
  const marginTop = (section?.marginTop ?? 1440) * PX_PER_TWIP
  return {
    pageWidth,
    marginLeft,
    marginTop,
    contentWidth: pageWidth - marginLeft - (section?.marginRight ?? 1440) * PX_PER_TWIP,
    contentHeight: pageHeight - marginTop - (section?.marginBottom ?? 1440) * PX_PER_TWIP,
  }
}

/** x from the left margin of an object `width` wide aligned across the page or the margins. */
function alignedX(align: string, onPage: boolean, width: number, section: SectionProps | null | undefined) {
  const box = pageBox(section)
  const across = onPage ? box.pageWidth : box.contentWidth
  const x = align === "center" ? (across - width) / 2 : align === "right" || align === "outside" ? across - width : 0
  return onPage ? x - box.marginLeft : x
}

/** y from the top margin of an object `height` high aligned between the margins. */
function alignedY(align: string, height: number, section: SectionProps | null | undefined) {
  const box = pageBox(section)
  return align === "center"
    ? (box.contentHeight - height) / 2
    : align === "bottom" || align === "outside"
      ? box.contentHeight - height
      : 0
}

const PX_PER_TWIP = 1 / 15

/**
 * Word's anchor in the editor's terms. Across, the picture sits from the left margin; down, it moves with its
 * paragraph, offset from the paragraph's top, or from the top margin of the page the paragraph is on.
 */
export function floatingLayout(
  layout: DrawingLayout,
  cx: number | undefined,
  section: SectionProps | null | undefined,
  cy?: number,
): FloatingLayout {
  const width = (cx ?? 0) / EMU_PER_PX
  const height = (cy ?? 0) / EMU_PER_PX
  const box = pageBox(section)
  const onPage = layout.h.from === "page"
  let x = (layout.h.offset ?? 0) / EMU_PER_PX
  if (layout.h.align) {
    x = alignedX(layout.h.align, onPage, width, section)
  } else if (onPage) {
    x -= box.marginLeft
  }
  const fromParagraph = layout.v.from === "paragraph" || layout.v.from === "line"
  let dy = (layout.v.offset ?? 0) / EMU_PER_PX
  if (layout.v.align) {
    dy = layout.v.from === "margin" ? alignedY(layout.v.align, height, section) : 0
  } else if (layout.v.from === "page") {
    dy -= box.marginTop
  }
  const result: FloatingLayout = {
    wrap: layout.wrap === "none" ? (layout.behind ? "behind" : "front") : layout.wrap,
    x: Math.round(x),
    dy: Math.round(fromParagraph ? dy : Math.max(0, dy)),
    relative: fromParagraph ? "paragraph" : "margin",
    z: Math.max(1, Math.min(9999, layout.z ?? 1)),
  }
  if (layout.wrapText && SIDE_FROM_WORD[layout.wrapText]) {
    result.side = SIDE_FROM_WORD[layout.wrapText]
  }
  if (layout.dist) {
    const px = (emu: number) => Math.round(emu / EMU_PER_PX)
    result.dist = { t: px(layout.dist.t), b: px(layout.dist.b), l: px(layout.dist.l), r: px(layout.dist.r) }
  }
  if (layout.allowOverlap !== undefined) {
    result.allowOverlap = layout.allowOverlap
  }
  if (layout.locked !== undefined) {
    result.locked = layout.locked
  }
  if (layout.h.align && (layout.h.from === "margin" || layout.h.from === "page" || layout.h.from === "column")) {
    result.alignH = layout.h.align
  }
  if (layout.v.align && layout.v.from === "margin") {
    result.alignV = layout.v.align
  }
  if (onPage) {
    result.fromH = "page"
  }
  return result
}

function imageHtml(
  media: MediaPart,
  cx: number | undefined,
  cy: number | undefined,
  name?: string,
  key?: string,
  layout?: FloatingLayout | null,
  rot?: number,
  object?: string,
  crop?: { l: number; t: number; r: number; b: number },
) {
  const mime = media.contentType || "image/png"
  const kept = object && /^[A-Za-z0-9+/=]+$/.test(object) ? ` data-inkspire-object="${object}"` : ""
  const degrees = rotationDegrees(rot)
  const rotate = degrees ? ` data-rotate="${degrees}"` : ""
  const width = cx ? ` width="${Math.max(1, Math.round(cx / EMU_PER_PX))}"` : ""
  const height = cy ? ` height="${Math.max(1, Math.round(cy / EMU_PER_PX))}"` : ""
  const alt = name ? ` alt="${escapeHtml(name)}"` : ""
  const anchor = key ? ` data-docx="${key}"` : ""
  const floating = layout ? floatingHtml(layout) : ""
  const percent = (value: number) => Math.round(value / 10) / 100
  const cropped = crop
    ? (["l", "t", "r", "b"] as const)
        .filter((side) => crop[side])
        .map((side) => ` data-crop-${side}="${percent(crop[side])}"`)
        .join("")
    : ""
  return `<img src="data:${mime};base64,${encodeBase64(media.data)}"${width}${height}${alt}${anchor}${floating}${rotate}${cropped}${kept}>`
}

/** The data attributes the editor reads a floating object's layout from. */
function floatingHtml(layout: FloatingLayout) {
  let html =
    ` data-wrap="${layout.wrap}" data-anchoring="move" data-x="${layout.x}" data-dy="${layout.dy}"` +
    ` data-relative="${layout.relative}" data-z="${layout.z}"`
  if (layout.side && layout.side !== "both") {
    html += ` data-wrap-side="${layout.side}"`
  }
  if (layout.dist) {
    html +=
      ` data-dist-t="${layout.dist.t}" data-dist-b="${layout.dist.b}"` +
      ` data-dist-l="${layout.dist.l}" data-dist-r="${layout.dist.r}"`
  }
  if (layout.allowOverlap === false) {
    html += ` data-allow-overlap="0"`
  }
  if (layout.locked) {
    html += ` data-lock-anchor="1"`
  }
  if (layout.alignH) {
    html += ` data-align-h="${escapeHtml(layout.alignH)}"`
  }
  if (layout.alignV) {
    html += ` data-align-v="${escapeHtml(layout.alignV)}"`
  }
  if (layout.fromH === "page") {
    html += ` data-from-h="page"`
  }
  return html
}

/** The editor's angle (degrees, -180 to 180) for Word's a:xfrm rot (60000ths of a degree, clockwise). */
export function rotationDegrees(rot: number | undefined) {
  if (!rot) {
    return 0
  }
  const degrees = Math.round(((((rot / 60000) % 360) + 360) % 360) * 100) / 100
  return degrees > 180 ? degrees - 360 : degrees
}

/** Word's a:xfrm rot for the editor's angle. */
export function rotationRot(degrees: number) {
  return Math.round((((degrees % 360) + 360) % 360) * 60000) % 21600000
}

function wrapText(text: string, props: RunProperties, theme: ThemeFonts) {
  let html = text
  if (props.b) {
    html = `<strong>${html}</strong>`
  }
  if (props.i) {
    html = `<em>${html}</em>`
  }
  if (props.u && props.u.value !== "none") {
    html = `<u>${html}</u>`
  }
  if (props.strike || props.dstrike) {
    html = `<s>${html}</s>`
  }
  if (props.vertAlign === "subscript") {
    html = `<sub>${html}</sub>`
  }
  if (props.vertAlign === "superscript") {
    html = `<sup>${html}</sup>`
  }
  const style = runStyle(props, theme)
  if (style) {
    html = `<span style="${style}">${html}</span>`
  }
  return html
}

function runStyle(props: RunProperties, theme: ThemeFonts) {
  const rules: string[] = []
  if (props.color && props.color !== "auto") {
    rules.push(`color: #${props.color}`)
  }
  const font = fontOf(props.rFonts, theme)
  if (font) {
    rules.push(`font-family: ${fontStack(font)}`)
  }
  if (props.sz) {
    rules.push(`font-size: ${props.sz / 2}pt`)
  }
  return rules.join("; ")
}

function romanNumeral(value: number) {
  const numerals: [number, string][] = [
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ]
  let rest = value
  let text = ""
  for (const [amount, symbol] of numerals) {
    while (rest >= amount) {
      text += symbol
      rest -= amount
    }
  }
  return text
}

// ---------------------------------------------------------------------------------------------------------------
// Editor → Word
// ---------------------------------------------------------------------------------------------------------------

const NO_THEME_FONTS: ThemeFonts = {
  majorLatin: "",
  minorLatin: "",
  majorEastAsia: "",
  minorEastAsia: "",
  majorBidi: "",
  minorBidi: "",
}

/** Run properties the editor shows. Everything else on a run is carried from its source. */
type VisibleRun = {
  b: boolean
  i: boolean
  u: boolean
  strike: boolean
  vertAlign: string
  color: string
  font: string
  sz: number
}

function visibleRun(props: RunProperties, theme: ThemeFonts): VisibleRun {
  return {
    b: props.b === true,
    i: props.i === true,
    u: Boolean(props.u && props.u.value !== "none"),
    strike: props.strike === true || props.dstrike === true,
    vertAlign: props.vertAlign === "subscript" || props.vertAlign === "superscript" ? props.vertAlign : "",
    color: props.color && props.color !== "auto" ? props.color.toUpperCase() : "",
    font: fontOf(props.rFonts, theme) || "",
    sz: props.sz ?? 0,
  }
}

/**
 * Run properties for edited text: the source run's properties with only the visible ones the user changed
 * applied, so character styles, language, and tracked formatting changes survive.
 */
export function runPropertiesFromEdit(
  edited: RunProperties,
  source: RunProperties | undefined,
  theme: ThemeFonts = NO_THEME_FONTS,
): RunProperties {
  if (!source) {
    return edited
  }
  const base = structuredClone(source)
  const before = visibleRun(source, theme)
  const after = visibleRun(edited, theme)
  if (after.b !== before.b) {
    base.b = after.b || undefined
  }
  if (after.i !== before.i) {
    base.i = after.i || undefined
  }
  if (after.u !== before.u) {
    base.u = after.u ? { value: "single" } : undefined
  }
  if (after.strike !== before.strike) {
    base.strike = after.strike || undefined
    base.dstrike = undefined
  }
  if (after.vertAlign !== before.vertAlign) {
    base.vertAlign = (after.vertAlign || undefined) as RunProperties["vertAlign"]
  }
  if (after.color !== before.color) {
    base.color = after.color || undefined
  }
  if (after.font !== before.font) {
    // A theme font overrides the explicit name in Word, so a chosen font replaces it.
    const fonts = {
      ...base.rFonts,
      ascii: after.font || undefined,
      hAnsi: after.font || undefined,
      asciiTheme: undefined,
      hAnsiTheme: undefined,
    }
    base.rFonts = Object.values(fonts).some((value) => value !== undefined) ? fonts : undefined
  }
  if (after.sz !== before.sz) {
    base.sz = after.sz || undefined
    base.szCs = after.sz || undefined
  }
  return Object.fromEntries(Object.entries(base).filter(([, value]) => value !== undefined)) as RunProperties
}

type RevisionKey = { kind: "ins" | "del"; id: string; author: string; date: string }

/** One inline from the editor, with the annotations that decide how it is grouped. */
type Piece = { inline: Inline; link?: string; revision?: RevisionKey; comments: string[] }

/** Comments found while saving, by editor id, in document order. */
export type EditorComment = CommentView

/** State shared by every paragraph while editor JSON is turned back into WordprocessingML. */
export type InlineBuild = {
  media: MediaPart[]
  picture: number
  runs: Map<string, Run>
  /** The source hyperlink around each run, by run anchor; an unchanged link keeps its relationship and history. */
  links: Map<string, Hyperlink>
  comments: Map<string, EditorComment>
  /** Comment ids on each saved inline, for placing commentRangeStart/End afterwards. */
  tags: Map<Inline, string[]>
  revisionIds: Map<string, number>
  nextRevision: number
  theme?: ThemeFonts
  /** The section the pictures sit in, for reading a floating picture's position the way it was opened. */
  section?: SectionProps | null
  /** Part names already in the package (lower case), so a new chart's parts take free ones. */
  usedParts?: Set<string>
  /** The parts the reader keeps whole (a 3-D model's `.glb`), to carry a model into the app's own picture. */
  preserved?: PreservedPackage
}

/** Word's date pictures for the automatic date and time the editor offers. */

export function inlinesFromEditor(nodes: JsonNode[], build: InlineBuild): Inline[] {
  const pieces: Piece[] = []
  for (const node of nodes) {
    const marks = node.marks ?? []
    const annotations = annotationsOf(marks, build)
    if (node.type === "text") {
      pieces.push({ inline: textRun(node.text ?? "", marks, annotations.revision, build), ...annotations })
      continue
    }
    if (node.type === "hardBreak" || node.type === "docTab") {
      const content: RunContent =
        node.type === "docTab" ? { kind: "tab" } : { kind: "break", breakType: "textWrapping" }
      pieces.push({ inline: contentRun(content, marks, build), ...annotations })
      continue
    }
    if (node.type === "image") {
      const run = imageRun(node, build)
      if (run) {
        pieces.push({ inline: run, ...annotations })
      }
      continue
    }
    if (node.type === "dateField") {
      // An automatic date goes back as Word's DATE field, with the date it shows as its result.
      const format = dateFormat(node.attrs?.format)
      pieces.push({
        inline: {
          kind: "simpleField",
          instr: ` DATE \\@ "${DATE_PICTURES[format]}" `,
          inlines: [textRun(formatDate(format), marks, annotations.revision, build)],
        },
        ...annotations,
      })
      continue
    }
    if (node.type === "wordInline") {
      for (const inline of payloadInlines(node.attrs?.payload)) {
        // A field inside a link (a table of contents' page number) stays inside it.
        pieces.push({ inline, link: annotations.link, comments: annotations.comments })
      }
      continue
    }
    for (const inline of inlinesFromEditor(node.content ?? [], build)) {
      pieces.push({ inline, comments: [] })
    }
  }
  return groupLinks(pieces, build)
}

function annotationsOf(marks: JsonMark[], build: InlineBuild) {
  const link = marks.find((mark) => mark.type === "link")
  const href = typeof link?.attrs?.href === "string" ? link.attrs.href : undefined
  const tracked = marks.find((mark) => mark.type === "insertion" || mark.type === "deletion")
  const revision: RevisionKey | undefined = tracked
    ? {
        kind: tracked.type === "insertion" ? "ins" : "del",
        id: String(tracked.attrs?.id ?? ""),
        author: String(tracked.attrs?.author ?? ""),
        date: String(tracked.attrs?.time ?? ""),
      }
    : undefined
  const comments: string[] = []
  for (const mark of marks) {
    if (mark.type !== "comment") {
      continue
    }
    const id = String(mark.attrs?.id ?? "")
    if (!id) {
      continue
    }
    comments.push(id)
    if (!build.comments.has(id)) {
      build.comments.set(id, {
        author: String(mark.attrs?.author ?? ""),
        text: String(mark.attrs?.text ?? ""),
        created: String(mark.attrs?.created ?? ""),
        resolved: mark.attrs?.resolved === true,
        replies: parseReplies(mark.attrs?.replies),
      })
    }
  }
  return { link: href || undefined, revision, comments }
}

function parseReplies(value: unknown): CommentReply[] {
  if (Array.isArray(value)) {
    return value as CommentReply[]
  }
  if (typeof value !== "string" || !value) {
    return []
  }
  for (const text of [value, safeDecode(value)]) {
    try {
      const parsed = JSON.parse(text) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((item: Partial<CommentReply>) => ({
          id: String(item.id ?? ""),
          author: String(item.author ?? ""),
          text: String(item.text ?? ""),
          created: String(item.created ?? ""),
        }))
      }
    } catch {
      // Try the next encoding.
    }
  }
  return []
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function payloadInlines(value: unknown): Inline[] {
  if (typeof value !== "string" || !value) {
    return []
  }
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as Inline[]) : []
  } catch {
    return []
  }
}

export function payloadBlock(value: unknown): Block | null {
  if (typeof value !== "string" || !value) {
    return null
  }
  try {
    const parsed = JSON.parse(value) as Block
    return parsed && typeof parsed === "object" && "kind" in parsed ? parsed : null
  } catch {
    return null
  }
}

function textRun(text: string, marks: JsonMark[], revision: RevisionKey | undefined, build: InlineBuild): Run {
  const kind = revision?.kind === "del" ? "delText" : "text"
  return contentRun(text ? { kind, text } : null, marks, build)
}

/** A run whose properties come from its source run (data-docx-run) with the editor's visible changes applied. */
function contentRun(content: RunContent | null, marks: JsonMark[], build: InlineBuild): Run {
  const anchor = marks.find((mark) => mark.type === "docxRun")
  const key = typeof anchor?.attrs?.key === "string" ? anchor.attrs.key : undefined
  const origin = key ? build.runs.get(key) : undefined
  const edited = propsFromMarks(marks)
  if (!origin && marks.some((mark) => mark.type === "link")) {
    edited.rStyle = "Hyperlink"
  }
  const run: Run = {
    kind: "run",
    rPr: runPropertiesFromEdit(edited, origin?.rPr, build.theme),
    content: content ? [content] : [],
  }
  if (key) {
    run.key = key
  }
  return run
}

/** Hyperlinks wrap revisions, the way Word nests a tracked change inside a link. */
function groupLinks(all: Piece[], build: InlineBuild): Inline[] {
  const pieces = mergeRunPieces(all)
  for (const piece of pieces) {
    if (piece.comments.length > 0) {
      build.tags.set(piece.inline, piece.comments)
    }
  }
  const out: Inline[] = []
  let index = 0
  while (index < pieces.length) {
    const link = pieces[index]!.link
    let end = index
    while (end < pieces.length && pieces[end]!.link === link) {
      end += 1
    }
    const grouped = groupRevisions(pieces.slice(index, end), build)
    if (link) {
      const fresh: Hyperlink = link.startsWith("#")
        ? { kind: "hyperlink", anchor: link.slice(1), inlines: grouped }
        : { kind: "hyperlink", target: link, inlines: grouped }
      const source = sourceLink(pieces.slice(index, end), build)
      const hyperlink: Hyperlink =
        source && source.target === fresh.target && source.anchor === fresh.anchor
          ? { ...source, inlines: grouped }
          : fresh
      const tags = pieces.slice(index, end).flatMap((piece) => piece.comments)
      if (tags.length > 0) {
        build.tags.set(hyperlink, [...new Set(tags)])
      }
      out.push(hyperlink)
    } else {
      out.push(...grouped)
    }
    index = end
  }
  return out
}

function sourceLink(pieces: Piece[], build: InlineBuild) {
  for (const piece of pieces) {
    const key = piece.inline.kind === "run" ? piece.inline.key : undefined
    const link = key ? build.links.get(key) : undefined
    if (link) {
      return link
    }
  }
  return undefined
}

/**
 * The editor splits a run at every tab and break; pieces of one source run that kept the same properties and
 * annotations go back together, so an unedited run is written as Word wrote it.
 */
function mergeRunPieces(pieces: Piece[]): Piece[] {
  const out: Piece[] = []
  for (const piece of pieces) {
    const previous = out[out.length - 1]
    const left = previous?.inline
    const right = piece.inline
    if (
      previous &&
      left?.kind === "run" &&
      right.kind === "run" &&
      left.key &&
      left.key === right.key &&
      previous.link === piece.link &&
      sameRevisionKey(previous.revision, piece.revision) &&
      previous.comments.join() === piece.comments.join() &&
      JSON.stringify(left.rPr) === JSON.stringify(right.rPr)
    ) {
      out[out.length - 1] = { ...previous, inline: { ...left, content: [...left.content, ...right.content] } }
      continue
    }
    out.push(piece)
  }
  return out
}

function sameRevisionKey(left: RevisionKey | undefined, right: RevisionKey | undefined) {
  return left === right || (left !== undefined && right !== undefined && sameRevision(left, right))
}

function groupRevisions(pieces: Piece[], build: InlineBuild): Inline[] {
  const out: Inline[] = []
  let index = 0
  while (index < pieces.length) {
    const revision = pieces[index]!.revision
    if (!revision) {
      out.push(pieces[index]!.inline)
      index += 1
      continue
    }
    let end = index
    while (end < pieces.length && sameRevision(pieces[end]!.revision, revision)) {
      end += 1
    }
    const inlines = pieces.slice(index, end).map((piece) => piece.inline)
    const tracked: Revision = {
      kind: revision.kind,
      id: revisionId(revision, build),
      ...(revision.author ? { author: revision.author } : {}),
      ...(revision.date ? { date: revision.date } : {}),
      inlines,
    }
    const tags = pieces.slice(index, end).flatMap((piece) => piece.comments)
    if (tags.length > 0) {
      build.tags.set(tracked, [...new Set(tags)])
    }
    out.push(tracked)
    index = end
  }
  return out
}

function sameRevision(left: RevisionKey | undefined, right: RevisionKey) {
  return left?.kind === right.kind && left.id === right.id && left.author === right.author
}

/** Word ids stay as they were; editor ids (uuids) get fresh numbers well clear of Word's. */
function revisionId(revision: RevisionKey, build: InlineBuild) {
  const key = `${revision.kind}:${revision.id}`
  const known = build.revisionIds.get(key)
  if (known !== undefined) {
    return known
  }
  const id = /^\d+$/.test(revision.id) ? Number(revision.id) : build.nextRevision++
  build.revisionIds.set(key, id)
  return id
}

export function propsFromMarks(marks: JsonMark[]): RunProperties {
  const props: RunProperties = {}
  if (marks.some((mark) => mark.type === "bold")) {
    props.b = true
  }
  if (marks.some((mark) => mark.type === "italic")) {
    props.i = true
  }
  if (marks.some((mark) => mark.type === "underline")) {
    props.u = { value: "single" }
  }
  if (marks.some((mark) => mark.type === "strike")) {
    props.strike = true
  }
  if (marks.some((mark) => mark.type === "subscript")) {
    props.vertAlign = "subscript"
  }
  if (marks.some((mark) => mark.type === "superscript")) {
    props.vertAlign = "superscript"
  }
  const style = marks.find((mark) => mark.type === "textStyle")
  const color = colorHex(style?.attrs?.color)
  if (color) {
    props.color = color
  }
  const font = fontName(style?.attrs?.fontFamily)
  if (font) {
    props.rFonts = { ascii: font, hAnsi: font }
  }
  const size = fontPoints(style?.attrs?.fontSize)
  if (size) {
    props.sz = Math.round(size * 2)
    props.szCs = props.sz
  }
  return props
}

/**
 * A picture from the editor. While it is the picture and size the source run had, the source drawing goes back
 * as Word wrote it (position, wrapping, cropping, effects); otherwise it becomes a new inline picture.
 */
export function imageRun(node: JsonNode, build: InlineBuild): Run | null {
  const object = typeof node.attrs?.objectNode === "string" ? node.attrs.objectNode : ""
  const figure = object ? decodeObjectJson(object) : null
  if (figure?.type === "figure" && figure.attrs?.kind === "chart") {
    return chartRun(node, figure, object, build)
  }
  const diagram = diagramRun(node, build)
  if (diagram) {
    return diagram
  }
  if (figure?.type === "threeDModel" && figure.attrs?.wordModel) {
    const kept = modelRun(node, figure, build)
    if (kept) {
      return kept
    }
    // Turned or resized in the app: the app's picture, carrying the model itself (the page holds only a blob URL).
    const part = modelPart(node, build)
    if (part && typeof figure.attrs.src === "string" && figure.attrs.src.startsWith("blob:")) {
      const own = {
        ...figure,
        attrs: { ...figure.attrs, src: `data:model/gltf-binary;base64,${encodeBase64(part)}`, wordModel: "" },
      }
      return imageRun({ ...node, attrs: { ...node.attrs, objectNode: encodeObjectJson(own) } }, build)
    }
  }
  const unchanged =
    figure?.type === "figure" && figure.attrs?.kind === "shape" ? wordShapeRun(node, figure, build) : null
  if (unchanged) {
    return unchanged
  }
  const native =
    figure?.type === "figure" && figure.attrs?.kind === "shape" ? nativeShapeRun(node, figure, build) : null
  if (native) {
    return native
  }
  const src = typeof node.attrs?.src === "string" ? node.attrs.src : ""
  const width = numberAttr(node.attrs?.width) ?? 320
  const height = numberAttr(node.attrs?.height) ?? 240
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const origin = key ? build.runs.get(key) : undefined
  const drawing = origin?.content.find((item) => item.kind === "drawing")
  // Picture formatting made in the app (corrections, a frame, effects) is not in the source drawing: write it anew.
  if (origin && drawing?.kind === "drawing" && !hasPictureFormat(node.attrs ?? {})) {
    const media = build.media.find((item) => item.relId === drawing.relId)
    const sameSize =
      Math.round((drawing.cx ?? 0) / EMU_PER_PX) === width && Math.round((drawing.cy ?? 0) / EMU_PER_PX) === height
    if (
      media &&
      sameSize &&
      sameLayout(node, drawing.layout, drawing.cx, build.section, drawing.cy) &&
      rotationDegrees(drawing.rot) === (numberAttr(node.attrs?.rotate) ?? 0) &&
      sameCrop(node.attrs ?? {}, drawing.crop) &&
      src === `data:${media.contentType || "image/png"};base64,${encodeBase64(media.data)}`
    ) {
      return structuredClone(origin)
    }
  }
  const decoded = decodeDataUrl(src)
  if (!decoded) {
    return null
  }
  const relId = `rId${20 + build.media.length}`
  const cx = Math.round(width * EMU_PER_PX)
  const cy = Math.round(height * EMU_PER_PX)
  const fileExtension = decoded.type === "jpg" ? "jpg" : decoded.type
  // The next free picture number: Word's own may skip some (image1 gone, image2 kept).
  const taken = (number: number) => {
    const name = `/word/media/image${number}.${fileExtension}`.toLowerCase()
    return build.usedParts?.has(name) || build.media.some((item) => item.name.toLowerCase() === name)
  }
  while (taken(build.picture)) {
    build.picture += 1
  }
  const id = build.picture
  build.picture += 1
  build.media.push({
    relId,
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
    target: `media/image${id}.${fileExtension}`,
    name: `/word/media/image${id}.${fileExtension}`,
    contentType: decoded.type === "jpg" ? "image/jpeg" : `image/${decoded.type}`,
    data: decoded.data,
  })
  return {
    kind: "run",
    rPr: { noProof: true },
    content: [
      {
        kind: "drawing",
        xml: drawingXml(
          id,
          relId,
          cx,
          cy,
          editorLayout(node),
          rotationRot(numberAttr(node.attrs?.rotate) ?? 0),
          build.section,
          typeof node.attrs?.objectNode === "string" && node.attrs.objectNode ? node.attrs.objectNode : undefined,
          undefined,
          pictureDrawingFormat(node.attrs ?? {}),
        ),
        text: "",
        floating: editorLayout(node) !== null,
        relId,
        name: `Picture ${id}`,
        cx,
        cy,
      },
    ],
  }
}

/** The `.glb` of the 3-D model drawing a picture node was opened from, from the parts kept whole. */
function modelPart(node: JsonNode, build: InlineBuild) {
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const drawing = key ? build.runs.get(key)?.content.find((item) => item.kind === "drawing") : undefined
  if (drawing?.kind !== "drawing") {
    return null
  }
  const group = build.preserved?.relationships.find((item) => item.source === "/word/document.xml")
  const relId = modelRelId(drawing.xml)
  const partName = group?.items.find((item) => item.id === relId)?.partName
  return (partName ? build.preserved?.parts.find((item) => item.name === partName)?.data : undefined) ?? null
}

/** A 3-D model not turned since Word's file goes back as Word's own drawing and model part. */
function modelRun(node: JsonNode, figure: JsonNode, build: InlineBuild): Run | null {
  const attrs = figure.attrs ?? {}
  if (`${attrs.yaw},${attrs.pitch}` !== attrs.wordModel) {
    return null
  }
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const origin = key ? build.runs.get(key) : undefined
  const drawing = origin?.content.find((item) => item.kind === "drawing")
  if (!origin || drawing?.kind !== "drawing") {
    return null
  }
  const width = numberAttr(node.attrs?.width) ?? 0
  const height = numberAttr(node.attrs?.height) ?? 0
  const sameSize =
    Math.round((drawing.cx ?? 0) / EMU_PER_PX) === width && Math.round((drawing.cy ?? 0) / EMU_PER_PX) === height
  if (
    sameSize &&
    sameLayout(node, drawing.layout, drawing.cx, build.section, drawing.cy) &&
    rotationDegrees(drawing.rot) === (numberAttr(node.attrs?.rotate) ?? 0)
  ) {
    return structuredClone(origin)
  }
  return null
}

/** A SmartArt graphic shown as a picture goes back as Word's own drawing while it keeps its size and place. */
function diagramRun(node: JsonNode, build: InlineBuild): Run | null {
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const origin = key ? build.runs.get(key) : undefined
  const drawing = origin?.content.find((item) => item.kind === "drawing")
  if (!origin || drawing?.kind !== "drawing" || !drawing.xml.includes("drawingml/2006/diagram")) {
    return null
  }
  const width = numberAttr(node.attrs?.width) ?? 0
  const height = numberAttr(node.attrs?.height) ?? 0
  const sameSize =
    Math.round((drawing.cx ?? 0) / EMU_PER_PX) === width && Math.round((drawing.cy ?? 0) / EMU_PER_PX) === height
  if (
    sameSize &&
    sameLayout(node, drawing.layout, drawing.cx, build.section, drawing.cy) &&
    rotationDegrees(drawing.rot) === (numberAttr(node.attrs?.rotate) ?? 0)
  ) {
    return structuredClone(origin)
  }
  return null
}

/** A shape opened from Word and not formatted since goes back as Word's own drawing, in its place and size. */
function wordShapeRun(node: JsonNode, figure: JsonNode, build: InlineBuild): Run | null {
  const attrs = figure.attrs ?? {}
  const now = shapeLook(attrs)
  const marked = typeof attrs.wordShape === "string" ? attrs.wordShape : ""
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const origin = key ? build.runs.get(key) : undefined
  const drawing = origin?.content.find((item) => item.kind === "drawing")
  if (!origin || drawing?.kind !== "drawing" || !marked || unmarked(marked) !== unmarked(now)) {
    return null
  }
  const width = numberAttr(node.attrs?.width) ?? 0
  const height = numberAttr(node.attrs?.height) ?? 0
  const sameSize =
    Math.round((drawing.cx ?? 0) / EMU_PER_PX) === width && Math.round((drawing.cy ?? 0) / EMU_PER_PX) === height
  if (
    sameSize &&
    sameLayout(node, drawing.layout, drawing.cx, build.section, drawing.cy) &&
    rotationDegrees(drawing.rot) === (numberAttr(node.attrs?.rotate) ?? 0)
  ) {
    return structuredClone(origin)
  }
  return null
}

/** A shape from the app, written as Word's own shape when Word draws it the same way (see `wordShapeGraphic`). */
function nativeShapeRun(node: JsonNode, figure: JsonNode, build: InlineBuild): Run | null {
  const attrs: Record<string, unknown> = figure.attrs ?? {}
  const width = numberAttr(node.attrs?.width) ?? 0
  const height = numberAttr(node.attrs?.height) ?? 0
  if (width <= 0 || height <= 0) {
    return null
  }
  const cx = Math.round(width * EMU_PER_PX)
  const cy = Math.round(height * EMU_PER_PX)
  const rot = rotationRot(numberAttr(node.attrs?.rotate) ?? 0)
  const graphic = wordShapeGraphic(attrs, cx, cy, rot)
  if (!graphic) {
    return null
  }
  const id = build.picture
  build.picture += 1
  const alt = typeof attrs.alt === "string" ? attrs.alt : ""
  const name = alt || `Shape ${id}`
  const layout = editorLayout(node)
  return {
    kind: "run",
    rPr: {},
    content: [
      {
        kind: "drawing",
        xml: drawingXml(id, "", cx, cy, layout, 0, build.section, undefined, { graphic, name }),
        text: "",
        floating: layout !== null,
        name,
        cx,
        cy,
      },
    ],
  }
}

/** The mark's values with the editor's "transparent" standing for Word's "none". */
function unmarked(value: string) {
  return value.replace(/"none"/g, '"transparent"')
}

/** A part name for a new chart's part that no part already in the package has. */
function freePartName(build: InlineBuild, make: (index: number) => string) {
  let index = 1
  const taken = (name: string) =>
    build.usedParts?.has(name.toLowerCase()) ||
    build.media.some((item) => item.name.toLowerCase() === name.toLowerCase())
  while (taken(make(index))) {
    index += 1
  }
  build.usedParts?.add(make(index).toLowerCase())
  return make(index)
}

/**
 * A chart saved as Word's chart (20.8): a drawing pointing at a chart part with the cached data, which points at
 * a workbook with the sheet. A chart opened from Word and not changed keeps Word's own drawing and parts.
 */
function chartRun(node: JsonNode, figure: JsonNode, object: string, build: InlineBuild): Run | null {
  const attrs = figure.attrs ?? {}
  const width = numberAttr(node.attrs?.width) ?? 576
  const height = numberAttr(node.attrs?.height) ?? 336
  const key = typeof node.attrs?.docxKey === "string" ? node.attrs.docxKey : undefined
  const origin = key ? build.runs.get(key) : undefined
  const drawing = origin?.content.find((item) => item.kind === "drawing")
  if (
    origin &&
    drawing?.kind === "drawing" &&
    chartRelId(drawing.xml) &&
    attrs.wordChart &&
    attrs.wordChart === attrs.chart
  ) {
    const sameSize =
      Math.round((drawing.cx ?? 0) / EMU_PER_PX) === width && Math.round((drawing.cy ?? 0) / EMU_PER_PX) === height
    if (
      sameSize &&
      sameLayout(node, drawing.layout, drawing.cx, build.section, drawing.cy) &&
      rotationDegrees(drawing.rot) === (numberAttr(node.attrs?.rotate) ?? 0)
    ) {
      return structuredClone(origin)
    }
  }
  const spec = chartSpecOf(attrs)
  const relId = `rId${20 + build.media.length}`
  const id = build.picture
  build.picture += 1
  const chartName = freePartName(build, (index) => `/word/charts/chart${index}.xml`)
  const workbookName = freePartName(build, (index) => `/word/embeddings/Microsoft_Excel_Worksheet${index}.xlsx`)
  build.media.push({
    relId,
    type: CHART_RELATIONSHIP,
    target: chartName.slice("/word/".length),
    name: chartName,
    contentType: CHART_CONTENT_TYPE,
    data: new TextEncoder().encode(chartSpaceXml(spec, "rId1")),
    related: [
      {
        relId: "rId1",
        type: PACKAGE_RELATIONSHIP,
        target: `../embeddings/${workbookName.split("/").pop()}`,
        name: workbookName,
        contentType: WORKBOOK_CONTENT_TYPE,
        data: chartWorkbook(spec),
      },
    ],
  })
  const cx = Math.round(width * EMU_PER_PX)
  const cy = Math.round(height * EMU_PER_PX)
  const graphic =
    `<a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${relId}"/></a:graphicData>`
  const name = typeof attrs.alt === "string" && attrs.alt ? attrs.alt : `Chart ${id}`
  return {
    kind: "run",
    rPr: { noProof: true },
    content: [
      {
        kind: "drawing",
        xml: drawingXml(
          id,
          relId,
          cx,
          cy,
          editorLayout(node),
          rotationRot(numberAttr(node.attrs?.rotate) ?? 0),
          build.section,
          object,
          { graphic, name },
        ),
        text: "",
        floating: editorLayout(node) !== null,
        name,
        cx,
        cy,
      },
    ],
  }
}

/** The editor's floating picture: its wrap and place, or null for a picture in line with the text. */
function editorLayout(node: JsonNode) {
  const attrs = node.attrs ?? {}
  const wrap = typeof attrs.wrap === "string" ? attrs.wrap : "inline"
  if (wrap === "inline" || !["square", "tight", "through", "topBottom", "behind", "front"].includes(wrap)) {
    return null
  }
  const move = attrs.anchoring === "move"
  const layout: FloatingLayout = {
    wrap: wrap as FloatingLayout["wrap"],
    x: Math.round(numberAttr(attrs.x) ?? 0),
    dy: Math.round(move ? (numberAttr(attrs.dy) ?? 0) : (numberAttr(attrs.y) ?? 0)),
    relative: move && attrs.relative !== "margin" ? "paragraph" : "margin",
    z: Math.max(1, Math.round(numberAttr(attrs.z) ?? 1)),
  }
  const side = attrs.wrapSide
  if (side === "left" || side === "right" || side === "largest" || side === "both") {
    layout.side = side
  }
  const dist = [attrs.distT, attrs.distB, attrs.distL, attrs.distR].map((value) => numberAttr(value))
  if (dist.some((value) => value !== undefined)) {
    const fallback = layout.wrap === "square" ? 12 : layout.wrap === "tight" || layout.wrap === "through" ? 6 : 0
    layout.dist = { t: dist[0] ?? 0, b: dist[1] ?? 0, l: dist[2] ?? fallback, r: dist[3] ?? fallback }
  }
  if (attrs.allowOverlap === false) {
    layout.allowOverlap = false
  }
  if (attrs.lockAnchor === true) {
    layout.locked = true
  }
  if (typeof attrs.alignH === "string" && attrs.alignH) {
    layout.alignH = attrs.alignH
  }
  if (typeof attrs.alignV === "string" && attrs.alignV) {
    layout.alignV = attrs.alignV
  }
  if (attrs.fromH === "page") {
    layout.fromH = "page"
  }
  return layout
}

/** Whether the picture still has the wrap, place and wrapping options it was opened with. */
function sameLayout(
  node: JsonNode,
  layout: DrawingLayout | undefined,
  cx: number | undefined,
  section?: SectionProps | null,
  cy?: number,
) {
  const now = editorLayout(node)
  if (!layout || !now) {
    return !layout && !now
  }
  const was = floatingLayout(layout, cx, section, cy)
  const near = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) <= 1
  const sameDist =
    !now.dist ||
    (near(now.dist.t, was.dist?.t) &&
      near(now.dist.b, was.dist?.b) &&
      near(now.dist.l, was.dist?.l) &&
      near(now.dist.r, was.dist?.r))
  return (
    now.wrap === was.wrap &&
    now.relative === was.relative &&
    near(now.x, was.x) &&
    near(now.dy, was.dy) &&
    (now.side ?? "both") === (was.side ?? "both") &&
    sameDist &&
    (now.allowOverlap ?? true) === (was.allowOverlap ?? true) &&
    (now.locked ?? false) === (was.locked ?? false) &&
    (now.alignH ?? "") === (was.alignH ?? "") &&
    (now.alignV ?? "") === (was.alignV ?? "")
  )
}

function wrapXml(layout: FloatingLayout) {
  const sides = SIDE_TO_WORD[layout.side ?? "both"]
  switch (layout.wrap) {
    case "square":
      return `<wp:wrapSquare wrapText="${sides}"/>`
    case "tight":
      return `<wp:wrapTight wrapText="${sides}">${wrapPolygon()}</wp:wrapTight>`
    case "through":
      return `<wp:wrapThrough wrapText="${sides}">${wrapPolygon()}</wp:wrapThrough>`
    case "topBottom":
      return `<wp:wrapTopAndBottom/>`
    default:
      return `<wp:wrapNone/>`
  }
}

/** The picture's own rectangle, which Word wants as the outline Tight and Through wrap around. */
function wrapPolygon() {
  return (
    `<wp:wrapPolygon edited="0"><wp:start x="0" y="0"/><wp:lineTo x="0" y="21600"/>` +
    `<wp:lineTo x="21600" y="21600"/><wp:lineTo x="21600" y="0"/><wp:lineTo x="0" y="0"/></wp:wrapPolygon>`
  )
}

/** wp:anchor's opening, position and wrap for a floating picture, in the order the schema wants them. */
function anchorOpen(layout: FloatingLayout, cx: number, cy: number, section?: SectionProps | null) {
  const gap = layout.wrap === "square" ? 12 : layout.wrap === "tight" || layout.wrap === "through" ? 6 : 0
  const dist = layout.dist ?? { t: 0, b: 0, l: gap, r: gap }
  const emu = (px: number) => Math.round(px * EMU_PER_PX)
  const width = cx / EMU_PER_PX
  const height = cy / EMU_PER_PX
  const onPage = layout.fromH === "page"
  // An alignment goes back while the object is still where it puts it; otherwise the offset.
  const alignH =
    layout.alignH && Math.abs(alignedX(layout.alignH, onPage, width, section) - layout.x) <= 1 ? layout.alignH : ""
  const alignV =
    layout.alignV && layout.relative === "margin" && Math.abs(alignedY(layout.alignV, height, section) - layout.dy) <= 1
      ? layout.alignV
      : ""
  const offsetX = onPage ? layout.x + pageBox(section).marginLeft : layout.x
  const positionH = alignH
    ? `<wp:align>${alignH}</wp:align>`
    : `<wp:posOffset>${Math.round(offsetX * EMU_PER_PX)}</wp:posOffset>`
  const positionV = alignV
    ? `<wp:align>${alignV}</wp:align>`
    : `<wp:posOffset>${Math.round(layout.dy * EMU_PER_PX)}</wp:posOffset>`
  return (
    `<wp:anchor distT="${emu(dist.t)}" distB="${emu(dist.b)}" distL="${emu(dist.l)}" distR="${emu(dist.r)}" ` +
    `simplePos="0" relativeHeight="${layout.z}" behindDoc="${layout.wrap === "behind" ? 1 : 0}" ` +
    `locked="${layout.locked ? 1 : 0}" layoutInCell="1" allowOverlap="${layout.allowOverlap === false ? 0 : 1}">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="${onPage ? "page" : "margin"}">${positionH}</wp:positionH>` +
    `<wp:positionV relativeFrom="${layout.relative}">${positionV}</wp:positionV>` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    wrapXml(layout)
  )
}

export type PictureDrawingFormat = { blip: string; srcRect: string; geometry: string; line: string; effects: string }

/** The crop as `a:srcRect` writes it: each side in 1000ths of a percent. */
function cropRect(attrs: Record<string, unknown>) {
  const side = (key: string) => Math.round(Math.max(0, Math.min(95, Number(attrs[key]) || 0)) * 1000)
  return { l: side("cropL"), t: side("cropT"), r: side("cropR"), b: side("cropB") }
}

/** True when the picture is cropped as the source drawing was (or neither is). */
function sameCrop(attrs: Record<string, unknown>, source?: { l: number; t: number; r: number; b: number }) {
  const now = cropRect(attrs)
  const before = source ?? { l: 0, t: 0, r: 0, b: 0 }
  return (["l", "t", "r", "b"] as const).every((side) => Math.abs(now[side] - before[side]) < 50)
}

const EMU_PER_PT = 12700

/**
 * A picture's formatting as DrawingML: brightness and contrast (`a:lum`), recolours, transparency
 * (`a:alphaModFix`), the frame's shape and border (`a:ln`), and shadow, glow, soft edges and reflection
 * (`a:effectLst`). Saturation and the artistic effects have no counterpart Word reads, so they stay in the app.
 */
export function pictureDrawingFormat(attrs: Record<string, unknown>): PictureDrawingFormat {
  const blip: string[] = []
  const brightness = Number(attrs.brightness) || 0
  const contrast = Number(attrs.contrast) || 0
  const recolor = String(attrs.recolor || "")
  if (recolor === "washout") {
    blip.push('<a:lum bright="70000" contrast="-70000"/>')
  } else if (brightness || contrast) {
    blip.push(`<a:lum bright="${Math.round(brightness * 1000)}" contrast="${Math.round(contrast * 1000)}"/>`)
  }
  if (recolor === "grayscale") {
    blip.push("<a:grayscl/>")
  } else if (recolor === "black-white") {
    blip.push('<a:biLevel thresh="50000"/>')
  }
  const transparency = Math.max(0, Math.min(100, Number(attrs.transparency) || 0))
  if (transparency) {
    blip.push(`<a:alphaModFix amt="${Math.round((100 - transparency) * 1000)}"/>`)
  }
  const frame = String(attrs.frame || "")
  const geometry = frame === "oval" ? "ellipse" : frame === "rounded" ? "roundRect" : "rect"
  const border = /^#[0-9a-f]{6}$/i.test(String(attrs.border || "")) ? String(attrs.border).slice(1) : ""
  const dash = String(attrs.borderDash || "")
  const width = Number(attrs.borderWidth) > 0 ? Number(attrs.borderWidth) : 1.5
  const line = border
    ? `<a:ln w="${Math.round(width * EMU_PER_PT)}"><a:solidFill><a:srgbClr val="${border}"/></a:solidFill>` +
      `${dash === "dot" ? '<a:prstDash val="sysDot"/>' : dash === "dash" ? '<a:prstDash val="dash"/>' : ""}</a:ln>`
    : ""
  const effects: string[] = []
  const shadow = String(attrs.shadow || "") || (attrs.effect === "shadow" ? "outer-br" : "")
  if (shadow) {
    effects.push(
      '<a:outerShdw blurRad="50800" dist="38100" dir="2700000" algn="tl" rotWithShape="0">' +
        '<a:prstClr val="black"><a:alpha val="40000"/></a:prstClr></a:outerShdw>',
    )
  }
  const [glowColor, glowSize] = String(attrs.glow || "").split(":")
  if (glowColor && /^#[0-9a-f]{6}$/i.test(glowColor)) {
    effects.push(
      `<a:glow rad="${Math.round((Number(glowSize) || 8) * EMU_PER_PT)}"><a:srgbClr val="${glowColor.slice(1)}">` +
        '<a:alpha val="40000"/></a:srgbClr></a:glow>',
    )
  }
  const soft = Number(attrs.softEdge) || 0
  if (soft) {
    effects.push(`<a:softEdge rad="${Math.round(soft * EMU_PER_PT)}"/>`)
  }
  if (attrs.reflection) {
    effects.push(
      '<a:reflection blurRad="6350" stA="52000" endA="300" endPos="35000" dir="5400000" sy="-100000" algn="bl" rotWithShape="0"/>',
    )
  }
  const crop = cropRect(attrs)
  const srcRect =
    crop.l || crop.t || crop.r || crop.b
      ? `<a:srcRect${(["l", "t", "r", "b"] as const).map((side) => (crop[side] ? ` ${side}="${crop[side]}"` : "")).join("")}/>`
      : ""
  return {
    blip: blip.join(""),
    srcRect,
    geometry,
    line,
    effects: effects.length ? `<a:effectLst>${effects.join("")}</a:effectLst>` : "",
  }
}

function drawingXml(
  id: number,
  relId: string,
  cx: number,
  cy: number,
  layout: FloatingLayout | null = null,
  rot = 0,
  section?: SectionProps | null,
  object?: string,
  /** A graphic other than a picture (a chart), and its name. */
  other?: { graphic: string; name: string },
  /** The picture's own formatting (21.2): what goes in its `a:blip` and `pic:spPr`. */
  format?: PictureDrawingFormat,
) {
  // The app's own object (a shape, chart, 3D model…) rides along with its picture, to open as itself again.
  const name = other ? escapeHtml(other.name) : object ? `Object ${id}` : `Picture ${id}`
  const docPr = object
    ? `<wp:docPr id="${id}" name="${name}"><a:extLst><a:ext uri="{6F1C2B7E-3A55-4E0B-9C1D-2B7A9E5F4C11}">` +
      `<ink:object xmlns:ink="${INKSPIRE_OBJECT_NS}" data="${object}"/></a:ext></a:extLst></wp:docPr>`
    : `<wp:docPr id="${id}" name="${name}"/>`
  const open = layout
    ? anchorOpen(layout, cx, cy, section)
    : `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
      `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
  return (
    `<w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    open +
    docPr +
    `<wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    (other?.graphic ??
      `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
        `<pic:nvPicPr><pic:cNvPr id="${id}" name=""/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill>${format?.blip ? `<a:blip r:embed="${relId}">${format.blip}</a:blip>` : `<a:blip r:embed="${relId}"/>`}${format?.srcRect ?? ""}<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm${rot ? ` rot="${rot}"` : ""}><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
        `<a:prstGeom prst="${format?.geometry ?? "rect"}"><a:avLst/></a:prstGeom>${format?.line ?? ""}${format?.effects ?? ""}</pic:spPr></pic:pic>` +
        `</a:graphicData>`) +
    `</a:graphic></wp:${layout ? "anchor" : "inline"}></w:drawing>`
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Comments on save
// ---------------------------------------------------------------------------------------------------------------

/** Numeric Word ids for the comments and replies found in the editor. */
export type CommentIds = { main: Map<string, number>; replies: Map<string, number[]> }

/**
 * comments.xml for the comments in the editor. Unchanged comments keep the source part as it was; otherwise the
 * part is rebuilt, reusing a source comment's formatted text while its plain text still matches.
 */
export function commentsFromEditor(
  found: Map<string, EditorComment>,
  source: CommentPart | undefined,
): { part: CommentPart | undefined; ids: CommentIds } {
  const ids: CommentIds = { main: new Map(), replies: new Map() }
  if (found.size === 0) {
    return { part: undefined, ids }
  }
  const sourceViews = commentViews(source).views
  const unchanged =
    source !== undefined &&
    sourceViews.size === found.size &&
    [...found].every(([id, view]) => {
      const before = sourceViews.get(Number(id))
      return /^\d+$/.test(id) && before !== undefined && sameComment(before, view)
    })
  if (unchanged && source) {
    for (const [id, view] of found) {
      ids.main.set(id, Number(id))
      ids.replies.set(
        id,
        view.replies.map((reply) => Number(reply.id)),
      )
    }
    return { part: source, ids }
  }
  const sourceItems = new Map((source?.items ?? []).map((item) => [item.id, item]))
  const used = new Set<number>()
  const usedParaIds = new Set<string>()
  let nextId = 0
  let nextParaId = 0x10000000
  const takeId = (wanted: string) => {
    const number = /^\d+$/.test(wanted) ? Number(wanted) : NaN
    if (Number.isFinite(number) && !used.has(number)) {
      used.add(number)
      return number
    }
    while (used.has(nextId) || [...found.keys()].includes(String(nextId))) {
      nextId += 1
    }
    used.add(nextId)
    return nextId
  }
  const takeParaId = (wanted: string | undefined) => {
    if (wanted && !usedParaIds.has(wanted)) {
      usedParaIds.add(wanted)
      return wanted
    }
    let id = nextParaId.toString(16).toUpperCase().padStart(8, "0")
    while (usedParaIds.has(id)) {
      nextParaId += 1
      id = nextParaId.toString(16).toUpperCase().padStart(8, "0")
    }
    nextParaId += 1
    usedParaIds.add(id)
    return id
  }
  const items: Comment[] = []
  const extended: CommentEx[] = []
  const add = (wanted: string, author: string, text: string, created: string) => {
    const id = takeId(wanted)
    const original = sourceItems.get(id)
    const keep = original && /^\d+$/.test(wanted) && commentText(original) === text
    const blocks: Block[] = keep ? structuredClone(original.blocks) : commentBlocks(text)
    const paragraphs = paragraphsIn(blocks)
    const last = paragraphs[paragraphs.length - 1]!
    last.paraId = takeParaId(keep ? last.paraId : undefined)
    items.push({
      id,
      ...(author ? { author } : {}),
      ...(created ? { date: created } : {}),
      ...(original?.initials ? { initials: original.initials } : author ? { initials: initialsOf(author) } : {}),
      blocks,
    })
    return { id, paraId: last.paraId }
  }
  for (const [editorId, view] of found) {
    const main = add(editorId, view.author, view.text, view.created)
    ids.main.set(editorId, main.id)
    extended.push({ paraId: main.paraId, ...(view.resolved ? { done: true } : {}) })
    const replyIds: number[] = []
    for (const reply of view.replies) {
      const added = add(reply.id, reply.author, reply.text, reply.created)
      replyIds.push(added.id)
      extended.push({ paraId: added.paraId, parentParaId: main.paraId, ...(view.resolved ? { done: true } : {}) })
    }
    ids.replies.set(editorId, replyIds)
  }
  const part: CommentPart = {
    ...(source?.relId ? { relId: source.relId } : {}),
    ...(source?.rootAttributes ? { rootAttributes: source.rootAttributes } : {}),
    items,
    extended,
    ...(source?.extendedRelId ? { extendedRelId: source.extendedRelId } : {}),
    ...(source?.extendedRoot ? { extendedRoot: source.extendedRoot } : {}),
  }
  return { part, ids }
}

function sameComment(before: CommentView, after: EditorComment) {
  return (
    before.author === after.author &&
    before.text === after.text &&
    before.resolved === after.resolved &&
    before.replies.length === after.replies.length &&
    before.replies.every((reply, index) => {
      const other = after.replies[index]
      return other?.id === reply.id && other.text === reply.text && other.author === reply.author
    })
  )
}

function commentBlocks(text: string): Block[] {
  return text.split("\n").map((line) => ({
    kind: "paragraph" as const,
    pPr: {},
    markRPr: {},
    inlines: line ? [{ kind: "run" as const, rPr: {}, content: [{ kind: "text" as const, text: line }] }] : [],
  }))
}

function initialsOf(author: string) {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3)
}

/**
 * Puts commentRangeStart before the first tagged inline of each comment and commentRangeEnd plus the reference
 * run after the last one. Replies get their own markers at the same places, as Word writes them.
 */
export function placeCommentRanges(
  blocks: Block[],
  tags: Map<Inline, string[]>,
  ids: CommentIds,
  referenceProps: RunProperties = {},
) {
  const first = new Map<string, { paragraph: Paragraph; index: number }>()
  const last = new Map<string, { paragraph: Paragraph; index: number }>()
  for (const paragraph of paragraphsIn(blocks)) {
    paragraph.inlines.forEach((inline, index) => {
      for (const id of taggedIds(inline, tags)) {
        if (!first.has(id)) {
          first.set(id, { paragraph, index })
        }
        last.set(id, { paragraph, index })
      }
    })
  }
  const before = new Map<Paragraph, Map<number, Inline[]>>()
  const after = new Map<Paragraph, Map<number, Inline[]>>()
  const queue = (
    table: Map<Paragraph, Map<number, Inline[]>>,
    at: { paragraph: Paragraph; index: number },
    items: Inline[],
  ) => {
    const byIndex = table.get(at.paragraph) ?? new Map<number, Inline[]>()
    byIndex.set(at.index, [...(byIndex.get(at.index) ?? []), ...items])
    table.set(at.paragraph, byIndex)
  }
  for (const [editorId, start] of first) {
    const main = ids.main.get(editorId)
    const end = last.get(editorId)
    if (main === undefined || !end) {
      continue
    }
    const all = [main, ...(ids.replies.get(editorId) ?? [])]
    queue(
      before,
      start,
      all.map((id) => ({ kind: "commentRangeStart" as const, id })),
    )
    queue(
      after,
      end,
      all.flatMap((id) => [
        { kind: "commentRangeEnd" as const, id },
        { kind: "run" as const, rPr: { ...referenceProps }, content: [{ kind: "commentReference" as const, id }] },
      ]),
    )
  }
  for (const paragraph of new Set([...before.keys(), ...after.keys()])) {
    const starts = before.get(paragraph)
    const ends = after.get(paragraph)
    paragraph.inlines = paragraph.inlines.flatMap((inline, index) => [
      ...(starts?.get(index) ?? []),
      inline,
      ...(ends?.get(index) ?? []),
    ])
  }
}

function taggedIds(inline: Inline, tags: Map<Inline, string[]>): string[] {
  const own = tags.get(inline) ?? []
  if (inline.kind === "hyperlink" || inline.kind === "ins" || inline.kind === "del") {
    return [...new Set([...own, ...inline.inlines.flatMap((child) => taggedIds(child, tags))])]
  }
  return own
}

// ---------------------------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------------------------

export function numberAttr(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : NaN
  return Number.isFinite(number) ? number : undefined
}

function fontPoints(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== "string") {
    return undefined
  }
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return undefined
  }
  return value.includes("px") ? (number * 72) / 96 : number
}

function fontName(value: unknown) {
  if (typeof value !== "string") {
    return undefined
  }
  const name = value.split(",")[0]?.replace(/['"]/g, "").trim()
  return name || undefined
}

function colorHex(value: unknown) {
  if (typeof value !== "string") {
    return undefined
  }
  const match = value.trim().match(/^#?([0-9a-fA-F]{6})$/)
  return match ? match[1]!.toUpperCase() : undefined
}

function decodeDataUrl(src: string) {
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src.trim())
  if (!match?.[1] || !match[2]) {
    return null
  }
  const binary = atob(match[2])
  const data = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    data[index] = binary.charCodeAt(index)
  }
  const kind = match[1].toLowerCase()
  const type = kind === "jpeg" || kind === "jpg" ? "jpg" : kind === "gif" ? "gif" : kind === "bmp" ? "bmp" : "png"
  return { data, type }
}

export function encodeBase64(data: Uint8Array) {
  const native = (data as Uint8Array & { toBase64?: () => string }).toBase64
  if (typeof native === "function") {
    return native.call(data)
  }
  // Each piece is a whole number of 3-byte groups, so the pieces join into one valid string; joining the encoded
  // pieces is several times faster than building the whole binary string first.
  const pieces: string[] = []
  for (let index = 0; index < data.length; index += 0x7ffe) {
    pieces.push(btoa(String.fromCharCode.apply(null, data.subarray(index, index + 0x7ffe) as unknown as number[])))
  }
  return pieces.join("")
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
