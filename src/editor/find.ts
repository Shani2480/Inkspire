import type { Editor } from "@tiptap/core"

export type TextRange = {
  from: number
  to: number
}

export function findTextRanges(editor: Editor, query: string, matchCase: boolean) {
  const needle = matchCase ? query : query.toLocaleLowerCase()
  if (!needle) {
    return []
  }

  const ranges: TextRange[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return
    }
    const haystack = matchCase ? node.text : node.text.toLocaleLowerCase()
    let index = 0
    while (index < haystack.length) {
      const found = haystack.indexOf(needle, index)
      if (found === -1) {
        break
      }
      ranges.push({ from: pos + found, to: pos + found + needle.length })
      index = found + Math.max(needle.length, 1)
    }
  })
  return ranges
}

export function replaceTextRanges(editor: Editor, ranges: TextRange[], replacement: string) {
  if (ranges.length === 0) {
    return false
  }

  let transaction = editor.state.tr
  for (const range of [...ranges].sort((left, right) => right.from - left.from)) {
    transaction = transaction.insertText(replacement, range.from, range.to)
  }
  editor.view.dispatch(transaction)
  return true
}
