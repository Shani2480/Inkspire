import { readSheetWorkbook, sheetWorkbook } from "@/document/docx/sheet-object"
import { encodeBase64 } from "@/document/docx/inlines"
import { useFileError } from "@/document/file-errors"
import { useDocumentStore } from "@/document/store"
import { isAndroid, isTauriRuntime } from "@/lib/platform"
import { parseGrid } from "@/editor/sheet-grid"
import type { Editor } from "@tiptap/core"
import type { Node as ProseNode } from "@tiptap/pm/model"

/**
 * Edit in Cells: the worksheet opened in Cells, the companion spreadsheet app, as Word opens one in Excel. The desktop
 * app writes the workbook to Inkspire's edit folder and opens `cells://edit` (`src-tauri/src/cells_link.rs`); Cells
 * saves each change back to that file, and the sheet here takes it in a moment later (an undoable change). The
 * workbook Cells saves is kept on the sheet, so its formatting and every function it knows go into the document.
 */

/** How often the edit copy is looked at, in milliseconds. */
const POLL_MS = 1000

/** The sheets being edited in Cells, by their edit copy's path. */
const watching = new Map<string, () => void>()

/** Cells is a desktop app: Android has no companion to open the worksheet in. */
export function canEditInCells() {
  return isTauriRuntime() && !isAndroid
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>

async function tauriInvoke(): Promise<Invoke> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke as Invoke
}

/** The workbook to send: the one Word or Cells wrote while it still holds the grid, else one made from the grid. */
export function workbookOf(attrs: Record<string, unknown>) {
  const grid = String(attrs.grid ?? "")
  if (typeof attrs.workbook === "string" && attrs.workbook && attrs.workbookGrid === grid) {
    return Uint8Array.from(atob(attrs.workbook), (char) => char.charCodeAt(0))
  }
  return sheetWorkbook(parseGrid(grid))
}

/** A grid grown with empty cells to at least `rows` by `cols`. */
function padded(grid: string[][], rows: number, cols: number) {
  const width = Math.max(cols, grid[0]?.length ?? 0)
  const lines = grid.map((line) => [...line, ...Array.from({ length: width - line.length }, () => "")])
  while (lines.length < rows) {
    lines.push(Array.from({ length: width }, () => ""))
  }
  return lines
}

/**
 * The attributes a workbook Cells saved gives the sheet (null when it cannot be read). Cells keeps only the cells in
 * use, so the sheet keeps at least the size it had (`rows` by `cols`), as Word keeps an object's visible area.
 */
export async function attrsFromWorkbook(bytes: Uint8Array, rows = 0, cols = 0) {
  const read = await readSheetWorkbook(bytes)
  if (!read) {
    return null
  }
  const grid = JSON.stringify(padded(read.grid, rows, cols))
  const values = JSON.stringify(padded(read.values, rows, cols))
  return { grid, workbook: encodeBase64(bytes), workbookGrid: grid, workbookValues: values }
}

function findSheet(editor: Editor, path: string) {
  let found: { node: ProseNode; pos: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found) {
      return false
    }
    if (node.type.name === "sheetBlock" && node.attrs.cellsEdit === path) {
      found = { node, pos }
    }
    return !found
  })
  return found as { node: ProseNode; pos: number } | null
}

/** Takes a workbook Cells saved into the sheet that was sent from `path`. False when that sheet is gone. */
export async function takeFromCells(editor: Editor, path: string, bytes: Uint8Array) {
  const sheet = editor.isDestroyed ? null : findSheet(editor, path)
  if (!sheet) {
    return false
  }
  const before = parseGrid(String(sheet.node.attrs.grid ?? ""))
  const attrs = await attrsFromWorkbook(bytes, before.length, before[0]?.length ?? 0)
  if (!attrs || attrs.workbook === sheet.node.attrs.workbook) {
    return true
  }
  // Found again: the document may have changed while the workbook was read.
  const current = findSheet(editor, path)
  if (!current) {
    return false
  }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(current.pos, undefined, { ...current.node.attrs, ...attrs }))
  return true
}

function watch(editor: Editor, path: string, invoke: Invoke, since: number) {
  watching.get(path)?.()
  let last = since
  let busy = false
  const timer = window.setInterval(() => {
    if (busy) {
      return
    }
    if (editor.isDestroyed) {
      stop()
      return
    }
    busy = true
    void (async () => {
      try {
        const modified = await invoke<number>("edit_copy_modified", { path })
        if (modified === 0) {
          stop()
          return
        }
        if (modified === last) {
          return
        }
        last = modified
        const bytes = new Uint8Array(await invoke<ArrayBuffer>("read_edit_copy", { path }))
        if (!(await takeFromCells(editor, path, bytes))) {
          stop()
        }
      } catch {
        // Cells may be writing the file just now; the next look reads it whole.
      } finally {
        busy = false
      }
    })()
  }, POLL_MS)
  const stop = () => {
    window.clearInterval(timer)
    watching.delete(path)
  }
  watching.set(path, stop)
}

/** Opens the sheet at `pos` in Cells and follows the changes saved there. */
export async function editSheetInCells(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || node.type.name !== "sheetBlock" || !canEditInCells()) {
    return
  }
  const document = useDocumentStore.getState().fileName || "Document1"
  try {
    const invoke = await tauriInvoke()
    const path = await invoke<string>("edit_in_cells", {
      bytes: Array.from(workbookOf(node.attrs)),
      document: /\.docx$/i.test(document) ? document : `${document}.docx`,
    })
    const since = await invoke<number>("edit_copy_modified", { path })
    const current = editor.state.doc.nodeAt(pos)
    if (current?.type.name === "sheetBlock") {
      // Which sheet the copy belongs to; not an edit of its own, so Undo skips it.
      const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, cellsEdit: path })
      editor.view.dispatch(tr.setMeta("addToHistory", false))
    }
    watch(editor, path, invoke, since)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    void useFileError.getState().show({
      kind: "unknown",
      operation: "open",
      fileName: "Worksheet",
      title: "Couldn't open the worksheet in Cells",
      message: /not installed/i.test(detail)
        ? detail
        : "Cells could not be started. You can still edit the worksheet here.",
      detail,
      actions: [],
    })
  }
}
