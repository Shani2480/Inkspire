import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"

export function bindLineSelect(editor: Editor, canvas: HTMLElement, marginMm: number, zoom: number) {
  let dragging = false
  let anchorFrom = 0
  let anchorTo = 0

  const onMove = (event: MouseEvent) => {
    if (skipTarget(event.target)) {
      canvas.classList.remove("is-line-select")
      return
    }
    const hit = lineAt(editor, event.clientX, event.clientY, marginMm, zoom, !dragging)
    canvas.classList.toggle("is-line-select", dragging || Boolean(hit))
    if (!dragging || !hit) {
      return
    }
    const range = lineRange(editor, hit)
    if (!range) {
      return
    }
    applySelection(editor, Math.min(anchorFrom, range.from), Math.max(anchorTo, range.to))
  }

  const onDown = (event: MouseEvent) => {
    if (event.button !== 0 || skipTarget(event.target)) {
      return
    }
    const hit = lineAt(editor, event.clientX, event.clientY, marginMm, zoom, true)
    if (!hit) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const range = event.detail >= 2 ? paragraphRange(editor, hit) : lineRange(editor, hit)
    if (!range) {
      return
    }
    // Single click: line; double+: paragraph. Triple in the text area is handled by
    // TripleClickSelectAll (paragraph); margin triple should not select-all.
    applySelection(editor, range.from, range.to)
    dragging = event.detail < 2
    anchorFrom = range.from
    anchorTo = range.to
    canvas.classList.add("is-line-select")
  }

  const onUp = () => {
    dragging = false
  }

  canvas.addEventListener("mousemove", onMove)
  canvas.addEventListener("mousedown", onDown)
  window.addEventListener("mouseup", onUp)
  return () => {
    canvas.classList.remove("is-line-select")
    canvas.removeEventListener("mousemove", onMove)
    canvas.removeEventListener("mousedown", onDown)
    window.removeEventListener("mouseup", onUp)
  }
}

function skipTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, button, label, a"))
}

function marginPx(marginMm: number, zoom: number) {
  return (marginMm / 25.4) * 96 * zoom
}

function sheetAt(x: number, y: number) {
  const sheets = document.querySelectorAll(".page-sheet")
  for (const sheet of sheets) {
    const rect = sheet.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return rect
    }
  }
  return null
}

function lineAt(editor: Editor, x: number, y: number, marginMm: number, zoom: number, marginOnly: boolean) {
  const sheet = sheetAt(x, y) ?? (marginOnly ? null : sheetByY(y))
  if (!sheet) {
    return null
  }
  const margin = marginPx(marginMm, zoom)
  const textLeft = sheet.left + margin
  if (marginOnly && (x < sheet.left - 2 || x > textLeft + 2)) {
    return null
  }
  const probeX = Math.min(sheet.right - 8, Math.max(textLeft + 8, marginOnly ? textLeft + 8 : x))
  const found = editor.view.posAtCoords({ left: probeX, top: y })
  if (!found) {
    return null
  }
  let coords: { left: number; right: number; top: number; bottom: number }
  try {
    coords = editor.view.coordsAtPos(found.pos, -1)
  } catch {
    return null
  }
  if (y < coords.top - 4 || y > coords.bottom + 4) {
    return null
  }
  if (coords.left < sheet.left || coords.left > sheet.right) {
    return null
  }
  return new DOMRect(
    coords.left,
    coords.top,
    Math.max(8, coords.right - coords.left),
    Math.max(1, coords.bottom - coords.top),
  )
}

function sheetByY(y: number) {
  let best: DOMRect | null = null
  let bestDistance = Infinity
  for (const sheet of document.querySelectorAll(".page-sheet")) {
    const rect = sheet.getBoundingClientRect()
    const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    if (distance < bestDistance) {
      bestDistance = distance
      best = rect
    }
  }
  return best
}

function lineRange(editor: Editor, hit: DOMRect) {
  const view = editor.view
  const found = view.posAtCoords({ left: hit.left + 4, top: (hit.top + hit.bottom) / 2 })
  if (!found) {
    return null
  }
  let position = found.pos
  let $pos = view.state.doc.resolve(position)
  if (!$pos.parent.isTextblock && position > 0) {
    position -= 1
    $pos = view.state.doc.resolve(position)
  }
  if (!$pos.parent.isTextblock) {
    return null
  }
  const blockStart = $pos.start()
  const blockEnd = $pos.end()
  if (blockStart === blockEnd) {
    return { from: blockStart, to: blockEnd }
  }
  const probe = Math.min(Math.max(position, blockStart), blockEnd)
  let top: number
  try {
    top = view.coordsAtPos(probe, -1).top
  } catch {
    return { from: blockStart, to: blockEnd }
  }
  return { from: edge(view, blockStart, probe, top, true), to: edge(view, probe, blockEnd, top, false) }
}

function paragraphRange(editor: Editor, hit: DOMRect) {
  const found = editor.view.posAtCoords({ left: hit.left + 4, top: (hit.top + hit.bottom) / 2 })
  if (!found) {
    return null
  }
  const $pos = editor.state.doc.resolve(found.pos)
  if (!$pos.parent.isTextblock) {
    return null
  }
  return { from: $pos.start(), to: $pos.end() }
}

function edge(view: Editor["view"], lo: number, hi: number, top: number, towardStart: boolean) {
  let low = lo
  let high = hi
  if (towardStart) {
    while (low < high) {
      const mid = (low + high) >> 1
      if (sameLine(view, mid, top, 1)) {
        high = mid
      } else {
        low = mid + 1
      }
    }
    return low
  }
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (sameLine(view, Math.max(lo, mid - 1), top, 1)) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return low
}

function sameLine(view: Editor["view"], pos: number, top: number, side: -1 | 1) {
  try {
    return Math.abs(view.coordsAtPos(pos, side).top - top) <= 3
  } catch {
    return false
  }
}

function applySelection(editor: Editor, from: number, to: number) {
  const doc = editor.state.doc
  const selection = TextSelection.between(doc.resolve(Math.min(from, to)), doc.resolve(Math.max(from, to)))
  editor.view.dispatch(editor.state.tr.setSelection(selection))
  editor.view.focus()
}
