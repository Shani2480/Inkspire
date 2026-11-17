import { useMemo, useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import {
  applyLink,
  documentPlaces,
  headingTarget,
  linkAtSelection,
  mailtoHref,
  normalizeAddress,
  parseMailto,
  removeLink,
  type Place,
} from "@/editor/links"

type Opened = { editor: Editor } | null

/** The Insert Hyperlink dialog (Ctrl+K, Insert > Link, Link… on the context menu); Edit Hyperlink over a link. */
export const useLinkDialog = create<{ opened: Opened; hide: () => void }>((set) => ({
  opened: null,
  hide: () => set({ opened: null }),
}))

/** Opens Insert Hyperlink (Edit Hyperlink when the caret is in a link) for `editor`. */
export function openLinkDialog(editor: Editor | null) {
  useLinkDialog.setState({ opened: editor ? { editor } : null })
}

export function LinkDialogHost() {
  const opened = useLinkDialog((state) => state.opened)
  return opened ? <LinkDialog editor={opened.editor} /> : null
}

type Target = "web" | "place" | "email"

const TARGETS: { id: Target; label: string }[] = [
  { id: "web", label: "Existing File or Web Page" },
  { id: "place", label: "Place in This Document" },
  { id: "email", label: "E-mail Address" },
]

function LinkDialog({ editor }: { editor: Editor }) {
  const hide = useLinkDialog((state) => state.hide)
  // What the dialog opened on: the link at the caret, or the selection.
  const start = useMemo(() => {
    const link = linkAtSelection(editor)
    const { from, to } = editor.state.selection
    const range = link ? { from: link.from, to: link.to } : { from, to }
    const selected = editor.state.doc.textBetween(range.from, range.to, "\n", "￼")
    return {
      link,
      range,
      text: link?.text ?? selected,
      // A selection over paragraphs or objects shows as Word's "<<Selection in Document>>" and is not retyped.
      fixed: /[\n￼]/.test(selected),
    }
  }, [editor])
  const places = useMemo(() => documentPlaces(editor.state.doc), [editor])
  const href = start.link?.href ?? ""
  const [target, setTarget] = useState<Target>(
    href.startsWith("#") ? "place" : href.toLowerCase().startsWith("mailto:") ? "email" : "web",
  )
  const [text, setText] = useState(start.text)
  const [address, setAddress] = useState(href.startsWith("#") || href.startsWith("mailto:") ? "" : href)
  const [place, setPlace] = useState<Place | null>(
    () => places.find((item) => href === `#${item.name ?? ""}` && item.name) ?? null,
  )
  const mail = parseMailto(href.toLowerCase().startsWith("mailto:") ? href : "")
  const [email, setEmail] = useState(mail.address)
  const [subject, setSubject] = useState(mail.subject)
  const [tip, setTip] = useState(start.link?.title ?? "")
  const [tipOpen, setTipOpen] = useState(false)

  const ready = target === "web" ? !!address.trim() : target === "place" ? !!place : !!email.trim()

  const ok = () => {
    let link = ""
    if (target === "web") {
      link = normalizeAddress(address)
    } else if (target === "email") {
      link = mailtoHref(email, subject)
    } else if (place) {
      const name = place.kind === "heading" ? headingTarget(editor, place.pos) : place.name
      link = name ? `#${name}` : ""
    }
    if (!link) {
      return
    }
    const display = start.fixed ? "" : text || (target === "email" ? `mailto:${email.trim()}` : link)
    applyLink(editor, start.range, { href: link, title: tip, text: display })
    hide()
  }

  return (
    <>
      <DialogFrame
        title={start.link ? "Edit Hyperlink" : "Insert Hyperlink"}
        width={620}
        onClose={hide}
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) {
            ok()
          }
        }}
      >
        <div className="link-dialog">
          <div className="link-dialog-top">
            <label htmlFor="link-text">Text to display:</label>
            <input
              id="link-text"
              className="dialog-input"
              value={start.fixed ? "<<Selection in Document>>" : text}
              disabled={start.fixed}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="button" className="dialog-btn" onClick={() => setTipOpen(true)}>
              ScreenTip…
            </button>
          </div>
          <div className="link-dialog-body">
            <div className="link-dialog-targets" role="tablist" aria-label="Link to">
              <span className="link-dialog-caption">Link to:</span>
              {TARGETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={target === item.id}
                  className={target === item.id ? "is-selected" : undefined}
                  onClick={() => setTarget(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="link-dialog-pane" role="tabpanel">
              {target === "web" ? (
                <label className="link-dialog-field">
                  <span>Address:</span>
                  <input
                    className="dialog-input"
                    value={address}
                    placeholder="https://"
                    autoFocus
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </label>
              ) : target === "place" ? (
                <>
                  <span className="link-dialog-caption">Select a place in this document:</span>
                  <ul className="link-dialog-places" role="listbox" aria-label="Places in this document">
                    {places.map((item, index) => {
                      const heading = item.kind === "heading"
                      const firstOfKind = index === 0 || places[index - 1]!.kind !== item.kind
                      return (
                        <li key={`${item.kind}-${item.pos}-${item.label}`} role="presentation">
                          {firstOfKind && item.kind !== "top" ? (
                            <span className="link-dialog-group">{heading ? "Headings" : "Bookmarks"}</span>
                          ) : null}
                          <button
                            type="button"
                            role="option"
                            aria-selected={place === item}
                            className={place === item ? "is-selected" : undefined}
                            style={{ paddingLeft: 8 + (item.kind === "top" ? 0 : 14 + ((item.level ?? 1) - 1) * 12) }}
                            onClick={() => setPlace(item)}
                          >
                            {item.label}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : (
                <>
                  <label className="link-dialog-field">
                    <span>E-mail address:</span>
                    <input
                      className="dialog-input"
                      value={email}
                      autoFocus
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </label>
                  <label className="link-dialog-field">
                    <span>Subject:</span>
                    <input
                      className="dialog-input"
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
        <DialogButtons ok="OK" okDisabled={!ready} onOk={ok} cancel="Cancel" onCancel={hide}>
          {start.link ? (
            <button
              type="button"
              className="dialog-btn"
              onClick={() => {
                editor.commands.setTextSelection(start.range)
                removeLink(editor)
                hide()
              }}
            >
              Remove Link
            </button>
          ) : null}
        </DialogButtons>
      </DialogFrame>
      {tipOpen ? <ScreenTipDialog value={tip} onClose={() => setTipOpen(false)} onOk={setTip} /> : null}
    </>
  )
}

function ScreenTipDialog({
  value,
  onOk,
  onClose,
}: {
  value: string
  onOk: (value: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState(value)
  return (
    <DialogFrame title="Set Hyperlink ScreenTip" width={380} level={100} onClose={onClose}>
      <label className="link-dialog-field">
        <span>ScreenTip text:</span>
        <textarea
          className="dialog-input link-dialog-tip"
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <DialogButtons
        onOk={() => {
          onOk(text)
          onClose()
        }}
        onCancel={onClose}
      />
    </DialogFrame>
  )
}
