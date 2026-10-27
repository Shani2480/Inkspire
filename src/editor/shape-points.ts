/**
 * Word's Edit Points: a shape as the points it is drawn through, so each can be dragged, added or deleted. A shape's
 * points are an SVG path (moves, lines, cubic curves and closes, all absolute) in a 100 by 100 box that is stretched
 * to the shape's size, as Word stretches a freeform's path to its extent. A shape from the gallery is turned into
 * points when Edit Points begins; in .docx the points are Word's own `a:custGeom`.
 */

export type Point = [number, number]
export type Segment =
  | { kind: "M"; to: Point }
  | { kind: "L"; to: Point }
  | { kind: "C"; c1: Point; c2: Point; to: Point }
  | { kind: "Z" }

/** The size of the box the points are in. */
export const POINTS_BOX = 100

const round = (value: number) => Math.round(value * 100) / 100

// ---------------------------------------------------------------------------------------------------------------
// Reading SVG

/** An SVG path's commands as moves, lines, cubic curves and closes in absolute coordinates. */
export function parsePath(d: string): Segment[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? []
  const segments: Segment[] = []
  let at = 0
  let command = ""
  let current: Point = [0, 0]
  let start: Point = [0, 0]
  let lastControl: Point | null = null
  let lastQuad: Point | null = null
  const number = () => Number(tokens[at++])
  const hasNumber = () => at < tokens.length && !/^[A-Za-z]$/.test(tokens[at]!)
  while (at < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[at]!)) {
      command = tokens[at++]!
    } else if (!command) {
      break
    }
    const relative = command === command.toLowerCase()
    const base = (point: Point): Point => (relative ? [current[0] + point[0], current[1] + point[1]] : point)
    const upper = command.toUpperCase()
    if (upper === "Z") {
      segments.push({ kind: "Z" })
      current = start
      lastControl = lastQuad = null
      continue
    }
    if (!hasNumber()) {
      continue
    }
    switch (upper) {
      case "M": {
        current = start = base([number(), number()])
        segments.push({ kind: "M", to: current })
        // Further pairs after a move are lines.
        command = relative ? "l" : "L"
        lastControl = lastQuad = null
        break
      }
      case "L": {
        current = base([number(), number()])
        segments.push({ kind: "L", to: current })
        lastControl = lastQuad = null
        break
      }
      case "H": {
        const x = number()
        current = [relative ? current[0] + x : x, current[1]]
        segments.push({ kind: "L", to: current })
        lastControl = lastQuad = null
        break
      }
      case "V": {
        const y = number()
        current = [current[0], relative ? current[1] + y : y]
        segments.push({ kind: "L", to: current })
        lastControl = lastQuad = null
        break
      }
      case "C": {
        const c1 = base([number(), number()])
        const c2 = base([number(), number()])
        const to = base([number(), number()])
        segments.push({ kind: "C", c1, c2, to })
        lastControl = c2
        lastQuad = null
        current = to
        break
      }
      case "S": {
        const c1: Point = lastControl ? [2 * current[0] - lastControl[0], 2 * current[1] - lastControl[1]] : current
        const c2 = base([number(), number()])
        const to = base([number(), number()])
        segments.push({ kind: "C", c1, c2, to })
        lastControl = c2
        lastQuad = null
        current = to
        break
      }
      case "Q":
      case "T": {
        const control: Point =
          upper === "Q"
            ? base([number(), number()])
            : lastQuad
              ? [2 * current[0] - lastQuad[0], 2 * current[1] - lastQuad[1]]
              : current
        const to = base([number(), number()])
        segments.push(quadToCubic(current, control, to))
        lastQuad = control
        lastControl = null
        current = to
        break
      }
      case "A": {
        const rx = number()
        const ry = number()
        const rotation = number()
        const large = number()
        const sweep = number()
        const to = base([number(), number()])
        segments.push(...arcToCubics(current, rx, ry, rotation, large !== 0, sweep !== 0, to))
        current = to
        lastControl = lastQuad = null
        break
      }
      default:
        at += 1
    }
  }
  return segments
}

