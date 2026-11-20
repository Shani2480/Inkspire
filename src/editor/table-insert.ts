import type { Editor } from "@tiptap/core"
import { Fragment, type Node as ProseNode, type Schema } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import { PX_PER_CM } from "@/editor/table-props"
import { insertAtSelectionEnd } from "@/editor/selection-memory"
import { autoFitAllColumns } from "@/editor/table-tools"

/**
 * Word's Insert Table… and Convert Text to Table… (Insert → Table): a table of the size asked for, with Word's three
 * AutoFit behaviours. Fixed column width "Auto" shares the text width equally (what the grid gives); a fixed width
 * sets every column to it and turns automatic resizing off; AutoFit to contents fits each column to what it holds;
 * AutoFit to window makes the table 100% of the text width.
 */

export type AutoFitBehavior = { kind: "fixed"; widthCm: number | null } | { kind: "contents" } | { kind: "window" }

export type TextSeparator =
  { kind: "paragraphs" } | { kind: "tabs" } | { kind: "commas" } | { kind: "other"; char: string }

export const MAX_TABLE_COLUMNS = 63
export const MAX_TABLE_ROWS = 32767

function tableAttrs(autoFit: AutoFitBehavior) {
  return {
    autoResize: !(autoFit.kind === "fixed" && autoFit.widthCm !== null),
    prefWidth: autoFit.kind === "window" ? "100%" : null,
  }
}

function columnWidth(autoFit: AutoFitBehavior) {
  return autoFit.kind === "fixed" && autoFit.widthCm !== null && autoFit.widthCm > 0
    ? [Math.max(1, Math.round(autoFit.widthCm * PX_PER_CM))]
    : null
}

function buildTable(
  schema: Schema,
  rows: (ProseNode | null)[][],
  autoFit: AutoFitBehavior,
  header: boolean,
): ProseNode | null {
  const { table, tableRow, tableCell, tableHeader, paragraph } = schema.nodes
  if (!table || !tableRow || !tableCell || !paragraph) {
    return null
  }
  const colwidth = columnWidth(autoFit)
  const built = rows.map((cells, index) =>
    tableRow.create(
      null,
      cells.map((content) => {
        const type = header && index === 0 && tableHeader ? tableHeader : tableCell
        return type.create({ colwidth }, content ?? paragraph.create())
      }),
    ),
  )
  return table.create(tableAttrs(autoFit), built)
}

/** After the table is drawn, AutoFit to contents measures its columns, as the ribbon's AutoFit does. */
function fitToContents(editor: Editor, tablePos: number) {
  const dom = editor.view.nodeDOM(tablePos)
  const element = dom instanceof HTMLElement ? (dom.matches("table") ? dom : dom.querySelector("table")) : null
  if (element instanceof HTMLTableElement) {
    autoFitAllColumns(editor.view, element, tablePos)
  }
}

function clampSize(rows: number, columns: number) {
  return {
    rows: Math.max(1, Math.min(MAX_TABLE_ROWS, Math.round(rows) || 1)),
    columns: Math.max(1, Math.min(MAX_TABLE_COLUMNS, Math.round(columns) || 1)),
  }
}

/** Insert Table…: a new table at the selection, the caret in its first cell. One undo step. */
export function insertTableWith(editor: Editor, options: { rows: number; columns: number; autoFit: AutoFitBehavior }) {
  const { rows, columns } = clampSize(options.rows, options.columns)
  const attrs = tableAttrs(options.autoFit)
  const colwidth = columnWidth(options.autoFit)
  let tablePos: number | null = null
  // As the grid does (the same command), then the AutoFit behaviour on the table the caret is now in. Every row is a
  // plain one, as Word's Insert Table makes it (a bold grey first row showed here but was saved plain).
  const done = insertAtSelectionEnd(editor)
    .insertTable({ rows, cols: columns, withHeaderRow: false })
    .command(({ tr }) => {
      const { $from } = tr.selection
      for (let depth = $from.depth; depth > 0; depth -= 1) {
        const node = $from.node(depth)
        if (node.type.name !== "table") {
          continue
        }
        tablePos = $from.before(depth)
        tr.setNodeMarkup(tablePos, undefined, { ...node.attrs, ...attrs })
        if (colwidth) {
          node.descendants((cell, offset) => {
            if (cell.type.spec.tableRole === "cell" || cell.type.spec.tableRole === "header_cell") {
              tr.setNodeMarkup(tablePos! + 1 + offset, undefined, { ...cell.attrs, colwidth })
              return false
            }
            return true
          })
        }
        return true
      }
      return false
    })
    .run()
  if (done && tablePos !== null && options.autoFit.kind === "contents") {
    fitToContents(editor, tablePos)
  }
  return done
}

// --- Convert Text to Table ---------------------------------------------------------------------------------------

/** The paragraphs Convert Text to Table works on: every text block the selection touches, outside tables. */
export function textForTable(editor: Editor) {
  const { $from, $to, empty } = editor.state.selection
  if (empty) {
    return null
  }
  const range = $from.blockRange($to)
  if (!range) {
    return null
  }
  for (let depth = range.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name
    if (name === "table" || name === "tableCell" || name === "tableHeader") {
      return null
    }
  }
  const blocks: ProseNode[] = []
  let blocked = false
  editor.state.doc.nodesBetween(range.start, range.end, (node) => {
    if (node.type.name === "table") {
      blocked = true
      return false
    }
    if (node.isTextblock) {
      blocks.push(node)
      return false
    }
    return true
  })
  return blocked || blocks.length === 0 ? null : { from: range.start, to: range.end, blocks }
}

