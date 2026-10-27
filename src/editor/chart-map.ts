import { geoCentroid, geoMercator, geoPath, geoProjection, type GeoProjection } from "d3-geo"
import type { Feature, FeatureCollection, Geometry } from "geojson"

/**
 * Word's Filled Map (22.6): each category a country or region, coloured by its value from the Minimum colour to
 * the Maximum. Word draws it from Bing's map data; here the outlines are Natural Earth's countries (world-atlas,
 * 1:110m), loaded the first time a map is drawn.
 */

export type MapProjection = "auto" | "mercator" | "miller" | "robinson"
export type MapArea = "auto" | "data" | "world"
export type MapLabels = "none" | "show"

type Country = Feature<Geometry, { name: string }>

let countries: Country[] | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

/** The countries, once loaded; null before. */
export function mapCountries() {
  return countries
}

/** Loads the outlines (once); everything that drew a map without them is told to draw it again. */
export function loadMapCountries() {
  loading ??= Promise.all([import("world-atlas/countries-110m.json"), import("topojson-client")]).then(
    ([atlas, topojson]) => {
      const topology = (atlas.default ?? atlas) as unknown as Parameters<typeof topojson.feature>[0]
      const collection = topojson.feature(
        topology,
        (topology as unknown as { objects: { countries: Parameters<typeof topojson.feature>[1] } }).objects.countries,
      ) as unknown as FeatureCollection<Geometry, { name: string }>
      countries = collection.features
      for (const listener of listeners) {
        listener()
      }
    },
  )
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

function projectionOf(kind: MapProjection, world: boolean): GeoProjection {
  // Automatic: Miller for the whole world, as Word shows it, and Mercator for a part of it.
  const chosen = kind === "auto" ? (world ? "miller" : "mercator") : kind
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
  /** Each country with data: its category, the outline as a path, and where its label goes. */
  shapes: { point: MapPoint; d: string; at: [number, number] }[]
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
  if (!countries) {
    return null
  }
  const matched: { point: MapPoint; country: Country }[] = []
  const unmatched: string[] = []
  for (const point of points) {
    const country = matchCountry(point.name)
    if (country) {
      matched.push({ point, country })
    } else {
      unmatched.push(point.name)
    }
  }
  const world = options.area === "world" || matched.length === 0
  // Antarctica only when it has data: Word's world map leaves it out.
  const shown = world
    ? countries.filter(
        (country) => country.properties.name !== "Antarctica" || matched.some((item) => item.country === country),
      )
    : matched.map((item) => item.country)
  const projection = projectionOf(options.projection ?? "auto", world)
  projection.fitExtent(
    [
      [box.x, box.y],
      [box.x + box.w, box.y + box.h],
    ],
    { type: "FeatureCollection", features: shown } as FeatureCollection,
  )
  const path = geoPath(projection)
  const withData = new Set(matched.map((item) => item.country))
  // The countries without data that fall in the box, so the map has its neighbours round it.
  const rest = countries
    .filter((country) => !withData.has(country) && country.properties.name !== "Antarctica")
    .filter((country) => {
      const [[left, top], [right, bottom]] = path.bounds(country)
      return right >= box.x && left <= box.x + box.w && bottom >= box.y && top <= box.y + box.h
    })
    .map((country) => path(country) ?? "")
    .join("")
  return {
    shapes: matched.map(({ point, country }) => {
      const centre = projection(geoCentroid(country)) ?? path.centroid(country)
      return { point, d: path(country) ?? "", at: [centre[0], centre[1]] as [number, number] }
    }),
    rest,
    unmatched,
  }
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
  return `#${a.map((value, index) => Math.round(value + (b[index]! - value) * t).toString(16).padStart(2, "0")).join("")}`
}
