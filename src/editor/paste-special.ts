import type { Editor } from "@tiptap/core"
import { pasteHtmlAs, pastePlainText } from "@/editor/editing-behavior"
import { insertFittedImage } from "@/editor/image-fit"
import { restoreSelection } from "@/editor/selection-memory"

/**
 * Paste Options and Edit > Paste Special: what the clipboard holds, and pasting it in one chosen format. The system
 * clipboard as a web page reads it offers HTML, plain text and PNG pictures; Word's other formats (RTF, metafiles,
 * embedded objects, links to the source) are not offered there, so they are not listed.
 */

export type Clip = { html?: string; text?: string; image?: Blob }

export type PasteFormat = "html" | "text" | "unicode" | "picture"

export type FormatChoice = { id: PasteFormat; label: string; result: string }

/** What the clipboard holds, or null when it can't be read (the system refused, or nothing is on it). */
export async function readClipboard(): Promise<Clip | null> {
  try {
    const clip: Clip = {}
    for (const item of await navigator.clipboard.read()) {
      if (!clip.html && item.types.includes("text/html")) {
        clip.html = await (await item.getType("text/html")).text()
      }
      if (!clip.text && item.types.includes("text/plain")) {
        clip.text = await (await item.getType("text/plain")).text()
      }
      const image = item.types.find((type) => type.startsWith("image/"))
      if (!clip.image && image) {
        clip.image = await item.getType(image)
      }
    }
    return clip.html || clip.text || clip.image ? clip : null
  } catch {
    try {
      const text = await navigator.clipboard.readText()
      return text ? { text } : null
    } catch {
      return null
    }
  }
}

/** The "As" list of Paste Special for what the clipboard holds, in Word's order and words. */
export function formatsFor(clip: Clip): FormatChoice[] {
  const list: FormatChoice[] = []
  if (clip.image) {
    list.push({
      id: "picture",
      label: "Picture (PNG)",
      result: "Inserts the contents of the Clipboard as a PNG picture.",
    })
  }
  if (clip.html) {
    list.push({
      id: "html",
      label: "HTML Format",
      result: "Inserts the contents of the Clipboard as HTML Format.",
    })
  }
  if (clip.text) {
    list.push(
      {
        id: "text",
        label: "Unformatted Text",
        result: "Inserts the contents of the Clipboard as text without any formatting.",
      },
      {
        id: "unicode",
        label: "Unformatted Unicode Text",
        result: "Inserts the contents of the Clipboard as text without any formatting.",
      },
    )
  }
  if (clip.html && !clip.image) {
    list.push({
      id: "picture",
      label: "Picture (PNG)",
      result: "Inserts the contents of the Clipboard as a picture of the text, as it looks.",
    })
  }
  return list
}

/** Where the clipboard came from, as Paste Special's "Source:" line says it. */
export function sourceOf(clip: Clip) {
  if (clip.html?.includes("data-pm-slice")) {
    return "Inkspire document"
  }
  if (clip.html && /urn:schemas-microsoft-com:office:word|class="?Mso/i.test(clip.html)) {
    return "Microsoft Word document"
  }
  const url = clip.html?.match(/<!--\s*SourceURL:\s*(\S+)/i)?.[1] ?? clip.html?.match(/<base href="([^"]+)"/i)?.[1]
  if (url) {
    return url.replace(/^https?:\/\//, "").split("/")[0] ?? "Unknown"
  }
  return "Unknown"
}

/** Pastes the clipboard in the format chosen; false when there was nothing to paste in it. */
export async function pasteClipAs(editor: Editor, clip: Clip, format: PasteFormat | "merge") {
  restoreSelection(editor)
  editor.commands.focus()
  const view = editor.view
  if (format === "picture") {
    if (clip.image) {
      return insertFittedImage(editor, { src: await blobUrl(clip.image), alt: "Pasted picture" })
    }
    const picture = clip.html ? await htmlPicture(clip.html, textWidth(editor), fontAt(editor)) : null
    return picture ? insertFittedImage(editor, { ...picture, alt: "Pasted picture" }) : false
  }
  if ((format === "html" || format === "merge") && clip.html) {
    return pasteHtmlAs(view, clip.html, format === "merge" ? "merge" : "keep")
  }
  if (format === "merge" && clip.text) {
    pastePlainText(view, clip.text)
    return true
  }
  if (clip.image && !clip.text && format !== "text" && format !== "unicode") {
    return insertFittedImage(editor, { src: await blobUrl(clip.image), alt: "Pasted picture" })
  }
  const text = clip.text ?? (clip.html ? htmlText(clip.html) : "")
  if (!text) {
    return false
  }
  pastePlainText(view, text)
  return true
}

function blobUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function htmlText(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  return doc.body.innerText || doc.body.textContent || ""
}

function textWidth(editor: Editor) {
  const paragraph = editor.view.dom.querySelector("p")
  return Math.max(200, Math.round(paragraph?.getBoundingClientRect().width ?? 600))
}

function fontAt(editor: Editor) {
  const at = editor.view.domAtPos(editor.state.selection.from).node
  const element = (at instanceof Element ? at : at.parentElement)?.closest("p, li, h1, h2, h3, h4, h5, h6")
  const style = getComputedStyle(element ?? editor.view.dom.querySelector("p") ?? editor.view.dom)
  return { family: style.fontFamily, size: style.fontSize, color: "#000" }
}

/**
 * The look of the elements pasted HTML uses, set in the picture and where it is measured alike: the app's own reset
 * applies on the page but not inside the picture, and without this the two lay out at different heights.
 */
const PICTURE_CSS =
  "*{box-sizing:border-box}p,h1,h2,h3,h4,h5,h6,ul,ol,li,table,blockquote,pre{margin:0;padding:0}" +
  "p,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre{margin:0 0 .4em}ul,ol{padding-left:1.6em}" +
  "ul{list-style:disc}ol{list-style:decimal}li{display:list-item}h1{font-size:2em}h2{font-size:1.5em}" +
  "h3{font-size:1.25em}h1,h2,h3,h4,h5,h6,b,strong,th{font-weight:bold}i,em{font-style:italic}" +
  "u{text-decoration:underline}s,del,strike{text-decoration:line-through}table{border-collapse:collapse}" +
  "td,th{padding:2px 4px;vertical-align:top}img{max-width:100%}a{color:#0563c1;text-decoration:underline}"

/**
 * A PNG picture of the HTML as it looks: laid out at the text's width in the page's font, drawn through an SVG
 * foreignObject onto a canvas at twice the size so it stays sharp. Null when the system won't draw
 * it; the size is the picture's in CSS pixels.
 */
export async function htmlPicture(html: string, width: number, font: { family: string; size: string; color: string }) {
  const doc = new DOMParser().parseFromString(html, "text/html")
  doc.querySelectorAll("script, style, meta, link, title").forEach((node) => node.remove())
  const box = document.createElement("div")
  box.setAttribute(
    "style",
    `position:fixed;left:-10000px;top:0;width:${width}px;font-family:${font.family};font-size:${font.size};color:${font.color};background:#fff;line-height:1.3`,
  )
  box.innerHTML = `<style>${PICTURE_CSS}</style>${doc.body.innerHTML}`
  document.body.append(box)
  const height = Math.max(1, Math.ceil(box.scrollHeight) + 2)
  box.removeAttribute("style")
  box.setAttribute(
    "style",
    `width:${width}px;font-family:${font.family};font-size:${font.size};color:${font.color};background:#fff;line-height:1.3`,
  )
  box.setAttribute("xmlns", "http://www.w3.org/1999/xhtml")
  const xhtml = new XMLSerializer().serializeToString(box)
  box.remove()
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`
  try {
    const image = new Image()
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    await image.decode()
    const scale = 2
    const canvas = document.createElement("canvas")
    canvas.width = width * scale
    canvas.height = height * scale
    const context = canvas.getContext("2d")
    if (!context) {
      return null
    }
    context.scale(scale, scale)
    context.drawImage(image, 0, 0)
    return { src: canvas.toDataURL("image/png"), size: { width, height } }
  } catch {
    return null
  }
}
