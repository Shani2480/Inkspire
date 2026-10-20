import { useEditingOptions } from "@/document/editing-options"
import type { ChainedCommands, Editor } from "@tiptap/core"
import { NodeSelection, type Transaction } from "@tiptap/pm/state"
import type { Step } from "@tiptap/pm/transform"

export type ObjectRun = (chain: ChainedCommands) => ChainedCommands

/**
 * Live previews of object commands, as Word shows while the pointer is over a menu choice or a dialog changes: each
 * preview runs without history and is taken back by inverting its steps, so even a command that moves the object
 * can be previewed. `commit` takes the preview back and runs the command once, as one undo step.
 */
export function objectPreview(editor: Editor) {
  let shown: { undo: Step[]; selection: number | null } | null = null

  const restore = () => {
    if (!shown || editor.isDestroyed) {
      shown = null
      return
    }
    const { undo, selection } = shown
    shown = null
    const tr = editor.state.tr
    for (const step of undo) {
      if (tr.maybeStep(step).failed) {
        // The document changed under the preview; leave it as it is.
        return
      }
    }
    if (selection !== null && tr.doc.nodeAt(selection)) {
      tr.setSelection(NodeSelection.create(tr.doc, selection))
    }
    editor.view.dispatch(tr.setMeta("addToHistory", false))
  }

  const preview = (run: ObjectRun) => {
    restore()
    if (!useEditingOptions.getState().livePreview) {
      return
    }
    const selection = editor.state.selection instanceof NodeSelection ? editor.state.selection.from : null
    let captured: Transaction | null = null
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged) {
        captured = transaction
      }
    }
    editor.on("transaction", onTransaction)
    try {
      run(
        editor.chain().command(({ tr }) => {
          tr.setMeta("addToHistory", false)
          return true
        }),
      ).run()
    } finally {
      editor.off("transaction", onTransaction)
    }
    const tr = captured as Transaction | null
    if (tr) {
      shown = { undo: tr.steps.map((step, index) => step.invert(tr.docs[index]!)).reverse(), selection }
    }
  }

  const commit = (run: ObjectRun) => {
    restore()
    run(editor.chain().focus()).run()
  }

  return { preview, restore, commit }
}
