import { Check, DialogButtons, DialogFrame, Keyed, SpinField } from "@/components/word-dialog"
import { useEditingOptions } from "@/document/editing-options"
import {
  DOCUMENT_LANGUAGES,
  languageName,
  normalizeDocumentLanguage,
  proofingLanguage,
  wordLanguageTag,
} from "@/document/languages"
import { useStatusBar } from "@/document/status-bar"
import { useDocumentStore } from "@/document/store"
import { clampZoom, useViewStore, type PageView } from "@/document/view"
import { proofingAt, setProofing } from "@/editor/proofing"
import { countStats } from "@/editor/word-count"
import { readability } from "@/lib/readability"
import type { Editor } from "@tiptap/core"
import { useMemo, useState } from "react"

const number = (value: number) => value.toLocaleString()

/**
 * Word's Word Count (Review > Word Count, or a click on the word count in the status bar): the selection's
 * statistics when text is selected, the document's otherwise.
 */
export function WordCountDialog({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const extras = useStatusBar((state) => state.countExtras)
  const setExtras = useStatusBar((state) => state.setCountExtras)
  const stats = useMemo(
    () => (editor && !editor.isDestroyed ? countStats(editor, { extras, lines: true }) : null),
    [editor, extras],
  )
  const showReadability = useEditingOptions((state) => state.readability)
  const scores = showReadability
    ? readability(editor?.state.doc.textBetween(0, editor.state.doc.content.size, "\n", " ") ?? "")
    : null
  const rows: [string, number][] = [
    ["Pages", stats?.pages ?? 0],
    ["Words", stats?.words ?? 0],
    ["Characters (no spaces)", stats?.characters ?? 0],
    ["Characters (with spaces)", stats?.charactersWithSpaces ?? 0],
    ["Paragraphs", stats?.paragraphs ?? 0],
    ["Lines", stats?.lines ?? 0],
  ]
  return (
    <DialogFrame title="Word Count" width={320} onClose={onClose} onSubmit={onClose}>
      <div className="status-dialog">
        <p className="status-dialog-heading">Statistics:</p>
        <dl className="word-count-table">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{number(value)}</dd>
            </div>
          ))}
        </dl>
        {showReadability ? (
          <dl aria-label="Readability" className="word-count-table">
            <div>
              <dt>Sentences</dt>
              <dd>{scores?.sentences ?? 0}</dd>
            </div>
            <div>
              <dt>Flesch Reading Ease</dt>
              <dd>{scores?.ease ?? "—"}</dd>
            </div>
            <div>
              <dt>Flesch-Kincaid Grade Level</dt>
              <dd>{scores?.grade ?? "—"}</dd>
            </div>
          </dl>
        ) : null}
        <Check
          id="word-count-extras"
          text="Include textboxes, footnotes and endnotes"
          letter="f"
          checked={extras}
          onChange={setExtras}
        />
      </div>
      <div className="word-dialog-actions">
        <span className="flex-1" />
        <button type="submit" className="dialog-btn is-primary">
          Close
        </button>
      </div>
    </DialogFrame>
  )
}

type ZoomChoice = "200" | "100" | "75" | "width" | "page" | "many" | "percent"

/**
 * Word's Zoom dialog (View > Zoom, or a click on the zoom percentage). Left out: Text width, which needs the page
 * scrolled sideways to its text, which the canvas does not do.
 */
