import { cancelAiRequest } from "@/ai/generate"
import { requestSynonyms, requestTranslation, TRANSLATION_LANGUAGES, useProofing } from "@/ai/proofing"
import { useAiSettings } from "@/ai/settings"
import { languageThesaurusName } from "@/document/languages"
import { errorMessage } from "@/document/commands"
import { useDocumentStore } from "@/document/store"
import { useBodyEditor } from "@/editor/document-editor"
import { X } from "lucide-react"
import { useRef } from "react"
import { DialogFrame } from "@/components/word-dialog"

export function ProofingPanel() {
  const editor = useBodyEditor()
  const open = useProofing((state) => state.open)
  const running = useProofing((state) => state.running)
  const notice = useProofing((state) => state.notice)
  const error = useProofing((state) => state.error)
  const synonyms = useProofing((state) => state.synonyms)
  const translation = useProofing((state) => state.translation)
  const language = useProofing((state) => state.language)
  const documentLanguage = useDocumentStore((state) => state.pageSetup.language)
  const closePanel = useProofing((state) => state.closePanel)
  const setLanguage = useProofing((state) => state.setLanguage)
  const setRunning = useProofing((state) => state.setRunning)
  const setNotice = useProofing((state) => state.setNotice)
  const setError = useProofing((state) => state.setError)
  const setSynonyms = useProofing((state) => state.setSynonyms)
  const setTranslation = useProofing((state) => state.setTranslation)
  const setRequestId = useProofing((state) => state.setRequestId)
  const setKeysOpen = useAiSettings((state) => state.setKeysOpen)
  const requestRef = useRef("")
  const rangeRef = useRef({ from: 0, to: 0, text: "", whole: false })

  if (!open) {
    return null
  }

  function rememberRange() {
    if (!editor) {
      rangeRef.current = { from: 0, to: 0, text: "", whole: false }
      return ""
    }
    const { from, to, empty } = editor.state.selection
    if (open === "translation" && empty) {
      const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n")
      rangeRef.current = { from: 0, to: editor.state.doc.content.size, text, whole: true }
      return text
    }
    const text = editor.state.doc.textBetween(from, to, "\n")
    rangeRef.current = { from, to, text, whole: false }
    return text
  }

  function stop() {
    if (requestRef.current) {
      cancelAiRequest(requestRef.current)
    }
    requestRef.current = ""
    setRequestId("")
    setRunning(false)
  }

  async function run() {
    if (!editor || !open) {
      return
    }
    const requestId = crypto.randomUUID()
    requestRef.current = requestId
    setRequestId(requestId)
    setRunning(true)
    setNotice("")
    setError("")
    setSynonyms([])
    setTranslation("")
    const text = rememberRange()
    try {
      if (open === "thesaurus") {
        const result = await requestSynonyms(text.trim(), requestId)
        if (requestRef.current !== requestId) {
          return
        }
        if (result.blocked) {
          setNotice(result.blocked)
          return
        }
        setSynonyms(result.synonyms)
        return
      }
      const result = await requestTranslation(text, useProofing.getState().language, requestId)
      if (requestRef.current !== requestId) {
        return
      }
      if (result.blocked) {
        setNotice(result.blocked)
        return
      }
      setTranslation(result.translation)
    } catch (caught) {
      if (requestRef.current === requestId) {
        setError(errorMessage(caught))
      }
    } finally {
      if (requestRef.current === requestId) {
        requestRef.current = ""
        setRequestId("")
        setRunning(false)
      }
    }
  }

  function insertSynonym(word: string) {
    if (!editor) {
      return
    }
    const range = rangeRef.current
    const max = editor.state.doc.content.size
    const from = Math.min(range.from, max)
    const to = Math.min(Math.max(range.to, from), max)
    const current = editor.state.doc.textBetween(from, to, "\n").trim()
    if (current !== range.text.trim()) {
      setError("The selection changed.")
      return
    }
    editor.chain().focus().setTextSelection({ from, to }).insertContent(word).run()
    closePanel()
  }

  function insertTranslation() {
    if (!editor || !translation) {
      return
    }
    const range = rangeRef.current
    const current = range.whole
      ? editor.state.doc.textBetween(0, editor.state.doc.content.size, "\n\n")
      : editor.state.doc.textBetween(
          Math.min(range.from, editor.state.doc.content.size),
          Math.min(range.to, editor.state.doc.content.size),
          "\n",
        )
    if (current !== range.text) {
      setError("The document changed.")
      return
    }
    if (range.whole) {
      const paragraphs = translation.split(/\n{2,}/).map((block) => {
        const line = block.trim()
        return line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" }
      })
      editor.chain().focus().selectAll().insertContent(paragraphs).run()
    } else {
      editor.chain().focus().setTextSelection({ from: range.from, to: range.to }).insertContent(translation).run()
    }
    closePanel()
  }

  const title = open === "thesaurus" ? "Thesaurus" : "Translate"
  const proofingLanguage = languageThesaurusName(documentLanguage)

  return (
    <DialogFrame title={title} width={420} onClose={() => closePanel()} level={60}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        <button
          type="button"
          aria-label="Close"
          className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
          onClick={closePanel}
        >
          <X className="size-4" />
        </button>
      </div>
      {open === "translation" ? (
        <label className="mb-3 flex items-center gap-2 text-xs text-neutral-600">
          Language
          <select
            aria-label="Translation language"
            value={language}
            disabled={running}
            className="h-7 rounded-md border border-black/10 bg-white px-1.5 text-xs text-neutral-900"
            onChange={(event) => setLanguage(event.target.value)}
          >
            {TRANSLATION_LANGUAGES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mb-3 text-xs text-neutral-500">Select one word, then look up {proofingLanguage} synonyms.</p>
      )}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white disabled:opacity-50"
          disabled={!editor || running}
          onClick={() => void run()}
        >
          {open === "thesaurus" ? "Find synonyms" : "Translate"}
        </button>
        {running ? (
          <button type="button" className="text-xs text-neutral-600 underline" onClick={stop}>
            Stop
          </button>
        ) : null}
      </div>
      {running ? <p className="text-xs text-neutral-500">Working…</p> : null}
      {notice ? (
        <div className="space-y-2">
          <p className="text-xs text-neutral-600">{notice}</p>
          <button type="button" className="text-xs text-neutral-800 underline" onClick={() => setKeysOpen(true)}>
            AI keys
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
      {synonyms.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {synonyms.map((word) => (
            <li key={word}>
              <button
                type="button"
                className="w-full rounded-md px-2 py-1.5 text-left text-sm text-neutral-800 hover:bg-neutral-100"
                onClick={() => insertSynonym(word)}
              >
                {word}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {translation ? (
        <div className="mt-2 space-y-2">
          <p className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-neutral-50 p-2 text-sm text-neutral-800">
            {translation}
          </p>
          <button
            type="button"
            className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
            onClick={insertTranslation}
          >
            Insert
          </button>
        </div>
      ) : null}
    </DialogFrame>
  )
}
