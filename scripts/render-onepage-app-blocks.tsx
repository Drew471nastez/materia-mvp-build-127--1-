/**
 * Round AL, for scripts/check-onepage-app-blocks.mjs: the Add block sheet's
 * list as links-tab draws it (components/onepage/add-block-picker), and the
 * app blocks (components/onepage/app-block) in each of their layouts on a
 * filled theme, as the live page draws them.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { AddBlockPicker, type PickerEntry } from "@/components/onepage/add-block-picker"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
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

const app = (id: string, data: Record<string, unknown>) => ({ id, type: "app", enabled: true, sort_order: 0, data }) as OnePageBlock
const BLOCKS = [
  app("ig_profile", { provider: "instagram", url: "https://instagram.com/storelib", layout: "profile" }),
  app("ig_card", { provider: "instagram", url: "https://instagram.com/storelib", layout: "card" }),
  app("discord_classic", { provider: "discord", url: "https://discord.gg/abc123", layout: "classic" }),
  app("reviews", { provider: "google_reviews", url: "https://maps.app.goo.gl/abc", title: "Studio Lipscani", rating: 4.8, reviews_count: 212 }),
  app("affiliate", { provider: "affiliate", title: "My desk", items: [{ id: "a", title: "Desk lamp", note: "$40", url: "https://shop.example/lamp" }, { id: "b", title: "Keyboard", note: "$120", url: "https://shop.example/kb" }, { id: "c", title: "Chair" }] }),
  app("events", { provider: "events", items: [{ id: "a", title: "Bucharest", date: "2027-03-14", venue: "Arenele Romane", url: "https://tickets.example/a" }, { id: "b", title: "Cluj", date: "2027-03-20", venue: "BT Arena", sold_out: true }] }),
  app("stats", { provider: "stats", items: [{ id: "a", value: "12k", title: "Students" }, { id: "b", value: "4.9", title: "Rating" }] }),
  app("poll", { provider: "poll", poll_question: "What should I film next?", poll_options: [{ id: "a", label: "Studio tour" }, { id: "b", label: "Gear guide" }] }),
  app("mobile", { provider: "mobile_app", title: "Mixer", subtitle: "Practice every day", ios_url: "https://apps.apple.com/app/id1", android_url: "https://play.google.com/store/apps/details?id=x" }),
  app("contact", { provider: "contact", contact: { name: "Ana Pop", org: "Producer", phone: "+40712345678", email: "ana@example.com" } }),
]

;(window as any).__picked = []

function Page() {
  return (
    <div className="min-h-screen bg-[#f8f9fa] p-4">
      <div className="flex flex-wrap items-start gap-6">
        <div data-probe="picker" className="flex h-[640px] w-[420px] max-w-full flex-col overflow-hidden rounded-2xl border border-[#ececf1] bg-white pt-4">
          <AddBlockPicker open inGroup={false} atLimit={(t) => t === "social_row"} onPick={(e: PickerEntry) => (window as any).__picked.push(e.id)} />
        </div>
        <div data-probe="live" className="flex w-[380px] max-w-full flex-col gap-4 rounded-2xl p-4" style={{ background: theme.background_color }}>
          {BLOCKS.map((block) => (
            <div key={block.id} data-probe-block={block.id}>
              <ExtraBlock block={block} look={{ theme, scale: "live" }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