function quadToCubic(from: Point, control: Point, to: Point): Segment {
  return {
    kind: "C",
    c1: [from[0] + (2 / 3) * (control[0] - from[0]), from[1] + (2 / 3) * (control[1] - from[1])],
    c2: [to[0] + (2 / 3) * (control[0] - to[0]), to[1] + (2 / 3) * (control[1] - to[1])],
    to,
  }
}

/** An SVG elliptical arc as cubic curves of at most a quarter turn each. */
function arcToCubics(
  from: Point,
  rxIn: number,
  ryIn: number,
  rotationDegrees: number,
  large: boolean,
  sweep: boolean,
  to: Point,
): Segment[] {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  if (!rx || !ry || (from[0] === to[0] && from[1] === to[1])) {
    return [{ kind: "L", to }]
  }
  const phi = (rotationDegrees * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (from[0] - to[0]) / 2
  const dy = (from[1] - to[1]) / 2
  const x1 = cos * dx + sin * dy
  const y1 = -sin * dx + cos * dy
  const scale = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
  if (scale > 1) {
    rx *= Math.sqrt(scale)
    ry *= Math.sqrt(scale)
  }
  const sign = large === sweep ? -1 : 1
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
  const factor = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * y1 * y1 + ry * ry * x1 * x1)))
  const cx1 = (factor * rx * y1) / ry
  const cy1 = (-factor * ry * x1) / rx
  const cx = cos * cx1 - sin * cy1 + (from[0] + to[0]) / 2
  const cy = sin * cx1 + cos * cy1 + (from[1] + to[1]) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const turn = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return turn
  }
  const theta = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry)
  let delta = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry)
  if (!sweep && delta > 0) {
    delta -= 2 * Math.PI
  } else if (sweep && delta < 0) {
    delta += 2 * Math.PI
  }
  const parts = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9))
  const step = delta / parts
  const k = (4 / 3) * Math.tan(step / 4)
  const pointAt = (t: number): Point => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ]
  const tangentAt = (t: number): Point => [
    -rx * Math.sin(t) * cos - ry * Math.cos(t) * sin,
    -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos,
  ]
  const segments: Segment[] = []
  for (let index = 0; index < parts; index += 1) {
    const a = theta + index * step
    const b = a + step
    const p0 = pointAt(a)
    const p3 = index === parts - 1 ? to : pointAt(b)
    const t0 = tangentAt(a)
    const t3 = tangentAt(b)
    segments.push({
      kind: "C",
      c1: [p0[0] + k * t0[0], p0[1] + k * t0[1]],
      c2: [p3[0] - k * t3[0], p3[1] - k * t3[1]],
      to: p3,
    })
  }
  return segments
}

const KAPPA = 0.5522847498

function ellipsePath(cx: number, cy: number, rx: number, ry: number): Segment[] {
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  return [
    { kind: "M", to: [cx + rx, cy] },
    { kind: "C", c1: [cx + rx, cy + oy], c2: [cx + ox, cy + ry], to: [cx, cy + ry] },
    { kind: "C", c1: [cx - ox, cy + ry], c2: [cx - rx, cy + oy], to: [cx - rx, cy] },
    { kind: "C", c1: [cx - rx, cy - oy], c2: [cx - ox, cy - ry], to: [cx, cy - ry] },
    { kind: "C", c1: [cx + ox, cy - ry], c2: [cx + rx, cy - oy], to: [cx + rx, cy] },
    { kind: "Z" },
  ]
}

