/**
 * ASK STORELIB'S STEPS AND THE CANVAS SHEEN, MOUNTED FOR scripts/check-ask-states.mjs.
 *
 * Two things, side by side, the way the builder draws them:
 *
 *   #chat     one exchange's activity: the one line and the real
 *             StepsTimeline, fed by the same reducer the chat uses
 *             (lib/website-builder/ask-activity.ts). The probe pushes stream
 *             lines with window.__push(line) and ends the run with
 *             window.__finish().
 *   #canvas   a scrolling canvas of stand in sections with the real
 *             AiWorkingOverlay after them. window.__work(ids) and
 *             window.__settle(ids) set what it marks.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ActivityLine, StepsTimeline } from "@/components/website-builder/ask-activity"
import { AiWorkingOverlay } from "@/components/website-builder/editor/ai-working-overlay"
import { EMPTY_ACTIVITY, activityLine, reduceActivity, settleActivity, timelineRows, type Activity } from "@/lib/website-builder/ask-activity"

type Win = Window & {
  __push?: (line: Record<string, unknown>) => void
  __finish?: () => void
  __work?: (ids: string[]) => void
  __settle?: (ids: string[]) => void
}
const w = window as Win

function Chat() {
  const [activity, setActivity] = React.useState<Activity>(EMPTY_ACTIVITY)
  const [running, setRunning] = React.useState(true)
  React.useEffect(() => {
    w.__push = (line) => setActivity((a) => reduceActivity(a, line))
    w.__finish = () => {
      setActivity((a) => settleActivity(a))
      setRunning(false)
    }
  }, [])
  const rows = React.useMemo(() => timelineRows(activity), [activity])
  return (
    <div style={{ width: 380, padding: 16, fontFamily: "Inter, system-ui, sans-serif" }}>
      <p style={{ margin: "0 0 10px", fontSize: 13.5 }}>Make the questions feel calmer</p>
      {running && <ActivityLine label={activityLine(activity, 2000)} />}
      <StepsTimeline rows={rows} open={running} />
      {!running && <p data-reply="" style={{ fontSize: 13.5, margin: "8px 0 0" }}>Calmed the questions.</p>}
    </div>
  )
}

const SECTIONS = [
  { id: "hero", h: 420, bg: "#f4efe6", text: "Handmade ceramics for slow mornings" },
  { id: "faq", h: 360, bg: "#ffffff", text: "Questions" },
  { id: "dark", h: 320, bg: "#16161d", text: "Join the list", color: "#ffffff" },
  { id: "footer", h: 200, bg: "#f8f9fa", text: "Footer" },
]

function Canvas() {
  const [working, setWorking] = React.useState<string[]>([])
  const [settled, setSettled] = React.useState<string[]>([])
  React.useEffect(() => {
    w.__work = (ids) => setWorking(ids)
    w.__settle = (ids) => setSettled(ids)
  }, [])
  return (
    <div id="wb-preview-root" style={{ position: "relative", width: 720, height: 600, overflowY: "auto", borderRadius: 20, border: "1px solid #e5e7eb" }}>
      <div className="flex w-full flex-col">
        {SECTIONS.map((s) => (
          <div key={s.id} id={`wb-section-${s.id}`} data-section-box="" style={{ height: s.h, background: s.bg, color: s.color ?? "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <button type="button" data-hit={s.id} style={{ fontSize: 28, fontWeight: 700, background: "none", border: 0, color: "inherit" }}>
              {s.text}
            </button>
          </div>
        ))}
        <AiWorkingOverlay working={working} settled={settled} />
      </div>
    </div>
  )
}

createRoot(document.getElementById("chat")!).render(<Chat />)
createRoot(document.getElementById("canvas")!).render(<Canvas />)
