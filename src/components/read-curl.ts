import { curlPath, foldShapes, onSpine, type Point, readPageStep } from "@/document/read-pages"

/**
 * Read Mode's page turn, as on an e-reader: the page on screen folds over from its corner like paper, the back of the
 * folded part showing over the next page, which lies in the shadow the fold casts (`index.css`, "Read Mode page
 * turn"). A finger moves the fold (`follow`); a tap or a key turns the page on its own (`release` straight away).
 *
 * The page that turns is a copy of that one page (`.read-curl`, `pageCopy`), its blocks laid out where they are in the
 * read view, while the read view itself shows the page underneath. The fold is cut by a box turned along the fold
 * line, with the page turned back inside it, so every frame only moves a few layers on the graphics card. Copying
 * only the page keeps a turn in a long book as quick as in a short one: a copy of the whole book (as before) was
 * walked through by the browser at every frame of the turn, and the back of the fold doubled that.
 * (A View Transition did this before that, but each turn laid out and painted the whole book again.)
 */

/** A turn on its way; starting another skips it to its end. */
export type Turning = { skipTransition: () => void }
type Flipping = { current: Turning | null }

export type Curl = {
  direction: "forward" | "back"
  /** The finger has gone `dx`, `dy` px from where it came down. */
  follow: (dx: number, dy: number) => void
  /** Let go: the page goes over (`complete`) or falls back. */
  release: (complete: boolean) => void
}

export function canCurl() {
  return (
    typeof document !== "undefined" &&
    !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)
  )
}

const easeOut = (t: number) => 1 - (1 - t) ** 3
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)

