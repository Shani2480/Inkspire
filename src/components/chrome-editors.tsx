import { Editor } from "@tiptap/core"
import { EditorContent } from "@tiptap/react"
import { useEffect, useId, useRef, useState, type CSSProperties } from "react"
import { chromeHasContent, chromeOnPage } from "@/document/chrome-html"
import { useActiveChromeEditor } from "@/document/chrome-editing"
import { reportChromeReach } from "@/document/chrome-extent"
import { pageMetrics } from "@/document/page-setup"
import type { ChromeSlot, SectionChrome } from "@/document/sections"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { ChromeFlow } from "@/editor/chrome-flow"
import { createExtensions } from "@/editor/extensions"
import { objectLeft, objectTop } from "@/editor/objects"

const MM_TO_PX = 96 / 25.4

/** The schema and behaviour of the body, without the checks that only make sense over a whole document. */
let chromeExtensions: ReturnType<typeof createExtensions> | null = null
function getChromeExtensions() {
  chromeExtensions ??= [...createExtensions().filter((extension) => extension.name !== "spellcheck"), ChromeFlow]
  return chromeExtensions
}

/**
 * What the editor drew, without what only the person editing sees: a selected picture's frame and its resize and rotate
 * handles. The copy shown on a page that is not being edited must not carry them, or a selection left behind keeps its
 * handles on screen and turns the header zone off (see `.page-canvas:has(.ProseMirror-selectednode …)`).
 */
export function drawnMarkup(dom: HTMLElement) {
  const copy = dom.cloneNode(true) as HTMLElement
  copy
    .querySelectorAll(".ProseMirror-selectednode")
    .forEach((node) => node.classList.remove("ProseMirror-selectednode"))
  copy
    .querySelectorAll("[data-rotate], [data-resize], [data-crop-edge], .image-resize, .object-rotate, .object-handle")
    .forEach((handle) => handle.remove())
  return copy.innerHTML
}

export type ChromePart = {
  editor: Editor | null
  /** What the part looks like when it is not being edited: the editor's own markup, so a picture sits where it was put. */
  snapshot: string
}

/**
 * A header or footer as an editor of its own. It is created once and kept; the page where it is being edited shows
 * the live editor, every other page shows a copy of what it draws, which follows as it is typed.
 */
export function useChromePart(
  html: string,
  setHtml: (html: string) => void,
  label: string,
  /** Whether the part is in use: it has content or a header or footer is being edited. */
  wanted = true,
): ChromePart {
  const emitted = useRef(html)
  const [snapshot, setSnapshot] = useState("")
  const [editor, setEditor] = useState<Editor | null>(null)
  const made = useRef<Editor | null>(null)
  const latest = useRef({ html, setHtml, label })
  latest.current = { html, setHtml, label }

  // A header or footer is an editor with the whole body's schema, which is slow to build, and most documents use
  // one or two of the six, so each is built when it first has something in it or is opened for editing, then kept.
  useEffect(() => {
    if (!wanted || made.current) {
      return
    }
    const created = new Editor({
      extensions: getChromeExtensions(),
      content: latest.current.html || "<p></p>",
      editable: false,
      editorProps: {
        attributes: { class: "page-editor chrome-editor", spellcheck: "false", "aria-label": latest.current.label },
      },
      onUpdate: ({ editor: current }) => {
        const next = current.getHTML()
        emitted.current = chromeHasContent(next) ? next : ""
        latest.current.setHtml(emitted.current)
      },
    })
    made.current = created
    setEditor(created)
  }, [wanted])

  useEffect(
    () => () => {
      made.current?.destroy()
      made.current = null
    },
    [],
  )

  useEffect(() => {
    if (!editor || html === emitted.current) {
      return
    }
    emitted.current = html
    editor.commands.setContent(html || "<p></p>", { emitUpdate: false })
  }, [editor, html])

  useEffect(() => {
    if (!editor) {
      return
    }
    let frame = 0
    const capture = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        // While open, the markup counts only on the page; closed, the editor draws off the page (a header set from
        // the gallery or read from a file is never on it until it is opened), and that is what the pages copy.
        if (editor.view.dom.isConnected || !editor.isEditable) {
          setSnapshot(drawnMarkup(editor.view.dom))
        }
      })
    }
    capture()
    editor.on("transaction", capture)
    return () => {
      window.cancelAnimationFrame(frame)
      editor.off("transaction", capture)
    }
  }, [editor])

  return { editor, snapshot }
}

