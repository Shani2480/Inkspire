import { readZip } from "@/document/docx/zip"

/**
 * An OpenDocument text (.odt) as editor HTML, read here so it opens where pandoc does not run (Android). It keeps
 * what a document is made of: headings, paragraphs and their alignment, bold, italic, underline, strike-through,
 * colour and size, lists, tables, links, line breaks, tabs, runs of spaces and embedded pictures. Page layout,
 * fields and drawings beyond pictures are left out.
 */

const OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0"
const TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0"
const TABLE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0"
const STYLE = "urn:oasis:names:tc:opendocument:xmlns:style:1.0"
const FO = "urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
const DRAW = "urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
const XLINK = "http://www.w3.org/1999/xlink"

type Look = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  size?: string
  align?: string
  numbered?: boolean
}

type Styles = Map<string, { parent: string | null; look: Look }>

export async function odtToHtml(bytes: Uint8Array): Promise<string> {
  const entries = await readZip(bytes)
  const part = (name: string) => entries.find((entry) => entry.name === name)?.data
  const content = part("content.xml")
  if (!content) {
    throw new Error("This file is not an OpenDocument text: it has no content.xml.")
  }
  const decode = (data: Uint8Array) => new TextDecoder().decode(data)
  const parse = (data: Uint8Array) => new DOMParser().parseFromString(decode(data), "application/xml")
  const doc = parse(content)
  const styles: Styles = new Map()
  const stylesPart = part("styles.xml")
  if (stylesPart) {
    readStyles(parse(stylesPart), styles)
  }
  readStyles(doc, styles)
  const pictures = new Map(entries.map((entry) => [entry.name, entry.data]))
  const text = doc.getElementsByTagNameNS(OFFICE, "text")[0]
  if (!text) {
    return "<p></p>"
  }
  const html = blocks(text, { styles, pictures })
  return html || "<p></p>"
}

type Context = { styles: Styles; pictures: Map<string, Uint8Array> }

function readStyles(doc: Document, styles: Styles) {
  for (const element of [
    ...Array.from(doc.getElementsByTagNameNS(STYLE, "style")),
    ...Array.from(doc.getElementsByTagNameNS(TEXT, "list-style")),
  ]) {
    const name = element.getAttributeNS(STYLE, "name")
    if (!name) {
      continue
    }
    const look: Look = {}
    const textProps = element.getElementsByTagNameNS(STYLE, "text-properties")[0]
    if (textProps) {
      const weight = textProps.getAttributeNS(FO, "font-weight")
      if (weight) {
        look.bold = weight === "bold" || Number(weight) >= 600
      }
      const style = textProps.getAttributeNS(FO, "font-style")
      if (style) {
        look.italic = style === "italic" || style === "oblique"
      }
      const underline = textProps.getAttributeNS(STYLE, "text-underline-style")
      if (underline) {
        look.underline = underline !== "none"
      }
      const strike = textProps.getAttributeNS(STYLE, "text-line-through-style")
      if (strike) {
        look.strike = strike !== "none"
      }
      look.color = textProps.getAttributeNS(FO, "color") || undefined
      look.size = textProps.getAttributeNS(FO, "font-size") || undefined
    }
    const paragraphProps = element.getElementsByTagNameNS(STYLE, "paragraph-properties")[0]
    const align = paragraphProps?.getAttributeNS(FO, "text-align")
    if (align) {
      look.align = align === "start" ? "left" : align === "end" ? "right" : align
    }
    if (element.localName === "list-style") {
      const first = element.firstElementChild
      look.numbered = first?.localName === "list-level-style-number"
    }
    styles.set(name, { parent: element.getAttributeNS(STYLE, "parent-style-name"), look })
  }
}

/** A style's look with its parents' under it, nearest first. */
function lookOf(name: string | null, context: Context, depth = 0): Look {
  const style = name ? context.styles.get(name) : undefined
  if (!style || depth > 10) {
    return {}
  }
  const inherited = lookOf(style.parent, context, depth + 1)
  const own = Object.fromEntries(Object.entries(style.look).filter(([, value]) => value !== undefined))
  return { ...inherited, ...own }
}

function blocks(parent: Element, context: Context): string {
  let html = ""
  for (const child of Array.from(parent.children)) {
    html += block(child, context)
  }
  return html
}

