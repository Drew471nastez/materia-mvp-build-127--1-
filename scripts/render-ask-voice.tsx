/**
 * The voice input hook (components/website-builder/ask-voice) on its own, for
 * scripts/check-ask-voice.mjs. The recogniser, the recorder and the route are
 * stood in for by `window.__voice`, which the probe writes before this runs,
 * so each case is a browser that behaves a particular way: one whose
 * recogniser ends without a word, one that refuses the microphone, one with
 * nothing to record to.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { useVoiceInput } from "@/components/website-builder/ask-voice"

function Harness() {
  const [said, setSaid] = React.useState("")
  const voice = useVoiceInput({ onText: (text) => setSaid(text) })
  ;(window as unknown as { __hook: unknown }).__hook = voice
  return (
    <div>
      <p data-engine={voice.engine ?? "none"} data-supported={String(voice.supported)} data-state={voice.state} />
      <p data-said="">{said}</p>
      <p data-error="">{voice.error ?? ""}</p>
      <p data-settings={String(voice.canOpenSettings)} />
      <button type="button" data-start="" onClick={() => void voice.start()}>
        start
      </button>
      <button type="button" data-stop="" onClick={() => voice.stop()}>
        stop
      </button>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Harness />)
