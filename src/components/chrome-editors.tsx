import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import { chromeHasContent } from "@/document/chrome-html"
import { useActiveChromeEditor } from "@/document/chrome-editing"
import { createExtensions } from "@/editor/extensions"

/** The schema and behaviour of the body, without the checks that only make sense over a whole document. */
const chromeExtensions = createExtensions().filter((extension) => extension.name !== "spellcheck")

export type ChromePart = {
  editor: Editor | null
  /** What the part looks like when it is not being edited: the editor's own markup, so a picture sits where it was put. */
  snapshot: string
}

/**
 * A header or footer as an editor of its own. It is created once and kept; the page where it is being edited shows
 * the live editor, every other page shows a copy of what it draws, which follows as it is typed.
 */
export function useChromePart(html: string, setHtml: (html: string) => void, label: string): ChromePart {
  const emitted = useRef(html)
  const [snapshot, setSnapshot] = useState("")
  const editor = useEditor({
    extensions: chromeExtensions,
    content: html || "<p></p>",
    editable: false,
    immediatelyRender: true,
    editorProps: { attributes: { class: "page-editor chrome-editor", spellcheck: "false", "aria-label": label } },
    onUpdate: ({ editor: current }) => {
      const next = current.getHTML()
      emitted.current = chromeHasContent(next) ? next : ""
      setHtml(emitted.current)
    },
  })

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
      frame = window.requestAnimationFrame(() => setSnapshot(editor.view.dom.innerHTML))
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
  focus,
}: {
  part: ChromePart
  kind: "header" | "footer"
  live: boolean
  html: string
  placeholder: string
  focus: boolean
}) {
  const { editor, snapshot } = part
  const activate = useActiveChromeEditor((state) => state.activate)
  const className = `${kind === "header" ? "page-header" : "page-footer"} chrome-box${chromeHasContent(html) ? " has-content" : " is-empty"}${live ? " is-live" : ""}`

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

  if (live && editor) {
    return (
      <div className={className} data-chrome-part={kind} data-placeholder={placeholder}>
        <EditorContent editor={editor} />
      </div>
    )
  }
  return (
    <div className={className} data-chrome-part={kind} aria-hidden={!chromeHasContent(html)}>
      <div
        className="page-editor chrome-editor ProseMirror"
        // What the editor drew, copied; it is read-only and never run as a page of its own.
        dangerouslySetInnerHTML={{ __html: snapshot }}
      />
    </div>
  )
}