function block(element: Element, context: Context): string {
  const name = element.localName
  if (element.namespaceURI === TEXT && (name === "p" || name === "h")) {
    const look = lookOf(element.getAttributeNS(TEXT, "style-name"), context)
    const align = look.align && look.align !== "left" ? ` style="text-align: ${escapeAttribute(look.align)}"` : ""
    const level = Math.min(6, Math.max(1, Number(element.getAttributeNS(TEXT, "outline-level")) || 1))
    const tag = name === "h" ? `h${level}` : "p"
    return `<${tag}${align}>${inlines(element, context, {})}</${tag}>`
  }
  if (element.namespaceURI === TEXT && name === "list") {
    const look = lookOf(element.getAttributeNS(TEXT, "style-name"), context)
    const tag = look.numbered ? "ol" : "ul"
    const items = Array.from(element.children)
      .filter((child) => child.localName === "list-item" || child.localName === "list-header")
      .map((item) => `<li>${blocks(item, context) || "<p></p>"}</li>`)
      .join("")
    return `<${tag}>${items}</${tag}>`
  }
  if (element.namespaceURI === TABLE && name === "table") {
    // Rows sit in the table, or in its header-rows and rows groups; a table inside a cell has its own.
    const rows = Array.from(element.getElementsByTagNameNS(TABLE, "table-row")).filter(
      (row) => nearestTable(row) === element,
    )
    const body = rows
      .map((row) => {
        const cells = Array.from(row.children)
          .filter((cell) => cell.localName === "table-cell")
          .map((cell) => {
            const span = Number(cell.getAttributeNS(TABLE, "number-columns-spanned")) || 1
            return `<td${span > 1 ? ` colspan="${span}"` : ""}>${blocks(cell, context) || "<p></p>"}</td>`
          })
          .join("")
        return `<tr>${cells}</tr>`
      })
      .join("")
    return `<table><tbody>${body}</tbody></table>`
  }
  if (element.namespaceURI === TEXT && name === "section") {
    return blocks(element, context)
  }
  if (element.namespaceURI === TEXT && (name === "table-of-content" || name === "index-body")) {
    const body = element.getElementsByTagNameNS(TEXT, "index-body")[0] ?? element
    return blocks(body, context)
  }
  return ""
}

function nearestTable(element: Element) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (node.namespaceURI === TABLE && node.localName === "table") {
      return node
    }
  }
  return null
}

function inlines(parent: Element, context: Context, outer: Look): string {
  let html = ""
  for (const node of Array.from(parent.childNodes)) {
    if (node.nodeType === 3) {
      html += wrap(escapeText((node.textContent ?? "").replace(/\s+/g, " ")), outer)
      continue
    }
    if (node.nodeType !== 1) {
      continue
    }
    const element = node as Element
    const name = element.localName
    if (element.namespaceURI === TEXT) {
      if (name === "span") {
        const look = { ...outer, ...lookOf(element.getAttributeNS(TEXT, "style-name"), context) }
        html += inlines(element, context, look)
      } else if (name === "s") {
        const count = Math.max(1, Number(element.getAttributeNS(TEXT, "c")) || 1)
        html += wrap("&nbsp;".repeat(count), outer)
      } else if (name === "tab") {
        html += "\t"
      } else if (name === "line-break") {
        html += "<br>"
      } else if (name === "a") {
        const href = element.getAttributeNS(XLINK, "href") ?? ""
        html += `<a href="${escapeAttribute(href)}">${inlines(element, context, outer)}</a>`
      } else if (name !== "note" && name !== "bookmark" && name !== "bookmark-start" && name !== "bookmark-end") {
        // Fields (page numbers, dates) show their last result.
        html += inlines(element, context, outer)
      }
    } else if (element.namespaceURI === DRAW && name === "frame") {
      html += picture(element, context)
    }
  }
  return html
}

function picture(frame: Element, context: Context) {
  const image = frame.getElementsByTagNameNS(DRAW, "image")[0]
  const href = image?.getAttributeNS(XLINK, "href") ?? ""
  const data = context.pictures.get(href.replace(/^\.\//, ""))
  if (!data) {
    return ""
  }
  const type = /\.png$/i.test(href)
    ? "image/png"
    : /\.gif$/i.test(href)
      ? "image/gif"
      : /\.svg$/i.test(href)
        ? "image/svg+xml"
        : "image/jpeg"
  let binary = ""
  for (let index = 0; index < data.length; index += 0x8000) {
    binary += String.fromCharCode(...data.subarray(index, index + 0x8000))
  }
  return `<img src="data:${type};base64,${btoa(binary)}" alt="">`
}

function wrap(text: string, look: Look) {
  if (!text) {
    return ""
  }
  let html = text
  const style = [look.color ? `color: ${look.color}` : "", look.size ? `font-size: ${look.size}` : ""]
    .filter(Boolean)
    .join("; ")
  if (style) {
    html = `<span style="${escapeAttribute(style)}">${html}</span>`
  }
  if (look.strike) {
    html = `<s>${html}</s>`
  }
  if (look.underline) {
    html = `<u>${html}</u>`
  }
  if (look.italic) {
    html = `<em>${html}</em>`
  }
  if (look.bold) {
    html = `<strong>${html}</strong>`
  }
  return html
}

function escapeText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttribute(text: string) {
  return escapeText(text).replace(/"/g, "&quot;")
}
