import { describe, expect, it } from "vitest"
import {
  addToGroup,
  canRemove,
  emptyLayout,
  groupKeys,
  groupsOf,
  moveItem,
  newGroup,
  newTab,
  readLayout,
  removeItem,
  renameItem,
  resetTab,
  tabName,
  tabOrder,
} from "@/document/ribbon-layout"
import { defaults, exportCustomization, importCustomization, readCustomization } from "@/document/customize"

describe("Customize Ribbon: New Tab, New Group, Rename (22.5)", () => {
  it("makes a tab with a group after the selected tab, and groups on a main tab", () => {
    let { layout, target } = newTab(emptyLayout(), "insert")
    const first = target.tab
    expect(tabOrder(layout).slice(0, 4)).toEqual(["home", "insert", first, "design"])
    expect(groupsOf(layout, first)).toHaveLength(1)
    expect(target.group).toBe(groupsOf(layout, first)[0]!.id)
    // A second New Tab with the first selected goes straight after it.
    const second = newTab(layout, first)
    expect(tabOrder(second.layout).slice(1, 4)).toEqual(["insert", first, second.target.tab])
    // New Group on a main tab: a group of the user's own there.
    ;({ layout, target } = newGroup(layout, { tab: "home" }))
    expect(groupsOf(layout, "home").map((group) => group.id)).toEqual([target.group])
    expect(canRemove(layout, { tab: "home" })).toBe(false)
    expect(canRemove(layout, target)).toBe(true)
  })

  it("renames tabs and groups; a blank name gives a main tab its own back", () => {
    let { layout, target } = newTab(emptyLayout(), "home")
    layout = renameItem(layout, { tab: target.tab }, "  Mine ")
    layout = renameItem(layout, target, "Tools")
    expect(tabName(layout, target.tab)).toBe("Mine")
    expect(groupsOf(layout, target.tab)[0]!.label).toBe("Tools")
    layout = renameItem(layout, { tab: "review" }, "Check")
    expect(tabName(layout, "review")).toBe("Check")
    layout = renameItem(layout, { tab: "review" }, "")
    expect(tabName(layout, "review")).toBe("Review")
    expect(layout.tabNames).toEqual({})
  })

  it("adds commands once to a group, and moves them within it and into the next group", () => {
    let { layout, target } = newTab(emptyLayout(), "home")
    const tab = target.tab
    const firstGroup = target.group!
    layout = addToGroup(layout, target, "save")!.layout
    layout = addToGroup(layout, { tab, group: firstGroup }, "ribbon:home:Bold")!.layout
    expect(addToGroup(layout, { tab, group: firstGroup }, "save")).toBeNull()
    // After the selected command.
    layout = addToGroup(layout, { tab, group: firstGroup, command: 0 }, "undo")!.layout
    expect(groupsOf(layout, tab)[0]!.commands).toEqual(["save", "undo", "ribbon:home:Bold"])
    const second = newGroup(layout, { tab, group: firstGroup })
    layout = second.layout
    // Down past the end of the first group: to the start of the second.
    const moved = moveItem(layout, { tab, group: firstGroup, command: 2 }, 1)!
    expect(moved.target).toEqual({ tab, group: second.target.group, command: 0 })
    expect(groupsOf(moved.layout, tab).map((group) => group.commands)).toEqual([["save", "undo"], ["ribbon:home:Bold"]])
    // And back up, to the end of the first.
    const back = moveItem(moved.layout, moved.target, -1)!
    expect(groupsOf(back.layout, tab).map((group) => group.commands)).toEqual([
      ["save", "undo", "ribbon:home:Bold"],
      [],
    ])
    expect(moveItem(back.layout, { tab, group: firstGroup, command: 0 }, -1)).toBeNull()
    // Groups among the tab's groups.
    const swapped = moveItem(back.layout, { tab, group: second.target.group }, -1)!
    expect(groupsOf(swapped.layout, tab).map((group) => group.id)).toEqual([second.target.group, firstGroup])
    // Remove a command, then the group.
    const removed = removeItem(back.layout, { tab, group: firstGroup, command: 1 })
    expect(groupsOf(removed, tab)[0]!.commands).toEqual(["save", "ribbon:home:Bold"])
    expect(groupsOf(removeItem(removed, { tab, group: firstGroup }), tab)).toHaveLength(1)
  })

  it("moves a tab of the user's past the main tabs, never before Home, and removes it", () => {
    const { layout, target } = newTab(emptyLayout(), "home")
    expect(moveItem(layout, { tab: target.tab }, -1)).toBeNull()
    expect(moveItem(layout, { tab: "insert" }, 1)).toBeNull()
    const down = moveItem(layout, { tab: target.tab }, 1)!
    expect(tabOrder(down.layout).slice(0, 3)).toEqual(["home", "insert", target.tab])
    expect(down.layout.customTabs[0]!.after).toBe("insert")
    expect(removeItem(down.layout, { tab: target.tab }).customTabs).toEqual([])
  })

  it("is saved, exported and read back, dropping what is wrong and commands that are gone", () => {
    let { layout, target } = newTab(emptyLayout(), "layout")
    layout = addToGroup(layout, target, "save")!.layout
    layout = addToGroup(layout, target, "ribbon:home:Bold")!.layout
    layout = newGroup(layout, { tab: "home" }).layout
    layout = renameItem(layout, { tab: "insert" }, "Add")
    const value = {
      ...defaults(),
      ...layout,
      ribbon: { "ribbon:home:Bold": { icon: "", tab: "Home" }, "ribbon:home:Italic": { icon: "", tab: "Home" } },
    }
    const read = importCustomization(exportCustomization(value), (id) => id === "save")!
    expect(read.customTabs).toEqual(layout.customTabs)
    expect(read.customGroups).toEqual(layout.customGroups)
    expect(read.tabNames).toEqual({ insert: "Add" })
    // The look of a ribbon command is kept while a group holds it, and dropped when nothing does.
    expect(Object.keys(read.ribbon)).toEqual(["ribbon:home:Bold"])
    const broken = readLayout(
      {
        customTabs: [
          { id: "t", label: "", after: "nowhere", groups: [{ id: "g", label: "G", commands: ["gone", "save"] }] },
          null,
        ],
        customGroups: { bogus: [{ id: "x", label: "X", commands: [] }] },
        tabNames: { home: "Start", nope: "No" },
      } as never,
      (id) => id === "save",
    )
    expect(broken).toEqual({
      customTabs: [{ id: "t", label: "New Tab", after: "ai", groups: [{ id: "g", label: "G", commands: ["save"] }] }],
      customGroups: {},
      tabNames: { home: "Start" },
      hiddenGroups: {},
      groupOrder: {},
    })
    expect(readCustomization(null, () => true)).toMatchObject({ customTabs: [], customGroups: {}, tabNames: {} })
  })

  it("removes and moves a main tab's own groups among the user's, and Reset puts the tab back", () => {
    const own = ["clipboard", "font", "paragraph"]
    // New Group with Font selected: straight after it.
    let { layout, target } = newGroup(emptyLayout(), { tab: "home", group: "own:font" }, own)
    const mine = target.group!
    expect(groupKeys(layout, "home", own)).toEqual(["own:clipboard", "own:font", mine, "own:paragraph"])
    // Moved up past Font and Clipboard; no further.
    layout = moveItem(layout, { tab: "home", group: mine }, -1, own)!.layout
    layout = moveItem(layout, { tab: "home", group: mine }, -1, own)!.layout
    expect(moveItem(layout, { tab: "home", group: mine }, -1, own)).toBeNull()
    expect(groupKeys(layout, "home", own)).toEqual([mine, "own:clipboard", "own:font", "own:paragraph"])
    // One of the tab's own groups moves too, and is removed.
    layout = moveItem(layout, { tab: "home", group: "own:paragraph" }, -1, own)!.layout
    expect(groupKeys(layout, "home", own)).toEqual([mine, "own:clipboard", "own:paragraph", "own:font"])
    expect(canRemove(layout, { tab: "home", group: "own:font" })).toBe(true)
    layout = removeItem(layout, { tab: "home", group: "own:font" })
    expect(layout.hiddenGroups).toEqual({ home: ["font"] })
    expect(groupKeys(layout, "home", own)).toEqual([mine, "own:clipboard", "own:paragraph"])
    // A group the tab gains later goes at the end.
    expect(groupKeys(layout, "home", [...own, "editing"]).slice(-1)).toEqual(["own:editing"])
    // Kept with the rest, and read back.
    const read = readCustomization(JSON.stringify({ ...defaults(), ...layout }), () => true)
    expect(read).toMatchObject({ hiddenGroups: layout.hiddenGroups, groupOrder: layout.groupOrder })
    // Reset only selected Ribbon tab: Home as it comes, other tabs untouched.
    layout = renameItem(layout, { tab: "insert" }, "Add")
    const reset = resetTab(layout, "home")
    expect(reset).toMatchObject({ customGroups: {}, hiddenGroups: {}, groupOrder: {}, tabNames: { insert: "Add" } })
  })
})
