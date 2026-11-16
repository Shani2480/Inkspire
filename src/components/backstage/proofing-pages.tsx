import { useAutoCorrectDialog } from "@/components/autocorrect-dialog"
import { useProofingDialogs } from "@/components/proofing-dialogs"
import { useEditingOptions } from "@/document/editing-options"
import { getDocumentEditor } from "@/document/editor-ref"
import { useLanguageSettings } from "@/document/language-settings"
import { languageLabel } from "@/document/languages"
import { useProofingExceptions } from "@/document/proofing-exceptions"
import { useDocumentStore } from "@/document/store"
import { useViewStore } from "@/document/view"
import { refreshDisplayedMarks } from "@/editor/display-refresh"
import { useEditorPane } from "@/editor/grammar"
import { recheckDocument } from "@/editor/spellcheck"
import { useState } from "react"

function Check({ checked, onChange, children }: { checked: boolean; onChange: (on: boolean) => void; children: string }) {
  return (
    <label className="backstage-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {children}
    </label>
  )
}

/** Options > Proofing, in Word's sections. */
export function ProofingPage() {
  const editing = useEditingOptions()
  const spellCheck = useViewStore((state) => state.spellCheck)
  const setSpellCheck = useViewStore((state) => state.setSpellCheck)
  const checkGrammar = useEditorPane((state) => state.checkGrammar)
  const confusedWords = useEditorPane((state) => state.confusedWords)
  const paneGrammar = useEditorPane((state) => state.paneGrammar)
  const hideSpelling = useProofingExceptions((state) => state.hideSpelling)
  const hideGrammar = useProofingExceptions((state) => state.hideGrammar)
  const fileName = useDocumentStore((state) => state.fileName)
  const [confirmRecheck, setConfirmRecheck] = useState(false)
  const [rechecked, setRechecked] = useState(false)
  const pane = useEditorPane.getState()
  return (
    <section className="backstage-card">
      <h2 className="backstage-card-title">Proofing</h2>
      <h3 className="options-sub">AutoCorrect options</h3>
      <div className="options-row">
        <span className="backstage-muted">Change how Inkspire corrects and formats text as you type:</span>
        <button type="button" className="dialog-btn" onClick={() => useAutoCorrectDialog.getState().show()}>
          AutoCorrect Options…
        </button>
      </div>

      <h3 className="options-sub">When correcting spelling</h3>
      {(
        [
          ["ignoreUppercase", "Ignore words in UPPERCASE"],
          ["ignoreNumbers", "Ignore words that contain numbers"],
          ["ignoreAddresses", "Ignore Internet and file addresses"],
          ["flagRepeated", "Flag repeated words"],
          ["mainDictionaryOnly", "Suggest from main dictionary only"],
        ] as const
      ).map(([name, label]) => (
        <Check key={name} checked={editing[name]} onChange={(on) => editing.set({ [name]: on })}>
          {label}
        </Check>
      ))}
      <button type="button" className="dialog-btn options-inline-btn" onClick={() => useProofingDialogs.getState().show("dictionaries")}>
        Custom Dictionaries…
      </button>

      <h3 className="options-sub">When correcting spelling and grammar in Inkspire</h3>
      <Check checked={spellCheck} onChange={setSpellCheck}>
        Check spelling as you type
      </Check>
      <Check checked={checkGrammar} onChange={(on) => pane.setCheckGrammar(on)}>
        Mark grammar errors as you type
      </Check>
      <Check checked={confusedWords} onChange={(on) => pane.setGrammarOptions({ confusedWords: on })}>
        Frequently confused words
      </Check>
      <Check checked={paneGrammar} onChange={(on) => pane.setGrammarOptions({ paneGrammar: on })}>
        Check grammar and refinements in the Editor Pane
      </Check>
      <Check checked={editing.readability} onChange={(on) => editing.set({ readability: on })}>
        Show readability statistics (in Word Count)
      </Check>
      <div className="options-row">
        <span>
          Writing Style: <strong>Grammar</strong>
        </span>
        <button type="button" className="dialog-btn" onClick={() => useProofingDialogs.getState().show("grammar")}>
          Settings…
        </button>
      </div>
      {confirmRecheck ? (
        <div className="options-confirm" role="alert">
          <p>
            This resets the spelling and grammar checker, so words and grammar you chose to ignore are checked again.
            Do you want to continue?
          </p>
          <div className="options-row">
            <button
              type="button"
              className="dialog-btn is-primary"
              onClick={() => {
                recheckDocument()
                pane.clearIgnored()
                const editor = getDocumentEditor()
                if (editor && !editor.isDestroyed) {
                  refreshDisplayedMarks(editor)
                }
                setConfirmRecheck(false)
                setRechecked(true)
              }}
            >
              Yes
            </button>
            <button type="button" className="dialog-btn" onClick={() => setConfirmRecheck(false)}>
              No
            </button>
          </div>
        </div>
      ) : (
        <div className="options-row">
          <button
            type="button"
            className="dialog-btn"
            onClick={() => {
              setRechecked(false)
              setConfirmRecheck(true)
            }}
          >
            Recheck Document
          </button>
          {rechecked ? <span className="backstage-muted">Ignored words and grammar are checked again.</span> : null}
        </div>
      )}

      <h3 className="options-sub">Exceptions for: {fileName}</h3>
      <Check checked={hideSpelling} onChange={(on) => useProofingExceptions.getState().set({ hideSpelling: on })}>
        Hide spelling errors in this document only
      </Check>
      <Check checked={hideGrammar} onChange={(on) => useProofingExceptions.getState().set({ hideGrammar: on })}>
        Hide grammar errors in this document only
      </Check>
    </section>
  )
}

