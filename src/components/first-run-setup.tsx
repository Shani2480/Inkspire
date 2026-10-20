import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { formatBytes } from "@/ai/local"
import { useHelperTools } from "@/document/helper-tools"
import { useDocumentStore } from "@/document/store"
import {
  DATE_FORMAT_OPTIONS,
  LOCALE_OPTIONS,
  detectSettings,
  formatWithPattern,
  initialsOf,
  type SystemFacts,
  useUserSettings,
} from "@/document/user-settings"
import { isTauriRuntime } from "@/lib/platform"
import { invoke } from "@tauri-apps/api/core"
import { useEffect, useState } from "react"

const SAMPLE_DAY = new Date(2026, 0, 31)

type Draft = {
  author: string
  /** Asked for when the system gave no name: the author is then these two. */
  firstName: string
  lastName: string
  initials: string
  locale: string
  dateFormat: string
  decimalSeparator: string
  groupSeparator: string
}

/** What the system offers: the desktop session's environment in the app, the browser's own locale anywhere. */
async function systemFacts(): Promise<SystemFacts> {
  const intlLocale = typeof navigator === "undefined" ? undefined : navigator.language
  if (!isTauriRuntime()) {
    return { intlLocale }
  }
  try {
    return { ...(await invoke<SystemFacts>("system_defaults")), intlLocale }
  } catch {
    return { intlLocale }
  }
}

/**
 * The first-run setup (21.42): confirms the author, locale, date format and number format, starting from what the
 * system offers and leaving blank what it does not. Shown once; "Run setup again" in File → Info reopens it.
 */
