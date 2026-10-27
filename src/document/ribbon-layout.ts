/**
 * Customize Ribbon's own tabs and groups (22.5): Word's New Tab, New Group and Rename, and the commands put in them.
 * A main tab's own groups can be removed and moved among its groups, the user's among them; what is in them stays
 * as it is. These are pure functions on the part of the customization they change, so the dialog can keep its
 * edits until OK. A main tab's own groups are named `own:<name>` here (their `data-group` on the ribbon), and the
 * functions that place groups are given the names the tab has (`own`), which only the ribbon knows.
 */

/** A group the user made: its name and its commands, as toolbar ids or "ribbon:<tab>:<label>" ids. */
export type CustomGroup = { id: string; label: string; commands: string[] }

/** A tab the user made: placed after the main tab `after`, shown unless `hidden`. */
export type CustomTab = { id: string; label: string; after: string; hidden?: boolean; groups: CustomGroup[] }

export type RibbonLayout = {
  customTabs: CustomTab[]
  /** Groups the user added to the main tabs, by tab id. */
  customGroups: Record<string, CustomGroup[]>
  /** Names the user gave the main tabs. */
  tabNames: Record<string, string>
  /** A main tab's own groups the user removed, by their names. */
  hiddenGroups: Record<string, string[]>
  /** The order of a main tab's groups once the user moved one: `own:<name>` and the user's group ids. */
  groupOrder: Record<string, string[]>
}

/** How a main tab's own group is named among its groups. */
export const OWN = "own:"

export function isOwnGroup(group: string | undefined): group is string {
  return Boolean(group?.startsWith(OWN))
}

/** A place in the Customize Ribbon tree: a tab, one of its groups, or a command in a group (by its place). */
export type RibbonTarget = { tab: string; group?: string; command?: number }

/** The main tabs in ribbon order, with Word's names for them; Home first and always shown. */
export const MAIN_TABS = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "design", label: "Design" },
  { id: "layout", label: "Layout" },
  { id: "references", label: "References" },
  { id: "review", label: "Review" },
  { id: "view", label: "View" },
  { id: "help", label: "Help" },
  { id: "ai", label: "AI Tools" },
]

export function emptyLayout(): RibbonLayout {
  return { customTabs: [], customGroups: {}, tabNames: {}, hiddenGroups: {}, groupOrder: {} }
}

let made = 0

function newId(kind: "tab" | "group") {
  made += 1
  return `custom-${kind}-${Date.now().toString(36)}-${made}`
}

export function isCustomTab(layout: RibbonLayout, tab: string) {
  return layout.customTabs.some((item) => item.id === tab)
}

/** The tabs in ribbon order: each main tab, then the tabs made after it. */
export function tabOrder(layout: RibbonLayout) {
  const main = MAIN_TABS.map((tab) => tab.id)
  const order: string[] = []
  for (const id of main) {
    order.push(id, ...layout.customTabs.filter((tab) => tab.after === id).map((tab) => tab.id))
  }
  // A tab whose place is gone goes at the end.
  order.push(...layout.customTabs.filter((tab) => !main.includes(tab.after)).map((tab) => tab.id))
  return order
}

/** A tab's name on the ribbon: the one the user gave it, or its own. */
export function tabName(layout: RibbonLayout, tab: string) {
  return (
    layout.customTabs.find((item) => item.id === tab)?.label ??
    layout.tabNames[tab] ??
    MAIN_TABS.find((item) => item.id === tab)?.label ??
    tab
  )
}

/** The groups the user made on a tab. */
export function groupsOf(layout: RibbonLayout, tab: string): CustomGroup[] {
  return layout.customTabs.find((item) => item.id === tab)?.groups ?? layout.customGroups[tab] ?? []
}

/**
 * A main tab's groups in ribbon order: its own (`own`, those it draws, by name) not removed, and the user's. Groups
 * not in the saved order (new ones) go at the end, the tab's own first.
 */
export function groupKeys(layout: RibbonLayout, tab: string, own: string[] = []) {
  const hidden = layout.hiddenGroups[tab] ?? []
  const all = [
    ...own.filter((name) => !hidden.includes(name)).map((name) => OWN + name),
    ...groupsOf(layout, tab).map((group) => group.id),
  ]
  const saved = (layout.groupOrder[tab] ?? []).filter((key) => all.includes(key))
  return [...saved, ...all.filter((key) => !saved.includes(key))]
}

