import { formatBytes } from "@/ai/local"
import { DialogButtons, DialogFrame } from "@/components/word-dialog"
import { useHelperTools } from "@/document/helper-tools"

/** Asks before downloading Pandoc or Typst for a feature that needs them, and shows the download. */
export function HelperToolsDialog() {
  const asking = useHelperTools((state) => state.asking)
  const tools = useHelperTools((state) => state.tools)
  const installing = useHelperTools((state) => state.installing)
  const progress = useHelperTools((state) => state.progress)
  if (!asking) {
    return null
  }
  const needed = asking.ids.map((id) => tools.find((tool) => tool.id === id)).filter((tool) => tool !== undefined)
  const finish = (download: boolean) => {
    const answer = asking.answer
    useHelperTools.setState({ asking: null })
    answer(download)
  }
  const total = needed.reduce((sum, tool) => sum + tool.size, 0)
  return (
    <DialogFrame title="Download a helper tool" width={440} level={150} onClose={() => finish(false)}>
      <p className="first-run-intro">
        This needs {needed.map((tool) => tool.label).join(" and ")}, which Inkspire does not ship with. It is a free
        program, downloaded once from its official release page ({formatBytes(total)}) and checked before it is used.
      </p>
      <ul className="first-run-intro list-disc pl-5">
        {needed.map((tool) => (
          <li key={tool.id}>
            {tool.label} {tool.version} · {formatBytes(tool.size)} · {tool.purpose}
          </li>
        ))}
      </ul>
      {installing && progress ? (
        <p role="status">Downloading… {Math.round((progress.received / Math.max(1, progress.total)) * 100)}%</p>
      ) : null}
      <DialogButtons ok="Download" cancel="Not now" onOk={() => finish(true)} onCancel={() => finish(false)} />
    </DialogFrame>
  )
}
