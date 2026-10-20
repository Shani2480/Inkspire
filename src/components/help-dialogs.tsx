import { DialogFrame } from "@/components/word-dialog"
import { PROMPT_TIPS } from "@/ai/prompt-tips"
import { sendFeedback } from "@/document/feedback"
import { ISSUES_URL, PROJECT_URL, newIssueUrl, openExternal, useHelp } from "@/document/help"
import { commandShortcut, formattingMarksShortcut, isMacPlatform, isTauriRuntime } from "@/lib/platform"
import { useState } from "react"
import { version } from "../../package.json"

/** The windows the Help tab opens. Mounted once, beside the other app dialogs. */
export function HelpDialogs() {
  const dialog = useHelp((state) => state.dialog)
  const close = useHelp((state) => state.closeHelp)
  switch (dialog) {
    case "help":
      return <HelpTopicsDialog onClose={close} />
    case "support":
      return <SupportDialog onClose={close} />
    case "feedback":
      return <FeedbackDialog onClose={close} />
    case "shortcuts":
      return <ShortcutsDialog onClose={close} />
    case "whats-new":
      return <WhatsNewDialog onClose={close} />
    default:
      return null
  }
}

/** Short answers to the questions people ask first, searchable by their title and text. */
const HELP_TOPICS = [
  {
    title: "Open and save Word documents",
    text: "Open a .docx file with File > Open or Ctrl+O, and save it with Ctrl+S. Inkspire reads and writes Word's own format, so the document opens in Word with its styles, lists, tables, headers and footers.",
  },
  {
    title: "AutoSave and recovering a document",
    text: "AutoSave keeps a recovery copy while you work. If Inkspire closes before you save, it offers the copy the next time it starts. Saving still writes the document itself.",
  },
  {
    title: "Switch between the classic and single line ribbon",
    text: "Select the arrow at the bottom right of the ribbon and choose Classic ribbon or Single line ribbon. The single line ribbon shows the most used commands on one row; the rest are under More options (…).",
  },
  {
    title: "Add a table of contents",
    text: "Give your headings a Heading style, then choose References > Table of Contents. After editing, select the table and choose Update Table so the page numbers follow the text.",
  },
  {
    title: "Track changes and comments",
    text: "Turn on Review > Track Changes to mark every insertion and deletion. Accept or Reject them one at a time or all at once. Select text and choose New Comment to add a comment beside it.",
  },
  {
    title: "Headers, footers and page numbers",
    text: "Choose Insert > Header & Footer, or double-click the top or bottom of a page, to edit them. Insert > Page Numbers adds a number field at the top or bottom of every page.",
  },
  {
    title: "Write and rewrite with AI",
    text: "The AI Tools tab summarizes the document, rewrites the selection and chats about it. Choose a provider with AI Tools > AI Settings first (the built-in engine needs a one-time download). Ctrl+Shift+J opens the Template Builder for the selection.",
  },
  {
    title: "Write better AI requests",
    text: PROMPT_TIPS.join(" "),
  },
  {
    title: "Ask AI at the cursor",
    text: "Press the sparkle in the title bar to ask AI at the cursor or the selection. With text selected it works on that text and offers Replace or Insert below; with only a cursor it writes new text there. AI Tools > Chat keeps a conversation open beside the document.",
  },
  {
    title: "Zoom and page views",
    text: "Zoom with the slider in the status bar, Ctrl+wheel, a pinch, or View > Zoom. View > Multiple Pages shows several pages side by side; Page Width fits the page to the window.",
  },
  {
    title: "Dark mode and Office themes",
    text: "View > Dark Mode, or the moon at the top right, switches the app between light and dark. The page stays white, as it will print. View > Office Theme changes the accent colour.",
  },
]