function rectPath(x: number, y: number, width: number, height: number, rxIn: number, ryIn: number): Segment[] {
  const rx = Math.min(width / 2, rxIn || ryIn || 0)
  const ry = Math.min(height / 2, ryIn || rxIn || 0)
  if (!rx || !ry) {
    return [
      { kind: "M", to: [x, y] },
      { kind: "L", to: [x + width, y] },
      { kind: "L", to: [x + width, y + height] },
      { kind: "L", to: [x, y + height] },
      { kind: "Z" },
    ]
  }
  const ox = rx * (1 - KAPPA)
  const oy = ry * (1 - KAPPA)
  const right = x + width
  const bottom = y + height
  return [
    { kind: "M", to: [x + rx, y] },
    { kind: "L", to: [right - rx, y] },
    { kind: "C", c1: [right - ox, y], c2: [right, y + oy], to: [right, y + ry] },
    { kind: "L", to: [right, bottom - ry] },
    { kind: "C", c1: [right, bottom - oy], c2: [right - ox, bottom], to: [right - rx, bottom] },
    { kind: "L", to: [x + rx, bottom] },
    { kind: "C", c1: [x + ox, bottom], c2: [x, bottom - oy], to: [x, bottom - ry] },
    { kind: "L", to: [x, y + ry] },
    { kind: "C", c1: [x, y + oy], c2: [x + ox, y], to: [x + rx, y] },
    { kind: "Z" },
  ]
}

function pointList(value: string): Point[] {
  const numbers = (value.match(/-?(?:\d+\.?\d*|\.\d+)/g) ?? []).map(Number)
  const points: Point[] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push([numbers[index]!, numbers[index + 1]!])
  }
  return points
}

/**
 * The points of a shape's drawing (its SVG markup), in a 100 by 100 box over `viewBox` (the drawing's own bounds),
 * or null when the drawing has no outline to edit (text).
 */
export function pointsFromMarkup(markup: string, viewBox: string): Segment[] | null {
  const segments: Segment[] = []
  const attr = (element: string, name: string) => {
    const match = new RegExp(`\\s${name}="([^"]*)"`).exec(element)
    return match ? match[1]! : ""
  }
  const num = (element: string, name: string) => Number(attr(element, name)) || 0
  for (const element of markup.match(/<(rect|ellipse|circle|polygon|polyline|line|path)\b[^>]*>/g) ?? []) {
    const tag = /^<(\w+)/.exec(element)![1]
    if (tag === "rect") {
      segments.push(
        ...rectPath(num(element, "x"), num(element, "y"), num(element, "width"), num(element, "height"), num(element, "rx"), num(element, "ry")),
      )
    } else if (tag === "ellipse") {
      segments.push(...ellipsePath(num(element, "cx"), num(element, "cy"), num(element, "rx"), num(element, "ry")))
    } else if (tag === "circle") {
      segments.push(...ellipsePath(num(element, "cx"), num(element, "cy"), num(element, "r"), num(element, "r")))
    } else if (tag === "polygon" || tag === "polyline") {
      const points = pointList(attr(element, "points"))
      if (points.length > 1) {
        segments.push({ kind: "M", to: points[0]! }, ...points.slice(1).map((to) => ({ kind: "L" as const, to })))
        if (tag === "polygon") {
          segments.push({ kind: "Z" })
        }
      }
    } else if (tag === "line") {
      segments.push(
        { kind: "M", to: [num(element, "x1"), num(element, "y1")] },
        { kind: "L", to: [num(element, "x2"), num(element, "y2")] },
      )
    } else {
      segments.push(...parsePath(attr(element, "d")))
    }
  }
  if (segments.length === 0) {
    return null
  }
  const [vx, vy, vw, vh] = viewBox.split(/[\s,]+/).map(Number) as [number, number, number, number]
  const map = ([x, y]: Point): Point => [round(((x - vx) / (vw || 1)) * POINTS_BOX), round(((y - vy) / (vh || 1)) * POINTS_BOX)]
  return segments.map((segment) =>
    segment.kind === "Z"
      ? segment
      : segment.kind === "C"
        ? { kind: "C", c1: map(segment.c1), c2: map(segment.c2), to: map(segment.to) }
        : { kind: segment.kind, to: map(segment.to) },
  )
}

