import { relativeCommentTime } from "@/editor/comments"
import { useEffect, useState } from "react"

/** A comment's age ("A few seconds ago", "3m ago"), kept current while it is on screen (22.18). */
export function RelativeTime({ value }: { value: string }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  return <>{relativeCommentTime(value)}</>
}
