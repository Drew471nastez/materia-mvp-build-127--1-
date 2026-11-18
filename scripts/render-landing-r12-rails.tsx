/**
 * Landing round 12, for scripts/check-landing-r12-rails.mjs: the showcase
 * under the hero (components/marketing/build-showcase.tsx) and the creators
 * rail (components/marketing/home/creators-carousel.tsx), the real components,
 * on a page tall enough to scroll, with nothing else of the home page around
 * them. The pictures are served from public/home by the probe server.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BuildShowcase } from "@/components/marketing/build-showcase"
import { CreatorsCarousel } from "@/components/marketing/home/creators-carousel"

function Page() {
  return (
    <main style={{ background: "#fff" }}>
      <div style={{ height: 520, background: "#f4f4f5" }} />
      <BuildShowcase />
      <div style={{ height: 240 }} />
      <CreatorsCarousel />
      <div style={{ height: 1400 }} />
    </main>
  )
}

createRoot(document.getElementById("app")!).render(<Page />)
