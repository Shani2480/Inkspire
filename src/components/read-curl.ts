import { curlPath, foldShapes, onSpine, type Point } from "@/document/read-pages"

/**
 * Read Mode's page turn, as on an e-reader: the page on screen folds over from its corner like paper, the back of the
 * folded part showing over the next page, which lies in the shadow the fold casts (`index.css`, "Read Mode page
 * turn"). A finger moves the fold (`follow`); a tap or a key turns the page on its own (`release` straight away).
 *
 * The page that turns is a copy of the read view kept beside it (`.read-curl`), scrolled to that page, while the read
 * view itself shows the page underneath. The fold is cut by a box turned along the fold line, with the page turned
 * back inside it, so every frame only moves a few layers on the graphics card: nothing is laid out or painted again,
 * and a long book turns as smoothly as a short one. (A View Transition did this before, but each turn laid out and
 * painted the whole book again, which a long novel in a complex script made crawl.)
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
  key: string
}

let stage: Stage | null = null

/** What the copy was made from: made again when the text or the read view's size changes. */
function copyKey(scroller: HTMLElement) {
  const body = scroller.firstElementChild as HTMLElement | null
  return [
    scroller.clientWidth,
    scroller.clientHeight,
    scroller.scrollWidth,
    body?.childElementCount ?? 0,
    body?.getAttribute("style") ?? "",
    (body?.textContent ?? "").length,
  ].join("|")
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
    stage = { root, dim, cut, shade, page, copy: document.createElement("div"), flap, key: "" }
    rest(stage, Math.max(1, scroller.clientWidth), Math.max(1, scroller.clientHeight))
  }
  const key = copyKey(scroller)
  if (key !== stage.key) {
    const copy = scroller.cloneNode(true) as HTMLElement
    copy.className = `${scroller.className} read-curl-copy`
    copy.removeAttribute("tabindex")
    copy.removeAttribute("aria-label")
    copy.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"))
    stage.copy.remove()
    stage.page.prepend(copy)
    stage.copy = copy
    stage.key = key
  }
  const box = scroller.getBoundingClientRect()
  const frame = view.getBoundingClientRect()
  setStyle(stage.root, "left", px(box.left - frame.left - view.clientLeft))
  setStyle(stage.root, "top", px(box.top - frame.top - view.clientTop))
  setStyle(stage.root, "width", px(box.width))
  setStyle(stage.root, "height", px(box.height))
  for (const element of [stage.page, stage.copy, stage.flap]) {
    setStyle(element, "width", px(box.width))
    setStyle(element, "height", px(box.height))
  }
  setStyle(stage.flap, "background-color", getComputedStyle(scroller).backgroundColor)
  return stage
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

/**
 * Makes the copy of the read view ahead of the first turn, while the page is idle, so a long book's first turn does
 * not wait for it to be laid out.
 */
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
  parts.copy.scrollLeft = direction === "forward" ? from : left
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
