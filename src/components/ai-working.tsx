import { AiSpark } from "@/components/ai-spark"
import type { ReactNode } from "react"

/**
 * The AI chat's reply while it is being written: the reply so far, if any words have arrived, and under it the small
 * animated spark that shows the AI is still working.
 */
export function AiThinking({ children }: { children?: ReactNode }) {
  return (
    <div role="status" aria-label="AI is writing" className="flex max-w-[95%] flex-col items-start gap-1.5">
      {children ? (
        <div className="rounded-md bg-[#f5f5f5] px-2.5 py-1.5 text-[13px] leading-5 whitespace-pre-wrap text-[#242424] dark:bg-[#383838] dark:text-[#f3f2f1]">
          {children}
        </div>
      ) : null}
      <AiSpark busy className="ml-1 size-4 text-violet-600" />
    </div>
  )
}
