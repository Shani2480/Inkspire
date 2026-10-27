import { openCommandMenu } from "@/components/command-menu"
import { QUICK_COMMANDS } from "@/components/quick-commands"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { ribbonCommandsOn } from "@/components/ribbon/ribbon-commands"
import { tabGroups } from "@/components/ribbon/custom-groups"
import {
  SEPARATOR,
  addCommand,
  defaults,
  exportCustomization,
  importCustomization,
  moveCommand,
  parseRibbonCommandId,
  removeCommand,
  usedLooks,
  useCustomize,
  type RibbonCommandLook,
} from "@/document/customize"
import {
  addToGroup,
  OWN,
  canRemove,
  groupKeys,
  groupsOf,
  isCustomTab,
  isOwnGroup,
  moveItem,
  newGroup,
  newTab,
  removeItem,
  renameItem,
  resetTab,
  tabName,
  tabOrder,
  type RibbonLayout,
  type RibbonTarget,
} from "@/document/ribbon-layout"
import { errorMessage } from "@/document/commands"
import { openSettingsFile, saveSettingsFile } from "@/lib/file-io"
import { useMemo, useState } from "react"
import { create } from "zustand"

type Page = "quick-access" | "ribbon"

/** Opens Customize the Ribbon and Quick Access Toolbar (22.5) on one of its two pages. */
export const useCustomizeDialog = create<{ open: Page | null }>(() => ({ open: null }))

export function openCustomize(page: Page = "quick-access") {
  useCustomizeDialog.setState({ open: page })
}

export function CustomizeDialogHost() {
  const open = useCustomizeDialog((state) => state.open)
  return open ? (
    <CustomizeDialog key={open} initial={open} onClose={() => useCustomizeDialog.setState({ open: null })} />
  ) : null
}

const LABELS = new Map(QUICK_COMMANDS.map((command) => [command.id, command.label]))

type Choice = { id: string; label: string; look?: RibbonCommandLook }

/**
 * Word's "Choose commands from": Popular Commands (the toolbar's own), each built tab's commands, and All Commands
 * (every one of those, by name).
 */
function commandSources(): { id: string; label: string; choices: () => Choice[] }[] {
  const popular = () => QUICK_COMMANDS.map((command) => ({ id: command.id, label: command.label }))
  // The tabs the app draws; not the user's own, whose buttons are copies of these.
  const tabs = [...document.querySelectorAll<HTMLElement>("[data-ribbon-tab]:not([data-custom-tab])")].map((panel) => ({
    id: panel.dataset.ribbonTab!,
    label: `${panel.dataset.ribbonTabLabel || panel.dataset.ribbonTab} Tab`,
    choices: (): Choice[] => ribbonCommandsOn(panel.dataset.ribbonTab!),
  }))
  return [
    { id: "popular", label: "Popular Commands", choices: popular },
    {
      id: "not-in-ribbon",
      label: "Commands Not in the Ribbon",
      choices: () => {
        const onRibbon = new Set(tabs.flatMap((tab) => tab.choices().map((choice) => choice.label)))
        return popular().filter((choice) => !onRibbon.has(choice.label))
      },
    },
    {
      id: "all",
      label: "All Commands",
      choices: () => {
        const all = [...popular(), ...tabs.flatMap((tab) => tab.choices())]
        // One of each name: a command on two tabs is the first one found.
        const seen = new Set<string>()
        return all
          .filter((choice) => !seen.has(choice.label) && seen.add(choice.label))
          .sort((a, b) => a.label.localeCompare(b.label))
      },
    },
    ...tabs,
  ]
}

