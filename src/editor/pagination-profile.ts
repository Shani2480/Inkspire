import { pageMetrics } from "@/document/page-setup"
import { useDocumentStore } from "@/document/store"
import type { Editor } from "@tiptap/react"

export type PaginationProfileSample = {
  label: string
  pageCount: number
  lastLayoutMs: number
  lastMeasureCount: number
  lastCacheHits: number
  lastDirtyFrom: number
}

export type PaginationProfileResult = {
  pagesTarget: number
  blocks: number
  samples: PaginationProfileSample[]
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function snapshotPeak(editor: Editor, label: string): PaginationProfileSample {
  const storage = editor.storage.pagination
  return {
    label,
    pageCount: storage?.pageCount ?? 0,
    lastLayoutMs: Number((storage?.peakLayoutMs ?? storage?.lastLayoutMs ?? 0).toFixed(2)),
    lastMeasureCount: storage?.peakMeasureCount ?? storage?.lastMeasureCount ?? 0,
    lastCacheHits: storage?.peakCacheHits ?? storage?.lastCacheHits ?? 0,
    lastDirtyFrom: storage?.peakDirtyFrom ?? storage?.lastDirtyFrom ?? 0,
  }
}

function resetLayoutStats(editor: Editor) {
  const storage = editor.storage.pagination
  if (!storage) {
    return
  }
  storage.lastLayoutMs = 0
  storage.lastMeasureCount = -1
  storage.lastCacheHits = 0
  storage.lastDirtyFrom = 0
  storage.peakLayoutMs = 0
  storage.peakMeasureCount = -1
  storage.peakCacheHits = 0
  storage.peakDirtyFrom = 0
}

function fillerDocument(blockCount: number) {
  const chunks: string[] = []
  for (let index = 0; index < blockCount; index += 1) {
    chunks.push(`<p>Pagination profile filler paragraph ${index + 1}.</p>`)
  }
  return chunks.join("")
}

async function waitFrames(count: number) {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
  }
}

/** Wait until a fresh layout pass has been recorded since reset. */
async function sampleAfterReset(editor: Editor, label: string, minPages: number) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    await waitFrames(1)
    const storage = editor.storage.pagination
    if ((storage?.peakMeasureCount ?? -1) < 0 && (storage?.lastMeasureCount ?? -1) < 0) {
      await sleep(8)
      continue
    }
    if ((storage?.pageCount ?? 0) >= minPages && attempt > 6) {
      await waitFrames(6)
      break
    }
    await sleep(8)
  }
  return snapshotPeak(editor, label)
}

/** Build ~100 pages, then sample cold / end-edit / page-1-edit layout stats. */
export async function runPaginationProfile(editor: Editor): Promise<PaginationProfileResult> {
  const metrics = pageMetrics(useDocumentStore.getState().pageSetup)
  const blocksPerPage = Math.max(1, Math.round(metrics.contentHeight / 40))
  const pagesTarget = 100
  const blocks = blocksPerPage * pagesTarget

  resetLayoutStats(editor)
  editor.commands.setContent(fillerDocument(blocks), { emitUpdate: true })
  const cold = await sampleAfterReset(editor, "cold layout", Math.max(40, pagesTarget - 40))

  resetLayoutStats(editor)
  editor.chain().focus("end").insertContent(" END").run()
  const endEdit = await sampleAfterReset(editor, "typing at end", Math.max(1, cold.pageCount - 5))

  resetLayoutStats(editor)
  const firstBlock = editor.state.doc.firstChild
  const replaceTo = firstBlock ? Math.min(1 + 12, 1 + firstBlock.content.size) : 1
  editor.chain().focus("start").insertContentAt({ from: 1, to: replaceTo }, "START ").run()
  const startEdit = await sampleAfterReset(editor, "typing on page 1", Math.max(1, cold.pageCount - 5))

  return { pagesTarget, blocks, samples: [cold, endEdit, startEdit] }
}

export function formatPaginationProfileMarkdown(
  result: PaginationProfileResult,
  synthetic?: { coldMs: number; warmEditEndMs: number },
) {
  const lines = [
    "## Live editor (DEV profile)",
    "",
    `Generated ~${result.pagesTarget} pages (${result.blocks} paragraphs) in the running TipTap editor via \`runPaginationProfile\` (Ctrl+Shift+Alt+P or \`window.__AIWORD_PROFILE_PAGINATION__\`).`,
    "",
    "| Scenario | Pages | lastLayoutMs | lastMeasureCount | lastCacheHits |",
    "| --- | ---: | ---: | ---: | ---: |",
  ]
  for (const sample of result.samples) {
    lines.push(
      `| ${sample.label} | ${sample.pageCount} | **${sample.lastLayoutMs}** | ${sample.lastMeasureCount} | ${sample.lastCacheHits} |`,
    )
  }
  if (synthetic) {
    lines.push("")
    lines.push(
      `Synthetic stand-in (from unit tests) for comparison: cold **${synthetic.coldMs} ms**, edit-at-end **${synthetic.warmEditEndMs} ms**.`,
    )
  }
  return `${lines.join("\n")}\n`
}

declare global {
  interface Window {
    __AIWORD_PROFILE_PAGINATION__?: () => Promise<PaginationProfileResult>
  }
}

export function installPaginationProfileCommand(getEditor: () => Editor | null) {
  if (!import.meta.env.DEV) {
    return () => undefined
  }

  window.__AIWORD_PROFILE_PAGINATION__ = async () => {
    const editor = getEditor()
    if (!editor) {
      throw new Error("Editor is not ready")
    }
    const result = await runPaginationProfile(editor)
    console.info("[Inkspire pagination profile]", result)
    console.info(formatPaginationProfileMarkdown(result, { coldMs: 92.93, warmEditEndMs: 0.95 }))
    return result
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || !event.altKey) {
      return
    }
    if (event.key.toLowerCase() !== "p") {
      return
    }
    event.preventDefault()
    void window.__AIWORD_PROFILE_PAGINATION__?.()
  }

  window.addEventListener("keydown", onKeyDown, true)
  return () => {
    window.removeEventListener("keydown", onKeyDown, true)
    delete window.__AIWORD_PROFILE_PAGINATION__
  }
}
