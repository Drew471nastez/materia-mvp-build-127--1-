/**
 * THE CHAT'S SEND, ITS LIVE LINE AND AI MEMORY, MOUNTED FOR scripts/check-ask-memory-send.mjs.
 *
 *   #memory    the real AskMemoryButton (components/website-builder/ask-memory.tsx)
 *              over a stand in for /api/ai-memory that answers after
 *              window.__memoryDelay ms.
 *   #composer  a thread and the chat's box, eased by the same function the
 *              chat calls (lib/website-builder/ask-composer.ts). window.__type(text)
 *              fills it; window.__send() puts the message in the thread with
 *              the chat's `ask-in` and empties the box, as submit does.
 *   #line      the real ActivityLine; window.__label(text) gives it a label.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AskMemoryButton } from "@/components/website-builder/ask-memory"
import { ActivityLine } from "@/components/website-builder/ask-activity"
import { easeFieldHeight } from "@/lib/website-builder/ask-composer"

type Win = Window & {
  __memoryDelay?: number
  __type?: (text: string) => void
  __send?: () => void
  __label?: (text: string) => void
}
const w = window as Win
w.__memoryDelay = 60

const NOTES = [
  { id: "n1", content: "Prices in euros.", createdAt: "2026-10-02T00:00:00Z", installId: "site" },
  { id: "n2", content: "No gradients on this site.", createdAt: "2026-10-01T00:00:00Z", installId: "site" },
  { id: "n3", content: "The events part is the main thing.", createdAt: "2026-09-30T00:00:00Z", installId: null },
]
const realFetch = window.fetch.bind(window)
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  if (!url.startsWith("/api/ai-memory")) return realFetch(input, init)
  await new Promise((r) => setTimeout(r, w.__memoryDelay ?? 0))
  const site = url.includes("installId=")
  const memories = NOTES.filter((n) => (site ? n.installId : !n.installId))
  return new Response(JSON.stringify({ memories }), { status: 200, headers: { "Content-Type": "application/json" } })
}) as typeof fetch

function Memory() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", width: 340, padding: 12 }}>
      <AskMemoryButton installId="site" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#6b7280] hover:bg-black/[0.05]" />
    </div>
  )
}

function Composer() {
  const [sent, setSent] = React.useState<string[]>(["Make the hero calmer"])
  const field = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    w.__type = (text) => {
      const f = field.current!
      f.value = text
      easeFieldHeight(f)
    }
    w.__send = () => {
      const f = field.current!
      const text = f.value
      setSent((s) => [...s, text])
      f.value = ""
      easeFieldHeight(f)
    }
  }, [])
  return (
    <div data-probe-chat="" style={{ width: 380, height: 520, display: "flex", flexDirection: "column", background: "#fff", borderRadius: 16 }}>
      <ul data-probe-thread="" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-3" style={{ listStyle: "none", margin: 0 }}>
        {sent.map((t, i) => (
          <li key={i} data-probe-bubble={i} className={i > 0 ? "ask-in" : undefined}>
            <div className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-[18px] bg-[#f1f2f4] px-3.5 py-2 text-[13.5px] leading-[1.5] text-[#1a1a2e]">{t}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-[#f0f1f3] p-3">
        <textarea
          ref={field}
          rows={1}
          data-probe-field=""
          className="block w-full resize-none bg-transparent text-[14px] leading-[20px] text-[#1a1a2e] outline-none"
          style={{ overflowY: "auto" }}
          defaultValue=""
        />
      </div>
    </div>
  )
}

function Line() {
  const [label, setLabel] = React.useState("Reading the page")
  React.useEffect(() => {
    w.__label = setLabel
  }, [])
  return (
    <div style={{ width: 380, padding: 16 }} data-probe-line="">
      <ActivityLine label={label} />
    </div>
  )
}

createRoot(document.getElementById("memory")!).render(<Memory />)
createRoot(document.getElementById("composer")!).render(<Composer />)
createRoot(document.getElementById("line")!).render(<Line />)
