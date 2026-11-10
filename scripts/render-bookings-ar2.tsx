/**
 * ROUND AR (track 2), FOR scripts/check-bookings-ar2.mjs: the booking sheet on a live OnePage, the
 * visitor's change-or-cancel page and /app/bookings, with every call answered by the probe.
 *
 *   /app/onepage?page      a OnePage whose Booking block books through one of the creator's forms
 *   /app/onepage?manage    /booking/<token>, the visitor's own booking
 *   /app/onepage?app       /app/bookings, the creator's list and a booking's sheet
 *
 * Nothing leaves the machine: the probe answers storelib.com's /api/forms and /api/bookings itself.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { ManageBooking } from "@/app/(storelib)/booking/[token]/manage-booking"
import { BookingsClient } from "@/app/(storelib)/app/bookings/bookings-client"
import { defaultSettings, defaultTheme } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
const root = createRoot(document.getElementById("app")!)
const block = (type: string, data: Record<string, unknown>, id: string, order: number) => ({ id, type, enabled: true, sort_order: order, data }) as never

if (params.has("manage")) {
  root.render(
    <main className="min-h-[100dvh] bg-[#f8f9fa] px-4 pb-6 pt-6 sm:pt-16">
      <div className="mx-auto w-full max-w-[480px]">
        <ManageBooking token="c0000000-0000-4000-8000-000000000001.probeprobeprobeprobeprobepr" />
      </div>
    </main>,
  )
} else if (params.has("app")) {
  root.render(
    <div className="h-[100dvh]">
      <BookingsClient />
    </div>,
  )
} else {
  const page = {
    id: "op_ar2",
    slug: "andrew",
    title: "Andrew Studio",
    bio: "Brand and web design calls",
    avatar_url: null,
    theme: { ...defaultTheme },
    settings: defaultSettings,
    social_links: {},
    seller_id: "seller_probe",
    blocks: [
      block("header", { show_avatar: false, show_name: true, show_bio: true }, "header", -1),
      block("calendly", { title: "Book an intro call", button_text: "Book a call", action: { type: "booking", form_id: "f0000000-0000-4000-8000-0000000000a1" } }, "b_book", 1),
      block("link_button", { label: "See my work", url: "https://example.com" }, "b_link", 2),
    ],
  }
  root.render(<PublicOnePage onepage={page as never} />)
}
