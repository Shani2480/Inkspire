import { useEffect } from "react"
import { createPortal } from "react-dom"
import { create } from "zustand"

/**
 * A plain right-click menu of commands, opened from anywhere (the ribbon and the Quick Access Toolbar, Edit Points'
 * points and segments) and drawn once, under the ribbon.
 */

export type MenuItem = { label: string; run: () => void; disabled?: boolean } | "-"

const useCommandMenu = create<{ at: { x: number; y: number } | null; items: MenuItem[]; label: string }>(() => ({
  at: null,
  items: [],
  label: "",
}))

export function openCommandMenu(items: MenuItem[], x: number, y: number, label: string) {
  useCommandMenu.setState({ at: { x, y }, items, label })
}

export function closeCommandMenu() {
  useCommandMenu.setState({ at: null })
}

export function CommandMenuHost() {
  const at = useCommandMenu((state) => state.at)
  const items = useCommandMenu((state) => state.items)
  const label = useCommandMenu((state) => state.label)
  useEffect(() => {
    if (!at) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        // Escape closes the menu only, not what it was opened on (Edit Points stays on).
        event.stopImmediatePropagation()
        closeCommandMenu()
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [at])
  if (!at) {
    return null
  }
  const rows = items.filter((item) => item === "-").length * 9 + items.filter((item) => item !== "-").length * 26 + 8
  return createPortal(
    <>
      <div
        className="command-menu-backdrop fixed inset-0 z-[90]"
        onMouseDown={closeCommandMenu}
        onContextMenu={(event) => {
          event.preventDefault()
          closeCommandMenu()
        }}
      />
      <div
        role="menu"
        aria-label={label}
        style={{ top: Math.max(0, Math.min(at.y, window.innerHeight - rows)), left: Math.min(at.x, window.innerWidth - 300) }}
        className="command-menu quick-menu fixed z-[91] flex min-w-56 flex-col rounded-md border border-[var(--app-popover-border,#e1dfdd)] bg-[var(--app-popover-bg,#fff)] py-1 text-[12px] text-[var(--app-ribbon-text)] shadow-lg"
        onMouseDown={(event) => event.preventDefault()}
      >
        {items.map((item, index) =>
          item === "-" ? (
            <div key={`sep-${index}`} className="my-1 border-t border-black/10" />
          ) : (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className="px-3 py-1 text-left hover:bg-[var(--app-hover)] disabled:opacity-40"
              onClick={() => {
                closeCommandMenu()
                item.run()
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    </>,
    document.body,
  )
}
