import {
  geoAlbersUsa,
  geoBounds,
  geoConicEqualArea,
  geoMercator,
  geoPath,
  geoProjection,
  type GeoProjection,
} from "d3-geo"
import type { Feature, FeatureCollection, Geometry, Polygon } from "geojson"

/**
 * Word's Filled Map (22.6): each category a country, a state of the United States, or a state or province of one
 * of a few other countries, coloured by its value from the Minimum colour to the Maximum (through a Midpoint colour
 * on a diverging scale), or by its text, a colour per different text. Word draws it from Bing's map data; here the
 * outlines are Natural Earth's countries (world-atlas, 1:110m), the Census Bureau's states (us-atlas, 1:10m) and
 * Natural Earth's states and provinces of Canada, Australia, Germany, Brazil, India, China, Mexico, South Africa
 * and Japan (`map-regions.json`, built by `docs/maps/build-map-regions.mjs`), loaded the first time a map is drawn.
 */

export type MapProjection = "auto" | "mercator" | "miller" | "robinson" | "albers"
export type MapArea = "auto" | "data" | "world"
export type MapLabels = "none" | "bestFit" | "show"

type Country = Feature<Geometry, { name: string }>
/** A state or province: its English name, its country, its ISO 3166-2 code and the names it goes by. */
type Region = Feature<Geometry, { name: string; country: string; code: string; names: string }>

let countries: Country[] | null = null
let states: Country[] | null = null
let regions: Region[] | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

/** The countries, once loaded; null before. */
export function mapCountries() {
  return countries
}

type Topology = Parameters<(typeof import("topojson-client"))["feature"]>[0]

function features<P = { name: string }>(topojson: typeof import("topojson-client"), atlas: unknown, name: string) {
  const topology = ((atlas as { default?: unknown }).default ?? atlas) as Topology
  const object = (topology as unknown as { objects: Record<string, Parameters<typeof topojson.feature>[1]> }).objects[
    name
  ]!
  return (topojson.feature(topology, object) as unknown as FeatureCollection<Geometry, P>).features
}

/** Loads the outlines (once); everything that drew a map without them is told to draw it again. */
export function loadMapCountries() {
  loading ??= Promise.all([
    import("world-atlas/countries-110m.json"),
    import("us-atlas/states-10m.json"),
    import("./map-regions.json"),
    import("topojson-client"),
  ]).then(([world, us, provinces, topojson]) => {
    countries = features(topojson, world, "countries")
    // A topology per country.
    const atlas = ((provinces as { default?: unknown }).default ?? provinces) as Record<string, unknown>
    regions = Object.values(atlas).flatMap((topology) => features<Region["properties"]>(topojson, topology, "regions"))
    // The fifty states and the District of Columbia: Word's map of the United States has no territories.
    states = features(topojson, us, "states").filter((state) => Number(state.id) <= 56 && state.id !== "60")
    for (const listener of listeners) {
      listener()
    }
  })
  return loading
}

