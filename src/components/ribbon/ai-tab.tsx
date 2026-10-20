import { useAiChat } from "@/ai/chat"
import { stopActiveGeneration } from "@/ai/generate"
import { useRewrite } from "@/ai/rewrite"
import { defaultModel, useAiSettings, type AiProviderName } from "@/ai/settings"
import { captureTemplatePlace } from "@/ai/template-place"
import { ChevronDownIcon, RibbonSvg } from "@/components/ribbon/icons"
import { MenuButton, RibbonCommand, RibbonGroup, RibbonHover, RibbonPopover } from "@/components/ribbon/ribbon-button"
import {
  LineChatIcon,
  LineKeyIcon,
  LineRewriteIcon,
  LineStopIcon,
  LineSummarizeIcon,
  LineTemplateIcon,
  LineVariablesIcon,
} from "@/components/ribbon/line-icons"
import { SingleLineBar, type LineCommand, type LineGroup } from "@/components/ribbon/single-line"
import { useViewStore } from "@/document/view"
import { rewriteSelection, summarizeDocument } from "@/editor/actions"
import { EngineChip } from "@/components/engine-chip"
import { useDocumentEditor } from "@/editor/document-editor"

const PROVIDERS: { value: AiProviderName; label: string }[] = [
  { value: "builtin", label: "Built-in engine" },
  { value: "ollama", label: "Local Ollama" },
  { value: "lmstudio", label: "LM Studio" },
  { value: "compatible", label: "Custom endpoint" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
]

export function AiTab() {
  const editor = useDocumentEditor()
  const provider = useAiSettings((state) => state.provider)
  const model = useAiSettings((state) => state.model)
  const running = useAiSettings((state) => state.running)
  const rewriteOpen = useRewrite((state) => state.open)
  const setProvider = useAiSettings((state) => state.setProvider)
  const setModel = useAiSettings((state) => state.setModel)
  const chatOpen = useAiChat((state) => state.open)
  const setBuilderOpen = useAiSettings((state) => state.setBuilderOpen)
  const setVariablesOpen = useAiSettings((state) => state.setVariablesOpen)
  const setKeysOpen = useAiSettings((state) => state.setKeysOpen)
  const toggleChat = useAiChat((state) => state.toggle)
  const busy = !editor || running || rewriteOpen
  const providerLabel = PROVIDERS.find((item) => item.value === provider)?.label ?? "Provider"
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const generating = running && !rewriteOpen

  const summarize = () => editor && void summarizeDocument(editor)
  const rewrite = () => editor && void rewriteSelection(editor)
  const openBuilder = () => {
    if (!editor) {
      return
    }
    captureTemplatePlace(editor.state.selection.from, editor.state.selection.to)
    setBuilderOpen(true)
  }
  const providerMenu = (close: () => void) => (
    <div className="flex w-44 flex-col">
      {PROVIDERS.map((item) => (
        <MenuButton
          key={item.value}
          selected={provider === item.value}
          onClick={() => {
            setProvider(item.value)
            close()
          }}
        >
          {item.label}
        </MenuButton>
      ))}
    </div>
  )
  const modelInput = (className: string) => (
    <input
      aria-label="AI model"
      value={model}
      disabled={running}
      placeholder={defaultModel(provider)}
      className={className}
      onChange={(event) => setModel(event.target.value)}
    />
  )

  if (ribbonLayout === "single") {
    const write: LineCommand[] = [
      {
        id: "summarize",
        label: "Summarize",
        icon: <LineSummarizeIcon />,
        priority: 2,
        disabled: busy,
        onClick: summarize,
      },
      { id: "rewrite", label: "Rewrite", icon: <LineRewriteIcon />, priority: 2, disabled: busy, onClick: rewrite },
      {
        id: "chat",
        label: "Chat",
        icon: <LineChatIcon />,
        priority: 1,
        active: chatOpen,
        disabled: !editor,
        onClick: toggleChat,
      },
    ]
    const create: LineCommand[] = [
      {
        id: "template-builder",
        label: "Template Builder",
        icon: <LineTemplateIcon />,
        disabled: busy,
        onClick: openBuilder,
      },
    ]
    const documentCommands: LineCommand[] = [
      {
        id: "fill-variables",
        label: "Fill Variables",
        icon: <LineVariablesIcon />,
        disabled: !editor,
        onClick: () => setVariablesOpen(true),
      },
    ]
    const modelCommands: LineCommand[] = [
      { id: "ai-keys", label: "AI Settings", icon: <LineKeyIcon />, onClick: () => setKeysOpen(true) },
      ...(generating
        ? [{ id: "stop", label: "Stop", icon: <LineStopIcon />, priority: 3, onClick: () => stopActiveGeneration() }]
        : []),
    ]
    // The model choice is set once, so it lives in More options.
    const more: LineGroup[] = [
      {
        id: "model",
        commands: [
          { id: "provider", label: `Provider: ${providerLabel}`, menu: providerMenu },
          { id: "model", label: "Model", field: modelInput("line-text-field") },
        ],
      },
    ]
    return (
      <SingleLineBar
        label="AI Tools"
        groups={[
          { id: "write", commands: write.map((command) => ({ ...command, showLabel: true })) },
          { id: "create", commands: create.map((command) => ({ ...command, showLabel: true })) },
          { id: "document", commands: documentCommands.map((command) => ({ ...command, showLabel: true })) },
          { id: "model", commands: modelCommands.map((command) => ({ ...command, showLabel: true })) },
        ]}
        more={more}
      />
    )
  }

  return (
    <div role="toolbar" aria-label="AI Tools" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Write" className="shrink-0">
        <RibbonCommand label="Summarize" disabled={busy} onClick={summarize}>
          <SummarizeIcon />
        </RibbonCommand>
        <RibbonCommand label="Rewrite" disabled={busy} onClick={rewrite}>
          <RewriteIcon />
        </RibbonCommand>
        <RibbonCommand label="Chat" active={chatOpen} disabled={!editor} onClick={toggleChat}>
          <ChatIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Create" className="shrink-0">
        <RibbonCommand label="Template Builder" disabled={busy} onClick={openBuilder}>
          <TemplateIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Document" className="shrink-0">
        <RibbonCommand label="Fill Variables" disabled={!editor} onClick={() => setVariablesOpen(true)}>
          <VariablesIcon />
        </RibbonCommand>
      </RibbonGroup>
      <RibbonGroup label="Model" className="shrink-0">
        <div className="flex flex-col justify-center gap-1 pr-1 pt-1">
          <RibbonPopover label="Provider" className="ribbon-combo w-36" disabled={running} content={providerMenu}>
            <span className="truncate">{providerLabel}</span>
            <ChevronDownIcon />
          </RibbonPopover>
          <RibbonHover label="Model">{modelInput("ribbon-combo w-36 outline-none focus:border-[#0f6cbd]")}</RibbonHover>
          <EngineChip />
        </div>
        <RibbonCommand label="AI Settings" onClick={() => setKeysOpen(true)}>
          <KeysIcon />
        </RibbonCommand>
        {generating ? (
          <RibbonCommand label="Stop" onClick={() => stopActiveGeneration()}>
            <StopIcon />
          </RibbonCommand>
        ) : null}
      </RibbonGroup>
    </div>
  )
}

function SummarizeIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2.2" y="1.6" width="9.2" height="12.6" rx="1" fill="#fff" stroke="#5c5c5c" strokeWidth="1" />
      <path d="M4.2 4.6h5.2M4.2 7h5.2M4.2 9.4h3.2" stroke="#8a8a8a" strokeWidth="0.9" />
      <path d="M9.2 9.2h4.4v4.2H9.2z" fill="#deecf9" stroke="#0f6cbd" strokeWidth="1" />
      <path d="M10.2 11.3h2.4" stroke="#0f6cbd" strokeWidth="1" />
    </RibbonSvg>
  )
}