export function FirstRunSetup() {
  const done = useUserSettings((state) => state.setupDone)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [custom, setCustom] = useState({ locale: false, dateFormat: false })
  // The system's name is shown as one field to confirm; with none, the person is asked for a first and last name.
  const [askName, setAskName] = useState(false)
  // The helper programs are the person's choice: nothing is downloaded unless it is ticked.
  const helpers = useHelperTools((state) => state.tools).filter((tool) => tool.supported && tool.source === "missing")
  const [wanted, setWanted] = useState<string[]>([])

  useEffect(() => {
    if (done) {
      setDraft(null)
      return
    }
    let cancelled = false
    void useHelperTools.getState().refresh()
    void systemFacts().then((facts) => {
      if (cancelled) {
        return
      }
      const stored = useUserSettings.getState()
      const found = detectSettings(facts)
      // What the person already has (an author typed before this setup existed) is kept over a guess.
      const author = stored.author || useDocumentStore.getState().documentProps.author || found.author
      setAskName(!author)
      setDraft({
        author,
        firstName: "",
        lastName: "",
        initials: stored.initials || initialsOf(author) || found.initials,
        locale: stored.locale || found.locale,
        dateFormat: stored.dateFormat || found.dateFormat,
        decimalSeparator: stored.decimalSeparator || found.decimalSeparator,
        groupSeparator: stored.groupSeparator || found.groupSeparator,
      })
    })
    return () => {
      cancelled = true
    }
  }, [done])

  if (done || !draft) {
    return null
  }

  const set = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    // Initials follow the name while the person has not typed their own.
    const nameOf = (value: Draft) => (askName ? `${value.firstName} ${value.lastName}` : value.author).trim()
    if (
      ("firstName" in patch || "lastName" in patch || "author" in patch) &&
      draft.initials === initialsOf(nameOf(draft))
    ) {
      next.initials = initialsOf(nameOf(next))
    }
    setDraft(next)
  }
  const confirm = () => {
    const named = askName ? `${draft.firstName.trim()} ${draft.lastName.trim()}`.trim() : draft.author.trim()
    const values = {
      locale: draft.locale,
      dateFormat: draft.dateFormat,
      decimalSeparator: draft.decimalSeparator,
      groupSeparator: draft.groupSeparator,
      author: named,
      initials: draft.initials.trim() || initialsOf(named),
    }
    useUserSettings.getState().confirm(values)
    if (wanted.length > 0) {
      void useHelperTools.getState().install(wanted)
    }
    if (values.author) {
      useDocumentStore.getState().setDocumentProps({ author: values.author })
    }
  }
  const OTHER = "\u0000other"
  const choice = (id: string, label: string, key: "locale" | "dateFormat", options: string[], example: string) => {
    const value = draft[key]
    // A detected value the list lacks is kept as an entry of its own.
    const list = value && !options.includes(value) ? [value, ...options] : options
    const typing = custom[key]
    return (
      <div className="first-run-row">
        <label className="text-prompt-label" htmlFor={`first-run-${id}`}>
          {label}
        </label>
        {typing ? (
          <input
            id={`first-run-${id}`}
            className="text-prompt-field"
            type="text"
            value={value}
            placeholder={example}
            onChange={(event) => set({ [key]: event.target.value })}
          />
        ) : (
          <select
            id={`first-run-${id}`}
            className="text-prompt-field"
            value={value}
            onChange={(event) => {
              if (event.target.value === OTHER) {
                setCustom({ ...custom, [key]: true })
                set({ [key]: "" })
              } else {
                set({ [key]: event.target.value })
              }
            }}
          >
            {value ? null : <option value="">Choose…</option>}
            {list.map((option) => (
              <option key={option} value={option}>
                {key === "dateFormat" ? `${option}  (${formatWithPattern(SAMPLE_DAY, option, draft.locale)})` : option}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
        )}
      </div>
    )
  }
  const field = (id: string, label: string, key: keyof Draft, placeholder: string, width?: number) => (
    <div className="first-run-row">
      <label className="text-prompt-label" htmlFor={`first-run-${id}`}>
        {label}
      </label>
      <input
        id={`first-run-${id}`}
        className="text-prompt-field"
        type="text"
        style={width ? { width } : undefined}
        value={draft[key]}
        placeholder={placeholder}
        onChange={(event) => set({ [key]: event.target.value })}
      />
    </div>
  )

  return (
    <DialogFrame
      title="Welcome to Inkspire"
      width={440}
      level={140}
      onClose={() => useUserSettings.getState().skip()}
      onSubmit={confirm}
    >
      <p className="first-run-intro">
        Confirm these once. They are filled in from your system where it tells us, and you can change them later.
        Nothing is stored anywhere else.
      </p>
      {askName ? (
        <>
          {field("first-name", "First name", "firstName", "Your first name")}
          {field("last-name", "Last name", "lastName", "Your last name")}
        </>
      ) : (
        field("author", "Author name", "author", "Your name")
      )}
      {field("initials", "Initials", "initials", "Your initials", 90)}
      {choice("locale", "Language and region", "locale", LOCALE_OPTIONS, "For example en-GB")}
      {choice("date", "Date format", "dateFormat", DATE_FORMAT_OPTIONS, "For example dd/MM/yyyy")}
      <div className="first-run-pair">
        {field("decimal", "Decimal separator", "decimalSeparator", "For example .", 120)}
        {field("group", "Thousands separator", "groupSeparator", "For example ,", 120)}
      </div>
      {helpers.length > 0 ? (
        <fieldset className="first-run-row">
          <legend className="text-prompt-label">Optional downloads</legend>
          <p className="first-run-intro">
            These free programs are not part of Inkspire. Tick the ones you want and they download in the background;
            otherwise you are asked when a feature needs one.
          </p>
          {helpers.map((tool) => (
            <label key={tool.id} className="word-dialog-check">
              <input
                type="checkbox"
                checked={wanted.includes(tool.id)}
                onChange={(event) =>
                  setWanted(event.target.checked ? [...wanted, tool.id] : wanted.filter((id) => id !== tool.id))
                }
              />
              <span>
                {tool.label} ({formatBytes(tool.size)}) — {tool.purpose}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <DialogButtons submit ok="Continue" cancel="Skip" onCancel={() => useUserSettings.getState().skip()} />
    </DialogFrame>
  )
}