/** The order given: kept for a main tab, with the user's groups listed in it too. */
function withOrder(layout: RibbonLayout, tab: string, keys: string[]): RibbonLayout {
  if (isCustomTab(layout, tab)) {
    return layout
  }
  const groups = groupsOf(layout, tab)
  const sorted = keys.flatMap((key) => groups.filter((group) => group.id === key))
  return {
    ...withGroups(layout, tab, [...sorted, ...groups.filter((group) => !keys.includes(group.id))]),
    groupOrder: { ...layout.groupOrder, [tab]: keys },
  }
}

function withGroups(layout: RibbonLayout, tab: string, groups: CustomGroup[]): RibbonLayout {
  if (isCustomTab(layout, tab)) {
    return { ...layout, customTabs: layout.customTabs.map((item) => (item.id === tab ? { ...item, groups } : item)) }
  }
  const customGroups = { ...layout.customGroups, [tab]: groups }
  if (!groups.length) {
    delete customGroups[tab]
  }
  return { ...layout, customGroups }
}

/** New Tab: a tab with one new group, after the tab `at` is on (its main tab, for a tab the user made). */
export function newTab(layout: RibbonLayout, at: string): { layout: RibbonLayout; target: RibbonTarget } {
  const after = layout.customTabs.find((tab) => tab.id === at)?.after ?? at
  const group: CustomGroup = { id: newId("group"), label: "New Group", commands: [] }
  const tab: CustomTab = { id: newId("tab"), label: "New Tab", after, groups: [group] }
  const customTabs = [...layout.customTabs]
  // Straight after the selected tab: after the tabs already made there when the selected one is a main tab.
  const index = customTabs.findIndex((item) => item.id === at)
  const lastThere = customTabs.map((item) => item.after).lastIndexOf(after)
  customTabs.splice(index >= 0 ? index + 1 : lastThere + 1, 0, tab)
  return { layout: { ...layout, customTabs }, target: { tab: tab.id, group: group.id } }
}

/** New Group: a group at the end of the tab, or after the selected group (one of the tab's own too). */
export function newGroup(
  layout: RibbonLayout,
  at: RibbonTarget,
  own: string[] = [],
): { layout: RibbonLayout; target: RibbonTarget } {
  const groups = [...groupsOf(layout, at.tab)]
  const group: CustomGroup = { id: newId("group"), label: "New Group", commands: [] }
  const index = groups.findIndex((item) => item.id === at.group)
  groups.splice(index >= 0 ? index + 1 : groups.length, 0, group)
  const added = withGroups(layout, at.tab, groups)
  if (isCustomTab(layout, at.tab) || (!layout.groupOrder[at.tab] && !isOwnGroup(at.group))) {
    return { layout: added, target: { tab: at.tab, group: group.id } }
  }
  // Among the tab's own groups: straight after the selected group, or at the end.
  const keys = groupKeys(layout, at.tab, own)
  const place = at.group ? keys.indexOf(at.group) : -1
  keys.splice(place >= 0 ? place + 1 : keys.length, 0, group.id)
  return { layout: withOrder(added, at.tab, keys), target: { tab: at.tab, group: group.id } }
}

/** Rename: a tab (a main tab too) or a group the user made. A blank name puts back a main tab's own. */
export function renameItem(layout: RibbonLayout, target: RibbonTarget, name: string): RibbonLayout {
  const label = name.trim()
  if (target.group) {
    if (!label) {
      return layout
    }
    return withGroups(
      layout,
      target.tab,
      groupsOf(layout, target.tab).map((group) => (group.id === target.group ? { ...group, label } : group)),
    )
  }
  if (isCustomTab(layout, target.tab)) {
    return label
      ? { ...layout, customTabs: layout.customTabs.map((tab) => (tab.id === target.tab ? { ...tab, label } : tab)) }
      : layout
  }
  const tabNames = { ...layout.tabNames }
  if (label && label !== MAIN_TABS.find((tab) => tab.id === target.tab)?.label) {
    tabNames[target.tab] = label
  } else {
    delete tabNames[target.tab]
  }
  return { ...layout, tabNames }
}

