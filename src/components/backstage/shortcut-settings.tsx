import { isMacPlatform } from "@/lib/platform"
import { SHORTCUTS, comboFromEvent, keysOf, useShortcuts, type ShortcutDef } from "@/editor/shortcuts"
import { useEffect, useState } from "react"

/** Keys the application itself uses, so a command cannot be moved onto them. */
const RESERVED = new Set([
  "Mod+S",
  "Mod+Shift+S",
  "Mod+O",
  "Mod+N",
  "Mod+P",
  "Mod+F",
  "Mod+H",
  "Mod+G",
  "Mod+W",
  "Mod+Z",
  "Mod+Y",
  "Mod+C",
  "Mod+V",
  "Mod+X",
  "Mod+A",
  "Mod+Shift+J",
  "Mod+0",
  "Mod+-",
  "F1",
])

export function showCombo(combo: string) {
  return combo.replace("Mod", isMacPlatform ? "Cmd" : "Ctrl")
}

const GROUPS: ShortcutDef["group"][] = ["Text", "Paragraph", "Insert", "Tools"]

/** View and rebind the editor's shortcuts; the bindings are kept in the browser's or app's storage. */
export function ShortcutSettings() {
  const custom = useShortcuts((state) => state.custom)
  const bind = useShortcuts((state) => state.bind)
  const reset = useShortcuts((state) => state.reset)
  const [recording, setRecording] = useState<string | null>(null)
  const [notice, setNotice] = useState("")

  useEffect(() => {
    if (!recording) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === "Escape") {
        setRecording(null)
        return
      }
      const combo = comboFromEvent(event)
      if (!combo) {
        return
      }
      const plain = !combo.includes("Mod") && !combo.includes("Alt") && !/^F\d+$/.test(combo)
      if (plain) {
        setNotice("Use Ctrl, Alt or a function key with it.")
        return
      }
      if (RESERVED.has(combo)) {
        setNotice(`${showCombo(combo)} is used by the application.`)
        return
      }
      const owner = SHORTCUTS.find((def) => def.id !== recording && keysOf(def, custom).includes(combo))
      bind(recording, [combo])
      setNotice(owner ? `${showCombo(combo)} moved here from ${owner.label}.` : "")
      setRecording(null)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [recording, custom, bind])

  return (
    <section className="backstage-card backstage-shortcuts">
      <div className="flex items-center justify-between">
        <h2 className="backstage-card-title">Keyboard Shortcuts</h2>
        <button type="button" className="backstage-link" onClick={() => reset()}>
          Reset all
        </button>
      </div>
      <p className="backstage-muted" role="status">
        {notice || "Choose Change, then press the new keys. Escape cancels."}
      </p>
      {GROUPS.map((group) => (
        <div key={group}>
          <h3 className="backstage-shortcut-group">{group}</h3>
          {SHORTCUTS.filter((def) => def.group === group).map((def) => {
            const keys = keysOf(def, custom)
            return (
              <div key={def.id} className="backstage-shortcut-row">
                <span>{def.label}</span>
                <span className="backstage-shortcut-keys">
                  {recording === def.id ? (
                    <em>Press the keys…</em>
                  ) : keys.length ? (
                    keys.map((key) => <kbd key={key}>{showCombo(key)}</kbd>)
                  ) : (
                    <em>None</em>
                  )}
                </span>
                <button
                  type="button"
                  className="backstage-link"
                  aria-label={`Change ${def.label}`}
                  onClick={() => {
                    setNotice("")
                    setRecording(recording === def.id ? null : def.id)
                  }}
                >
                  {recording === def.id ? "Cancel" : "Change"}
                </button>
                {custom[def.id] ? (
                  <button
                    type="button"
                    className="backstage-link"
                    aria-label={`Reset ${def.label}`}
                    onClick={() => reset(def.id)}
                  >
                    Reset
                  </button>
                ) : (
                  <span />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </section>
  )
}
