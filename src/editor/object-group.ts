import { Extension, type Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { Plugin } from "@tiptap/pm/state"
import { create } from "zustand"

const OBJECT_TYPES = new Set(["image", "textBox", "figure", "wordArt", "drawingCanvas", "signatureLine"])

let regroupId: string | null = null

type PickState = {
  picked: number[]
  pick: (pos: number, extend: boolean) => void
  clear: () => void
}

export const useObjectSelection = create<PickState>((set) => ({
  picked: [],
  pick: (pos, extend) =>
    set((state) => {
      if (!extend) {
        return { picked: [pos] }
      }
      return {
        picked: state.picked.includes(pos) ? state.picked.filter((item) => item !== pos) : [...state.picked, pos],
      }
    }),
  clear: () => set({ picked: [] }),
}))

export function listObjects(doc: ProseNode) {
  const rows: { pos: number; label: string; hidden: boolean; groupId: string }[] = []
  const counts = new Map<string, number>()
  doc.descendants((node, pos) => {
    const label = objectLabel(node)
    if (!label) {
      return
    }
    const count = (counts.get(label) ?? 0) + 1
    counts.set(label, count)
    rows.push({
      pos,
      label: `${label} ${count}`,
      hidden: node.attrs.hidden === "1",
      groupId: typeof node.attrs.groupId === "string" ? node.attrs.groupId : "",
    })
  })
  return rows.reverse()
}

export function canRegroup(doc: ProseNode) {
  if (!regroupId) {
    return false
  }
  let found = false
  doc.descendants((node) => {
    if (node.attrs.formerGroup === regroupId) {
      found = true
      return false
    }
  })
  return found
}

export function groupObjects(editor: Editor, positions: number[]) {
  const unique = [...new Set(positions)]
    .filter((pos) => {
      const node = editor.state.doc.nodeAt(pos)
      return node ? OBJECT_TYPES.has(node.type.name) : false
    })
    .sort((left, right) => right - left)
  if (unique.length < 2) {
    return false
  }
  const id = `g${Date.now().toString(36)}`
  let tr = editor.state.tr
  for (const pos of unique) {
    const node = tr.doc.nodeAt(pos)
    if (!node) {
      continue
    }
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, groupId: id, formerGroup: null })
  }
  editor.view.dispatch(tr)
  useObjectSelection.getState().clear()
  return true
}

export function ungroupObjects(editor: Editor, positions: number[]) {
  const ids = new Set<string>()
  for (const pos of positions) {
    const node = editor.state.doc.nodeAt(pos)
    if (typeof node?.attrs.groupId === "string" && node.attrs.groupId) {
      ids.add(node.attrs.groupId)
    }
  }
  if (ids.size === 0) {
    return false
  }
  regroupId = [...ids][0] ?? null
  const hits: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (typeof node.attrs.groupId === "string" && ids.has(node.attrs.groupId)) {
      hits.push(pos)
    }
  })
  let tr = editor.state.tr
  for (const pos of hits.sort((left, right) => right - left)) {
    const node = tr.doc.nodeAt(pos)
    if (!node) {
      continue
    }
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, formerGroup: node.attrs.groupId, groupId: null })
  }
  editor.view.dispatch(tr)
  useObjectSelection.getState().clear()
  return true
}

export function regroupObjects(editor: Editor) {
  if (!canRegroup(editor.state.doc) || !regroupId) {
    return false
  }
  const id = regroupId
  const hits: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs.formerGroup === id) {
      hits.push(pos)
    }
  })
  let tr = editor.state.tr
  for (const pos of hits.sort((left, right) => right - left)) {
    const node = tr.doc.nodeAt(pos)
    if (!node) {
      continue
    }
    tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, groupId: id, formerGroup: null })
  }
  editor.view.dispatch(tr)
  return true
}

export function toggleObjectHidden(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || !OBJECT_TYPES.has(node.type.name)) {
    return
  }
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      hidden: node.attrs.hidden === "1" ? null : "1",
    }),
  )
}

export const ObjectGrouping = Extension.create({
  name: "objectGrouping",

  addGlobalAttributes() {
    return [
      {
        types: [...OBJECT_TYPES],
        attributes: {
          hidden: {
            default: null,
            parseHTML: (element: HTMLElement) => (element.getAttribute("data-hidden") === "1" ? "1" : null),
            renderHTML: (attributes: { hidden?: string | null }) =>
              attributes.hidden === "1" ? { "data-hidden": "1" } : {},
          },
          groupId: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-group") || null,
            renderHTML: (attributes: { groupId?: string | null }) =>
              attributes.groupId ? { "data-group": attributes.groupId } : {},
          },
          formerGroup: {
            default: null,
            parseHTML: (element: HTMLElement) => element.getAttribute("data-former-group") || null,
            renderHTML: (attributes: { formerGroup?: string | null }) =>
              attributes.formerGroup ? { "data-former-group": attributes.formerGroup } : {},
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(view) {
          const paint = () => {
            view.state.doc.descendants((node, pos) => {
              if (!OBJECT_TYPES.has(node.type.name)) {
                return
              }
              const dom = view.nodeDOM(pos)
              if (!(dom instanceof HTMLElement)) {
                return
              }
              if (node.attrs.hidden === "1") {
                dom.setAttribute("data-hidden", "1")
              } else {
                dom.removeAttribute("data-hidden")
              }
              if (node.attrs.groupId) {
                dom.setAttribute("data-group", String(node.attrs.groupId))
              } else {
                dom.removeAttribute("data-group")
              }
            })
          }
          paint()
          return {
            update: paint,
          }
        },
      }),
    ]
  },
})

function objectLabel(node: ProseNode) {
  if (node.type.name === "image") {
    return "Picture"
  }
  if (node.type.name === "textBox") {
    return "Text Box"
  }
  if (node.type.name === "wordArt") {
    return "WordArt"
  }
  if (node.type.name === "drawingCanvas") {
    return "Drawing Canvas"
  }
  if (node.type.name === "signatureLine") {
    return "Signature Line"
  }
  if (node.type.name === "figure") {
    if (node.attrs.kind === "chart") {
      return "Chart"
    }
    if (node.attrs.kind === "icon") {
      return "Icon"
    }
    if (node.attrs.kind === "model") {
      return "3D Model"
    }
    return "Shape"
  }
  return ""
}
