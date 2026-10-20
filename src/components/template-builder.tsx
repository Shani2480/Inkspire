import { cancelAiRequest } from "@/ai/generate"
import { templatePlace } from "@/ai/template-place"
import { promptLibraryName, searchPromptLibrary, type PromptHit } from "@/ai/prompt-search"
import { TEMPLATE_PRESETS, generateTemplateDraft, streamingPreviewHtml } from "@/ai/templates"
import { useAiSettings } from "@/ai/settings"
import { DialogFrame } from "@/components/word-dialog"
import { errorMessage, insertHtmlAsNewDocument, reportError } from "@/document/commands"
import { getDocumentEditor } from "@/document/editor-ref"
import { createExtensions } from "@/editor/extensions"
import { commandShortcut } from "@/lib/platform"
import { EditorContent, useEditor } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"

export function TemplateBuilder() {
  const open = useAiSettings((state) => state.builderOpen)
  const setOpen = useAiSettings((state) => state.setBuilderOpen)
  const setVariablesOpen = useAiSettings((state) => state.setVariablesOpen)
  const running = useAiSettings((state) => state.running)
  const stream = useAiSettings((state) => state.stream)
  const settledHtml = useAiSettings((state) => state.settledHtml)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const [prompt, setPrompt] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [hits, setHits] = useState<PromptHit[]>([])
  const [searching, setSearching] = useState(false)
  const [searchNote, setSearchNote] = useState("")
  const requestRef = useRef("")
  const searchAbort = useRef<AbortController | null>(null)
  const previewBox = useRef<HTMLDivElement>(null)
  /** The preview follows the text as it is written, unless the user has scrolled up to read. */
  const followRef = useRef(true)

  const [previewExtensions] = useState(createExtensions)
  const preview = useEditor({
    extensions: previewExtensions,
    content: "<p></p>",
    editable: false,
    editorProps: {
      attributes: {
        class: "page-editor",
        "aria-label": "Template preview",
        spellcheck: "false",
      },
    },
  })

  const previewHtml = !running && settledHtml ? streamingPreviewHtml(settledHtml) : streamingPreviewHtml(stream)
  const canInsert = !running && settledHtml.trim().length > 0 && previewHtml !== "<p></p>"

  useEffect(() => {
    if (!preview || !open) {
      return
    }
    preview.commands.setContent(previewHtml, { emitUpdate: false })
    const box = previewBox.current
    if (box && running && followRef.current) {
      box.scrollTop = box.scrollHeight
    }
  }, [preview, open, previewHtml, running])

  useEffect(() => {
    if (running) {
      followRef.current = true
    }
  }, [running])

  useEffect(() => {
    if (!open) {
      return
    }
    const frame = window.requestAnimationFrame(() => promptRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  if (!open) {
    return null
  }

  function dismiss() {
    const requestId = requestRef.current
    requestRef.current = ""
    searchAbort.current?.abort()
    if (requestId) {
      cancelAiRequest(requestId)
    }
    if (!requestId || useAiSettings.getState().requestId === requestId) {
      useAiSettings.getState().clearResult()
    }
    setError("")
    setOpen(false)
  }

  async function onGenerate() {
    const task = prompt.trim()
    if (!task || useAiSettings.getState().running) {
      return
    }
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setError("")
    try {
      const status = await generateTemplateDraft(task, requestId)
      if (requestRef.current !== requestId) {
        return
      }
      if (status === "busy") {
        setError("A template is already being generated.")
      }
    } catch (caught) {
      if (requestRef.current === requestId) {
        setError(errorMessage(caught))
        await reportError(caught)
      }
    } finally {
      if (requestRef.current === requestId) {
        requestRef.current = ""
      }
    }
  }

  function stop() {
    if (requestRef.current) {
      cancelAiRequest(requestRef.current)
    }
  }

  function insertAtCursor() {
    const editor = getDocumentEditor()
    if (!editor || !canInsert) {
      return
    }
    if (editor.isEmpty) {
      editor.chain().focus().setContent(previewHtml).run()
    } else {
      const max = editor.state.doc.content.size
      const at = Math.min(Math.max(templatePlace().to, 0), max)
      editor.chain().focus().insertContentAt(at, previewHtml).run()
    }
    dismiss()
  }

  function insertAsNewDocument() {
    if (!canInsert) {
      return
    }
    const result = insertHtmlAsNewDocument(previewHtml)
    if (result === "dirty") {
      setError("Save the open document before starting a new one.")
      return
    }
    if (result === "ok") {
      dismiss()
    }
  }

  async function onSearch() {
    const task = query.trim()
    if (!task || searching) {
      return
    }
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    setSearching(true)
    setSearchNote("")
    setHits([])
    try {
      const found = await searchPromptLibrary(task, controller.signal)
      if (controller.signal.aborted) {
        return
      }
      setHits(found)
      setSearchNote(found.length === 0 ? "No prompts matched." : "")
    } catch (caught) {
      if (controller.signal.aborted) {
        return
      }
      setSearchNote(errorMessage(caught))
    } finally {
      if (searchAbort.current === controller) {
        searchAbort.current = null
        setSearching(false)
      }
    }
  }

  return (
    <DialogFrame
      title="Template Builder"
      width={960}
      height="min(720px, calc(100vh - 48px))"
      onClose={() => dismiss()}
      level={50}
      bodyClassName="is-flush"
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-b border-black/10 p-4 md:border-r md:border-b-0">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Template types">
            {TEMPLATE_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected === item.id}
                className={
                  selected === item.id
                    ? "rounded-full bg-[var(--dlg-accent)] px-2.5 py-1 text-xs text-white"
                    : "rounded-full border border-black/10 bg-white px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
                }
                onClick={() => {
                  setSelected(item.id)
                  setPrompt(item.prompt)
                  setError("")
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-xs font-medium text-neutral-600">
            Prompt
            <textarea
              ref={promptRef}
              value={prompt}
              aria-label="Template prompt"
              placeholder="Describe the document you want, and ask for [Placeholders]."
              className="min-h-36 flex-1 resize-none rounded-lg border border-black/10 bg-white px-3 py-2 text-sm font-normal text-neutral-900 outline-none focus:border-neutral-400"
              onChange={(event) => {
                setPrompt(event.target.value)
                setSelected(null)
              }}
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="dialog-btn is-primary"
              disabled={running || !prompt.trim()}
              onClick={() => void onGenerate()}
            >
              {running ? "Generating…" : "Generate"}
            </button>
            {running ? (
              <button type="button" className="dialog-btn" onClick={stop}>
                Stop
              </button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          ) : null}
          <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              void onSearch()
            }}
          >
            <label className="flex flex-col gap-1.5 text-xs font-medium text-neutral-600">
              Search prompts
              <input
                value={query}
                aria-label="Search prompt libraries"
                placeholder={`Search ${promptLibraryName()}`}
                className="h-8 rounded-lg border border-black/10 bg-white px-2 text-sm font-normal text-neutral-900 outline-none focus:border-neutral-400"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button type="submit" className="dialog-btn" disabled={searching || !query.trim()}>
              {searching ? "Searching…" : "Search"}
            </button>
          </form>
          {searchNote ? <p className="text-xs text-neutral-500">{searchNote}</p> : null}
          {hits.length > 0 ? (
            <ul aria-label="Prompt results" className="max-h-32 space-y-1 overflow-auto">
              {hits.map((hit, index) => (
                <li key={`${hit.title}-${index}`}>
                  <button
                    type="button"
                    className="w-full truncate rounded-md px-2 py-1 text-left text-xs text-neutral-800 hover:bg-white"
                    onClick={() => {
                      setPrompt(hit.prompt)
                      setSelected(null)
                      setError("")
                    }}
                  >
                    {hit.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <section className="flex min-h-0 flex-col p-4" aria-label="Template preview">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-neutral-600">Preview</h3>
            <span className="text-xs text-neutral-500" aria-live="polite">
              {running ? "Writing…" : settledHtml ? "Ready to insert" : "Waiting for a prompt"}
            </span>
          </div>
          <div
            ref={previewBox}
            data-keep-light
            onScroll={(event) => {
              const box = event.currentTarget
              followRef.current = box.scrollHeight - box.scrollTop - box.clientHeight < 24
            }}
            className="template-preview min-h-0 flex-1 overflow-auto rounded-lg bg-white px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_rgba(15,23,42,0.06)]"
          >
            <EditorContent editor={preview} />
          </div>
        </section>
      </div>

      <div className="word-dialog-actions">
        <span className="mr-auto text-[var(--dlg-muted)]">{commandShortcut("J")} opens this dialog</span>
        <button type="button" className="dialog-btn" onClick={() => setVariablesOpen(true)}>
          Fill Variables
        </button>
        <button type="button" className="dialog-btn is-primary" disabled={!canInsert} onClick={insertAtCursor}>
          Insert at Cursor
        </button>
        <button type="button" className="dialog-btn" disabled={!canInsert} onClick={insertAsNewDocument}>
          New Document
        </button>
      </div>
    </DialogFrame>
  )
}