function separatorChar(separator: TextSeparator) {
  switch (separator.kind) {
    case "tabs":
      return "\t"
    case "commas":
      return ","
    case "other":
      return separator.char.slice(0, 1)
    default:
      return ""
  }
}

/** Word's guess: tabs when the text has them, otherwise one paragraph per cell. */
export function guessSeparator(blocks: ProseNode[]): TextSeparator {
  return blocks.some((block) => block.textContent.includes("\t")) ? { kind: "tabs" } : { kind: "paragraphs" }
}

/** How many columns the text makes with this separator: the most pieces any paragraph splits into. */
export function columnsForText(blocks: ProseNode[], separator: TextSeparator) {
  const char = separatorChar(separator)
  if (!char) {
    return 1
  }
  return Math.max(1, ...blocks.map((block) => block.textContent.split(char).length))
}

export function rowsForText(blocks: ProseNode[], separator: TextSeparator, columns: number) {
  const char = separatorChar(separator)
  if (!char) {
    return Math.max(1, Math.ceil(blocks.length / Math.max(1, columns)))
  }
  // A paragraph with more pieces than columns wraps onto the next rows, as in Word.
  return blocks.reduce((sum, block) => sum + Math.max(1, Math.ceil(block.textContent.split(char).length / columns)), 0)
}

/**
 * A text block's content cut at every `char`, the separators dropped, marks kept. A tab is also the editor's own tab
 * node (`docTab`), which the page draws in place of a typed "\t".
 */
function splitBlock(block: ProseNode, char: string) {
  const cuts: { at: number; size: number }[] = []
  block.forEach((child, offset) => {
    if (char === "\t" && child.type.name === "docTab") {
      cuts.push({ at: offset, size: child.nodeSize })
      return
    }
    if (!child.isText) {
      return
    }
    const text = child.text ?? ""
    for (let index = text.indexOf(char); index >= 0; index = text.indexOf(char, index + 1)) {
      cuts.push({ at: offset + index, size: char.length })
    }
  })
  const pieces: Fragment[] = []
  let start = 0
  for (const cut of cuts) {
    pieces.push(block.content.cut(start, cut.at))
    start = cut.at + cut.size
  }
  pieces.push(block.content.cut(start))
  return pieces.map((content) => block.type.create(block.attrs, content, block.marks))
}

/** The cells, row by row, the text makes. */
export function textCells(blocks: ProseNode[], separator: TextSeparator, columns: number) {
  const count = Math.max(1, columns)
  const char = separatorChar(separator)
  const rows: (ProseNode | null)[][] = []
  const pushRow = (cells: ProseNode[]) => {
    for (let start = 0; start < cells.length; start += count) {
      const row: (ProseNode | null)[] = cells.slice(start, start + count)
      while (row.length < count) {
        row.push(null)
      }
      rows.push(row)
    }
  }
  if (!char) {
    pushRow(blocks)
  } else {
    for (const block of blocks) {
      pushRow(splitBlock(block, char))
    }
  }
  return rows
}

/** Convert Text to Table…: the selected paragraphs become a table, the caret in its first cell. One undo step. */
export function convertTextToTable(
  editor: Editor,
  options: { separator: TextSeparator; columns: number; autoFit: AutoFitBehavior },
) {
  const source = textForTable(editor)
  if (!source) {
    return false
  }
  const columns = clampSize(1, options.columns).columns
  const node = buildTable(editor.schema, textCells(source.blocks, options.separator, columns), options.autoFit, false)
  if (!node) {
    return false
  }
  const tr = editor.state.tr.replaceWith(source.from, source.to, node)
  tr.setSelection(TextSelection.near(tr.doc.resolve(source.from + 1)))
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.focus()
  if (options.autoFit.kind === "contents") {
    fitToContents(editor, source.from)
  }
  return true
}

// --- remembered dimensions ---------------------------------------------------------------------------------------

const REMEMBER_KEY = "inkspire.insertTable"

export type TableDefaults = { columns: number; rows: number; autoFit: AutoFitBehavior }

const WORD_DEFAULTS: TableDefaults = { columns: 5, rows: 2, autoFit: { kind: "fixed", widthCm: null } }

/** Insert Table opens on 5 × 2, or the size remembered with "Remember dimensions for new tables". */
export function tableDefaults(): TableDefaults & { remembered: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBER_KEY) ?? "null") as TableDefaults | null
    if (saved && saved.columns > 0 && saved.rows > 0 && saved.autoFit) {
      return { ...saved, remembered: true }
    }
  } catch {
    // No storage: Word's own defaults.
  }
  return { ...WORD_DEFAULTS, remembered: false }
}

export function rememberTableDefaults(defaults: TableDefaults | null) {
  try {
    if (defaults) {
      localStorage.setItem(REMEMBER_KEY, JSON.stringify(defaults))
    } else {
      localStorage.removeItem(REMEMBER_KEY)
    }
  } catch {
    // Not remembered; the dialog still works.
  }
}
