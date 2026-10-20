import { TableCell, TableHeader } from "@tiptap/extension-table"
import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { CellSelection, TableMap, cellAround } from "@tiptap/pm/tables"

const background = {
  default: null as string | null,
  parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
  renderHTML: (attributes: { backgroundColor?: string | null }) =>
    attributes.backgroundColor ? { style: `background-color: ${attributes.backgroundColor}` } : {},
}

export const ShadedTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: background,
    }
  },
})

export const ShadedTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: background,
    }
  },
})

export type TableLook = "plain" | "grid" | "banded" | "header"

const LOOKS: Record<TableLook, { header: string; band: string; cell: string }> = {
  plain: { header: "#f5f5f5", band: "#ffffff", cell: "#ffffff" },
  grid: { header: "#1f4e79", band: "#ffffff", cell: "#ffffff" },
  banded: { header: "#2e75b6", band: "#deecf9", cell: "#ffffff" },
  header: { header: "#0f6cbd", band: "#ffffff", cell: "#ffffff" },
}

export function paintTable(editor: Editor, look: TableLook) {
  const found = tableAround(editor)
  if (!found) {
    return
  }
  const colors = LOOKS[look]
  const map = TableMap.get(found.node)
  let tr = editor.state.tr
  for (let row = 0; row < map.height; row += 1) {
    for (let col = 0; col < map.width; col += 1) {
      const cellPos = found.start + map.map[row * map.width + col]
      const cell = tr.doc.nodeAt(cellPos)
      if (!cell) {
        continue
      }
      const backgroundColor = row === 0 ? colors.header : row % 2 === 0 ? colors.band : colors.cell
      tr = tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, backgroundColor })
    }
  }
  editor.view.dispatch(tr)
  if (look !== "plain") {
    editor.chain().focus().toggleHeaderRow().run()
  }
}

export function selectTablePart(editor: Editor, part: "row" | "column" | "table") {
  const found = tableAround(editor)
  const $cell = currentCell(editor)
  if (!found || !$cell) {
    return
  }
  const map = TableMap.get(found.node)
  const rect = map.findCell($cell.pos - found.start)
  const anchorIndex = part === "column" ? rect.left : part === "table" ? 0 : rect.top * map.width
  const headIndex =
    part === "column"
      ? map.map.length - map.width + rect.left
      : part === "table"
        ? map.map.length - 1
        : rect.bottom * map.width - 1
  const selection = CellSelection.create(
    editor.state.doc,
    found.start + map.map[anchorIndex],
    found.start + map.map[headIndex],
  )
  editor.view.dispatch(editor.state.tr.setSelection(selection))
}

export function tableElement(editor: Editor) {
  const found = tableAround(editor)
  if (!found) {
    return null
  }
  const dom = editor.view.nodeDOM(found.pos)
  return dom instanceof HTMLElement ? dom : null
}

function tableAround(editor: Editor) {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === "table") {
      return { node, pos: $from.before(depth), start: $from.start(depth) }
    }
  }
  return null
}

function currentCell(editor: Editor) {
  const selection = editor.state.selection
  if (selection instanceof CellSelection) {
    return selection.$anchorCell
  }
  return cellAround(selection.$from)
}

export function tableSize(node: ProseNode) {
  const map = TableMap.get(node)
  return { rows: map.height, cols: map.width }
}
