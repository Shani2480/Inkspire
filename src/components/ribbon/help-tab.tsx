import { RibbonCommand, RibbonGroup } from "@/components/ribbon/ribbon-button"
import { RibbonSvg } from "@/components/ribbon/icons"
import { SingleLineBar, type LineCommand } from "@/components/ribbon/single-line"
import { useHelp, type HelpDialog } from "@/document/help"
import { useViewStore } from "@/document/view"
import type { ReactNode } from "react"

type HelpCommand = {
  id: HelpDialog
  label: string
  description: string
  shortcut?: string
  icon: (size: number) => ReactNode
}

/** Word for the web's Help tab: one group, the same five commands in both layouts. */
const HELP_COMMANDS: HelpCommand[] = [
  {
    id: "help",
    label: "Help",
    description: "Find answers to common questions about Inkspire.",
    shortcut: "F1",
    icon: (size) => <HelpIcon size={size} />,
  },
  {
    id: "support",
    label: "Contact Support",
    description: "Get help with a problem, or report one.",
    icon: (size) => <SupportIcon size={size} />,
  },
  {
    id: "feedback",
    label: "Feedback",
    description: "Tell us what you like, what you don't, or what you'd like to see.",
    icon: (size) => <FeedbackIcon size={size} />,
  },
  {
    id: "shortcuts",
    label: "Keyboard Shortcuts",
    description: "See the keyboard shortcuts for common commands.",
    icon: (size) => <KeyboardIcon size={size} />,
  },
  {
    id: "whats-new",
    label: "What's New",
    description: "See the latest changes to Inkspire.",
    icon: (size) => <WhatsNewIcon size={size} />,
  },
]

export function HelpTab() {
  const ribbonLayout = useViewStore((state) => state.ribbonLayout)
  const openHelp = useHelp((state) => state.openHelp)

  if (ribbonLayout === "single") {
    const commands: LineCommand[] = HELP_COMMANDS.map((command) => ({
      id: command.id,
      label: command.label,
      description: command.description,
      shortcut: command.shortcut,
      icon: command.icon(16),
      showLabel: true,
      onClick: () => openHelp(command.id),
    }))
    return <SingleLineBar label="Help" groups={[{ id: "help", commands }]} />
  }

  return (
    <div role="toolbar" aria-label="Help" className="ribbon-home flex items-stretch overflow-x-hidden">
      <RibbonGroup label="Help" className="shrink-0">
        {HELP_COMMANDS.map((command) => (
          <RibbonCommand
            key={command.id}
            label={command.label}
            description={command.description}
            shortcut={command.shortcut}
            onClick={() => openHelp(command.id)}
          >
            {command.icon(20)}
          </RibbonCommand>
        ))}
      </RibbonGroup>
    </div>
  )
}

/* Outline icons on the 16 grid with one 1.2 stroke, as the single line ribbon's; the classic tab shows them at 20 px. */

const base = {
  stroke: "var(--icon-base-color)",
  strokeWidth: 1.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const
const accent = { ...base, stroke: "var(--icon-accent-color)" } as const

function HelpIcon({ size }: { size: number }) {
  return (
    <RibbonSvg size={size}>
      <circle cx="8" cy="8" r="6.2" {...base} />
      <path d="M6.2 6.2a1.8 1.8 0 1 1 2.6 1.6c-.5.3-.8.7-.8 1.3v.4" {...accent} />
      <circle cx="8" cy="11.6" r="0.75" fill="var(--icon-accent-color)" />
    </RibbonSvg>
  )
}

function SupportIcon({ size }: { size: number }) {
  return (
    <RibbonSvg size={size}>
      <path d="M3 9V7.6a5 5 0 0 1 10 0V9" {...base} />
      <rect x="2.2" y="8.4" width="2.6" height="3.8" rx="1" {...base} />
      <rect x="11.2" y="8.4" width="2.6" height="3.8" rx="1" {...base} />
      <path d="M12.5 12.2c0 1.2-1.2 2-3 2H8" {...accent} />
    </RibbonSvg>
  )
}

function FeedbackIcon({ size }: { size: number }) {
  return (
    <RibbonSvg size={size}>
      <circle cx="5" cy="5.4" r="2.2" {...base} />
      <path d="M1.6 13.8c.3-2.2 1.6-3.6 3.4-3.6s3.1 1.4 3.4 3.6" {...base} />
      <path d="M9 2.2h5.2v4H11.4L9.8 7.8V6.2H9Z" {...accent} />
    </RibbonSvg>
  )
}

function KeyboardIcon({ size }: { size: number }) {
  return (
    <RibbonSvg size={size}>
      <rect x="1.4" y="3.8" width="13.2" height="8.4" rx="1.4" {...base} />
      <path d="M4 6.6h.1M6.6 6.6h.1M9.3 6.6h.1M12 6.6h.1M4 9.4h.1M12 9.4h.1" {...base} strokeWidth={1.4} />
      <path d="M6.4 9.4h3.2" {...accent} />
    </RibbonSvg>
  )
}

function WhatsNewIcon({ size }: { size: number }) {
  return (
    <RibbonSvg size={size}>
      <path d="M3.2 11.4h8.4l-1-1.6V7a3.2 3.2 0 0 0-6.4 0v2.8Z" {...base} />
      <path d="M6.2 13.4a1.4 1.4 0 0 0 2.6 0" {...base} />
      <path d="M12.6 1.8v2.4M11.4 3h2.4M14.4 5.8h.1" {...accent} />
    </RibbonSvg>
  )
}
