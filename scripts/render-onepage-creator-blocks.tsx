/**
 * Round 10's OnePage parts, for scripts/check-onepage-blocks.mjs: the + Add
 * button and its + (components/onepage/add-block-picker AddBlockPlus), the
 * Add block sheet as links-tab draws it (SheetDialog: the shared bottom
 * sheet on a phone, a dialog from 640px), and the course, music,
 * testimonials and contact blocks on a filled theme, as the live page draws
 * them and as the editor's preview does (preview: true).
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ExtraBlock, IncompleteLinkPlaceholder } from "@/components/onepage/extra-blocks"
import { AddBlockPicker, AddBlockPlus, type PickerEntry } from "@/components/onepage/add-block-picker"
import { SHEET_DIALOG_MAX_HEIGHT, SheetDialog, SheetDialogTitle } from "@/components/ui/sheet-dialog"
import { DialogHeader } from "@/components/ui/dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { accentDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import type { OnePageBlock, OnePageTheme } from "@/lib/onepage/types"

const theme = {
  template_id: "t",
  background_type: "solid",
  background_color: "#f4efe9",
  text_color: "#1a1a2e",
  button_style: "filled",
  button_color: "#1a1a2e",
  button_text_color: "#ffffff",
  button_border_radius: 14,
  button_border_width: 0,
  button_border_color: "#000000",
  font_family: "Inter",
  spacing: "normal",
} as unknown as OnePageTheme

const b = (type: string, data: unknown) => ({ id: type, type, enabled: true, sort_order: 0, data }) as OnePageBlock
const COVER = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#2b2b3a"/><stop offset="1" stop-color="#6b6b80"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/></svg>')
const BLOCKS = [
  b("course", { product_id: "c1", course_title: "Mixing for beginners", course_slug: "mixing", course_thumbnail: COVER, course_price_cents: 4900, lessons_count: 12, show_price: true }),
  b("music", { url: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT", title: "New single" }),
  b("testimonials", { title: "What people say", items: [{ id: "a", quote: "My mixes finally sound clean.", name: "Ana", detail: "Bought the course", rating: 5 }, { id: "b", quote: "Clear and short lessons.", name: "Bo", rating: 4 }] }),
  b("contact_form", { title: "Get in touch", description: "Questions, work, or just hi", button_text: "Send", offer_signup: true }),
]
const SELLER = "0b1c2d3e-0000-4000-8000-000000000001"

;(window as any).__picked = []

function AddArea() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const phone = usePhoneWidth()
  return (
    <div data-probe="add" className="w-[340px] space-y-3">
      <button type="button" data-add-block="" aria-expanded={open} onClick={() => setOpen(true)} className={cn(accentDepth, "h-11 w-full gap-2 rounded-xl text-[15px]")}>
        <AddBlockPlus open={open} />
        Add
      </button>
      <SheetDialog
        open={open}
        onClose={() => {
          setOpen(false)
          setQuery("")
        }}
        phone={phone}
        label="Add Block"
        onOpenAutoFocus={(e) => e.preventDefault()}
        sheet={{ keepMounted: true, height: SHEET_DIALOG_MAX_HEIGHT }}
        className="p-0 gap-0 overflow-hidden mx-auto flex flex-col bg-white border-[#ececf1] w-[calc(100%-24px)] max-w-[640px] sm:max-w-[640px] h-[min(640px,85vh)] rounded-2xl shadow-[0_24px_64px_-12px_rgba(17,17,19,0.25),0_2px_6px_rgba(17,17,19,0.06)]"
      >
        <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 shrink-0 text-left">
          <SheetDialogTitle className="text-[17px] sm:text-lg font-semibold tracking-[-0.01em] text-[#111113]">Add Block</SheetDialogTitle>
        </DialogHeader>
        <AddBlockPicker
          open={open}
          inGroup={false}
          query={query}
          onQuery={setQuery}
          atLimit={(t) => t === "social_row"}
          onPick={(e: PickerEntry) => {
            ;(window as any).__picked.push(e.id)
            setOpen(false)
            setQuery("")
          }}
        />
      </SheetDialog>
    </div>
  )
}

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] p-4">
      <div className="flex flex-wrap items-start gap-6">
        <AddArea />
        <div data-probe="live" className="flex w-[380px] max-w-full flex-col gap-4 rounded-2xl p-4" style={{ background: theme.background_color }}>
          {BLOCKS.map((block) => (
            <div key={block.id} data-probe-block={block.type}>
              <ExtraBlock block={block} look={{ theme, scale: "live", sellerId: SELLER }} />
            </div>
          ))}
        </div>
        <div data-probe="preview" className="flex w-[300px] max-w-full flex-col gap-3 rounded-2xl p-3" style={{ background: theme.background_color }}>
          <div data-probe-preview="incomplete_link">
            <IncompleteLinkPlaceholder label="My Link" theme={theme} />
          </div>
          {BLOCKS.map((block) => (
            <div key={block.id} data-probe-preview={block.type}>
              <ExtraBlock block={block} look={{ theme, scale: "small", preview: true, sellerId: SELLER }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