function RewriteIcon() {
  return (
    <RibbonSvg size={20}>
      <path d="M3.2 12.6 9.4 6.4l1.8 1.8-6.2 6.2H3.2z" fill="#fff4ce" stroke="#8a6116" strokeWidth="1" />
      <path d="M9.2 5.6 11 3.8l1.8 1.8-1.8 1.8z" fill="#0f6cbd" />
      <path d="M3 3.2a5 5 0 0 1 6.2-.4" stroke="#107c10" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.2 2.2 9.4 3.4 8 4.2" stroke="#107c10" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </RibbonSvg>
  )
}

function TemplateIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2.4" y="2.2" width="8.4" height="11.2" rx="1" fill="#fff" stroke="#5c5c5c" strokeWidth="1" />
      <path d="M4.2 5.2h4.6M4.2 7.4h4.6M4.2 9.6h3" stroke="#8a8a8a" strokeWidth="0.9" />
      <path d="M10.2 8.2 12.4 6.4l1.6 1.4-2.2 1.8z" fill="#7c3aed" />
      <path d="M12.8 4.2 13.4 5.6 14.8 6.2 13.4 6.8 12.8 8.2 12.2 6.8 10.8 6.2 12.2 5.6z" fill="#c4b5fd" />
    </RibbonSvg>
  )
}

function VariablesIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="2.2" y="1.8" width="11.6" height="12.4" rx="1" fill="#fff" stroke="#5c5c5c" strokeWidth="1" />
      <path
        d="M5.2 6.2 3.6 8l1.6 1.8M10.8 6.2 12.4 8l-1.6 1.8"
        stroke="#0f6cbd"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M8.6 5.4 7.2 10.6" stroke="#107c10" strokeWidth="1.1" strokeLinecap="round" />
    </RibbonSvg>
  )
}

function KeysIcon() {
  return (
    <RibbonSvg size={20}>
      <circle cx="6" cy="6.2" r="3.1" fill="#fff4ce" stroke="#ca5010" strokeWidth="1.1" />
      <circle cx="6" cy="6.2" r="1.1" fill="#ca5010" />
      <path
        d="M8.6 7.6 13.4 12.4M11.2 10.2l1.6 1.6M12.4 11.4l1.2 1.2"
        stroke="#5c5c5c"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </RibbonSvg>
  )
}

function StopIcon() {
  return (
    <RibbonSvg size={20}>
      <rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.2" fill="#d13438" />
    </RibbonSvg>
  )
}

function ChatIcon() {
  return (
    <RibbonSvg size={20}>
      <path
        d="M3.2 3.4h9.6a1.2 1.2 0 0 1 1.2 1.2v6a1.2 1.2 0 0 1-1.2 1.2H7.2L4.4 14.2V11.8H3.2A1.2 1.2 0 0 1 2 10.6v-6A1.2 1.2 0 0 1 3.2 3.4z"
        fill="#deecf9"
        stroke="#0f6cbd"
        strokeWidth="1"
      />
      <path d="M5 6.4h6.2M5 8.6h4.4" stroke="#0f6cbd" strokeWidth="0.9" strokeLinecap="round" />
    </RibbonSvg>
  )
}