/** Points as an SVG path. */
export function pathString(segments: Segment[]): string {
  return segments
    .map((segment) => {
      const p = (point: Point) => `${round(point[0])} ${round(point[1])}`
      switch (segment.kind) {
        case "M":
          return `M${p(segment.to)}`
        case "L":
          return `L${p(segment.to)}`
        case "C":
          return `C${p(segment.c1)} ${p(segment.c2)} ${p(segment.to)}`
        case "Z":
          return "Z"
      }
    })
    .join(" ")
}

// ---------------------------------------------------------------------------------------------------------------
// Editing

/**
 * The points shown as handles: each segment's end, except a line or curve that only comes back to where its
 * figure began (that point is the move's handle already).
 */
export function anchorsOf(segments: Segment[]): { index: number; at: Point }[] {
  const anchors: { index: number; at: Point }[] = []
  let start: Point | null = null
  segments.forEach((segment, index) => {
    if (segment.kind === "Z") {
      return
    }
    if (segment.kind === "M") {
      start = segment.to
    }
    const closing =
      segment.kind !== "M" &&
      start !== null &&
      segments[index + 1]?.kind === "Z" &&
      Math.abs(segment.to[0] - start[0]) < 0.01 &&
      Math.abs(segment.to[1] - start[1]) < 0.01
    if (!closing) {
      anchors.push({ index, at: segment.to })
    }
  })
  return anchors
}

const moved = (point: Point, dx: number, dy: number): Point => [round(point[0] + dx), round(point[1] + dy)]

/** The segment that ends at the same place as `index` when the figure closes there (its first point). */
function twinOf(segments: Segment[], index: number) {
  if (segments[index]?.kind !== "M") {
    return -1
  }
  const start = (segments[index] as { to: Point }).to
  for (let at = index + 1; at < segments.length; at += 1) {
    const segment = segments[at]!
    if (segment.kind === "M") {
      return -1
    }
    if (segment.kind === "Z") {
      const before = segments[at - 1]
      return before && before.kind !== "Z" && before.kind !== "M" && before.to[0] === start[0] && before.to[1] === start[1]
        ? at - 1
        : -1
    }
  }
  return -1
}

/** Moves the point ending segment `index` by (dx, dy), its curve handles with it, as dragging a point in Word does. */
export function movePoint(segments: Segment[], index: number, dx: number, dy: number): Segment[] {
  const next = segments.map((segment) => ({ ...segment })) as Segment[]
  const shift = (at: number) => {
    const segment = next[at]
    if (!segment || segment.kind === "Z") {
      return
    }
    segment.to = moved(segment.to, dx, dy)
    if (segment.kind === "C") {
      segment.c2 = moved(segment.c2, dx, dy)
    }
    const after = next[at + 1]
    if (after?.kind === "C") {
      after.c1 = moved(after.c1, dx, dy)
    }
  }
  shift(index)
  const twin = twinOf(segments, index)
  if (twin >= 0) {
    shift(twin)
  }
  // The first curve after a move starts at the move: its first handle follows the move.
  return next
}

/** Deletes a point, joining its neighbours; a figure keeps at least two points. */
export function deletePoint(segments: Segment[], index: number): Segment[] {
  const figureStart = segments.slice(0, index + 1).map((segment) => segment.kind).lastIndexOf("M")
  let figureEnd = segments.findIndex((segment, at) => at > index && segment.kind === "M")
  figureEnd = figureEnd < 0 ? segments.length : figureEnd
  const drawn = segments.slice(figureStart, figureEnd).filter((segment) => segment.kind !== "Z").length
  if (drawn <= 2) {
    return segments
  }
  const next = segments.map((segment) => ({ ...segment })) as Segment[]
  const target = next[index]!
  if (target.kind === "M") {
    // The figure now begins at the next point.
    const following = next[index + 1]
    if (!following || following.kind === "Z" || following.kind === "M") {
      return segments
    }
    next.splice(index, 2, { kind: "M", to: following.to })
    const twin = twinOf(segments, index)
    if (twin >= 0) {
      // A closed figure came back to the deleted point; it now comes back to the new first point.
      const closing = next[twin - 1]
      if (closing && closing.kind !== "Z" && closing.kind !== "M") {
        closing.to = following.to
      }
    }
    return next
  }
  const following = next[index + 1]
  if (following?.kind === "C" && target.kind === "C") {
    // Two curves become one, keeping the outer handles.
    next.splice(index, 2, { kind: "C", c1: target.c1, c2: following.c2, to: following.to })
    return next
  }
  next.splice(index, 1)
  return next
}

