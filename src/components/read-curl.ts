import { curlPath, foldShapes, onSpine, type Point } from "@/document/read-pages"

/**
 * Read Mode's page turn, as on an e-reader: the page on screen folds over from its corner like paper, the back of the
 * folded part showing over the next page, which lies in the shadow the fold casts (`index.css`, "Read Mode page
 * turn"). The page is a View Transition's picture of the read view: the columns underneath jump straight to the
 * new page, so a long document turns as fast as a short one. A finger moves the fold (`follow`); a tap or a key
 * turns the page on its own (`release` straight away).
 */

const OLD = "::view-transition-old(read-page)"
const NEW = "::view-transition-new(read-page)"
const FLAP = "::view-transition-new(read-fold)"

type Flipping = { current: ViewTransition | null }

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
    "startViewTransition" in document &&
    !(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)
  )
}

const polygon = (points: Point[]) =>
  `polygon(${points.map((point) => `${point.x.toFixed(1)}px ${point.y.toFixed(1)}px`).join(", ")})`

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

/** Mirrored across the fold: about its middle, flipped along the direction the corner went. */
const mirrored = ({ x, y, angle }: { x: number; y: number; angle: number }) =>
  `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${angle.toFixed(5)}rad) scaleX(-1) ` +
  `rotate(${(-angle).toFixed(5)}rad) translate(${(-x).toFixed(1)}px, ${(-y).toFixed(1)}px)`

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
  const root = document.documentElement
  const from = scroller.scrollLeft
  flipping.current?.skipTransition()
  const box = scroller.getBoundingClientRect()
  const w = Math.max(1, box.width)
  const h = Math.max(1, box.height)
  const corner = { x: w, y: gripY !== undefined && gripY < h / 2 ? 0 : h }
  const over = { x: -w, y: corner.y }
  // Forward the page on screen folds away from its corner; back the page before lies folded over and comes down.
  let point: Point = direction === "forward" ? corner : over
  root.dataset.readFlip = direction
  // The back of the folded part: a sheet of the page's paper, drawn in the transition's pictures (`read-fold`).
  const fold = document.createElement("div")
  fold.className = "read-fold"
  Object.assign(fold.style, {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${w}px`,
    height: `${h}px`,
    backgroundColor: getComputedStyle(scroller).backgroundColor,
  })
  const start = (document as Document & { startViewTransition: (update: () => void) => ViewTransition })
    .startViewTransition
  const transition = start.call(document, () => {
    scroller.scrollLeft = left
    document.body.append(fold)
  })
  flipping.current = transition
  const top = direction === "forward" ? OLD : NEW
  const under = direction === "forward" ? NEW : OLD
  let animations: { top: Animation; under: Animation; flap: Animation } | null = null
  let outcome: boolean | null = null
  let moved = false

  const frames = (at: Point) => {
    const shape = foldShapes(w, h, corner, at)
    return {
      top: { clipPath: polygon(shape.top) },
      // The next page brightens as the page over it goes, out of its shadow.
      under: {
        filter: `brightness(${(0.8 + 0.2 * (direction === "forward" ? shape.turned : 1 - shape.turned)).toFixed(3)})`,
      },
      flap: {
        clipPath: polygon(shape.flap),
        transform: mirrored(shape.mirror),
      },
    }
  }

  const show = () => {
    if (!animations) {
      return
    }
    const frame = frames(point)
    ;(animations.top.effect as KeyframeEffect).setKeyframes([frame.top, frame.top])
    ;(animations.under.effect as KeyframeEffect).setKeyframes([frame.under, frame.under])
    ;(animations.flap.effect as KeyframeEffect).setKeyframes([frame.flap, frame.flap])
  }

  const finish = (complete: boolean) => {
    if (!animations) {
      if (!complete) {
        scroller.scrollLeft = from
      }
      transition.skipTransition()
      return
    }
    const target = complete === (direction === "forward") ? over : corner
    const distance = Math.abs(target.x - point.x) / (2 * w)
    // A tap turns the whole way at a reader's pace; a let-go finishes from where the finger left it.
    const path = curlPath(point, target, corner, w, h, moved ? 0.04 : 0.14)
    const duration = moved ? Math.max(140, 420 * distance) : 640
    const ease = moved ? easeOut : easeInOut
    const begun = performance.now()
    // Moved frame by frame like the finger does, every picture set together: run as animations of their own, the
    // compositor moved the folded part ahead of the page's cut, and it slid off the fold.
    const step = (now: number) => {
      const t = Math.min(1, (now - begun) / duration)
      point = along(path, ease(t))
      show()
      if (t < 1) {
        requestAnimationFrame(step)
        return
      }
      if (!complete) {
        // Laid back: the page under the fold is the one being read again before the turn ends and shows it.
        scroller.scrollLeft = from
      }
      Object.values(animations!).forEach((animation) => animation.finish())
    }
    requestAnimationFrame(step)
  }

  transition.ready
    .then(() => {
      const hold = (pseudoElement: string) => {
        const animation = root.animate([{}, {}], { pseudoElement, duration: 1000, fill: "both" })
        animation.pause()
        return animation
      }
      animations = { top: hold(top), under: hold(under), flap: hold(FLAP) }
      show()
      if (outcome !== null) {
        finish(outcome)
      }
    })
    .catch(() => undefined)
  void transition.finished.finally(() => {
    fold.remove()
    if (flipping.current === transition) {
      flipping.current = null
      delete root.dataset.readFlip
    }
  })

  return {
    direction,
    follow(dx, dy) {
      if (outcome !== null) {
        return
      }
      moved = true
      // The fold stays under the finger: the corner goes twice as far as the finger, across from where it was.
      const base = direction === "forward" ? corner : over
      point = onSpine({ x: base.x + 2 * dx, y: base.y + dy }, corner, w, h)
      show()
    },
    release(complete) {
      outcome = complete
      if (animations) {
        finish(complete)
      }
    },
  }
}
