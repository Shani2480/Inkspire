// Builds src/editor/map-regions.json, the first-level regions a Filled Map draws below a country: Natural Earth's
// admin-1 states and provinces (1:10m, public domain), a TopoJSON per country, simplified to about the detail of
// us-atlas's states.
//
//   curl -L -o admin1.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
//   npm i --no-save topojson-server topojson-simplify topojson-client
//   node docs/maps/build-map-regions.mjs admin1.geojson   (from the repository root, the packages installed beside it)
import { readFileSync, writeFileSync } from "node:fs"
import { quantize } from "topojson-client"
import { topology } from "topojson-server"
import { filter, filterAttachedWeight, presimplify, quantile, simplify } from "topojson-simplify"

// The countries, by Natural Earth's name, and the name the map gives each.
const COUNTRIES = {
  Canada: "Canada",
  Australia: "Australia",
  Germany: "Germany",
  Brazil: "Brazil",
  India: "India",
  China: "China",
  Mexico: "Mexico",
  "South Africa": "South Africa",
  Japan: "Japan",
}
// Specks no one charts on their own.
const LEFT_OUT = new Set(["Jervis Bay Territory", "Macquarie Island", "Lord Howe Island", "Paracel Islands"])

const source = JSON.parse(readFileSync(process.argv[2], "utf8"))
const features = source.features
  .filter((feature) => COUNTRIES[feature.properties.admin] && feature.properties.name)
  .filter((feature) => !LEFT_OUT.has(feature.properties.name))
  .map((feature) => {
    const p = feature.properties
    const code = /^[A-Z]{2}-([A-Z0-9]+)$/.exec(p.iso_3166_2 ?? "")?.[1] ?? ""
    // The local name and the English one, and Natural Earth's other spellings ("Québec" also "Quebec").
    const names = [p.name, p.name_en, ...(p.name_alt ?? "").split("|")]
      .map((name) => (name ?? "").trim())
      .filter((name, index, all) => name && all.indexOf(name) === index)
    return {
      type: "Feature",
      properties: { name: p.name_en || p.name, country: COUNTRIES[p.admin], code, names: names.join("|") },
      geometry: feature.geometry,
    }
  })

// Each country on its own scale, so Berlin keeps the detail Nunavut would take from it: a topology per country, its
// points thinned to the share kept, and islands smaller than the detail left out (a state on the mainland never).
const atlas = {}
for (const country of Object.values(COUNTRIES)) {
  const own = features.filter((feature) => feature.properties.country === country)
  const topo = presimplify(topology({ regions: { type: "FeatureCollection", features: own } }))
  const weight = quantile(topo, 0.04)
  const kept = filter(simplify(topo, weight), filterAttachedWeight(topo, weight * 30))
  // Without the weights simplifying left on each point, and as whole numbers.
  kept.arcs = kept.arcs.map((arc) => arc.map(([x, y]) => [x, y]))
  atlas[country] = quantize(kept, 1e4)
}
writeFileSync("src/editor/map-regions.json", JSON.stringify(atlas))
console.log(features.length, "regions")
