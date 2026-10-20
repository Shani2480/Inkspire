import { Sparkles } from "lucide-react"
import type { ReactNode } from "react"

/**
 * The AI chat's reply while it is being written: the Rewrite popover's turning violet border around the text so far,
 * or around a pulsing spark and dots until the first words arrive.
 */
export function AiThinking({ children }: { children?: ReactNode }) {
  return (
    <div role="status" aria-label="AI is writing" className="ai-working rewrite-frame max-w-[95%] rounded-md">
      <span className="rewrite-border" aria-hidden />
      <div className="relative z-10 rounded-[5px] bg-[#f5f5f5] px-2.5 py-1.5 text-[13px] leading-5 whitespace-pre-wrap text-[#242424] dark:bg-[#383838] dark:text-[#f3f2f1]">
        {children || (
          <span className="flex items-center gap-1.5">
            <Sparkles className="rewrite-spark size-3.5 text-violet-600" aria-hidden />
            <span className="ai-working-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
