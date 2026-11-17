/**
 * The geometry of ink on a drawing canvas: which strokes the eraser touches, which the lasso holds, moving strokes,
 * and the Ruler's straight edge. Points are in the canvas's own units (its viewBox). A stroke drawn in the app keeps
 * its points; an older one only its outline (`d`), whose corners stand in for them.
 */

export type InkPoint = number[]

/** The outline's corners: every number pair in an SVG path of M, Q and Z commands. */
export function pathPoints(d: string): InkPoint[] {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const points: InkPoint[] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    points.push([numbers[index]!, numbers[index + 1]!])
  }
  return points
}

/** The path moved: every number pair shifted. */
export function movePath(d: string, dx: number, dy: number) {
  let index = 0
  return d.replace(/-?\d+(?:\.\d+)?/g, (match) => {
    const value = Number(match) + (index++ % 2 === 0 ? dx : dy)
    return String(Math.round(value * 100) / 100)
  })
}

export function movePoints(points: InkPoint[], dx: number, dy: number): InkPoint[] {
  return points.map(([x = 0, y = 0, ...rest]) => [round(x + dx), round(y + dy), ...rest])
}

function round(value: number) {
  return Math.round(value * 100) / 100
}

function segmentDistance(px: number, py: number, a: InkPoint, b: InkPoint) {
  const [ax = 0, ay = 0] = a
  const [bx = 0, by = 0] = b
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function insidePolygon(x: number, y: number, polygon: InkPoint[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi = 0, yi = 0] = polygon[i]!
    const [xj = 0, yj = 0] = polygon[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

type HitStroke = { d: string; points?: InkPoint[]; widthMm?: number }

/** Whether a stroke passes within `radius` of a point: near its line, or inside its outline. */
export function strokeHit(stroke: HitStroke, x: number, y: number, radius: number, halfWidth = 0) {
  const line = stroke.points ?? []
  if (line.length === 1) {
    return Math.hypot(x - (line[0]![0] ?? 0), y - (line[0]![1] ?? 0)) <= radius + halfWidth
  }
  for (let index = 1; index < line.length; index += 1) {
    if (segmentDistance(x, y, line[index - 1]!, line[index]!) <= radius + halfWidth) {
      return true
    }
  }
  const outline = pathPoints(stroke.d)
  if (outline.some(([px = 0, py = 0]) => Math.hypot(x - px, y - py) <= radius)) {
    return true
  }
  return outline.length > 2 && insidePolygon(x, y, outline)
}

/** The strokes the lasso holds: those with nearly all of themselves inside it (Word's lasso is as forgiving). */
export function lassoPicks(strokes: HitStroke[], lasso: InkPoint[]) {
  if (lasso.length < 3) {
    return []
  }
  return strokes.flatMap((stroke, index) => {
    const points = stroke.points?.length ? stroke.points : pathPoints(stroke.d)
    if (!points.length) {
      return []
    }
    const inside = points.filter(([x = 0, y = 0]) => insidePolygon(x, y, lasso)).length
    return inside / points.length >= 0.9 ? [index] : []
  })
}

export type Box = { x: number; y: number; width: number; height: number }

export function strokesBox(strokes: HitStroke[]): Box | null {
  const points = strokes.flatMap((stroke) => pathPoints(stroke.d))
  if (!points.length) {
    return null
  }
  const xs = points.map((point) => point[0] ?? 0)
  const ys = points.map((point) => point[1] ?? 0)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

/** Word's Ruler on the canvas: where its drawing edge starts and its turn, in degrees clockwise. */
export type Ruler = { x: number; y: number; angle: number }

/** How near the edge, in canvas units, a stroke must start to be drawn along it. */
export const RULER_REACH = 14

function edge(ruler: Ruler) {
  const radians = (ruler.angle * Math.PI) / 180
  return { ux: Math.cos(radians), uy: Math.sin(radians) }
}

export function distanceToRuler(ruler: Ruler, x: number, y: number) {
  const { ux, uy } = edge(ruler)
  // The distance across the edge's line (a ruler is longer than any canvas).
  return Math.abs((x - ruler.x) * uy - (y - ruler.y) * ux)
}

/**
 * A stroke drawn along the Ruler: begun within reach of its edge, every point is laid on the edge, so the line comes
 * out straight. Points keep their pressure and time.
 */
export function snapToRuler(points: InkPoint[], ruler: Ruler | null): InkPoint[] {
  const [first] = points
  if (!ruler || !first || distanceToRuler(ruler, first[0] ?? 0, first[1] ?? 0) > RULER_REACH) {
    return points
  }
  const { ux, uy } = edge(ruler)
  return points.map(([x = 0, y = 0, ...rest]) => {
    const along = (x - ruler.x) * ux + (y - ruler.y) * uy
    return [round(ruler.x + along * ux), round(ruler.y + along * uy), ...rest]
  })
}
