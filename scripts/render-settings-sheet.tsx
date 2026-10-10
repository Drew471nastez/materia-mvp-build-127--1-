/* The settings sheet over a page, for scripts/check-settings-sheet.mjs. */
import { createRoot } from "react-dom/client"
import { SettingsSheet } from "@/components/app/settings-sheet"

function Rows() {
  return (
    <div style={{ padding: 16 }}>
      {Array.from({ length: 60 }, (_, i) => (
        <div key={i} data-row={i} style={{ height: 48, borderBottom: "1px solid #eee", display: "flex", alignItems: "center" }}>
          Row {i}
          {i === 3 ? <input type="range" data-range="" style={{ marginLeft: 12 }} /> : null}
        </div>
      ))}
    </div>
  )
}

const w = window as unknown as { __mode: string }
const overlay = (w.__mode ?? "over") === "over"
createRoot(document.getElementById("app")!).render(
  <>
    <div data-page-under="" style={{ height: 2000, background: "#fff" }}>The page it was opened from</div>
    <SettingsSheet overlay={overlay}>
      <Rows />
    </SettingsSheet>
  </>,
)
