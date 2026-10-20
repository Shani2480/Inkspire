import { create } from "zustand"

type AiActivity = {
  /** Requests to the AI that are in flight right now; they can overlap, so this is a count and not a flag. */
  count: number
  start: () => void
  end: () => void
}

/** Whether the AI is working on anything at all, quiet requests included. The title bar's AI icon animates from it. */
export const useAiActivity = create<AiActivity>((set) => ({
  count: 0,
  start: () => set((state) => ({ count: state.count + 1 })),
  end: () => set((state) => ({ count: Math.max(0, state.count - 1) })),
}))

export function useAiBusy() {
  return useAiActivity((state) => state.count > 0)
}