export function ZoomDialog({ onClose }: { onClose: () => void }) {
  const view = useViewStore.getState()
  const [percent, setPercent] = useState(String(Math.round(view.zoom * 100)))
  const [choice, setChoice] = useState<ZoomChoice>(() =>
    view.zoomMode === "width"
      ? "width"
      : view.zoomMode === "page"
        ? "page"
        : view.pageView > 1
          ? "many"
          : ((["200", "100", "75"] as const).find((level) => Number(level) === Math.round(view.zoom * 100)) ??
            "percent"),
  )
  const [pages, setPages] = useState<PageView>(view.pageView > 1 ? view.pageView : 2)
  const pick = (next: ZoomChoice) => {
    setChoice(next)
    if (next === "200" || next === "100" || next === "75") {
      setPercent(next)
    }
  }
  const apply = () => {
    const store = useViewStore.getState()
    if (choice === "width" || choice === "page") {
      store.setPageView(1)
      store.setZoomMode(choice)
    } else if (choice === "many") {
      store.setPageView(pages)
    } else {
      store.setPageView(1)
      store.setZoom(clampZoom(Number(percent) / 100))
    }
    onClose()
  }
  const radio = (id: ZoomChoice, text: string, letter: string) => (
    <label className="word-dialog-check">
      <input type="radio" name="zoom-to" checked={choice === id} onChange={() => pick(id)} />
      <span>
        <Keyed text={text} letter={letter} />
      </span>
    </label>
  )
  const scale = Math.min(2, Math.max(0.5, Number(percent) / 100 || 1))
  return (
    <DialogFrame title="Zoom" width={400} onClose={onClose} onSubmit={apply}>
      <div className="status-dialog">
        <fieldset className="zoom-dialog-to">
          <legend>Zoom to</legend>
          <div className="zoom-dialog-grid">
            {radio("200", "200%", "2")}
            {radio("width", "Page width", "P")}
            {radio("many", "Many pages:", "M")}
            {radio("100", "100%", "1")}
            <span />
            <select
              aria-label="Many pages"
              value={pages}
              onChange={(event) => {
                setPages(Number(event.target.value) as PageView)
                setChoice("many")
              }}
            >
              <option value={2}>2 pages</option>
              <option value={4}>4 pages</option>
              <option value={8}>8 pages</option>
            </select>
            {radio("75", "75%", "7")}
            {radio("page", "Whole page", "W")}
          </div>
        </fieldset>
        <div className="zoom-dialog-lower">
          <div className="zoom-dialog-percent">
            <label htmlFor="zoom-percent">
              <Keyed text="Percent:" letter="E" />
            </label>
            <SpinField
              id="zoom-percent"
              value={percent}
              unit="%"
              step={10}
              min={50}
              max={200}
              onChange={(value) => {
                setPercent(value)
                setChoice("percent")
              }}
            />
          </div>
          <fieldset className="zoom-dialog-preview" aria-label="Preview">
            <legend>Preview</legend>
            <div className="zoom-dialog-sample" data-keep-light>
              <span style={{ fontSize: `${11 * scale}px` }}>AaBbCcDdEeXxYyZz</span>
            </div>
          </fieldset>
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/**
 * Word's Language dialog (Review > Language > Set Proofing Language, or a click on the language in the status bar):
 * marks the selection (or the word at the caret) with a language, or as not to be checked. Set As Default changes
 * the document's own language. Left out: Detect language automatically (the app does not detect languages).
 */
export function LanguageDialog({ editor, onClose }: { editor: Editor | null; onClose: () => void }) {
  const setup = useDocumentStore((state) => state.pageSetup)
  const setPageSetup = useDocumentStore((state) => state.setPageSetup)
  const documentTag = wordLanguageTag(normalizeDocumentLanguage(setup.language))
  const start = editor && !editor.isDestroyed ? proofingAt(editor.state) : { lang: null, noProof: false }
  const [tag, setTag] = useState(start.lang ?? documentTag)
  const [noProof, setNoProof] = useState(start.noProof)
  const [confirm, setConfirm] = useState(false)
  const choices = useMemo(() => {
    const own: { tag: string; label: string; proofed: boolean }[] = DOCUMENT_LANGUAGES.map((item) => ({
      tag: wordLanguageTag(item.id),
      label: item.label,
      proofed: true,
    }))
    const current = start.lang
    if (current && !own.some((item) => item.tag.toLowerCase() === current.toLowerCase())) {
      own.push({ tag: current, label: languageName(current), proofed: proofingLanguage(current) !== null })
    }
    return own.sort((left, right) => left.label.localeCompare(right.label))
  }, [start.lang])
  const selected = choices.find((item) => item.tag.toLowerCase() === tag.toLowerCase())
  const apply = () => {
    if (editor && !editor.isDestroyed) {
      setProofing(editor, { lang: tag, noProof })
      editor.commands.focus()
    }
    onClose()
  }
  return (
    <DialogFrame title="Language" width={380} onClose={onClose} onSubmit={apply}>
      <div className="status-dialog">
        <label htmlFor="language-list" className="status-dialog-heading">
          <Keyed text="Mark selected text as:" letter="M" />
        </label>
        <div id="language-list" role="listbox" aria-label="Mark selected text as" className="language-dialog-list">
          {choices.map((item) => (
            <button
              key={item.tag}
              type="button"
              role="option"
              aria-selected={item.tag === selected?.tag}
              className="language-dialog-item"
              onClick={() => setTag(item.tag)}
              onDoubleClick={() => {
                setTag(item.tag)
                if (editor && !editor.isDestroyed) {
                  setProofing(editor, { lang: item.tag, noProof })
                }
                onClose()
              }}
            >
              <span className="language-dialog-proofed" aria-hidden>
                {item.proofed ? "✓" : ""}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <p className="status-dialog-note">
          The speller and other proofing tools automatically use dictionaries of the selected language, if available.
        </p>
        <Check
          id="language-no-proof"
          text="Do not check spelling or grammar"
          letter="N"
          checked={noProof}
          onChange={setNoProof}
        />
      </div>
      <DialogButtons submit onCancel={onClose}>
        <button type="button" className="dialog-btn" onClick={() => setConfirm(true)}>
          Set As Default
        </button>
      </DialogButtons>
      {confirm ? (
        <DialogFrame title="Language" width={400} level={90} onClose={() => setConfirm(false)}>
          <p className="mt-2 text-sm">
            Do you want to change the default language to {selected?.label ?? languageName(tag)}? This change affects
            this document and the spelling of text not marked with a language.
          </p>
          <DialogButtons
            ok="Yes"
            cancel="No"
            onOk={() => {
              const id = proofingLanguage(tag)
              if (id) {
                setPageSetup({ ...setup, language: id })
              }
              setConfirm(false)
            }}
            onCancel={() => setConfirm(false)}
          />
        </DialogFrame>
      ) : null}
    </DialogFrame>
  )
}
