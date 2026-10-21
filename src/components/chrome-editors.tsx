import { Editor } from "@tiptap/core"
import { EditorContent } from "@tiptap/react"
import { useEffect, useRef, useState, type CSSProperties } from "react"
import { chromeHasContent, chromeOnPage } from "@/document/chrome-html"
import { useActiveChromeEditor } from "@/document/chrome-editing"
import { pageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { ChromeFlow } from "@/editor/chrome-flow"
import { createExtensions } from "@/editor/extensions"
import { objectLeft, objectTop } from "@/editor/objects"

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
        // Once the editor is taken off the page (the header is closed) its markup is no longer what was drawn.
        if (editor.view.dom.isConnected) {
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
        if (field.textContent !== text) {
          field.textContent = text
        }
      })
    }
    show()
    editor.on("transaction", show)
    return () => {
      editor.off("transaction", show)
    }
  }, [editor, live, page, pages])

  if (live && editor) {
    return (
      <div ref={box} className={className} style={origin} data-chrome-part={kind} data-placeholder={placeholder}>
        <EditorContent editor={editor} />
      </div>
    )
  }
  return (
    <div className={className} style={origin} data-chrome-part={kind} aria-hidden={!chromeHasContent(html)}>
      <div
        className="page-editor chrome-editor ProseMirror"
        // What the editor drew, copied; it is read-only and never run as a page of its own.
        dangerouslySetInnerHTML={{ __html: chromeOnPage(snapshot, page, pages) }}
      />
    </div>
  )
}
