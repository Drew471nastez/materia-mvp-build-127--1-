/**
 * ASK STORELIB'S COMPOSER, MOUNTED FOR REAL.
 *
 * The suite checks that an attached picture reaches the model. It cannot
 * check the thing a person actually meets: whether the attach control is
 * there, whether a pasted screenshot appears as a thumbnail, whether the
 * little cross on it is something a thumb could hit, and whether Send comes
 * alive with a picture and no words. That is geometry, so it is measured
 * here rather than asserted.
 *
 * `#dock` mounts the computer's shape (the pill over a canvas) instead of
 * the phone's sheet: the same picture attached three ways at once is
 * counted on both, because each shape has its own drop handler around the
 * composer and that is where the second copy came from.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ThemeChat } from "@/components/website-builder/theme-chat"
import type { SectionInstance } from "@/lib/website-builder/types"

const sections: SectionInstance[] = [
  { id: "header-1", type: "header", name: "Header", settings: {}, blocks: [] },
  { id: "hero-1", type: "hero_centered", name: "Hero", settings: { heading: "A page" }, blocks: [] },
]

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  if (!url.startsWith("/api/")) return realFetch(input, init)
  return new Response(JSON.stringify({ exchanges: [] }), { status: 200, headers: { "content-type": "application/json" } })
}

const dock = window.location.hash === "#dock"
const host = document.getElementById("app")!
createRoot(host).render(
  <div style={{ width: dock ? 900 : 380, height: 620, display: "flex", flexDirection: "column", position: "relative" }}>
    <ThemeChat
      installId="probe-install"
      page="home"
      sections={sections}
      settings={{}}
      variant={dock ? "dock" : "sheet"}
      onRunStart={() => {}}
      onRunEnd={() => {}}
      onOp={() => {}}
      onClose={() => {}}
    />
  </div>,
)
