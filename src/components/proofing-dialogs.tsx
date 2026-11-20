import { DialogButtons, DialogFrame, Label } from "@/components/word-dialog"
import { DOCUMENT_LANGUAGES, languageLabel, type DocumentLanguageId } from "@/document/languages"
import { useLanguageSettings } from "@/document/language-settings"
import {
  newDictionary,
  normalizeWord,
  readDicFile,
  useCustomDictionaries,
  type CustomDictionary,
} from "@/editor/custom-dictionaries"
import { GRAMMAR_RULES } from "@/editor/grammar-rules"
import { useEditorPane } from "@/editor/grammar"
import { openLocalFile } from "@/lib/file-io"
import { useState } from "react"
import { create } from "zustand"

/** The dialogs Options > Proofing and Options > Language open. */
type Open = "dictionaries" | "grammar" | "add-language" | null

export const useProofingDialogs = create<{ open: Open; show: (open: Open) => void }>((set) => ({
  open: null,
  show: (open) => set({ open }),
}))

export function ProofingDialogs() {
  const open = useProofingDialogs((state) => state.open)
  const close = () => useProofingDialogs.getState().show(null)
  if (open === "dictionaries") {
    return <CustomDictionariesDialog onClose={close} />
  }
  if (open === "grammar") {
    return <GrammarSettingsDialog onClose={close} />
  }
  if (open === "add-language") {
    return <AddLanguageDialog onClose={close} />
  }
  return null
}

function dictionaryLabel(dictionary: CustomDictionary, defaultId: string) {
  return `${dictionary.name}${dictionary.id === defaultId ? " (Default)" : ""}`
}