function CustomizeDialog({ initial, onClose }: { initial: Page; onClose: () => void }) {
  const stored = useCustomize()
  // Edits are kept in the dialog until OK, so Cancel leaves the toolbar and the tabs as they were.
  const [page, setPage] = useState<Page>(initial)
  const [shown, setShown] = useState(stored.qatShown)
  const [qat, setQat] = useState(stored.qat)
  const [hidden, setHidden] = useState(stored.hiddenTabs)
  const [below, setBelow] = useState(stored.qatBelow)
  const [labels, setLabels] = useState(stored.qatLabels)
  const [looks, setLooks] = useState(stored.ribbon)
  const [layout, setLayout] = useState<RibbonLayout>(() => layoutOf(stored))
  // The place selected in the Customize Ribbon tree; Reset only selected Ribbon tab resets its tab.
  const [target, setTarget] = useState<RibbonTarget | null>({ tab: "home" })
  const [sources] = useState(commandSources)
  const [from, setFrom] = useState("popular")
  const choices = useMemo(
    () => [...(sources.find((source) => source.id === from)?.choices() ?? []), { id: SEPARATOR, label: "<Separator>" }],
    [sources, from],
  )
  const [left, setLeft] = useState<string>(QUICK_COMMANDS[0]!.id)
  const [right, setRight] = useState(-1)

  const labelOf = (id: string) => {
    if (id === SEPARATOR) {
      return "<Separator>"
    }
    const ribbon = parseRibbonCommandId(id)
    return ribbon ? `${ribbon.label} (${looks[id]?.tab ?? ribbon.tab})` : (LABELS.get(id) ?? id)
  }

  const add = () => {
    const choice = choices.find((item) => item.id === left)
    if (!choice) {
      return
    }
    setQat(addCommand(qat, choice.id))
    if (choice.look) {
      setLooks({ ...looks, [choice.id]: choice.look })
    }
  }

  // What Import/Export did, shown above the buttons.
  const [notice, setNotice] = useState("")

  /** The customizations as the dialog has them now, to export or to keep on OK. */
  const current = () => ({
    qatShown: shown,
    qat,
    hiddenTabs: hidden,
    qatBelow: below,
    qatLabels: labels,
    // Only the looks of ribbon commands still on the toolbar or in a group are kept.
    ribbon: usedLooks({ qat, ribbon: looks, ...layout }),
    ...layout,
  })

  // Word's Import/Export: an imported file replaces what the dialog shows, and OK keeps it, as with any change here.
  const importFile = async () => {
    try {
      const raw = await openSettingsFile("Import Customization File")
      if (raw === null) {
        return
      }
      const read = importCustomization(raw)
      if (!read) {
        setNotice("That file is not an Inkspire customization file.")
        return
      }
      setShown(read.qatShown)
      setQat(read.qat)
      setHidden(read.hiddenTabs)
      setBelow(read.qatBelow)
      setLabels(read.qatLabels)
      setLooks(read.ribbon)
      setLayout(layoutOf(read))
      setRight(-1)
      setNotice("Customizations imported. Click OK to use them.")
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  const exportFile = async () => {
    try {
      if (
        await saveSettingsFile("Inkspire Customizations.json", exportCustomization(current()), "Export Customizations")
      ) {
        setNotice("Customizations exported.")
      }
    } catch (error) {
      setNotice(errorMessage(error))
    }
  }

  // Word's Reset ▾: the toolbar alone, the selected main tab alone, or everything.
  const resetToolbar = () => {
    const base = defaults()
    setShown(base.qatShown)
    setQat(base.qat)
    setBelow(base.qatBelow)
    setLabels(base.qatLabels)
    setRight(-1)
  }
  const resetAll = () => {
    const base = defaults()
    resetToolbar()
    setHidden(base.hiddenTabs)
    setLooks(base.ribbon)
    setLayout(layoutOf(base))
    setTarget({ tab: "home" })
  }
  const selectedTab = target && !isCustomTab(layout, target.tab) ? target.tab : null
  const resetSelectedTab = () => {
    if (selectedTab) {
      setLayout(resetTab(layout, selectedTab))
      setHidden(hidden.filter((id) => id !== selectedTab))
      setTarget({ tab: selectedTab })
    }
  }

  return (
    <DialogFrame
      title="Customize the Ribbon and Quick Access Toolbar"
      width={page === "ribbon" ? 720 : 560}
      onClose={onClose}
      onSubmit={() => {
        stored.set(current())
        onClose()
      }}
      tabs={[
        { id: "quick-access", label: "Quick Access Toolbar" },
        { id: "ribbon", label: "Customize Ribbon" },
      ]}
      tab={page}
      onTab={(id) => setPage(id as Page)}
      bodyHeight={400}
    >
      {page === "quick-access" ? (
        <div className="cz-panel">
          <label className="cz-check">
            <input type="checkbox" checked={shown} onChange={(event) => setShown(event.target.checked)} />
            Show Quick Access Toolbar
          </label>
          <label className="cz-from">
            Choose commands from:
            <select
              aria-label="Choose commands from"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                setLeft("")
              }}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cz-lists">
            <div className="cz-column">
              <select size={9} aria-label="Commands" value={left} onChange={(event) => setLeft(event.target.value)}>
                {choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="cz-buttons">
              <button type="button" className="dialog-btn" disabled={!left} onClick={add}>
                Add &gt;&gt;
              </button>
              <button
                type="button"
                className="dialog-btn"
                disabled={right < 0}
                onClick={() => {
                  setQat(removeCommand(qat, right))
                  setRight(-1)
                }}
              >
                &lt;&lt; Remove
              </button>
            </div>
            <div className="cz-column">
              <select
                size={9}
                aria-label="Quick Access Toolbar commands"
                value={right >= 0 ? String(right) : ""}
                onChange={(event) => setRight(Number(event.target.value))}
              >
                {qat.map((id, index) => (
                  <option key={`${id}-${index}`} value={index}>
                    {labelOf(id)}
                  </option>
                ))}
              </select>
            </div>
            <div className="cz-buttons">
              <button
                type="button"
                className="dialog-btn"
                aria-label="Move Up"
                disabled={right <= 0}
                onClick={() => {
                  setQat(moveCommand(qat, right, -1))
                  setRight(right - 1)
                }}
              >
                ▲
              </button>
              <button
                type="button"
                className="dialog-btn"
                aria-label="Move Down"
                disabled={right < 0 || right >= qat.length - 1}
                onClick={() => {
                  setQat(moveCommand(qat, right, 1))
                  setRight(right + 1)
                }}
              >
                ▼
              </button>
            </div>
          </div>
          <label className="cz-check">
            <input type="checkbox" checked={below} onChange={(event) => setBelow(event.target.checked)} />
            Show Quick Access Toolbar below the Ribbon
          </label>
          <label className="cz-check">
            <input type="checkbox" checked={labels} onChange={(event) => setLabels(event.target.checked)} />
            Always show command labels
          </label>
        </div>
      ) : (
        <RibbonPage
          sources={sources}
          layout={layout}
          setLayout={setLayout}
          hidden={hidden}
          setHidden={setHidden}
          labelOf={labelOf}
          onLook={(id, look) => setLooks((current) => ({ ...current, [id]: look }))}
          target={target}
          setTarget={setTarget}
        />
      )}
      {notice ? (
        <p className="cz-notice" role="status">
          {notice}
        </p>
      ) : null}
      <DialogButtons submit onCancel={onClose}>
        <button
          type="button"
          className="dialog-btn"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            openCommandMenu(
              page === "ribbon"
                ? [
                    { label: "Reset only selected Ribbon tab", run: resetSelectedTab, disabled: !selectedTab },
                    { label: "Reset all customizations", run: resetAll },
                  ]
                : [
                    { label: "Reset only Quick Access Toolbar", run: resetToolbar },
                    { label: "Reset all customizations", run: resetAll },
                  ],
              box.left,
              box.bottom,
              "Reset",
            )
          }}
        >
          Reset ▾
        </button>
        <button
          type="button"
          className="dialog-btn"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            openCommandMenu(
              [
                { label: "Import customization file", run: () => void importFile() },
                { label: "Export all customizations", run: () => void exportFile() },
              ],
              box.left,
              box.bottom,
              "Import/Export",
            )
          }}
        >
          Import/Export ▾
        </button>
      </DialogButtons>
    </DialogFrame>
  )
}