function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function bezierAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const a = lerp(p0, c1, t)
  const b = lerp(c1, c2, t)
  const c = lerp(c2, p3, t)
  return lerp(lerp(a, b, t), lerp(b, c, t), t)
}

/**
 * Adds a point on the outline nearest (x, y) when it is within `reach`, splitting that line or curve there; the
 * shape is drawn as before. Returns null when no part of the outline is that near.
 */
export function addPoint(segments: Segment[], x: number, y: number, reach: number): Segment[] | null {
  let best: { index: number; t: number; distance: number } | null = null
  let current: Point = [0, 0]
  let start: Point = [0, 0]
  const consider = (index: number, at: (t: number) => Point) => {
    for (let step = 1; step < 64; step += 1) {
      const t = step / 64
      const [px, py] = at(t)
      const distance = Math.hypot(px - x, py - y)
      if (!best || distance < best.distance) {
        best = { index, t, distance }
      }
    }
  }
  segments.forEach((segment, index) => {
    const from = current
    if (segment.kind === "M") {
      current = start = segment.to
    } else if (segment.kind === "L") {
      consider(index, (t) => lerp(from, segment.to, t))
      current = segment.to
    } else if (segment.kind === "C") {
      consider(index, (t) => bezierAt(from, segment.c1, segment.c2, segment.to, t))
      current = segment.to
    } else {
      // The closing line back to the figure's start is split by adding a line before the close.
      const back = start
      consider(index, (t) => lerp(from, back, t))
      current = start
    }
  })
  const found = best as { index: number; t: number; distance: number } | null
  if (!found || found.distance > reach) {
    return null
  }
  const next = segments.map((segment) => ({ ...segment })) as Segment[]
  let from: Point = [0, 0]
  let figureStart: Point = [0, 0]
  for (let at = 0; at < found.index; at += 1) {
    const segment = segments[at]!
    if (segment.kind === "M") {
      from = figureStart = segment.to
    } else if (segment.kind === "Z") {
      from = figureStart
    } else {
      from = segment.to
    }
  }
  const target = segments[found.index]!
  const t = found.t
  if (target.kind === "L" || target.kind === "Z") {
    const end = target.kind === "L" ? target.to : figureStart
    const middle = lerp(from, end, t)
    next.splice(found.index, 0, { kind: "L", to: [round(middle[0]), round(middle[1])] })
    return next
  }
  if (target.kind === "C") {
    // de Casteljau: the curve split into two that draw the same.
    const a = lerp(from, target.c1, t)
    const b = lerp(target.c1, target.c2, t)
    const c = lerp(target.c2, target.to, t)
    const d = lerp(a, b, t)
    const e = lerp(b, c, t)
    const middle = lerp(d, e, t)
    const r = (point: Point): Point => [round(point[0]), round(point[1])]
    next.splice(
      found.index,
      1,
      { kind: "C", c1: r(a), c2: r(d), to: r(middle) },
      { kind: "C", c1: r(e), c2: r(c), to: target.to },
    )
    return next
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------
// Fitting the box to the outline

/** The outline's true extent in the points' box: its points, and the furthest reach of each curve. */
export function pathBounds(segments: Segment[]) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  const take = ([x, y]: Point) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  let at: Point = [0, 0]
  for (const segment of segments) {
    if (segment.kind === "Z") {
      continue
    }
    if (segment.kind === "C") {
      // A curve stays inside its control points but need not reach them: sample it.
      for (let step = 1; step < 16; step += 1) {
        const t = step / 16
        const u = 1 - t
        const along = (a: number, b: number, c: number, d: number) =>
          u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d
        take([
          along(at[0], segment.c1[0], segment.c2[0], segment.to[0]),
          along(at[1], segment.c1[1], segment.c2[1], segment.to[1]),
        ])
      }
    }
    take(segment.to)
    at = segment.to
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null
}

/** The shape's frame as Edit Points needs it: its size, turn and flips. */
export type PointsFrame = { width: number; height: number; rotate: number; flipH: boolean; flipV: boolean }

/**
 * Word fits a shape's box to its outline as its points are edited: dragged out, the box grows; pulled in, it shrinks.
 * Gives the points spread over the whole box again, the new size, and how far the box's top-left corner moves on
 * the page (its turn and flips taken into account, so the outline stays where it was drawn). Null when it fits.
 */
export function fitPoints(segments: Segment[], frame: PointsFrame) {
  const bounds = pathBounds(segments)
  if (!bounds) {
    return null
  }
  // A flat outline (a straight line) keeps its box across, rather than becoming nothing wide.
  const spanX = bounds.maxX - bounds.minX >= 0.5 ? bounds.maxX - bounds.minX : POINTS_BOX
  const spanY = bounds.maxY - bounds.minY >= 0.5 ? bounds.maxY - bounds.minY : POINTS_BOX
  const fromX = spanX === POINTS_BOX && bounds.maxX - bounds.minX < 0.5 ? 0 : bounds.minX
  const fromY = spanY === POINTS_BOX && bounds.maxY - bounds.minY < 0.5 ? 0 : bounds.minY
  const close = (a: number, b: number) => Math.abs(a - b) < 0.01
  if (close(fromX, 0) && close(fromY, 0) && close(spanX, POINTS_BOX) && close(spanY, POINTS_BOX)) {
    return null
  }
  const map = ([x, y]: Point): Point => [
    round(((x - fromX) / spanX) * POINTS_BOX),
    round(((y - fromY) / spanY) * POINTS_BOX),
  ]
  const fitted = segments.map((segment): Segment => {
    if (segment.kind === "Z") {
      return segment
    }
    if (segment.kind === "C") {
      return { kind: "C", c1: map(segment.c1), c2: map(segment.c2), to: map(segment.to) }
    }
    return { kind: segment.kind, to: map(segment.to) }
  })
  const width = (frame.width * spanX) / POINTS_BOX
  const height = (frame.height * spanY) / POINTS_BOX
  // The box's centre moves in the shape's own frame, then turns and flips with it onto the page.
  let cx = ((fromX + spanX / 2 - POINTS_BOX / 2) / POINTS_BOX) * frame.width
  let cy = ((fromY + spanY / 2 - POINTS_BOX / 2) / POINTS_BOX) * frame.height
  if (frame.flipH) {
    cx = -cx
  }
  if (frame.flipV) {
    cy = -cy
  }
  const turn = (frame.rotate * Math.PI) / 180
  const px = cx * Math.cos(turn) - cy * Math.sin(turn)
  const py = cx * Math.sin(turn) + cy * Math.cos(turn)
  return {
    segments: fitted,
    width,
    height,
    // The corner of the unturned box, which turns about its centre.
    dx: px - (width - frame.width) / 2,
    dy: py - (height - frame.height) / 2,
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Word's custom geometry

/** The path size written in `a:path`: Word's own unit box, so points keep two decimals. */
const WORD_BOX = 100000

/** Points as Word's `a:custGeom`. */
export function custGeomXml(segments: Segment[]): string {
  const scale = WORD_BOX / POINTS_BOX
  const pt = (point: Point) => `<a:pt x="${Math.round(point[0] * scale)}" y="${Math.round(point[1] * scale)}"/>`
  const body = segments
    .map((segment) => {
      switch (segment.kind) {
        case "M":
          return `<a:moveTo>${pt(segment.to)}</a:moveTo>`
        case "L":
          return `<a:lnTo>${pt(segment.to)}</a:lnTo>`
        case "C":
          return `<a:cubicBezTo>${pt(segment.c1)}${pt(segment.c2)}${pt(segment.to)}</a:cubicBezTo>`
        case "Z":
          return "<a:close/>"
      }
    })
    .join("")
  return (
    `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/>` +
    `<a:pathLst><a:path w="${WORD_BOX}" h="${WORD_BOX}">${body}</a:path></a:pathLst></a:custGeom>`
  )
}

/**
 * Word's `a:custGeom` as points in the 100 by 100 box, or null when it has none the app can draw. Each `a:path`
 * is stretched by its own `w` and `h`; arcs (`a:arcTo`, from the current point by radii and angles in 60000ths of
 * a degree) become curves. Guides (formulas) are not evaluated: a point given by a guide name ends the reading.
 */
export function pointsFromCustGeom(xml: string): Segment[] | null {
  const geometry = /<a:custGeom\b[\s\S]*?<\/a:custGeom>/.exec(xml)?.[0]
  if (!geometry) {
    return null
  }
  const segments: Segment[] = []
  for (const path of geometry.match(/<a:path\b[^>]*?(?:\/>|>[\s\S]*?<\/a:path>)/g) ?? []) {
    const width = Number(/\bw="(\d+)"/.exec(path)?.[1]) || 0
    const height = Number(/\bh="(\d+)"/.exec(path)?.[1]) || 0
    if (!width || !height) {
      continue
    }
    const map = (x: string, y: string): Point | null => {
      const px = Number(x)
      const py = Number(y)
      return Number.isFinite(px) && Number.isFinite(py)
        ? [round((px / width) * POINTS_BOX), round((py / height) * POINTS_BOX)]
        : null
    }
    let current: Point = [0, 0]
    let start: Point = [0, 0]
    for (const command of path.match(/<a:(moveTo|lnTo|cubicBezTo|quadBezTo|arcTo|close)\b[^>]*?(?:\/>|>[\s\S]*?<\/a:\1>)/g) ?? []) {
      const name = /^<a:(\w+)/.exec(command)![1]
      const points = [...command.matchAll(/<a:pt x="([^"]+)" y="([^"]+)"\s*\/>/g)].map((match) => map(match[1]!, match[2]!))
      if (points.some((point) => point === null)) {
        return null
      }
      const pts = points as Point[]
      if (name === "moveTo" && pts[0]) {
        current = start = pts[0]
        segments.push({ kind: "M", to: current })
      } else if (name === "lnTo" && pts[0]) {
        current = pts[0]
        segments.push({ kind: "L", to: current })
      } else if (name === "cubicBezTo" && pts.length === 3) {
        segments.push({ kind: "C", c1: pts[0]!, c2: pts[1]!, to: pts[2]! })
        current = pts[2]!
      } else if (name === "quadBezTo" && pts.length === 2) {
        segments.push(quadToCubic(current, pts[0]!, pts[1]!))
        current = pts[1]!
      } else if (name === "arcTo") {
        const value = (key: string) => Number(new RegExp(`\\b${key}="(-?\\d+)"`).exec(command)?.[1])
        const wr = (value("wR") / width) * POINTS_BOX
        const hr = (value("hR") / height) * POINTS_BOX
        const startAngle = (value("stAng") / 60000) * (Math.PI / 180)
        const swing = (value("swAng") / 60000) * (Math.PI / 180)
        if (![wr, hr, startAngle, swing].every(Number.isFinite)) {
          return null
        }
        const cx = current[0] - wr * Math.cos(startAngle)
        const cy = current[1] - hr * Math.sin(startAngle)
        const end: Point = [round(cx + wr * Math.cos(startAngle + swing)), round(cy + hr * Math.sin(startAngle + swing))]
        segments.push(...arcToCubics(current, wr, hr, 0, Math.abs(swing) > Math.PI, swing > 0, end))
        current = end
      } else if (name === "close") {
        segments.push({ kind: "Z" })
        current = start
      }
    }
  }
  return segments.length > 0 ? segments : null
}