/** Calls `listener` once the outlines are loaded; returns the unsubscribe. */
export function onMapCountries(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const NAMES: Record<string, string> = {
  "united states": "United States of America",
  usa: "United States of America",
  us: "United States of America",
  "u s": "United States of America",
  "u s a": "United States of America",
  america: "United States of America",
  uk: "United Kingdom",
  "u k": "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  "russian federation": "Russia",
  korea: "South Korea",
  "republic of korea": "South Korea",
  "korea republic of": "South Korea",
  dprk: "North Korea",
  "czech republic": "Czechia",
  "ivory coast": "Côte d'Ivoire",
  "democratic republic of the congo": "Dem. Rep. Congo",
  "dr congo": "Dem. Rep. Congo",
  drc: "Dem. Rep. Congo",
  "congo kinshasa": "Dem. Rep. Congo",
  "republic of the congo": "Congo",
  "congo brazzaville": "Congo",
  "bosnia and herzegovina": "Bosnia and Herz.",
  bosnia: "Bosnia and Herz.",
  "central african republic": "Central African Rep.",
  "dominican republic": "Dominican Rep.",
  "equatorial guinea": "Eq. Guinea",
  "falkland islands": "Falkland Is.",
  "solomon islands": "Solomon Is.",
  "south sudan": "S. Sudan",
  "western sahara": "W. Sahara",
  "north macedonia": "Macedonia",
  swaziland: "eSwatini",
  uae: "United Arab Emirates",
  "the netherlands": "Netherlands",
  holland: "Netherlands",
  burma: "Myanmar",
  "east timor": "Timor-Leste",
  turkiye: "Turkey",
  "viet nam": "Vietnam",
  "lao pdr": "Laos",
  "the bahamas": "Bahamas",
  "the gambia": "Gambia",
  "northern cyprus": "N. Cyprus",
  "french southern and antarctic lands": "Fr. S. Antarctic Lands",
}

/** A name as typed, without case, accents, punctuation or a leading "the". */
function normal(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** The country a category names, by its own name or a common other one; null when none matches. */
export function matchCountry(name: string, list: Country[] | null = countries): Country | null {
  if (!list || !name.trim()) {
    return null
  }
  const key = normal(name)
  const bare = key.replace(/^the /, "")
  const wanted = normal(NAMES[key] ?? NAMES[bare] ?? bare)
  return list.find((country) => normal(country.properties.name) === wanted) ?? null
}

const POSTAL: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
}

const STATE_NAMES: Record<string, string> = {
  "washington dc": "District of Columbia",
  "washington d c": "District of Columbia",
  "d c": "District of Columbia",
  "washington state": "Washington",
}

/** The state a category names, by its name or its two-letter postal code; null when none matches. */
export function matchState(name: string, list: Country[] | null = states): Country | null {
  if (!list || !name.trim()) {
    return null
  }
  const code = name.trim().toUpperCase()
  const key = normal(name).replace(/ (state|usa|us)$/, "")
  const wanted = normal(POSTAL[code] ?? STATE_NAMES[normal(name)] ?? STATE_NAMES[key] ?? key)
  return list.find((state) => normal(state.properties.name) === wanted) ?? null
}

/**
 * The state or province of `country` a category names, by any of its names ("Bavaria" or "Bayern") or its code
 * ("ON", "NSW"); null when none matches.
 */
export function matchRegion(name: string, country: string, list: Region[] | null = regions): Region | null {
  if (!list || !name.trim()) {
    return null
  }
  const key = normal(name)
  const code = name.trim().toUpperCase()
  return (
    list.find(
      (region) =>
        region.properties.country === country &&
        (region.properties.code === code || region.properties.names.split("|").some((other) => normal(other) === key)),
    ) ?? null
  )
}

/** The countries whose states or provinces the map knows. */
export function regionCountries(list: Region[] | null = regions) {
  return [...new Set((list ?? []).map((region) => region.properties.country))]
}

// Miller's cylindrical projection: Mercator with the latitudes eased, so the poles stay in reach.
function millerRaw(lambda: number, phi: number): [number, number] {
  return [lambda, 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi))]
}

// Robinson's table: the length of each parallel and its distance from the equator, every 5°.
const ROBINSON = [
  [1, 0],
  [0.9986, 0.062],
  [0.9954, 0.124],
  [0.99, 0.186],
  [0.9822, 0.248],
  [0.973, 0.31],
  [0.96, 0.372],
  [0.9427, 0.434],
  [0.9216, 0.4958],
  [0.8962, 0.5571],
  [0.8679, 0.6176],
  [0.835, 0.6769],
  [0.7986, 0.7346],
  [0.7597, 0.7903],
  [0.7186, 0.8435],
  [0.6732, 0.8936],
  [0.6213, 0.9394],
  [0.5722, 0.9761],
  [0.5322, 1],
] as const

function robinsonRaw(lambda: number, phi: number): [number, number] {
  const degrees = Math.min(90, (Math.abs(phi) * 180) / Math.PI)
  const at = Math.min(17, Math.floor(degrees / 5))
  const share = (degrees - at * 5) / 5
  const [x0, y0] = ROBINSON[at]!
  const [x1, y1] = ROBINSON[at + 1]!
  return [0.8487 * (x0 + (x1 - x0) * share) * lambda, 1.3523 * (y0 + (y1 - y0) * share) * Math.sign(phi)]
}

