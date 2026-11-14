import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state"
import type { Node as ProseNode } from "@tiptap/pm/model"
import { AddMarkStep, RemoveMarkStep, ReplaceStep, type Step } from "@tiptap/pm/transform"
import { editingAllowed, useReviewStore } from "@/document/review"
import { FORMATTING_MARKS } from "@/editor/track-changes"

/** Set on a transaction the app makes itself so protection lets it through. */
export const PROTECTION_BYPASS = "protectionBypass"

/**
 * Restrict Editing while protection is enforced. "No changes (Read only)" and "Filling in forms" leave nothing to
 * change (the editor has no form fields: Word's content controls are kept as they were read), "Comments" lets only
 * comments be added or removed, and "Tracked changes" stays editable with Track Changes locked on. Changes the app
 * makes without history (layout, field results) pass.
 */
export const Protection = Extension.create({
  name: "protection",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("protection"),
        filterTransaction(tr) {
          if (!tr.docChanged || tr.getMeta(PROTECTION_BYPASS) || tr.getMeta("addToHistory") === false) {
            return true
          }
          const state = useReviewStore.getState()
          if (state.protection?.enforced && state.protection.formatting && tr.steps.some(formattingStep)) {
            return false
          }
          return allowedChange(tr, editingAllowed(state))
        },
      }),
    ]
  },
})

/** Whether protection lets the transaction's changes through. */
export function allowedChange(tr: Transaction, allowed: ReturnType<typeof editingAllowed>) {
  if (allowed === "all") {
    return true
  }
  return allowed === "comments" && tr.steps.every((step, index) => commentStep(step, tr.docs[index]))
}

/** Direct formatting, which "Limit formatting to a selection of styles" stops. */
function formattingStep(step: Step) {
  return (
    (step instanceof AddMarkStep || step instanceof RemoveMarkStep) && FORMATTING_MARKS.includes(step.mark.type.name)
  )
}

/** A comment mark added or removed, or the zero-width anchor a comment on an empty line puts in (or takes out). */
function commentStep(step: Step, doc: ProseNode | undefined) {
  if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
    return step.mark.type.name === "comment"
  }
  if (step instanceof ReplaceStep && doc) {
    const removed = doc.textBetween(step.from, step.to, "\n", "\n")
    const added = step.slice.content.textBetween(0, step.slice.content.size, "\n", "\n")
    return step.to - step.from === removed.length && /^\u200b*$/.test(removed + added) && removed + added !== ""
  }
  return false
}
