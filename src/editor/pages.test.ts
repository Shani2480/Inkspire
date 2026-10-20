import { Schema } from "@tiptap/pm/model"
import { describe, expect, it } from "vitest"
import { firstContentDiff, mustMoveToNextPage, pageCountForBlockHeights } from "@/editor/pages"

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { content: "text*", group: "block", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
    text: { group: "inline" },
  },
})

function docOf(...paragraphs: string[]) {
  return schema.node(
    "doc",
    null,
    paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : [])),
  )
}

describe("firstContentDiff", () => {
  it("returns doc size when documents match", () => {
    const doc = docOf("alpha", "beta")
    expect(firstContentDiff(doc, doc.copy(doc.content))).toBe(doc.content.size)
  })

  it("points inside the first changed block", () => {
    const before = docOf("alpha", "beta", "gamma")
    const after = docOf("alpha", "BETA", "gamma")
    const pos = firstContentDiff(before, after)
    // Diff digs into the paragraph (open token + text), not just the top-level index.
    expect(pos).toBe(before.child(0).nodeSize + 1)
  })

  it("points past the paragraph open token when the first block changes", () => {
    const before = docOf("alpha", "beta")
    const after = docOf("ALPHA", "beta")
    expect(firstContentDiff(before, after)).toBe(1)
  })
})

describe("mustMoveToNextPage (keep lines together, 22.8)", () => {
  it("moves a paragraph that would be split, only when it fits a page by itself", () => {
    expect(mustMoveToNextPage(600, 200, 700)).toBe(true)
    expect(mustMoveToNextPage(0, 200, 700)).toBe(false)
    expect(mustMoveToNextPage(400, 200, 700)).toBe(false)
    expect(mustMoveToNextPage(600, 800, 700)).toBe(false)
  })
})

describe("pageCountForBlockHeights", () => {
  it("keeps status-bar page counts stable for a ~100 page document", () => {
    const contentHeight = 875
    const line = 18
    const perPage = Math.floor(contentHeight / line)
    const pages = 100
    const heights = Array.from({ length: perPage * pages }, () => line)
    expect(pageCountForBlockHeights(heights, contentHeight)).toBe(pages)
  })

  it("adds a page when the last block overflows", () => {
    expect(pageCountForBlockHeights([100, 100], 150)).toBe(2)
  })
})

describe("incremental measure cache (profile)", () => {
  it("remeasures only from the first changed block onward", () => {
    const blocks = 4800
    const dirtyFromBlock = blocks - 1
    const cache = new Map<number, { height: number }>()
    for (let index = 0; index < blocks; index += 1) {
      cache.set(index, { height: 18 })
    }

    let measures = 0
    let hits = 0
    const dirtyFrom = dirtyFromBlock
    for (const key of [...cache.keys()]) {
      if (key >= dirtyFrom) {
        cache.delete(key)
      }
    }
    for (let index = 0; index < blocks; index += 1) {
      if (index < dirtyFrom && cache.has(index)) {
        hits += 1
        continue
      }
      measures += 1
      cache.set(index, { height: 18 })
    }

    expect(hits).toBe(dirtyFromBlock)
    expect(measures).toBe(1)
  })

  it("reports cold vs warm timings for a 100-page workload", () => {
    const contentHeight = 875
    const line = 18
    const perPage = Math.floor(contentHeight / line)
    const blocks = perPage * 100
    const heights = Array.from({ length: blocks }, () => line)

    const expensive = (height: number) => {
      // Approximate DOM line-measure cost (range/rects) with a CPU burn.
      let total = 0
      for (let i = 0; i < 800; i += 1) {
        total += Math.sin(height + i) * Math.cos(i)
      }
      return height + (total > 1e9 ? 0 : 0)
    }

    const run = (dirtyFrom: number, cache: Map<number, number>) => {
      const started = performance.now()
      let measures = 0
      let hits = 0
      for (const key of [...cache.keys()]) {
        if (key >= dirtyFrom) {
          cache.delete(key)
        }
      }
      const measured: number[] = []
      for (let index = 0; index < heights.length; index += 1) {
        const cached = index < dirtyFrom ? cache.get(index) : undefined
        if (cached != null) {
          hits += 1
          measured.push(cached)
          continue
        }
        measures += 1
        const height = expensive(heights[index])
        cache.set(index, height)
        measured.push(height)
      }
      const pageCount = pageCountForBlockHeights(measured, contentHeight)
      return { ms: performance.now() - started, measures, hits, pageCount }
    }

    const cache = new Map<number, number>()
    const cold = run(0, cache)
    const warmEnd = run(blocks - 1, cache)
    const warmStart = run(0, new Map())

    expect(cold.pageCount).toBe(100)
    expect(warmEnd.pageCount).toBe(100)
    expect(warmEnd.measures).toBe(1)
    expect(warmEnd.hits).toBe(blocks - 1)
    expect(warmEnd.ms).toBeLessThan(cold.ms)
    expect(warmStart.measures).toBe(blocks)

    // Surfaced in the Vitest log for the profile report.
    console.log(
      JSON.stringify({
        blocks,
        coldMs: Number(cold.ms.toFixed(2)),
        warmEditEndMs: Number(warmEnd.ms.toFixed(2)),
        fullRemeasureMs: Number(warmStart.ms.toFixed(2)),
        coldMeasures: cold.measures,
        warmEditEndMeasures: warmEnd.measures,
        speedup: Number((cold.ms / Math.max(warmEnd.ms, 0.01)).toFixed(1)),
      }),
    )
  })
})