function projectionOf(kind: MapProjection, world: boolean, us: boolean, shown: FeatureCollection): GeoProjection {
  // Automatic: Albers for the United States (Alaska and Hawaii moved in beside the others), Miller for the whole
  // world, as Word shows them, and Mercator for a part of it.
  const chosen = kind === "auto" ? (us ? "albers" : world ? "miller" : "mercator") : kind
  if (chosen === "albers" && us) {
    return geoAlbersUsa()
  }
  if (chosen === "albers") {
    // Elsewhere an equal-area cone on the area shown: its standard parallels a sixth in from its edges.
    const [[west, south], [east, north]] = geoBounds(shown)
    const middle = west <= east ? (west + east) / 2 : (west + east + 360) / 2
    const span = Math.max(1, north - south)
    return geoConicEqualArea()
      .rotate([-middle, 0])
      .parallels([south + span / 6, north - span / 6])
  }
  if (chosen === "miller") {
    return geoProjection(millerRaw)
  }
  if (chosen === "robinson") {
    return geoProjection(robinsonRaw)
  }
  return geoMercator()
}

export type MapPoint = { index: number; name: string; value: number }

export type MapDrawing = {
  /** Each region with data: its category, the outline as a path, where its label goes, and its size there. */
  shapes: { point: MapPoint; d: string; at: [number, number]; size: [number, number] }[]
  /** The countries without data, as one path. */
  rest: string
  /** Categories whose names no country matched. */
  unmatched: string[]
}

/**
 * The map in the box: the countries with data, and the others around them that the map area shows. Without the
 * outlines loaded, null.
 */
export function drawMap(
  points: MapPoint[],
  box: { x: number; y: number; w: number; h: number },
  options: { projection?: MapProjection; area?: MapArea },
): MapDrawing | null {
  if (!countries || !states || !regions) {
    return null
  }
  // The level the data is at, as Word picks it: countries, or the states or provinces of the country most
  // categories name one of (countries first on a tie, then the United States).
  const named = (match: (name: string) => Country | null) => points.filter((point) => match(point.name)).length
  const levels: { country: string | null; match: (name: string) => Country | null; count: number }[] = [
    { country: null, match: (name) => matchCountry(name), count: 0 },
    { country: "United States", match: (name) => matchState(name), count: 0 },
    ...regionCountries().map((country) => ({
      country,
      match: (name: string) => matchRegion(name, country) as Country | null,
      count: 0,
    })),
  ]
  for (const level of levels) {
    level.count = named(level.match)
  }
  const level = levels.reduce((best, next) => (next.count > best.count ? next : best))
  const us = level.country === "United States"
  const within = level.country !== null
  const list: Country[] = !within
    ? countries
    : us
      ? states
      : (regions ?? []).filter((region) => region.properties.country === level.country)
  const matched: { point: MapPoint; country: Country }[] = []
  const unmatched: string[] = []
  for (const point of points) {
    const country = level.match(point.name)
    if (country) {
      matched.push({ point, country })
    } else {
      unmatched.push(point.name)
    }
  }
  // The whole country for states, unless only the regions with data are asked for.
  const world = options.area === "world" || matched.length === 0 || (within && options.area !== "data")
  // Antarctica only when it has data: Word's world map leaves it out.
  const shown = world
    ? list.filter(
        (country) => country.properties.name !== "Antarctica" || matched.some((item) => item.country === country),
      )
    : matched.map((item) => item.country)
  const collection = { type: "FeatureCollection", features: shown } as FeatureCollection
  const projection = projectionOf(options.projection ?? "auto", world && !within, us, collection)
  projection.fitExtent(
    [
      [box.x, box.y],
      [box.x + box.w, box.y + box.h],
    ],
    collection,
  )
  const path = geoPath(projection)
  const withData = new Set(matched.map((item) => item.country))
  // The countries without data that fall in the box, so the map has its neighbours round it.
  const rest = list
    .filter((country) => !withData.has(country) && country.properties.name !== "Antarctica")
    .filter((country) => {
      const [[left, top], [right, bottom]] = path.bounds(country)
      return right >= box.x && left <= box.x + box.w && bottom >= box.y && top <= box.y + box.h
    })
    .map((country) => path(country) ?? "")
    .join("")
  return {
    shapes: matched.map(({ point, country }) => ({ point, d: path(country) ?? "", ...labelSpot(country, projection) })),
    rest,
    unmatched,
  }
}

type Ring = [number, number][]

