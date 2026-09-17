/**
 * The real ExploreHero, at the two widths it has to work at.
 *
 * Nothing about it is reimplemented here: the point is to render the shipped
 * component against the shipped stylesheet and measure what comes out.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { ExploreHero } from "@/components/explore/explore-hero"

function Host() {
  const [q, setQ] = React.useState("")
  return <ExploreHero query={q} onQueryChange={setQ} />
}

createRoot(document.getElementById("app")!).render(
  <div id="host" style={{ background: "#f8f9fa" }}>
    <Host />
  </div>,
)
