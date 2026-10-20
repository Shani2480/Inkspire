import { useClipboard, rememberClipboard, type ClipItem } from "@/document/clipboard"
import { pasteStored } from "@/editor/home-actions"
import { useDocumentEditor } from "@/editor/document-editor"
import { useEffect, useState } from "react"

export function useClipboardCapture() {
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => rememberClipboard(event)
    document.addEventListener("copy", onCopy)
    document.addEventListener("cut", onCopy)
    return () => {
      document.removeEventListener("copy", onCopy)
      document.removeEventListener("cut", onCopy)
    }
  }, [])
}

export function ClipboardPane() {
  const editor = useDocumentEditor()
  const open = useClipboard((state) => state.open)
  const items = useClipboard((state) => state.items)
  const clear = useClipboard((state) => state.clear)
  const remove = useClipboard((state) => state.remove)
  const autoOpen = useClipboard((state) => state.autoOpen)
  const setAutoOpen = useClipboard((state) => state.setAutoOpen)
  const setOpen = useClipboard((state) => state.setOpen)
  const [options, setOptions] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)

  if (!open) {
    return null
  }

  function paste(item: ClipItem) {
    if (!editor) {
      return
    }
    pasteStored(editor, item)
  }

  function pasteAll() {
    if (!editor) {
      return
    }
    for (const item of [...items].reverse()) {
      pasteStored(editor, item)
    }
  }

  return (
    <aside
      aria-label="Clipboard"
      className="flex h-full min-h-0 w-[248px] shrink-0 flex-col border-r border-[#d0d0d0] bg-white"
    >
      <div className="flex items-center justify-between border-b border-[#e6e6e6] px-3 py-2">
        <h2 className="text-[13px] font-semibold text-[#242424]">Clipboard</h2>
        <button
          type="button"
          className="text-[12px] text-[#595959] hover:text-[#242424]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
      <div className="flex gap-2 border-b border-[#e6e6e6] px-3 py-2">
        <button
          type="button"
          className="text-[12px] text-[#0f6cbd] disabled:text-[#b0b0b0]"
          disabled={!editor || items.length === 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={pasteAll}
        >
          Paste All
        </button>
        <button
          type="button"
          className="text-[12px] text-[#0f6cbd] disabled:text-[#b0b0b0]"
          disabled={items.length === 0}
          onMouseDown={(event) => event.preventDefault()}
          onClick={clear}
        >
          Clear All
        </button>
        <button
          type="button"
          className="ml-auto text-[12px] text-[#595959]"
          aria-expanded={options}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOptions((open) => !open)}
        >
          Options
        </button>
      </div>
      {options ? (
        <label className="flex items-center gap-2 border-b border-[#e6e6e6] px-3 py-2 text-[12px] text-[#242424]">
          <input type="checkbox" checked={autoOpen} onChange={(event) => setAutoOpen(event.target.checked)} />
          Show clipboard when copying
        </label>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-[#767676]">Copied text shows up here while the app is running.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="border-b border-[#f0f0f0]">
                <div className="flex items-start hover:bg-[#f3f9fd]">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => paste(item)}
                  >
                    <ClipIcon />
                    <span className="line-clamp-3 text-[12px] leading-snug text-[#242424]">{item.text}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Clipboard item options for ${item.text.slice(0, 24)}`}
                    aria-expanded={menu === item.id}
                    className="px-2 py-2 text-[12px] text-[#767676]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setMenu(menu === item.id ? null : item.id)}
                  >
                    ▾
                  </button>
                </div>
                {menu === item.id ? (
                  <div className="flex flex-col border-t border-[#f0f0f0] bg-[#fafafa]">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-left text-[12px] hover:bg-[#f3f9fd]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => paste(item)}
                    >
                      Paste
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-left text-[12px] hover:bg-[#f3f9fd]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        remove(item.id)
                        setMenu(null)
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function ClipIcon() {
  return (
    <svg className="mt-0.5 shrink-0" width="14" height="16" viewBox="0 0 14 16" aria-hidden>
      <rect x="1" y="1" width="12" height="14" rx="1" fill="#fff" stroke="#8a8a8a" />
      <path d="M3 5h8M3 8h8M3 11h5" stroke="#8a8a8a" strokeWidth="1" />
    </svg>
  )
}