/**
 * One header or footer box on a page: the live editor where the header or footer is being edited, else what the
 * editor drew. It is a layer of its own: it can run over the body, and nothing in the body moves for it.
 */
export function ChromeBox({
  part,
  kind,
  live,
  html,
  placeholder,
  page,
  pages,
  focus,
  section = "",
  marginTop,
}: {
  part: ChromePart
  kind: "header" | "footer"
  live: boolean
  html: string
  placeholder: string
  /** The number of the page this box is on, and how many pages there are: what the page fields in it show. */
  page: number
  pages: number
  focus: boolean
  /** The key of the section before the last the page is in ("" for the last), whose margins the box reaches into. */
  section?: string
  /** That section's top margin in mm, when it is not the document's. */
  marginTop?: number
}) {
  const { editor, snapshot } = part
  const activate = useActiveChromeEditor((state) => state.activate)
  const className = `${kind === "header" ? "page-header" : "page-footer"} chrome-box${chromeHasContent(html) ? " has-content" : " is-empty"}${live ? " is-live" : ""}`

  // A picture floating in the header is placed from the box's own corner: objects are laid out on the page grid,
  // so the box takes the first page's corner back out (see `.chrome-box` in index.css).
  const pageSetup = useDocumentStore((state) => state.pageSetup)
  useViewStore((state) => state.pageView + state.movement)
  const metrics = pageMetrics(pageSetup)
  const origin = {
    "--chrome-left": `${-objectLeft(1, 0, metrics)}px`,
    "--chrome-top": `${-objectTop(1, 0, metrics)}px`,
  } as CSSProperties

  useEffect(() => {
    if (!editor || !live) {
      return
    }
    editor.setEditable(true)
    const take = () => activate(editor)
    editor.on("focus", take)
    if (focus) {
      editor.commands.focus("end")
      take()
    }
    return () => {
      editor.off("focus", take)
      editor.setEditable(false)
      if (useActiveChromeEditor.getState().editor === editor) {
        activate(null)
      }
    }
  }, [editor, live, focus, activate])

  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!editor || !live) {
      return
    }
    // The editor draws a field with the number it was saved with; the page it is on has its own.
    const show = () => {
      box.current?.querySelectorAll<HTMLElement>("[data-page-field]").forEach((field) => {
        const text = String(field.dataset.pageField === "pages" ? pages : page)
        const slot = field.querySelector<HTMLElement>(":scope > .field-value") ?? field
        if (slot.textContent !== text) {
          slot.textContent = text
        }
      })
    }
    show()
    editor.on("transaction", show)
    return () => {
      editor.off("transaction", show)
    }
  }, [editor, live, page, pages])

  // How far the box reaches into the page: a header taller than the top margin pushes the body down (Word), and a
  // footer taller than the bottom margin pushes it up. Floating pictures in it are out of the flow and push nothing.
  const id = useId()
  const filled = chromeHasContent(html)
  const measured = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = measured.current
    if (!element) {
      return
    }
    const report = () => {
      // From the box's top to the page's top margin, which pictures placed relative to the margin are measured from.
      const margin = (marginTop ?? useDocumentStore.getState().pageSetup.marginTop) * MM_TO_PX
      element.style.setProperty("--chrome-margin", `${Math.round(margin - element.offsetTop)}px`)
      const sheet = element.offsetParent as HTMLElement | null
      // An empty header or footer takes no room, as on a cover page whose section has none (Word).
      if (!sheet || useViewStore.getState().layoutMode === "web" || (!live && !filled)) {
        reportChromeReach(id, kind, null, section)
        return
      }
      const reach =
        kind === "header" ? element.offsetTop + element.offsetHeight : sheet.offsetHeight - element.offsetTop
      reportChromeReach(id, kind, reach, section)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => {
      observer.disconnect()
      reportChromeReach(id, kind, null, section)
    }
  }, [id, kind, live, filled, editor, pageSetup.marginTop, marginTop, section])

  if (live && editor) {
    return (
      <div
        ref={(element) => {
          box.current = element
          measured.current = element
        }}
        className={className}
        style={origin}
        data-chrome-part={kind}
        data-placeholder={placeholder}
      >
        <EditorContent editor={editor} />
      </div>
    )
  }
  return (
    <div
      ref={measured}
      className={className}
      style={origin}
      data-chrome-part={kind}
      aria-hidden={!chromeHasContent(html)}
    >
      <div
        className="page-editor chrome-editor ProseMirror"
        // What the editor drew, copied; it is read-only and never run as a page of its own.
        dangerouslySetInnerHTML={{ __html: chromeOnPage(snapshot, page, pages) }}
      />
    </div>
  )
}

