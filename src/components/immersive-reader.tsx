import { useBodyEditor } from "@/editor/document-editor"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { useEditorState } from "@tiptap/react"

export function ImmersiveReader() {
  const open = useViewStore((state) => state.immersive)
  // The reader shows the document as HTML; it is serialised only while the reader is open, not on every keystroke.
  return open ? <ImmersiveReaderView /> : null
}

function ImmersiveReaderView() {
  const setImmersive = useViewStore((state) => state.setImmersive)
  const editor = useBodyEditor()
  const language = useDocumentStore((state) => state.pageSetup.language)
  const html = useEditorState({
    editor,
    selector: ({ editor: current }) => current?.getHTML() ?? "",
  })

  function speak() {
    if (typeof speechSynthesis === "undefined" || !editor) {
      return
    }
    if (speechSynthesis.speaking) {
      speechSynthesis.cancel()
      return
    }
    const utterance = new SpeechSynthesisUtterance(editor.state.doc.textContent.slice(0, 4000))
    utterance.lang = language || "en"
    speechSynthesis.speak(utterance)
  }

  return (
    <div className="immersive-reader" role="dialog" aria-label="Immersive Reader">
      <div className="immersive-reader-bar">
        <button type="button" className="immersive-reader-btn" onClick={speak}>
          Read Aloud
        </button>
        <button type="button" className="immersive-reader-btn" onClick={() => setImmersive(false)}>
          Close
        </button>
      </div>
      <article className="immersive-reader-body" dangerouslySetInnerHTML={{ __html: html ?? "" }} />
    </div>
  )
}
