import { setItems, useSmartArtPane, useSmartArtState } from "@/components/ribbon/smartart-tab"
import { useSmartArtItem } from "@/editor/smartart"

/** Word's Text Pane (22.1): the graphic's items as an outline, edited here or on the graphic. */
export function SmartArtTextPane() {
  const open = useSmartArtPane((state) => state.open)
  const close = useSmartArtPane((state) => state.close)
  const { editor, found, items, active } = useSmartArtState()
  if (!open || !found) {
    return null
  }
  return (
    <aside className="smartart-pane" aria-label="Text Pane">
      <div className="smartart-pane-title">
        <span>Type your text here</span>
        <button type="button" aria-label="Close Text Pane" onClick={close}>
          ✕
        </button>
      </div>
      <ul>
        {items.map((item, index) => (
          <li key={index} style={{ paddingInlineStart: item.level * 18 }} data-active={index === active || undefined}>
            <input
              aria-label={`Item ${index + 1}`}
              value={item.text}
              onFocus={() => useSmartArtItem.getState().set(index)}
              onChange={(event) =>
                setItems(
                  editor,
                  items.map((entry, position) => (position === index ? { ...entry, text: event.target.value } : entry)),
                  index,
                )
              }
            />
          </li>
        ))}
      </ul>
    </aside>
  )
}