/** The point `share` (0 to 1) of the way along a path of points. */
function along(path: Point[], share: number): Point {
  const at = Math.min(path.length - 1, Math.max(0, share * (path.length - 1)))
  const index = Math.min(path.length - 2, Math.floor(at))
  const a = path[index]!
  const b = path[index + 1] ?? a
  const t = at - index
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

const px = (value: number) => `${value.toFixed(2)}px`
const rad = (value: number) => `${value.toFixed(5)}rad`

/** Mirrored across the fold: about its middle, flipped along the direction the corner went. */
const mirrored = ({ x, y, angle }: { x: number; y: number; angle: number }) =>
  `translate(${px(x)}, ${px(y)}) rotate(${rad(angle)}) scaleX(-1) rotate(${rad(-angle)}) translate(${px(-x)}, ${px(-y)})`

type Stage = {
  root: HTMLElement
  dim: HTMLElement
  cut: HTMLElement
  shade: HTMLElement
  page: HTMLElement
  copy: HTMLElement
  flap: HTMLElement
  /** The folding page's text seen through the back of the fold: a second copy, faint, in the mirrored flap. */
  back: HTMLElement
}

let stage: Stage | null = null

/** The read view's box of a rect, in the scroller's content (as `scrollLeft` counts it). */
function across(scroller: HTMLElement, box: DOMRect, rect: DOMRect) {
  return rect.left - box.left - scroller.clientLeft + scroller.scrollLeft
}

/**
 * The first index for which `test` holds, the blocks being in reading order (so it holds for every
 * later one too). A block with no box (hidden) takes the answer of the next one that has one.
 */
function firstWhere(count: number, test: (index: number) => boolean | null) {
  let low = 0
  let high = count
  while (low < high) {
    const middle = (low + high) >> 1
    let probe = middle
    let result: boolean | null = null
    while (probe < high && (result = test(probe)) === null) {
      probe++
    }
    if (result === null || result) {
      high = middle
    } else {
      low = probe + 1
    }
  }
  return low
}

/**
 * A copy of the page at `left` (a scroll position of the read view), and where it is scrolled to show it: the read
 * body's blocks with a part on that page, laid out as in the read view. The first block's first part starts where it
 * does there: on the same column of its page (empty columns ahead of it) and as far down (a spacer above it), so the
 * blocks break between columns and pages at the same places.
 */
export function pageCopy(scroller: HTMLElement, left: number) {
  const body = scroller.querySelector<HTMLElement>(".read-body")!
  const copy = scroller.cloneNode(false) as HTMLElement
  copy.className = `${scroller.className} read-curl-copy`
  copy.removeAttribute("tabindex")
  copy.removeAttribute("aria-label")
  copy.removeAttribute("id")
  const page = body.cloneNode(false) as HTMLElement
  copy.append(page)
  const w = Math.max(1, scroller.clientWidth)
  const step = readPageStep(w)
  const box = scroller.getBoundingClientRect()
  const blocks = Array.from(body.children) as HTMLElement[]
  const parts = (index: number) => {
    const rects = blocks[index]!.getClientRects()
    return rects.length ? { first: rects[0]!, last: rects[rects.length - 1]! } : null
  }
  const ends = (index: number) => {
    const found = parts(index)
    return found ? across(scroller, box, found.last) + found.last.width > left + 1 : null
  }
  const starts = (index: number) => {
    const found = parts(index)
    return found ? across(scroller, box, found.first) >= left + w : null
  }
  const first = firstWhere(blocks.length, ends)
  const after = firstWhere(blocks.length, starts)
  const lead = first < blocks.length ? parts(first) : null
  let scroll = 0
  if (lead) {
    const style = getComputedStyle(body)
    const padLeft = parseFloat(style.paddingLeft) || 0
    const padTop = parseFloat(style.paddingTop) || 0
    const content = body.clientWidth - padLeft - (parseFloat(style.paddingRight) || 0)
    const gap = parseFloat(style.columnGap) || 0
    const width = parseFloat(style.columnWidth)
    // The browser's own count of columns on a screen for a column width: as many as fit, widened to fill it.
    const columns = width > 0 ? Math.max(1, Math.floor((content + gap) / (width + gap))) : 1
    const pitch = (content + gap) / columns
    const x = across(scroller, box, lead.first)
    const startPage = Math.max(0, Math.floor((x + 1) / step))
    const column = Math.max(0, Math.min(columns - 1, Math.round((x - startPage * step - padLeft) / pitch)))
    for (let index = 0; index < column; index++) {
      const empty = document.createElement("div")
      empty.style.breakAfter = "column"
      page.append(empty)
    }
    const down = lead.first.top - body.getBoundingClientRect().top - body.clientTop - padTop
    if (down > 0.5) {
      const spacer = document.createElement("div")
      spacer.style.height = px(down)
      page.append(spacer)
    }
    // One block more than the page shows, so the page's last line breaks as it does in the read view.
    for (let index = first; index < Math.min(blocks.length, after + 1); index++) {
      const clone = blocks[index]!.cloneNode(true) as HTMLElement
      clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"))
      clone.removeAttribute("id")
      if (index === first) {
        clone.style.setProperty("margin-top", "0px", "important")
      }
      page.append(clone)
    }
    scroll = Math.max(0, Math.round(left / step) - startPage) * step
  }
  // As in the read view, the last page is a whole screen, so the copy can be scrolled to it.
  const end = scroller.querySelector(".read-end")?.cloneNode(false) as HTMLElement | undefined
  if (end) {
    end.style.left = px(scroll + w - 1)
    copy.append(end)
  }
  return { copy, scroll }
}

const setStyle = (element: HTMLElement, name: string, value: string) => {
  if (element.style.getPropertyValue(name) !== value) {
    element.style.setProperty(name, value)
  }
}

/**
 * The turning page's stage, kept from one turn to the next (hidden between them): a shade over the page underneath,
 * the box that cuts along the fold, the copy of the read view inside it and the back of the folded part. The copy of
 * the text is made once and laid out ahead (`prepareCurl`), not at each turn.
 */
function stageFor(scroller: HTMLElement) {
  // In the read view, so the copy takes its colours, fonts and text styles; laid out once, kept to the end.
  const view = (scroller.closest(".read-view") as HTMLElement | null) ?? scroller.parentElement!
  if (stage && stage.root.parentElement !== view) {
    stage.root.remove()
    stage = null
  }
  if (!stage) {
    const root = document.createElement("div")
    root.className = "read-curl"
    root.setAttribute("aria-hidden", "true")
    const dim = document.createElement("div")
    dim.className = "read-curl-dim"
    const cut = document.createElement("div")
    cut.className = "read-curl-cut"
    const page = document.createElement("div")
    page.className = "read-curl-page"
    const flap = document.createElement("div")
    flap.className = "read-curl-flap"
    page.append(flap)
    cut.append(page)
    const shade = document.createElement("div")
    shade.className = "read-curl-shade"
    root.append(dim, shade, cut)
    view.append(root)
    stage = {
      root,
      dim,
      cut,
      shade,
      page,
      copy: document.createElement("div"),
      flap,
      back: document.createElement("div"),
    }
    rest(stage, Math.max(1, scroller.clientWidth), Math.max(1, scroller.clientHeight))
  }
  const box = scroller.getBoundingClientRect()
  const frame = view.getBoundingClientRect()
  setStyle(stage.root, "left", px(box.left - frame.left - view.clientLeft))
  setStyle(stage.root, "top", px(box.top - frame.top - view.clientTop))
  setStyle(stage.root, "width", px(box.width))
  setStyle(stage.root, "height", px(box.height))
  for (const element of [stage.page, stage.flap]) {
    setStyle(element, "width", px(box.width))
    setStyle(element, "height", px(box.height))
  }
  setStyle(stage.flap, "background-color", getComputedStyle(scroller).backgroundColor)
  return stage
}

/**
 * Puts the copy of the page at `left` on the stage, and the same page faintly on the back of the fold: drawn inside
 * the flap, which is mirrored across the fold, it lies reversed where the page's own text would show if the paper
 * were held to the light.
 */
function showPage(parts: Stage, scroller: HTMLElement, left: number) {
  const { copy, scroll } = pageCopy(scroller, left)
  const back = copy.cloneNode(true) as HTMLElement
  back.classList.add("read-curl-back")
  for (const element of [copy, back]) {
    element.style.width = px(scroller.clientWidth)
    element.style.height = px(scroller.clientHeight)
  }
  parts.copy.replaceWith(copy)
  parts.back.replaceWith(back)
  if (!copy.isConnected) {
    parts.page.prepend(copy)
  }
  if (!back.isConnected) {
    parts.flap.append(back)
  }
  parts.copy = copy
  parts.back = back
  copy.scrollLeft = scroll
  back.scrollLeft = scroll
}

/**
 * Lays the stage out for the corner drawn to `point`. The box that cuts along the fold has its edge on the fold and
 * reaches past every point of the page (the corner never strays more than half a diagonal from it): one and a half
 * diagonals across, three along the fold. Only transforms and an opacity change, which the graphics card applies.
 */
function place(parts: Stage, w: number, h: number, corner: Point, point: Point) {
  const diagonal = Math.hypot(w, h)
  const lengthwise = 3 * diagonal
  setStyle(parts.cut, "width", px(1.5 * diagonal))
  setStyle(parts.cut, "height", px(lengthwise))
  setStyle(parts.shade, "height", px(lengthwise))
  const shape = foldShapes(w, h, corner, point)
  const { x, y, angle } = shape.mirror
  // Turned so its edge lies on the fold, the cut box keeps the spine's side; the page inside is turned back.
  const turned = `translate(${px(x)}, ${px(y)}) rotate(${rad(angle)}) translate(0px, ${px(-lengthwise / 2)})`
  parts.cut.style.transform = turned
  parts.page.style.transform = `translate(0px, ${px(lengthwise / 2)}) rotate(${rad(-angle)}) translate(${px(-x)}, ${px(-y)})`
  // The turning page's shadow on the page it uncovers: a strip along the fold, on the far side of it.
  parts.shade.style.transform = turned
  // Gone once the page has gone over: then the fold lies on the spine, and so would its shadow.
  parts.shade.style.opacity = Math.min(1, 4 * (1 - shape.turned)).toFixed(3)
  parts.flap.style.transform = mirrored(shape.mirror)
  // The next page lies in the turning page's shadow until it is uncovered.
  parts.dim.style.opacity = (0.22 * (1 - shape.turned)).toFixed(3)
}

/**
 * Between turns the stage stays, its page turned all the way over and so cut away: shown and hidden instead, its
 * copy of the book was restyled and its accessibility updated at each end of a turn, a quarter second in a long one.
 */
function rest(parts: Stage, w: number, h: number) {
  place(parts, w, h, { x: w, y: h }, { x: -w, y: h })
}

/** Makes the stage ahead of the first turn, while the page is idle. */
export function prepareCurl(scroller: HTMLElement) {
  if (canCurl() && scroller.isConnected && scroller.clientWidth > 0) {
    rest(stageFor(scroller), scroller.clientWidth, scroller.clientHeight)
  }
}

/**
 * Starts turning to the page at `left` (the scroller's scroll position for it). `gripY`, the height on the page the
 * finger took it at, chooses the corner: the top one when held high, the bottom one otherwise.
 */
export function startCurl(
  scroller: HTMLElement,
  left: number,
  direction: "forward" | "back",
  flipping: Flipping,
  gripY?: number,
): Curl {
  flipping.current?.skipTransition()
  const from = scroller.scrollLeft
  const parts = stageFor(scroller)
  const w = Math.max(1, scroller.clientWidth)
  const h = Math.max(1, scroller.clientHeight)
  const corner = { x: w, y: gripY !== undefined && gripY < h / 2 ? 0 : h }
  const over = { x: -w, y: corner.y }
  // The copy shows the page that folds: forward the one being read, back the one before, coming down over it.
  showPage(parts, scroller, direction === "forward" ? from : left)
  scroller.scrollLeft = direction === "forward" ? left : from
  let point: Point = direction === "forward" ? corner : over
  let outcome: boolean | null = null
  let moved = false
  let frame = 0
  let done = false
  const show = () => place(parts, w, h, corner, point)

  const turning: Turning = { skipTransition: () => end(outcome ?? true) }

  function end(complete: boolean) {
    if (done) {
      return
    }
    done = true
    cancelAnimationFrame(frame)
    // The read view ends on the new page, or on the one it started on when the page fell back.
    scroller.scrollLeft = complete ? left : from
    rest(parts, w, h)
    parts.root.classList.remove("is-turning")
    if (flipping.current === turning) {
      flipping.current = null
    }
  }

  flipping.current = turning
  show()
  parts.root.classList.add("is-turning")

  const finish = (complete: boolean) => {
    const target = complete === (direction === "forward") ? over : corner
    const distance = Math.abs(target.x - point.x) / (2 * w)
    // A tap turns the whole way at a reader's pace; a let-go finishes from where the finger left it.
    const path = curlPath(point, target, corner, w, h, moved ? 0.04 : 0.14)
    const duration = moved ? Math.max(140, 420 * distance) : 640
    const ease = moved ? easeOut : easeInOut
    const begun = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - begun) / duration)
      point = along(path, ease(t))
      show()
      if (t < 1) {
        frame = requestAnimationFrame(step)
      } else {
        end(complete)
      }
    }
    frame = requestAnimationFrame(step)
  }

  return {
    direction,
    follow(dx, dy) {
      if (outcome !== null || done) {
        return
      }
      moved = true
      // The fold stays under the finger: the corner goes twice as far as the finger, across from where it was.
      const base = direction === "forward" ? corner : over
      point = onSpine({ x: base.x + 2 * dx, y: base.y + dy }, corner, w, h)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(show)
    },
    release(complete) {
      if (outcome !== null || done) {
        return
      }
      outcome = complete
      cancelAnimationFrame(frame)
      finish(complete)
    },
  }
}
