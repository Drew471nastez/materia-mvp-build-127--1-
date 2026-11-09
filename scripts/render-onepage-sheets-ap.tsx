/**
 * Round AP's sheet harness (scripts/check-onepage-sheets-ap.mjs): the real
 * BlockSheetProvider on a long page, with what opens it the way the owner
 * opens it. A Storelib form behind a button (components/forms/action-frame,
 * the screenshot's "Get in touch"), the contact form block, an Instagram post,
 * a Calendly-like full sheet, and a sheet whose content grows after it opens.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BlockSheetProvider, useBlockSheet } from "@/components/onepage/block-sheet"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { NativeFormBlock } from "@/components/forms/native-form-block"
import { OnePageShareSheet } from "@/components/onepage/share-sheet"
import { defaultTheme, type OnePageBlock } from "@/lib/onepage/types"

const block = (id: string, type: OnePageBlock["type"], data: Record<string, unknown>): OnePageBlock => ({ id, type, enabled: true, sort_order: 0, data: data as never })
const dark = new URLSearchParams(location.search).has("dark")
const theme = dark
  ? { ...defaultTheme, button_style: "filled" as const, background_color: "#0e0e10", text_color: "#f4f4f5", button_color: "#f4f4f5", button_text_color: "#111113", button_border_radius: 999 }
  : { ...defaultTheme, button_style: "filled" as const, background_color: "#ffffff", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 12 }
document.body.style.background = theme.background_color

function Grows() {
  const [more, setMore] = React.useState(false)
  React.useEffect(() => {
    const t = window.setTimeout(() => setMore(true), 120)
    return () => window.clearTimeout(t)
  }, [])
  return <div style={{ height: more ? 420 : 140, background: "rgba(127,127,127,0.12)", borderRadius: 12 }} data-probe-grows="" />
}

function Buttons() {
  const sheet = useBlockSheet()
  const btn: React.CSSProperties = { display: "block", width: "100%", padding: 16, borderRadius: 14, background: "#1a1a2e", color: "#fff" }
  return (
    <>
      <button type="button" data-probe-calendly="" style={btn} onClick={() => sheet.open({ blockId: "cal", title: "Calendly", body: <iframe title="Calendly" src="https://calendly.com/probe/30min" className="block h-full w-full rounded-[16px] border-0 bg-white" />, cta: { label: "Book A Call", href: "https://calendly.com/probe/30min" }, shareUrl: "https://calendly.com/probe/30min", fill: true })}>
        Calendly
      </button>
      <button type="button" data-probe-grows-open="" style={btn} onClick={() => sheet.open({ blockId: "grow", title: "Grows", body: <Grows />, cta: null })}>
        Grows
      </button>
    </>
  )
}

const FORM_ID = "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"

function Page() {
  const look = { theme, scale: "live" as const, onepageId: null, sellerId: null }
  return (
    <main style={{ width: "calc(100% - 32px)", maxWidth: 560, margin: "20px auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <Buttons />
      <div data-probe="form"><NativeFormBlock formId={FORM_ID} title="Work with me" presentation="modal" /></div>
      <div data-probe="contact"><ExtraBlock block={block("c", "contact_form", { title: "Get in touch", open_mode: "sheet" })} look={look} /></div>
      <div data-probe="post"><ExtraBlock block={block("e", "embed", { url: "https://www.instagram.com/p/ABC123/", title: "", open_mode: "sheet" })} look={look} /></div>
      {Array.from({ length: 30 }, (_, i) => (
        <p key={i} style={{ padding: 18, background: dark ? "#1c1c20" : "#eceef1", color: theme.text_color, borderRadius: 12 }}>Row {i + 1}</p>
      ))}
    </main>
  )
}

/* ?view=share: the OnePage's Share, open, on a page in a dark colour (its band). */
function ShareView() {
  const [open, setOpen] = React.useState(true)
  return (
    <main style={{ minHeight: "100vh", background: "#0e0e10", padding: 24, color: "#fff" }}>
      <button type="button" data-probe-share="" onClick={() => setOpen(true)}>Share</button>
      <OnePageShareSheet open={open} onClose={() => setOpen(false)} dark pageUrl="https://storelib.me/radu" pageTitle="Radu Stamate" avatarUrl={null} band={{ backgroundType: "solid", backgroundColor: "#0e0e10" }} />
    </main>
  )
}

createRoot(document.getElementById("app")!).render(
  new URLSearchParams(location.search).get("view") === "share" ? (
    <ShareView />
  ) : (
    <BlockSheetProvider dark={dark} theme={theme}>
      <Page />
    </BlockSheetProvider>
  ),
)