/** Add: the command goes after the selected one in its group, or at the end of the selected group; once a group. */
export function addToGroup(
  layout: RibbonLayout,
  at: RibbonTarget,
  command: string,
): { layout: RibbonLayout; target: RibbonTarget } | null {
  const group = groupsOf(layout, at.tab).find((item) => item.id === at.group)
  if (!group || group.commands.includes(command)) {
    return null
  }
  const commands = [...group.commands]
  const index = at.command === undefined ? commands.length : at.command + 1
  commands.splice(index, 0, command)
  return {
    layout: withGroups(
      layout,
      at.tab,
      groupsOf(layout, at.tab).map((item) => (item.id === group.id ? { ...item, commands } : item)),
    ),
    target: { tab: at.tab, group: group.id, command: index },
  }
}

/** Remove: a command, a group (a main tab's own too), or a tab the user made. A main tab stays. */
export function removeItem(layout: RibbonLayout, target: RibbonTarget): RibbonLayout {
  if (isOwnGroup(target.group)) {
    const name = target.group.slice(OWN.length)
    const hidden = layout.hiddenGroups[target.tab] ?? []
    return { ...layout, hiddenGroups: { ...layout.hiddenGroups, [target.tab]: [...new Set([...hidden, name])] } }
  }
  const groups = groupsOf(layout, target.tab)
  if (target.group && target.command !== undefined) {
    return withGroups(
      layout,
      target.tab,
      groups.map((group) =>
        group.id === target.group
          ? { ...group, commands: group.commands.filter((_, index) => index !== target.command) }
          : group,
      ),
    )
  }
  if (target.group) {
    return withGroups(
      layout,
      target.tab,
      groups.filter((group) => group.id !== target.group),
    )
  }
  return { ...layout, customTabs: layout.customTabs.filter((tab) => tab.id !== target.tab) }
}

/** Whether Remove applies: anything the user made, and a main tab's own groups. */
export function canRemove(layout: RibbonLayout, target: RibbonTarget | null) {
  return Boolean(target && (target.group || isCustomTab(layout, target.tab)))
}

/** Reset only selected Ribbon tab: a main tab as it comes, with its name, its own groups in order and none added. */
export function resetTab(layout: RibbonLayout, tab: string): RibbonLayout {
  if (isCustomTab(layout, tab)) {
    return layout
  }
  const without = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => id !== tab))
  return {
    ...layout,
    customGroups: without(layout.customGroups),
    tabNames: without(layout.tabNames),
    hiddenGroups: without(layout.hiddenGroups),
    groupOrder: without(layout.groupOrder),
  }
}

/**
 * Move Up and Move Down: a command within its group, and past the group's end into the group next to it; a group
 * among the tab's groups; a tab the user made among the tabs (it cannot go before Home). Returns where the item is
 * now, or null when it cannot move that way.
 */
export function moveItem(
  layout: RibbonLayout,
  target: RibbonTarget,
  direction: -1 | 1,
  own: string[] = [],
): { layout: RibbonLayout; target: RibbonTarget } | null {
  const groups = groupsOf(layout, target.tab)
  const at = groups.findIndex((group) => group.id === target.group)
  if (target.group && target.command !== undefined) {
    const group = groups[at]
    const command = group?.commands[target.command]
    if (!group || command === undefined) {
      return null
    }
    const to = target.command + direction
    if (to >= 0 && to < group.commands.length) {
      const commands = [...group.commands]
      ;[commands[target.command], commands[to]] = [commands[to]!, commands[target.command]!]
      return {
        layout: withGroups(
          layout,
          target.tab,
          groups.map((item, index) => (index === at ? { ...item, commands } : item)),
        ),
        target: { ...target, command: to },
      }
    }
    // Into the next group: at its end going up, at its start going down; not where it is already.
    const next = groups[at + direction]
    if (!next || next.commands.includes(command)) {
      return null
    }
    const place = direction < 0 ? next.commands.length : 0
    const moved = groups.map((item, index) => {
      if (index === at) {
        return { ...item, commands: item.commands.filter((_, spot) => spot !== target.command) }
      }
      if (item.id === next.id) {
        const commands = [...item.commands]
        commands.splice(place, 0, command)
        return { ...item, commands }
      }
      return item
    })
    return {
      layout: withGroups(layout, target.tab, moved),
      target: { tab: target.tab, group: next.id, command: place },
    }
  }
  if (target.group && !isCustomTab(layout, target.tab)) {
    // A main tab's groups, its own and the user's, move among each other.
    const keys = groupKeys(layout, target.tab, own)
    const from = keys.indexOf(target.group)
    const to = from + direction
    if (from < 0 || to < 0 || to >= keys.length) {
      return null
    }
    ;[keys[from], keys[to]] = [keys[to]!, keys[from]!]
    return { layout: withOrder(layout, target.tab, keys), target }
  }
  if (target.group) {
    const to = at + direction
    if (at < 0 || to < 0 || to >= groups.length) {
      return null
    }
    const moved = [...groups]
    ;[moved[at], moved[to]] = [moved[to]!, moved[at]!]
    return { layout: withGroups(layout, target.tab, moved), target }
  }
  if (!isCustomTab(layout, target.tab)) {
    return null
  }
  const order = tabOrder(layout)
  const index = order.indexOf(target.tab)
  const to = index + direction
  if (to < 1 || to >= order.length) {
    return null
  }
  ;[order[index], order[to]] = [order[to]!, order[index]!]
  // Each tab the user made goes after the main tab before it now, in the order they now have.
  const main = new Set(MAIN_TABS.map((tab) => tab.id))
  let last = "home"
  const placed = new Map<string, string>()
  for (const id of order) {
    if (main.has(id)) {
      last = id
    } else {
      placed.set(id, last)
    }
  }
  const customTabs = order
    .filter((id) => placed.has(id))
    .map((id) => ({ ...layout.customTabs.find((tab) => tab.id === id)!, after: placed.get(id)! }))
  return { layout: { ...layout, customTabs }, target }
}

