/**
 * The subscribe surfaces harness (scripts/check-onepage-signup-ready.mjs):
 * the header's Subscribe sheet (components/onepage/subscribe-sheet) and the
 * free gift block's form (components/onepage/storelib-blocks lead magnet),
 * drawn as the live page draws them, so the probe can type into each.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageSubscribeSheet } from "@/components/onepage/subscribe-sheet"
import { StorelibBlock } from "@/components/onepage/storelib-blocks"
import { defaultTheme, type OnePageBlock } from "@/lib/onepage/types"

const theme = { ...defaultTheme, background_color: "#f4f1ea", text_color: "#1d1b16", button_color: "#1d1b16", button_text_color: "#ffffff" }
document.body.style.background = theme.background_color

const gift = { id: "lm", type: "lead_magnet", enabled: true, sort_order: 0, data: { kind: "waitlist", title: "The waitlist", button_text: "Join the waitlist" } } as unknown as OnePageBlock

function Page() {
  const [open, setOpen] = React.useState(false)
  return (
    <main style={{ width: "calc(100% - 32px)", maxWidth: 520, margin: "24px auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <button type="button" data-probe-subscribe="" onClick={() => setOpen(true)} style={{ padding: 14, borderRadius: 12, background: "#1d1b16", color: "#fff" }}>
        Subscribe
      </button>
      <div data-probe="gift">
        <StorelibBlock block={gift} look={{ theme, scale: "live", onepageId: "00000000-0000-4000-8000-000000000001", sellerId: "s1" } as never} />
      </div>
      <OnePageSubscribeSheet open={open} onClose={() => setOpen(false)} dark={false} sellerName="Anna" sellerId="s1" onepageId="00000000-0000-4000-8000-000000000001" />
    </main>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
