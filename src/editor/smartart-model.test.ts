import { describe, expect, it } from "vitest"
import {
  addBullet,
  addShape,
  canDemote,
  canMoveDown,
  canMoveUp,
  canPromote,
  demote,
  moveItem,
  promote,
  readItems,
  writeItems,
  type SmartArtItem,
} from "@/editor/smartart-model"

const item = (text: string, level = 0): SmartArtItem => ({ text, level })
const texts = (items: SmartArtItem[]) => items.map((entry) => `${"-".repeat(entry.level)}${entry.text}`)

describe("SmartArt text (22.1)", () => {
  it("reads and writes the labels and levels, and tolerates missing or bad levels", () => {
    const items = [item("A"), item("B", 1)]
    const written = writeItems(items)
    expect(readItems(written.labels, written.levels)).toEqual(items)
    expect(readItems('["A","B"]', "")).toEqual([item("A"), item("B")])
    expect(readItems('["A"]', "[99]")).toEqual([item("A", 4)])
  })

  it("adds a shape after an item's whole block, or before it", () => {
    const items = [item("A"), item("a1", 1), item("B")]
    expect(texts(addShape(items, 0, true).items)).toEqual(["A", "-a1", "Text", "B"])
    expect(addShape(items, 0, true).index).toBe(2)
    expect(texts(addShape(items, 2, false).items)).toEqual(["A", "-a1", "Text", "B"])
    expect(addShape([], 0, true).items).toEqual([item("Text")])
  })

  it("adds a bullet as the last child of the active item", () => {
    const items = [item("A"), item("a1", 1), item("B")]
    expect(texts(addBullet(items, 0).items)).toEqual(["A", "-a1", "-Text", "B"])
    expect(texts(addBullet(items, 1).items)).toEqual(["A", "-a1", "--Text", "B"])
  })

  it("promotes and demotes an item with what is under it", () => {
    const items = [item("A"), item("B"), item("b1", 1)]
    expect(canDemote(items, 0)).toBe(false)
    expect(canDemote(items, 1)).toBe(true)
    expect(texts(demote(items, 1))).toEqual(["A", "-B", "--b1"])
    expect(canPromote(items, 1)).toBe(false)
    expect(texts(promote(demote(items, 1), 1))).toEqual(["A", "B", "-b1"])
  })

  it("moves an item with its children past its sibling", () => {
    const items = [item("A"), item("a1", 1), item("B"), item("b1", 1)]
    expect(canMoveUp(items, 0)).toBe(false)
    expect(canMoveDown(items, 2)).toBe(false)
    const down = moveItem(items, 0, "down")
    expect(texts(down.items)).toEqual(["B", "-b1", "A", "-a1"])
    expect(down.index).toBe(2)
    const up = moveItem(items, 2, "up")
    expect(texts(up.items)).toEqual(["B", "-b1", "A", "-a1"])
    expect(up.index).toBe(0)
  })
})

describe("pictures in SmartArt items", () => {
  it("keep their item through reading, moving and writing", () => {
    const items = readItems('["a","b"]', "[0,0]", '["data:x",""]')
    expect(items.map((item) => item.picture)).toEqual(["data:x", undefined])
    const written = writeItems([items[1]!, items[0]!])
    expect(JSON.parse(written.pictures)).toEqual(["", "data:x"])
  })
})