/** Word's Custom Dictionaries dialog. Changes apply on OK. */
function CustomDictionariesDialog({ onClose }: { onClose: () => void }) {
  const stored = useCustomDictionaries()
  const [dictionaries, setDictionaries] = useState(stored.dictionaries)
  const [defaultId, setDefaultId] = useState(stored.defaultId)
  const [selected, setSelected] = useState(stored.defaultId)
  const [naming, setNaming] = useState<string | null>(null)
  const [editing, setEditing] = useState<CustomDictionary | null>(null)
  const current = dictionaries.find((item) => item.id === selected) ?? dictionaries[0]
  const update = (id: string, patch: Partial<CustomDictionary>) =>
    setDictionaries((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  const add = (dictionary: CustomDictionary) => {
    setDictionaries((list) => [...list, dictionary])
    setSelected(dictionary.id)
  }
  if (editing) {
    return (
      <EditWordListDialog
        dictionary={editing}
        onClose={() => setEditing(null)}
        onSave={(words) => {
          update(editing.id, { words })
          setEditing(null)
        }}
      />
    )
  }
  return (
    <DialogFrame
      title="Custom Dictionaries"
      width={560}
      level={110}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        stored.replace(dictionaries, defaultId)
        onClose()
      }}
    >
      <div className="dictionaries-layout">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">Dictionary List</p>
          <div className="dictionaries-list" role="listbox" aria-label="Dictionary List">
            {dictionaries.map((item) => (
              <div
                key={item.id}
                role="option"
                aria-selected={item.id === current?.id}
                className={`dictionaries-item${item.id === current?.id ? " is-selected" : ""}`}
                onClick={() => setSelected(item.id)}
              >
                <input
                  type="checkbox"
                  aria-label={`Use ${item.name}`}
                  checked={item.enabled}
                  onChange={(event) => update(item.id, { enabled: event.target.checked })}
                />
                <span className="min-w-0 truncate">
                  {dictionaryLabel(item, defaultId)}
                  {item.language !== "all" ? ` – ${languageLabel(item.language)}` : ""}
                </span>
              </div>
            ))}
          </div>
          {current ? (
            <>
              <p className="dictionaries-meta">
                {current.words.length === 1 ? "1 word" : `${current.words.length} words`}, kept by Inkspire on this
                computer.
              </p>
              <div className="dictionaries-language">
                <Label htmlFor="dictionary-language" text="Dictionary language:" letter="l" />
                <select
                  id="dictionary-language"
                  value={current.language}
                  onChange={(event) =>
                    update(current.id, { language: event.target.value as CustomDictionary["language"] })
                  }
                >
                  <option value="all">All Languages</option>
                  {DOCUMENT_LANGUAGES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          {naming !== null ? (
            <div className="dictionaries-name">
              <Label htmlFor="dictionary-name" text="New dictionary name:" letter="N" />
              <input
                id="dictionary-name"
                className="word-dialog-text"
                autoFocus
                data-own-escape
                value={naming}
                onChange={(event) => setNaming(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    if (naming.trim()) {
                      add(newDictionary(naming.trim()))
                    }
                    setNaming(null)
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    setNaming(null)
                  }
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="dictionaries-buttons">
          <button
            type="button"
            className="dialog-btn"
            disabled={!current}
            onClick={() => current && setEditing(current)}
          >
            Edit Word List…
          </button>
          <button
            type="button"
            className="dialog-btn"
            disabled={!current || current.id === defaultId}
            onClick={() => current && setDefaultId(current.id)}
          >
            Change Default
          </button>
          <button type="button" className="dialog-btn" onClick={() => setNaming("")}>
            New…
          </button>
          <button
            type="button"
            className="dialog-btn"
            onClick={async () => {
              const file = await openLocalFile(
                [{ name: "Dictionary files", extensions: ["dic", "txt"] }],
                "Add Custom Dictionary",
              ).catch(() => null)
              if (file) {
                const name = (file.name || file.path || "CUSTOM.DIC").split(/[/\\]/).pop()!
                add(newDictionary(name, readDicFile(file.bytes)))
              }
            }}
          >
            Add…
          </button>
          <button
            type="button"
            className="dialog-btn"
            disabled={!current || dictionaries.length < 2}
            onClick={() => {
              if (!current) {
                return
              }
              const rest = dictionaries.filter((item) => item.id !== current.id)
              setDictionaries(rest)
              setSelected(rest[0]!.id)
              if (defaultId === current.id) {
                setDefaultId(rest[0]!.id)
              }
            }}
          >
            Remove
          </button>
        </div>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/** Edit Word List…: the dictionary's words, to add to and delete from. */
function EditWordListDialog({
  dictionary,
  onClose,
  onSave,
}: {
  dictionary: CustomDictionary
  onClose: () => void
  onSave: (words: string[]) => void
}) {
  const [words, setWords] = useState(dictionary.words)
  const [word, setWord] = useState("")
  const [selected, setSelected] = useState<string | null>(null)
  const addWord = () => {
    const clean = normalizeWord(word)
    if (clean && !words.includes(clean)) {
      setWords((list) => [...list, clean].sort((a, b) => a.localeCompare(b)))
    }
    setWord("")
  }
  return (
    <DialogFrame
      title={dictionary.name}
      width={380}
      level={120}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        onSave(words)
      }}
    >
      <Label htmlFor="word-list-word" text="Word(s):" letter="W" />
      <div className="word-list-add">
        <input
          id="word-list-word"
          className="word-dialog-text"
          autoFocus
          value={word}
          onChange={(event) => setWord(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              addWord()
            }
          }}
        />
        <button type="button" className="dialog-btn" disabled={!normalizeWord(word)} onClick={addWord}>
          Add
        </button>
      </div>
      <p className="mt-2 text-[13px]">Dictionary:</p>
      <div className="word-list-box" role="listbox" aria-label="Dictionary">
        {words.map((item) => (
          <div
            key={item}
            role="option"
            aria-selected={item === selected}
            className={`word-list-item${item === selected ? " is-selected" : ""}`}
            onClick={() => setSelected(item)}
          >
            {item}
          </div>
        ))}
      </div>
      <div className="word-list-actions">
        <button
          type="button"
          className="dialog-btn"
          disabled={!selected}
          onClick={() => {
            setWords((list) => list.filter((item) => item !== selected))
            setSelected(null)
          }}
        >
          Delete
        </button>
        <button type="button" className="dialog-btn" disabled={!words.length} onClick={() => setWords([])}>
          Delete all
        </button>
      </div>
      <DialogButtons submit onCancel={onClose} />
    </DialogFrame>
  )
}

/** Grammar Settings: the rule groups checked as you type and in the Editor pane. */
function GrammarSettingsDialog({ onClose }: { onClose: () => void }) {
  const rulesOff = useEditorPane((state) => state.rulesOff)
  const confusedWords = useEditorPane((state) => state.confusedWords)
  const [off, setOff] = useState(rulesOff)
  const [confused, setConfused] = useState(confusedWords)
  return (
    <DialogFrame
      title="Grammar Settings"
      width={400}
      level={110}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        useEditorPane.getState().setGrammarOptions({ rulesOff: off, confusedWords: confused })
        onClose()
      }}
    >
      <p className="text-[13px]">
        Writing style: <strong>Grammar</strong>
      </p>
      <p className="mt-2 text-[13px] font-semibold">Options</p>
      <div className="grammar-settings-list">
        {GRAMMAR_RULES.map((rule) => (
          <label key={rule.kind} className="word-dialog-check">
            <input
              type="checkbox"
              checked={!off.includes(rule.kind)}
              onChange={(event) =>
                setOff((list) =>
                  event.target.checked ? list.filter((kind) => kind !== rule.kind) : [...list, rule.kind],
                )
              }
            />
            <span>{rule.label}</span>
          </label>
        ))}
        <label className="word-dialog-check">
          <input type="checkbox" checked={confused} onChange={(event) => setConfused(event.target.checked)} />
          <span>Frequently confused words (its / it&rsquo;s, then / than, could of…)</span>
        </label>
      </div>
      <DialogButtons submit onCancel={onClose}>
        <button
          type="button"
          className="dialog-btn"
          onClick={() => {
            setOff([])
            setConfused(true)
          }}
        >
          Reset All
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}

/** Options > Language > Add a Language…: one more authoring and proofing language. */
function AddLanguageDialog({ onClose }: { onClose: () => void }) {
  const authoring = useLanguageSettings((state) => state.authoring)
  const chosen = useLanguageSettings((state) => state.chosen)
  const left = DOCUMENT_LANGUAGES.filter((item) => !authoring.includes(item.id))
  const [pick, setPick] = useState<DocumentLanguageId | null>(left[0]?.id ?? null)
  const [preferred, setPreferred] = useState(false)
  return (
    <DialogFrame
      title="Add an authoring language"
      width={380}
      level={110}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        if (pick) {
          useLanguageSettings
            .getState()
            .replace(preferred ? [pick, ...authoring] : [...authoring, pick], preferred || chosen)
        }
        onClose()
      }}
    >
      {left.length ? (
        <>
          <div className="word-list-box" role="listbox" aria-label="Languages">
            {left.map((item) => (
              <div
                key={item.id}
                role="option"
                aria-selected={item.id === pick}
                className={`word-list-item${item.id === pick ? " is-selected" : ""}`}
                onClick={() => setPick(item.id)}
              >
                {item.label}
              </div>
            ))}
          </div>
          <label className="word-dialog-check mt-2">
            <input type="checkbox" checked={preferred} onChange={(event) => setPreferred(event.target.checked)} />
            <span>Set as your preferred authoring language</span>
          </label>
        </>
      ) : (
        <p className="text-[13px]">Every language with proofing tools is already in your list.</p>
      )}
      <DialogButtons submit ok="Add" okDisabled={!pick} onCancel={onClose} />
    </DialogFrame>
  )
}
