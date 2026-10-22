/**
 * Insert > Cover Page > Generate with AI…: a title, a subtitle and a tone; the model writes the cover, the dialog
 * shows it, and Insert puts it at the front of the document as ordinary text.
 */
import { COVER_TONES, insertGeneratedCover, plainCover, requestCoverText, type CoverText } from "@/ai/cover-page"
import { DialogButtons, DialogFrame, Label } from "@/components/word-dialog"
import { errorMessage } from "@/document/commands"
import { useDocumentStore } from "@/document/store"
import type { Editor } from "@tiptap/core"
import { useState } from "react"
import { create } from "zustand"

export const useCoverPageDialog = create<{ editor: Editor | null }>(() => ({ editor: null }))

export function openCoverGenerator(editor: Editor) {
  useCoverPageDialog.setState({ editor })
}

export function CoverPageDialogHost() {
  const editor = useCoverPageDialog((state) => state.editor)
  return editor ? (
    <CoverPageDialog editor={editor} onClose={() => useCoverPageDialog.setState({ editor: null })} />
  ) : null
}

type Stage = { kind: "brief" } | { kind: "writing" } | { kind: "ready"; cover: CoverText; note: string }

export function CoverPageDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [title, setTitle] = useState(() => useDocumentStore.getState().documentProps.title)
  const [subtitle, setSubtitle] = useState("")
  const [tone, setTone] = useState<string>(COVER_TONES[0])
  const [stage, setStage] = useState<Stage>({ kind: "brief" })
  const [error, setError] = useState("")

  const generate = async () => {
    setStage({ kind: "writing" })
    setError("")
    try {
      const result = await requestCoverText({ title, subtitle, tone }, editor, crypto.randomUUID())
      if (!result.cover) {
        setStage({ kind: "brief" })
        return
      }
      setStage({ kind: "ready", cover: result.cover, note: result.blocked ?? "" })
    } catch (failure) {
      setStage({ kind: "brief" })
      setError(errorMessage(failure))
    }
  }

  const insert = (cover: CoverText) => {
    insertGeneratedCover(editor, cover)
    onClose()
  }

  return (
    <DialogFrame
      title="Generate Cover Page"
      width={440}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (stage.kind === "ready") {
          insert(stage.cover)
        } else if (stage.kind === "brief") {
          void generate()
        }
      }}
    >
      {stage.kind === "ready" ? (
        <div className="cover-gen-preview" aria-live="polite">
          <p className="cover-gen-title">{stage.cover.title}</p>
          {stage.cover.subtitle ? <p className="cover-gen-subtitle">{stage.cover.subtitle}</p> : null}
          <hr />
          {stage.cover.tagline ? <p>{stage.cover.tagline}</p> : null}
          {stage.cover.byline ? <p className="cover-gen-byline">{stage.cover.byline}</p> : null}
          {stage.note ? <p className="cover-gen-note">{stage.note}</p> : null}
        </div>
      ) : (
        <div className="cover-gen-form">
          <Label htmlFor="cover-gen-title" text="Title" letter="T" />
          <input
            id="cover-gen-title"
            type="text"
            className="text-prompt-field"
            value={title}
            autoFocus
            placeholder="What the document is called"
            onChange={(event) => setTitle(event.target.value)}
          />
          <Label htmlFor="cover-gen-subtitle" text="Subtitle" letter="S" />
          <input
            id="cover-gen-subtitle"
            type="text"
            className="text-prompt-field"
            value={subtitle}
            placeholder="Optional"
            onChange={(event) => setSubtitle(event.target.value)}
          />
          <Label htmlFor="cover-gen-tone" text="Tone" letter="o" />
          <select id="cover-gen-tone" value={tone} onChange={(event) => setTone(event.target.value)}>
            {COVER_TONES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <p className="cover-gen-note">
            {stage.kind === "writing"
              ? "Writing the cover page…"
              : "The cover is inserted as a Title, a Subtitle, a rule and a byline, then a page break: ordinary text to edit."}
          </p>
          {error ? (
            <p role="alert" className="cover-gen-error">
              {error}
            </p>
          ) : null}
        </div>
      )}
      {stage.kind === "ready" ? (
        <DialogButtons submit ok="Insert" onCancel={onClose}>
          <button type="button" className="dialog-btn" onClick={() => setStage({ kind: "brief" })}>
            Back
          </button>
        </DialogButtons>
      ) : (
        <DialogButtons submit ok="Generate" okDisabled={stage.kind === "writing" || !title.trim()} onCancel={onClose}>
          <button
            type="button"
            className="dialog-btn"
            disabled={stage.kind === "writing" || !title.trim()}
            onClick={() => insert(plainCover({ title, subtitle, tone }))}
          >
            Insert without AI
          </button>
        </DialogButtons>
      )}
    </DialogFrame>
  )
}
