// Builds src/document/docx/preset-geometry.json: the geometry of each of DrawingML's 187 preset shapes (adjust
// values, guide formulas and paths), from presetShapeDefinitions.xml as ECMA-376 publishes it (Part 1, the
// DrawingML geometries annex). The copy below is Apache OpenOffice's (Apache License 2.0):
//
//   curl -L -o presetShapeDefinitions.xml \
//     https://svn.apache.org/repos/asf/openoffice/branches/AOO42X/main/oox/source/export/presetShapeDefinitions.xml
//   node docs/shapes/build-preset-geometry.mjs presetShapeDefinitions.xml
//
// Each shape is { a: adjust guides, g: guides, p: paths }. A guide is [name, formula]; a path is { w, h, f: 0 when
// it is not filled, s: 0 when it is not outlined, c: commands }, a command one of
// ["M", x, y], ["L", x, y], ["A", wR, hR, stAng, swAng], ["Q", x1, y1, x, y], ["C", x1, y1, x2, y2, x, y], ["Z"],
// where each value is a number or a guide's name.
import { readFileSync, writeFileSync } from "node:fs"

const source = readFileSync(process.argv[2], "utf8")
const value = (text) => (/^-?\d+$/.test(text) ? Number(text) : text)
const guides = (block) =>
  [...(block ?? "").matchAll(/<gd name="([^"]+)" fmla="([^"]+)"\s*\/>/g)].map((match) => [match[1], match[2]])
const points = (text) =>
  [...text.matchAll(/<pt x="([^"]+)" y="([^"]+)"\s*\/>/g)].flatMap((m) => [value(m[1]), value(m[2])])

const shapes = {}
for (const match of source.matchAll(/^ {2}<(\w+)>([\s\S]*?)^ {2}<\/\1>/gm)) {
  const [, name, body] = match
  const paths = []
  for (const path of body.matchAll(/<path\b([^>]*?)(?:\/>|>([\s\S]*?)<\/path>)/g)) {
    const attrs = path[1]
    const item = {}
    const w = /\bw="(\d+)"/.exec(attrs)?.[1]
    const h = /\bh="(\d+)"/.exec(attrs)?.[1]
    if (w) item.w = Number(w)
    if (h) item.h = Number(h)
    if (/\bfill="none"/.test(attrs)) item.f = 0
    if (/\bstroke="(?:false|0)"/.test(attrs)) item.s = 0
    item.c = []
    for (const command of (path[2] ?? "").matchAll(
      /<(moveTo|lnTo|arcTo|quadBezTo|cubicBezTo|close)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g,
    )) {
      const [, kind, own, inner] = command
      if (kind === "moveTo") item.c.push(["M", ...points(inner)])
      else if (kind === "lnTo") item.c.push(["L", ...points(inner)])
      else if (kind === "quadBezTo") item.c.push(["Q", ...points(inner)])
      else if (kind === "cubicBezTo") item.c.push(["C", ...points(inner)])
      else if (kind === "close") item.c.push(["Z"])
      else {
        const at = (key) => value(new RegExp(`\\b${key}="([^"]+)"`).exec(own)[1])
        item.c.push(["A", at("wR"), at("hR"), at("stAng"), at("swAng")])
      }
    }
    paths.push(item)
  }
  const shape = { p: paths }
  const adjust = guides(/<avLst[^>]*>([\s\S]*?)<\/avLst>/.exec(body)?.[1])
  const formulas = guides(/<gdLst[^>]*>([\s\S]*?)<\/gdLst>/.exec(body)?.[1])
  if (adjust.length) shape.a = adjust
  if (formulas.length) shape.g = formulas
  shapes[name] = shape
}
writeFileSync("src/document/docx/preset-geometry.json", JSON.stringify(shapes))
console.log(Object.keys(shapes).length, "presets")