/** The part of the customization the Customize Ribbon tree changes. */
function layoutOf(value: RibbonLayout): RibbonLayout {
  const { customTabs, customGroups, tabNames, hiddenGroups, groupOrder } = value
  return { customTabs, customGroups, tabNames, hiddenGroups, groupOrder }
}

/**
 * The groups a main tab draws itself (by name and caption) as the classic ribbon last drew them, for the tree to
 * list; none before the tab is built.
 */
function ownGroups(tab: string) {
  const seen = new Set<string>()
  return (tabGroups.get(tab) ?? []).filter((group) => !seen.has(group.name) && seen.add(group.name))
}

const same = (a: RibbonTarget | null, b: RibbonTarget) =>
  Boolean(a) && a!.tab === b.tab && a!.group === b.group && a!.command === b.command

/**
 * Customize Ribbon: the commands to choose from, and the ribbon's tabs as a tree. The main tabs can be hidden and
 * renamed and given groups of their own; New Tab and New Group make the user's own, which hold the commands added
 * to them and can be moved, renamed and removed.
 */
function RibbonPage({
  sources,
  layout,
  setLayout,
  hidden,
  setHidden,
  labelOf,
  onLook,
  target,
  setTarget,
}: {
  sources: { id: string; label: string; choices: () => Choice[] }[]
  layout: RibbonLayout
  setLayout: (layout: RibbonLayout) => void
  hidden: string[]
  setHidden: (hidden: string[]) => void
  labelOf: (id: string) => string
  onLook: (id: string, look: RibbonCommandLook) => void
  target: RibbonTarget | null
  setTarget: (target: RibbonTarget | null) => void
}) {
  const [from, setFrom] = useState("popular")
  const choices = useMemo(() => sources.find((source) => source.id === from)?.choices() ?? [], [sources, from])
  const [left, setLeft] = useState("")
  const [open, setOpen] = useState<string[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const own = useMemo(() => Object.fromEntries(tabOrder(layout).map((tab) => [tab, ownGroups(tab)])), [layout])
  // The names of the selected tab's own groups, which Move and New Group place the tab's groups among.
  const names = (tab: string) => (own[tab] ?? []).map((group) => group.name)

  const select = (next: RibbonTarget) => {
    setTarget(next)
    setRenaming(null)
  }
  const apply = (result: { layout: RibbonLayout; target: RibbonTarget } | null) => {
    if (result) {
      setLayout(result.layout)
      setOpen((current) => [...new Set([...current, result.target.tab, result.target.group ?? ""].filter(Boolean))])
      select(result.target)
    }
  }
  const add = () => {
    const choice = choices.find((item) => item.id === left)
    if (!choice || !target?.group) {
      return
    }
    if (choice.look) {
      onLook(choice.id, choice.look)
    }
    apply(addToGroup(layout, target, choice.id))
  }
  const toggle = (id: string) =>
    setOpen((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const nameNow = target
    ? target.group
      ? (groupsOf(layout, target.tab).find((group) => group.id === target.group)?.label ?? "")
      : tabName(layout, target.tab)
    : ""
  const canAdd = Boolean(left && target?.group)
  const rename = () => {
    if (target && renaming !== null) {
      setLayout(renameItem(layout, target, renaming))
    }
    setRenaming(null)
  }
  const renamable = Boolean(target && target.command === undefined && !isOwnGroup(target.group))
  const move = (direction: -1 | 1) => (target ? moveItem(layout, target, direction, names(target.tab)) : null)

  return (
    <div className="cz-panel">
      <div className="cz-lists">
        <div className="cz-column">
          <label className="cz-from">
            Choose commands from:
            <select
              aria-label="Choose commands from"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                setLeft("")
              }}
            >
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>
          <select size={14} aria-label="Commands" value={left} onChange={(event) => setLeft(event.target.value)}>
            {choices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        <div className="cz-buttons">
          <button
            type="button"
            className="dialog-btn"
            disabled={!canAdd}
            onClick={add}
            title="Add to the selected group (one you made)"
          >
            Add &gt;&gt;
          </button>
          <button
            type="button"
            className="dialog-btn"
            disabled={!canRemove(layout, target)}
            onClick={() => {
              setLayout(removeItem(layout, target!))
              select({ tab: isCustomTab(layout, target!.tab) && !target!.group ? "home" : target!.tab })
            }}
          >
            &lt;&lt; Remove
          </button>
        </div>
        <div className="cz-column">
          <span className="cz-from">Customize the Ribbon: Main Tabs</span>
          <ul className="cz-tree" role="tree" aria-label="Ribbon tabs">
            {tabOrder(layout).map((tab) => {
              const custom = isCustomTab(layout, tab)
              const shown = custom ? !layout.customTabs.find((item) => item.id === tab)?.hidden : !hidden.includes(tab)
              const expanded = open.includes(tab)
              return (
                <li key={tab} role="treeitem" aria-expanded={expanded} aria-selected={same(target, { tab })}>
                  <div
                    className={`cz-row${same(target, { tab }) ? " is-selected" : ""}`}
                    onClick={() => select({ tab })}
                  >
                    <button
                      type="button"
                      className="cz-twisty"
                      aria-label={expanded ? "Collapse" : "Expand"}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggle(tab)
                      }}
                    >
                      {expanded ? "▾" : "▸"}
                    </button>
                    <input
                      type="checkbox"
                      aria-label={`Show ${tabName(layout, tab)}`}
                      checked={shown}
                      disabled={tab === "home"}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const on = event.target.checked
                        if (custom) {
                          setLayout({
                            ...layout,
                            customTabs: layout.customTabs.map((item) =>
                              item.id === tab ? { ...item, hidden: on ? undefined : true } : item,
                            ),
                          })
                        } else {
                          setHidden(on ? hidden.filter((id) => id !== tab) : [...hidden, tab])
                        }
                      }}
                    />
                    {tabName(layout, tab)}
                    {custom ? " (Custom)" : ""}
                  </div>
                  {expanded ? (
                    <ul role="group">
                      {groupKeys(layout, tab, names(tab)).map((key) => {
                        const group = groupsOf(layout, tab).find((item) => item.id === key)
                        if (!group) {
                          // One of the tab's own groups: it can be moved or removed, not changed.
                          const here = { tab, group: key }
                          const label = own[tab]?.find((item) => OWN + item.name === key)?.label ?? key
                          return (
                            <li
                              key={key}
                              role="treeitem"
                              aria-selected={same(target, here)}
                              className={`cz-row cz-own${same(target, here) ? " is-selected" : ""}`}
                              onClick={() => select(here)}
                            >
                              {label}
                            </li>
                          )
                        }
                        const here = { tab, group: group.id }
                        const groupOpen = open.includes(group.id)
                        return (
                          <li
                            key={group.id}
                            role="treeitem"
                            aria-expanded={groupOpen}
                            aria-selected={same(target, here)}
                          >
                            <div
                              className={`cz-row${same(target, here) ? " is-selected" : ""}`}
                              onClick={() => select(here)}
                            >
                              <button
                                type="button"
                                className="cz-twisty"
                                aria-label={groupOpen ? "Collapse" : "Expand"}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggle(group.id)
                                }}
                              >
                                {groupOpen ? "▾" : "▸"}
                              </button>
                              {group.label} (Custom)
                            </div>
                            {groupOpen ? (
                              <ul role="group">
                                {group.commands.map((command, index) => {
                                  const at = { tab, group: group.id, command: index }
                                  return (
                                    <li
                                      key={command}
                                      role="treeitem"
                                      aria-selected={same(target, at)}
                                      className={`cz-row cz-command${same(target, at) ? " is-selected" : ""}`}
                                      onClick={() => select(at)}
                                    >
                                      {labelOf(command)}
                                    </li>
                                  )
                                })}
                              </ul>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <div className="cz-row-buttons">
            <button type="button" className="dialog-btn" onClick={() => apply(newTab(layout, target?.tab ?? "home"))}>
              New Tab
            </button>
            <button
              type="button"
              className="dialog-btn"
              disabled={!target}
              onClick={() => target && apply(newGroup(layout, target, names(target.tab)))}
            >
              New Group
            </button>
            <button type="button" className="dialog-btn" disabled={!renamable} onClick={() => setRenaming(nameNow)}>
              Rename…
            </button>
          </div>
          {renaming !== null && target ? (
            // Word's Rename box, here in the dialog; Enter keeps the name, Escape gives up (the dialog's own form is not
            // submitted).
            <div className="cz-rename" role="group" aria-label="Rename" data-own-escape="">
              <label className="cz-from">
                Display name:
                <input
                  autoFocus
                  aria-label="Display name"
                  value={renaming}
                  onChange={(event) => setRenaming(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      rename()
                    } else if (event.key === "Escape") {
                      event.preventDefault()
                      event.stopPropagation()
                      setRenaming(null)
                    }
                  }}
                />
              </label>
              <button type="button" className="dialog-btn" onClick={rename}>
                OK
              </button>
              <button type="button" className="dialog-btn" onClick={() => setRenaming(null)}>
                Cancel
              </button>
            </div>
          ) : null}
        </div>
        <div className="cz-buttons">
          <button
            type="button"
            className="dialog-btn"
            aria-label="Move Up"
            disabled={!move(-1)}
            onClick={() => apply(move(-1))}
          >
            ▲
          </button>
          <button
            type="button"
            className="dialog-btn"
            aria-label="Move Down"
            disabled={!move(1)}
            onClick={() => apply(move(1))}
          >
            ▼
          </button>
        </div>
      </div>
    </div>
  )
}
