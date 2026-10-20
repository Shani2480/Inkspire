import type { Editor } from "@tiptap/core"
import { create } from "zustand"

/** The parts of the Web Speech API's recognizer that dictation uses. */
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult:
    | ((event: {
        resultIndex: number
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
      }) => void)
    | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type RecognitionConstructor = new () => Recognition

function recognizer(): RecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null
  }
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/** Whether this browser or webview can turn speech into text. */
export const dictationSupported = recognizer() !== null

type DictationState = {
  listening: boolean
  start: (editor: Editor, lang?: string) => void
  stop: () => void
}

let active: Recognition | null = null

/**
 * Word's Dictate: speech typed at the cursor as it is recognised, until it is turned off again. Only final phrases
 * are inserted, each followed by a space, so the text never has to be rewritten.
 */
export const useDictation = create<DictationState>((set) => ({
  listening: false,
  start: (editor, lang = navigator.language || "en-US") => {
    const Recognizer = recognizer()
    if (!Recognizer || active) {
      return
    }
    const recognition = new Recognizer()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = false
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0]?.transcript.trim()
        if (result.isFinal && text) {
          editor.chain().focus().insertContent(`${text} `).run()
        }
      }
    }
    recognition.onend = () => {
      active = null
      set({ listening: false })
    }
    recognition.onerror = recognition.onend
    active = recognition
    recognition.start()
    set({ listening: true })
  },
  stop: () => {
    active?.stop()
  },
}))