/** No editor yet: what a page shows for a section's part before its editor has been made. */
export const NO_PART: ChromePart = { editor: null, snapshot: "" }

/**
 * The six headers and footers of a section before the last as editors, reported to the pages (`onParts`); a part the
 * section is linked to the previous one for is made only if it is the chain's first (see `slotOwner`).
 */
export function SectionParts({
  section,
  root,
  editing,
  onParts,
}: {
  section: SectionChrome
  /** The first section: a header or footer no section has yet is made here. */
  root: boolean
  editing: boolean
  onParts: (key: string, parts: Record<ChromeSlot, ChromePart>) => void
}) {
  const setPart = useDocumentStore((state) => state.setSectionPart)
  const { key, parts: html } = section
  // A linked part is the previous section's editor, so none is made for it here.
  const wanted = (value: string | undefined) =>
    (value !== undefined || root) && (editing || chromeHasContent(value ?? ""))
  const header = useChromePart(html.header ?? "", (next) => setPart(key, "header", next), "Header", wanted(html.header))
  const footer = useChromePart(html.footer ?? "", (next) => setPart(key, "footer", next), "Footer", wanted(html.footer))
  const firstHeader = useChromePart(
    html.firstHeader ?? "",
    (next) => setPart(key, "firstHeader", next),
    "First page header",
    wanted(html.firstHeader),
  )
  const firstFooter = useChromePart(
    html.firstFooter ?? "",
    (next) => setPart(key, "firstFooter", next),
    "First page footer",
    wanted(html.firstFooter),
  )
  const evenHeader = useChromePart(
    html.evenHeader ?? "",
    (next) => setPart(key, "evenHeader", next),
    "Even page header",
    wanted(html.evenHeader),
  )
  const evenFooter = useChromePart(
    html.evenFooter ?? "",
    (next) => setPart(key, "evenFooter", next),
    "Even page footer",
    wanted(html.evenFooter),
  )
  useEffect(() => {
    onParts(key, { header, footer, firstHeader, firstFooter, evenHeader, evenFooter })
    // Each part is a new object every render; what matters is its editor and what it drew.
  }, [
    key,
    onParts,
    header.editor,
    header.snapshot,
    footer.editor,
    footer.snapshot,
    firstHeader.editor,
    firstHeader.snapshot,
    firstFooter.editor,
    firstFooter.snapshot,
    evenHeader.editor,
    evenHeader.snapshot,
    evenFooter.editor,
    evenFooter.snapshot,
  ])
  return null
}