/** Every command id the user's groups hold. */
export function layoutCommands(layout: RibbonLayout) {
  return [...layout.customTabs.flatMap((tab) => tab.groups), ...Object.values(layout.customGroups).flat()].flatMap(
    (group) => group.commands,
  )
}

const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback

function readGroups(value: unknown, keep: (id: string) => boolean): CustomGroup[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    const group = (item ?? {}) as Partial<CustomGroup>
    if (typeof group.id !== "string") {
      return []
    }
    const commands = Array.isArray(group.commands)
      ? [...new Set(group.commands.filter((id): id is string => typeof id === "string" && keep(id)))]
      : []
    return [{ id: group.id, label: text(group.label, "New Group"), commands }]
  })
}

/** Reads the saved tabs and groups, dropping what is not the right shape and commands that are gone. */
export function readLayout(value: Partial<RibbonLayout>, keep: (id: string) => boolean): RibbonLayout {
  const main = MAIN_TABS.map((tab) => tab.id)
  const customTabs = Array.isArray(value.customTabs)
    ? value.customTabs.flatMap((item) => {
        const tab = (item ?? {}) as Partial<CustomTab>
        if (typeof tab.id !== "string") {
          return []
        }
        return [
          {
            id: tab.id,
            label: text(tab.label, "New Tab"),
            after: typeof tab.after === "string" && main.includes(tab.after) ? tab.after : "ai",
            ...(tab.hidden === true ? { hidden: true } : {}),
            groups: readGroups(tab.groups, keep),
          },
        ]
      })
    : []
  const customGroups: Record<string, CustomGroup[]> = {}
  if (value.customGroups && typeof value.customGroups === "object") {
    for (const [tab, groups] of Object.entries(value.customGroups)) {
      const read = readGroups(groups, keep)
      if (main.includes(tab) && read.length) {
        customGroups[tab] = read
      }
    }
  }
  const tabNames: Record<string, string> = {}
  if (value.tabNames && typeof value.tabNames === "object") {
    for (const [tab, name] of Object.entries(value.tabNames)) {
      if (main.includes(tab) && typeof name === "string" && name.trim()) {
        tabNames[tab] = name.trim().slice(0, 80)
      }
    }
  }
  const lists = (record: unknown) => {
    const read: Record<string, string[]> = {}
    if (record && typeof record === "object") {
      for (const [tab, list] of Object.entries(record)) {
        const names = Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []
        if (main.includes(tab) && names.length) {
          read[tab] = [...new Set(names)]
        }
      }
    }
    return read
  }
  return {
    customTabs,
    customGroups,
    tabNames,
    hiddenGroups: lists(value.hiddenGroups),
    groupOrder: lists(value.groupOrder),
  }
}
