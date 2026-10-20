import type { ChromeShape } from "@/document/header"
import { encodeBase64 } from "@/document/docx/inlines"
import {
  DEFAULT_SECTION,
  paragraphsIn,
  type HeaderFooterRef,
  type Inline,
  type RunContent,
  type SectionProps,
} from "@/document/docx/model"

const EMU_PER_PX = 9525
const TWIPS_PER_PX = 15
/** Height the page gives one header or footer paragraph when placing pictures relative to it. */
const LINE_PX = 19

type Drawing = Extract<RunContent, { kind: "drawing" }>
type Axis = { from: string; offset?: number; align?: string }

/**
 * Pictures in a header or footer, placed on the page the way Word places them. Floating pictures use their
 * anchor position; inline ones sit at the start of their paragraph. Positions are CSS pixels from the page's
 * top-left corner.
 */
export function storyShapes(story: HeaderFooterRef | undefined, section: SectionProps | null): ChromeShape[] {
  if (!story) {
    return []
  }
  const page = pageBox(section)
  const shapes: ChromeShape[] = []
  const paragraphs = paragraphsIn(story.blocks)
  paragraphs.forEach((paragraph, index) => {
    for (const drawing of drawingsIn(paragraph.inlines)) {
      const src = pictureSource(story, drawing.relId)
      if (!src || !drawing.cx || !drawing.cy) {
        continue
      }
      const width = drawing.cx / EMU_PER_PX
      const height = drawing.cy / EMU_PER_PX
      // The paragraph's top edge: headers grow down from the header distance, footers grow up from the footer one.
      const paragraphTop =
        story.kind === "header"
          ? page.header + index * LINE_PX
          : page.height - page.footer - (paragraphs.length - index) * LINE_PX
      const position = drawing.floating ? anchorPosition(drawing.xml) : undefined
      const x = position ? horizontal(position.x, width, page) : page.marginLeft
      const y = position
        ? vertical(position.y, height, page, paragraphTop)
        : story.kind === "header"
          ? paragraphTop
          : paragraphTop + LINE_PX - height
      shapes.push({
        src,
        width,
        height,
        x,
        y,
        ...(position?.behind ? { behind: true } : {}),
        ...(drawing.name ? { alt: drawing.name } : {}),
      })
    }
  })
  return shapes
}

function pageBox(section: SectionProps | null) {
  const value = (key: keyof SectionProps) => Number(section?.[key] ?? DEFAULT_SECTION[key] ?? 0) / TWIPS_PER_PX
  return {
    width: value("pageWidth"),
    height: value("pageHeight"),
    marginTop: value("marginTop"),
    marginRight: value("marginRight"),
    marginBottom: value("marginBottom"),
    marginLeft: value("marginLeft"),
    header: value("header"),
    footer: value("footer"),
  }
}

function drawingsIn(inlines: Inline[]): Drawing[] {
  const drawings: Drawing[] = []
  for (const inline of inlines) {
    if (inline.kind === "run") {
      drawings.push(...inline.content.filter((item): item is Drawing => item.kind === "drawing"))
    } else if ("inlines" in inline) {
      drawings.push(...drawingsIn(inline.inlines))
    }
  }
  return drawings
}

/** A data URL for the picture a story's relationship points at. */
function pictureSource(story: HeaderFooterRef, relId: string | undefined) {
  const relationship = story.links?.relationships.find((item) => item.id === relId)
  const part = story.links?.parts.find((item) => item.name === relationship?.partName)
  if (!part || !part.contentType.startsWith("image/")) {
    return undefined
  }
  return `data:${part.contentType};base64,${encodeBase64(part.data)}`
}

function anchorPosition(xml: string) {
  const axis = (name: "positionH" | "positionV"): Axis | undefined => {
    const match = new RegExp(
      `<(?:\\w+:)?${name}\\b[^>]*relativeFrom="([^"]+)"[^>]*>([\\s\\S]*?)</(?:\\w+:)?${name}>`,
    ).exec(xml)
    if (!match) {
      return undefined
    }
    const offset = /<(?:\w+:)?posOffset>(-?\d+)</.exec(match[2]!)?.[1]
    const align = /<(?:\w+:)?align>(\w+)</.exec(match[2]!)?.[1]
    return {
      from: match[1]!,
      ...(offset !== undefined ? { offset: Number(offset) / EMU_PER_PX } : {}),
      ...(align ? { align } : {}),
    }
  }
  const x = axis("positionH")
  const y = axis("positionV")
  if (!x || !y) {
    return undefined
  }
  return { x, y, behind: /\bbehindDoc="(?:1|true)"/.test(xml) }
}

function place(axis: Axis, start: number, size: number, length: number) {
  if (axis.offset !== undefined) {
    return start + axis.offset
  }
  switch (axis.align) {
    case "center":
      return start + (size - length) / 2
    case "right":
    case "bottom":
    case "outside":
      return start + size - length
    default:
      return start
  }
}

function horizontal(axis: Axis, width: number, page: ReturnType<typeof pageBox>) {
  const text = page.width - page.marginLeft - page.marginRight
  switch (axis.from) {
    case "page":
      return place(axis, 0, page.width, width)
    case "leftMargin":
    case "insideMargin":
      return place(axis, 0, page.marginLeft, width)
    case "rightMargin":
    case "outsideMargin":
      return place(axis, page.width - page.marginRight, page.marginRight, width)
    default:
      // margin, column, character: the text area.
      return place(axis, page.marginLeft, text, width)
  }
}

function vertical(axis: Axis, height: number, page: ReturnType<typeof pageBox>, paragraphTop: number) {
  switch (axis.from) {
    case "page":
      return place(axis, 0, page.height, height)
    case "margin":
      return place(axis, page.marginTop, page.height - page.marginTop - page.marginBottom, height)
    case "topMargin":
    case "insideMargin":
      return place(axis, 0, page.marginTop, height)
    case "bottomMargin":
    case "outsideMargin":
      return place(axis, page.height - page.marginBottom, page.marginBottom, height)
    default:
      // paragraph, line.
      return place(axis, paragraphTop, LINE_PX, height)
  }
}
