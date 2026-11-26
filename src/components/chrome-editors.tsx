import { Editor } from "@tiptap/core"
import { EditorContent } from "@tiptap/react"
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react"
import { chromeHasContent, chromeOnPage } from "@/document/chrome-html"
import { useActiveChromeEditor } from "@/document/chrome-editing"
import { forgetChrome, measureChrome, reportChromeReach, useChromeExtent } from "@/document/chrome-extent"
import { pageMetrics } from "@/document/page-setup"
import type { ChromeSlot, SectionChrome } from "@/document/sections"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { ChromeFlow } from "@/editor/chrome-flow"
import { createExtensions } from "@/editor/extensions"
import { layoutTabsIn } from "@/editor/tab-stops"
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
      // As in the body: Word's AutoFormat As You Type, not Markdown's typing rules.
      enableInputRules: ["horizontalRule"],
      enablePasteRules: ["link"],
      editorProps: {
        attributes: { class: "page-editor chrome-editor", spellcheck: "false", "aria-label": latest.current.label },
      },
      onUpdate: ({ editor: current, transaction }) => {
        // Making the editor live or not (`setEditable`) also emits an update; with the part changed in the store in
        // the same render (Link to Previous), it would write the old text back over the new.
        if (!transaction.docChanged) {
          return
        }
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
  page: string
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
  // Word measures "relative to margin" from where the body starts: below the header when it reaches past the top
  // margin (a letterhead's footer picture sat a header's line lower in Word).
  const headerReach = useChromeExtent((state) => (section ? (state.sections[section]?.header ?? 0) : state.header))
  const remeasure = useRef<(() => void) | null>(null)
  const measured = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = measured.current
    if (!element) {
      return
    }
    // Measured with every other box in one pass (`measureChrome`): a long document has two boxes on each of hundreds
    // of pages, and each measuring on its own, after another had changed a style, laid the whole document out again.
    const report = () =>
      measureChrome(element, () => {
        // From the box's top to the page's top margin, which pictures placed relative to the margin are measured from.
        const extent = useChromeExtent.getState()
        const pushed = (section ? extent.sections[section]?.header : extent.header) ?? 0
        const margin = Math.max((marginTop ?? useDocumentStore.getState().pageSetup.marginTop) * MM_TO_PX, pushed)
        const inner = element.querySelector<HTMLElement>(".chrome-editor")
        const push = inner ? `${wrapPush(inner)}px` : "0px"
        const top = element.offsetTop
        const sheet = element.offsetParent as HTMLElement | null
        // An empty header or footer takes no room, as on a cover page whose section has none (Word).
        const empty = !sheet || useViewStore.getState().layoutMode === "web" || (!live && !filled)
        const reach = empty ? null : kind === "header" ? top + element.offsetHeight : sheet.offsetHeight - top
        return () => {
          const offset = `${Math.round(margin - top)}px`
          if (element.style.getPropertyValue("--chrome-margin") !== offset) {
            element.style.setProperty("--chrome-margin", offset)
          }
          if (element.style.getPropertyValue("--chrome-wrap-push") !== push) {
            element.style.setProperty("--chrome-wrap-push", push)
          }
          return { id, kind, reach, section }
        }
      })
    report()
    remeasure.current = report
    const observer = new ResizeObserver(report)
    observer.observe(element)
    return () => {
      observer.disconnect()
      forgetChrome(element)
      reportChromeReach(id, kind, null, section)
    }
  }, [id, kind, live, filled, editor, pageSetup.marginTop, marginTop, section])
  // A new header reach moves the margin pictures are placed from: measured again, the box's reach kept meanwhile (a
  // dependency above would drop it first, and the header's own reach then went back and forth).
  useEffect(() => {
    remeasure.current?.()
  }, [headerReach])

  // The copy's tabs, set on the page (its editor is off the page, where they cannot be measured).
  const copy = useRef<HTMLDivElement>(null)
  const drawn = live && editor ? "" : chromeOnPage(snapshot, page, pages)
  useLayoutEffect(() => {
    if (copy.current && drawn.includes("doc-tab")) {
      layoutTabsIn(copy.current)
    }
  }, [drawn])

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
        ref={copy}
        className="page-editor chrome-editor ProseMirror"
        // What the editor drew, copied; it is read-only and never run as a page of its own.
        dangerouslySetInnerHTML={{ __html: drawn }}
      />
    </div>
  )
}

/** Less room than this beside a picture, and no text goes there (as a floating table leaves, table-float.ts). */
const MIN_BESIDE = 1 * 37.8

/**
 * How far a header's or footer's text is pushed down by a picture it wraps around (Square, Tight, Through, Top and
 * Bottom) that leaves no room beside it: Word starts the picture's paragraph below it, so the box grows and, in a
 * footer, rises (a letterhead's full-width footer picture sat 17 px low). Pixels, 0 for none.
 */
export function wrapPush(editor: HTMLElement) {
  let push = 0
  const width = editor.clientWidth
  for (const frame of editor.querySelectorAll<HTMLElement>(":scope > .object-frame[data-wrapping]")) {
    const next = frame.nextElementSibling as HTMLElement | null
    if (!next || next.classList.contains("object-frame")) {
      continue
    }
    // The picture's own size: the frame's box can be cut to the text's width.
    const left = frame.offsetLeft
    const right = left + Math.max(frame.offsetWidth, frame.scrollWidth)
    const top = frame.offsetTop
    const bottom = top + Math.max(frame.offsetHeight, frame.scrollHeight) + (Number(frame.dataset.wrapping) || 0)
    // Only over the paragraph's first line (a picture placed far below it, from the margin, moves nothing).
    const lineBottom = next.offsetTop + next.offsetHeight - (parseFloat(getComputedStyle(next).paddingTop) || 0)
    if (left < MIN_BESIDE && width - right < MIN_BESIDE && top < lineBottom && bottom > next.offsetTop) {
      push = Math.max(push, bottom - next.offsetTop)
    }
  }
  return Math.max(0, Math.round(push * 100) / 100)
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