function HelpTopicsDialog({ onClose }: { onClose: () => void }) {
  const openHelp = useHelp((state) => state.openHelp)
  const [query, setQuery] = useState("")
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const topics = HELP_TOPICS.filter((topic) => {
    const haystack = `${topic.title} ${topic.text}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
  return (
    <DialogFrame title="Help" width={480} onClose={onClose}>
      <input
        aria-label="Search help"
        placeholder="Search help"
        autoFocus
        value={query}
        className="mt-3 h-8 w-full rounded border border-[var(--popover-border)] bg-transparent px-2 text-sm"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="mt-2 flex h-72 flex-col gap-1 overflow-auto pr-1" aria-label="Help topics">
        {topics.length === 0 ? <p className="px-1 py-2 text-sm opacity-70">No topics match “{query.trim()}”.</p> : null}
        {topics.map((topic) => (
          <details key={topic.title} className="help-topic" open={words.length > 0 && topics.length === 1}>
            <summary>{topic.title}</summary>
            <p>{topic.text}</p>
          </details>
        ))}
      </div>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={() => openHelp("shortcuts")}>
          Keyboard Shortcuts
        </button>
        <button type="button" className="dialog-btn is-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}

/** What a report needs to reproduce a problem; nothing from the document. */
function diagnostics() {
  return [
    `Inkspire ${version}`,
    `App: ${isTauriRuntime() ? "desktop" : "web"}`,
    `Platform: ${navigator.platform || "unknown"}`,
    `Browser: ${navigator.userAgent}`,
  ].join("\n")
}

function SupportDialog({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <DialogFrame title="Contact Support" width={440} onClose={onClose}>
      <p className="mt-3 text-sm">
        Inkspire is supported through its project page. Search the existing issues, or open a new one describing what
        happened and the steps that lead to it.
      </p>
      <pre className="help-diagnostics" aria-label="Version details">
        {diagnostics()}
      </pre>
      <div className="word-dialog-actions">
        <button
          type="button"
          className="dialog-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(diagnostics()).then(() => setCopied(true))
          }}
        >
          {copied ? "Copied" : "Copy details"}
        </button>
        <button type="button" className="dialog-btn" onClick={() => void openExternal(ISSUES_URL)}>
          View issues
        </button>
        <button
          type="button"
          className="dialog-btn is-primary"
          onClick={() => {
            void openExternal(newIssueUrl("", `\n\n---\n${diagnostics()}`))
            onClose()
          }}
        >
          Report a problem
        </button>
      </div>
    </DialogFrame>
  )
}

const FEEDBACK_KINDS = [
  { id: "like", label: "I like something", prefix: "Like" },
  { id: "dislike", label: "I don't like something", prefix: "Problem" },
  { id: "suggestion", label: "I have a suggestion", prefix: "Suggestion" },
] as const

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<(typeof FEEDBACK_KINDS)[number]["id"]>("suggestion")
  const [text, setText] = useState("")
  const [withDetails, setWithDetails] = useState(false)
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle")
  const item = FEEDBACK_KINDS.find((entry) => entry.id === kind)
  const prefix = item?.prefix ?? "Feedback"
  const summary = text.trim().split("\n")[0].slice(0, 60)

  async function send() {
    if (!text.trim() || state === "sending") {
      return
    }
    setState("sending")
    try {
      await sendFeedback({
        kind: item?.label ?? prefix,
        message: text.trim(),
        version,
        details: withDetails ? diagnostics() : "",
      })
      setState("sent")
    } catch {
      setState("failed")
    }
  }

  return (
    <DialogFrame
      title="Feedback"
      width={440}
      onClose={onClose}
      onSubmit={(event) => {
        event.preventDefault()
        void send()
      }}
    >
      {state === "sent" ? (
        <p role="status" className="mt-3 text-sm">
          Sent. Thank you for telling us.
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-1.5 text-sm" role="radiogroup" aria-label="Kind of feedback">
            {FEEDBACK_KINDS.map((entry) => (
              <label key={entry.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="feedback-kind"
                  checked={kind === entry.id}
                  onChange={() => setKind(entry.id)}
                />
                {entry.label}
              </label>
            ))}
          </div>
          <textarea
            aria-label="Tell us more"
            placeholder="Tell us more"
            rows={5}
            value={text}
            className="mt-3 w-full resize-none rounded border border-[var(--popover-border)] bg-transparent p-2 text-sm"
            onChange={(event) => setText(event.target.value)}
          />
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={withDetails} onChange={(event) => setWithDetails(event.target.checked)} />
            Include version details
          </label>
          {withDetails ? (
            <pre className="help-diagnostics" aria-label="Details that will be sent">
              {diagnostics()}
            </pre>
          ) : null}
          <p className="mt-1 text-xs opacity-70">
            Only what you see here is sent, to the Inkspire feedback form. Nothing from your document is included.
          </p>
          {state === "failed" ? (
            <p role="alert" className="mt-1 text-xs text-red-700">
              Could not send. Check your connection, or open it on GitHub instead.
            </p>
          ) : null}
        </>
      )}
      <div className="word-dialog-actions">
        {state === "sent" ? null : (
          <button
            type="button"
            className="dialog-btn"
            disabled={!text.trim()}
            onClick={() => {
              void openExternal(newIssueUrl(`${prefix}: ${summary}`, `${text.trim()}\n\n---\nInkspire ${version}`))
              onClose()
            }}
          >
            Open on GitHub instead
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className="dialog-btn" onClick={onClose}>
          {state === "sent" ? "Close" : "Cancel"}
        </button>
        {state === "sent" ? null : (
          <button type="submit" className="dialog-btn is-primary" disabled={!text.trim() || state === "sending"}>
            {state === "sending" ? "Sending…" : "Send"}
          </button>
        )}
      </div>
    </DialogFrame>
  )
}

function shortcutGroups() {
  const key = commandShortcut
  return [
    {
      title: "Files",
      rows: [
        ["New", key("N")],
        ["Open", key("O")],
        ["Save", key("S")],
        ["Save As", key("S", true)],
        ["Print", key("P")],
        ["Close", key("W")],
      ],
    },
    {
      title: "Editing",
      rows: [
        ["Undo", key("Z")],
        ["Redo", key("Y")],
        ["Cut, Copy, Paste", `${key("X")}, ${key("C")}, ${key("V")}`],
        ["Select All", key("A")],
        ["Find", key("F")],
        ["Replace", key("H")],
        ["Go To", key("G")],
      ],
    },
    {
      title: "Formatting",
      rows: [
        ["Bold", key("B")],
        ["Italic", key("I")],
        ["Underline", key("U")],
        ["Align Left", key("L", true)],
        ["Center", key("E", true)],
        ["Align Right", key("R", true)],
        ["Justify", key("J", true)],
        ["Show/Hide ¶", formattingMarksShortcut()],
      ],
    },
    {
      title: "Insert",
      rows: [
        ["Page Break", key("Enter")],
        ["Column Break", key("Enter", true)],
      ],
    },
    {
      title: "View and tools",
      rows: [
        ["Zoom In", key("+")],
        ["Zoom Out", key("-")],
        ["Zoom to 100%", key("0")],
        ["Template Builder", key("J")],
        ["Collapse or Expand the Ribbon", key("F1")],
        ["Help", isMacPlatform ? "fn F1" : "F1"],
      ],
    },
  ]
}

function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="Keyboard Shortcuts" width={460} onClose={onClose}>
      <div className="mt-3 h-80 overflow-auto pr-1">
        {shortcutGroups().map((group) => (
          <section key={group.title} className="help-shortcuts">
            <h3>{group.title}</h3>
            <dl>
              {group.rows.map(([action, keys]) => (
                <div key={action}>
                  <dt>{action}</dt>
                  <dd>
                    <kbd>{keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn is-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}

/** Recent changes, newest first. */
const WHATS_NEW = [
  {
    title: "Single line ribbon",
    text: "A compact one-row ribbon, as in Word for the web, for Home, Insert, Layout, References, Review, View and Help. Choose it from the arrow at the bottom right of the ribbon.",
  },
  {
    title: "Tables of contents that work like Word's",
    text: "Built-in and custom tables, Update Table, and tables that stay intact in .docx files.",
  },
  {
    title: "Dark mode everywhere",
    text: "Menus, dialogs, panes and the chart sheet now follow dark mode, while the page stays white.",
  },
  {
    title: "Safer AutoSave",
    text: "AutoSave keeps a recovery copy, and Inkspire asks to save before closing a changed document.",
  },
  {
    title: "Headers, footers and page breaks",
    text: "Edit headers and footers as Word does, add page breaks with Ctrl+Enter, and see the editor's own pages in the print preview.",
  },
]

function WhatsNewDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="What's New" width={460} onClose={onClose}>
      <p className="mt-3 text-xs opacity-70">Inkspire {version}</p>
      <ul className="help-news">
        {WHATS_NEW.map((item) => (
          <li key={item.title}>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
      <div className="word-dialog-actions">
        <button type="button" className="dialog-btn" onClick={() => void openExternal(PROJECT_URL)}>
          Project page
        </button>
        <button type="button" className="dialog-btn is-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </DialogFrame>
  )
}