/** Options > Language: the display language and the authoring (proofing) languages. */
export function LanguagePage({ locale, dateFormat }: { locale: string; dateFormat: string }) {
  const authoring = useLanguageSettings((state) => state.authoring)
  const chosen = useLanguageSettings((state) => state.chosen)
  const replace = useLanguageSettings((state) => state.replace)
  const [selected, setSelected] = useState(authoring[0])
  const current = authoring.includes(selected!) ? selected! : authoring[0]!
  return (
    <section className="backstage-card">
      <h2 className="backstage-card-title">Language</h2>
      <h3 className="options-sub">Display language</h3>
      <p className="backstage-muted">The language of buttons, menus and other controls.</p>
      <div className="options-language-list" role="listbox" aria-label="Display language">
        <div role="option" aria-selected className="options-language-item is-selected">
          <span>1. English</span>
          <span className="backstage-muted">Preferred</span>
        </div>
      </div>
      <p className="backstage-muted">Inkspire&rsquo;s menus and dialogs are in English only for now.</p>

      <h3 className="options-sub">Authoring languages and proofing</h3>
      <p className="backstage-muted">
        The languages you write in. The preferred one checks the spelling and grammar of new documents.
      </p>
      <div className="options-language-layout">
        <div className="options-language-list" role="listbox" aria-label="Authoring languages">
          {authoring.map((id, index) => (
            <div
              key={id}
              role="option"
              aria-selected={id === current}
              className={`options-language-item${id === current ? " is-selected" : ""}`}
              onClick={() => setSelected(id)}
            >
              <span>
                {index + 1}. {languageLabel(id)}
              </span>
              <span className="backstage-muted">
                {index === 0 && chosen ? "Preferred · " : ""}Proofing installed
              </span>
            </div>
          ))}
        </div>
        <div className="options-language-buttons">
          <button type="button" className="dialog-btn" onClick={() => useProofingDialogs.getState().show("add-language")}>
            Add a Language…
          </button>
          <button
            type="button"
            className="dialog-btn"
            disabled={authoring.length < 2}
            onClick={() => replace(authoring.filter((id) => id !== current), chosen)}
          >
            Remove
          </button>
          <button
            type="button"
            className="dialog-btn"
            disabled={chosen && current === authoring[0]}
            onClick={() => replace([current, ...authoring.filter((id) => id !== current)], true)}
          >
            Set as Preferred
          </button>
        </div>
      </div>
      <dl className="backstage-defaults">
        <dt>Regional format</dt>
        <dd>{locale || "Not set"}</dd>
        <dt>Date format</dt>
        <dd>{dateFormat || "Not set"}</dd>
      </dl>
      <p className="backstage-muted">The regional and date formats come from the first-run setup; run it again to change them.</p>
    </section>
  )
}