/** A polygon as drawn: its rings in the box, the antimeridian's cuts and all. */
function drawnRings(polygon: Polygon, projection: GeoProjection) {
  const rings: Ring[] = []
  geoPath(projection, {
    moveTo: (x: number, y: number) => rings.push([[x, y]]),
    lineTo: (x: number, y: number) => rings[rings.length - 1]?.push([x, y]),
    closePath: () => {},
    arc: () => {},
    beginPath: () => {},
  } as unknown as CanvasRenderingContext2D)(polygon)
  return rings.filter((ring) => ring.length > 2)
}

/** A ring's area, signed by the way it winds: a hole winds the other way round from the outline it is in. */
function ringArea(ring: Ring) {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0] + ring[i]![0]) * (ring[j]![1] - ring[i]![1])
  }
  return sum / 2
}

/** Where the rings cross the line at `y`, left to right. */
function crossings(rings: Ring[], y: number) {
  const xs: number[] = []
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j]!
      const [x1, y1] = ring[i]!
      if (y0 > y !== y1 > y) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0))
      }
    }
  }
  return xs.sort((a, b) => a - b)
}

/** How far a point is from the nearest edge. */
function edgeDistance(rings: Ring[], x: number, y: number) {
  let best = Infinity
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j]!
      const [x1, y1] = ring[i]!
      const dx = x1 - x0
      const dy = y1 - y0
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy))) : 0
      best = Math.min(best, Math.hypot(x - x0 - t * dx, y - y0 - t * dy))
    }
  }
  return best
}

/**
 * Where a region's label goes: on its largest piece (the mainland, not its islands), at the point furthest inside
 * it, centred on the stretch of the region across that line; with the room there, the stretch's width and twice
 * the distance to the nearest edge.
 */
function labelSpot(region: Country, projection: GeoProjection) {
  const geometry = region.geometry
  const polygons: Polygon[] =
    geometry.type === "Polygon"
      ? [geometry]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }))
        : []
  let rings: Ring[] = []
  let largest = -1
  for (const polygon of polygons) {
    const drawn = drawnRings(polygon, projection)
    // The outlines less the holes (an outline cut at the antimeridian comes as two rings, both outlines).
    const area = Math.abs(drawn.reduce((sum, ring) => sum + ringArea(ring), 0))
    if (area > largest) {
      largest = area
      rings = drawn
    }
  }
  const fallback = geoPath(projection).centroid(region)
  if (!rings.length) {
    return { at: [fallback[0], fallback[1]] as [number, number], size: [0, 0] as [number, number] }
  }
  const all = rings.flat()
  const left = Math.min(...all.map((p) => p[0]))
  const right = Math.max(...all.map((p) => p[0]))
  const top = Math.min(...all.map((p) => p[1]))
  const bottom = Math.max(...all.map((p) => p[1]))
  // The point furthest inside, from a grid over the piece: on each line across it, the middle of each stretch
  // inside.
  let best = { x: (left + right) / 2, y: (top + bottom) / 2, room: -1, width: 0 }
  const steps = 24
  for (let row = 1; row < steps; row++) {
    const y = top + ((bottom - top) * row) / steps
    const xs = crossings(rings, y)
    for (let at = 0; at + 1 < xs.length; at += 2) {
      const width = xs[at + 1]! - xs[at]!
      const x = (xs[at]! + xs[at + 1]!) / 2
      const room = Math.min(edgeDistance(rings, x, y), width / 2)
      // Wide stretches first, as a label is wider than it is high.
      if (room * 2 + width / 4 > best.room * 2 + best.width / 4) {
        best = { x, y, room, width }
      }
    }
  }
  if (best.room < 0) {
    return {
      at: [fallback[0], fallback[1]] as [number, number],
      size: [right - left, bottom - top] as [number, number],
    }
  }
  return { at: [best.x, best.y] as [number, number], size: [best.width, best.room * 2] as [number, number] }
}

/** A colour between two, by `share` (0 to 1). */
export function mixColor(from: string, to: string, share: number) {
  const parse = (color: string) => {
    const hex = /^#?([0-9a-f]{6})$/i.exec(color.trim())?.[1] ?? "808080"
    return [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16))
  }
  const a = parse(from)
  const b = parse(to)
  const t = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0))
  return `#${a
    .map((value, index) =>
      Math.round(value + (b[index]! - value) * t)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}
