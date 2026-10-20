import { Sparkles } from "lucide-react"

/**
 * The AI's spark. While `busy` it comes alive: the big star breathes and tilts, the small ones twinkle in turn, and a
 * soft glow follows the icon's colour. Idle, it is the plain icon. The chat, the Rewrite popover and the title bar
 * all use it, so the AI looks the same wherever it is working.
 */
export function AiSpark({ busy = false, className = "" }: { busy?: boolean; className?: string }) {
  return <Sparkles className={`ai-spark ${busy ? "is-busy" : ""} ${className}`} aria-hidden />
}
