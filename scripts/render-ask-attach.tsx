/**
 * ASK STORELIB'S COMPOSER, MOUNTED FOR REAL.
 *
 * The suite checks that an attached picture reaches the model. It cannot
 * check the thing a person actually meets: whether the attach control is
 * there, whether a pasted screenshot appears as a thumbnail, whether the
 * little cross on it is something a thumb could hit, and whether Send comes
 * alive with a picture and no words. That is geometry, so it is measured
 * here rather than asserted.
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

const host = document.getElementById("app")!
createRoot(host).render(
  <div style={{ width: 380, height: 620, display: "flex", flexDirection: "column" }}>
    <ThemeChat
      installId="probe-install"
      page="home"
      sections={sections}
      settings={{}}
      onRunStart={() => {}}
      onRunEnd={() => {}}
      onOp={() => {}}
    />
  </div>,
)
