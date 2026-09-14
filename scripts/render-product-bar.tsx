/**
 * The real LiveProductCreatorBar, twice: once with an ordinary creator name
 * and once with a very long one, both carrying a bio far longer than the
 * line it has to fit in. Bundled by scripts/check-product-bar.mjs.
 *
 * createRoot rather than renderToStaticMarkup: the bar is a client component
 * full of hooks, and the thing being measured is what a browser lays out.
 *
 * THE LONG NAME IS NOT DECORATION. A display name with no floor next to
 * anything else in a flex row is what used to squeeze the row; the name has
 * to be the part that gives way, and the bio under it has to stay on one
 * line regardless of what is above it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

/* Fourteen words. The row is allowed six of them. */
const LONG_BIO =
  "Handmade ceramic tableware fired in small batches in a studio just outside Lisbon, Portugal"

function Bar({ name }: { name: string }) {
  return (
    <LiveProductCreatorBar
      settings={{ ...defaultProductCreatorBarSettings, visible: true, showSubscribe: true }}
      creatorName={name}
      creatorId="creator-1"
      creatorUsername="andrewrullz"
      bio={LONG_BIO}
    />
  )
}

createRoot(document.getElementById("app")!).render(<Bar name="AndrewRullz" />)
createRoot(document.getElementById("app-long")!).render(
  <Bar name="Andrew Rullz Ceramics And Homeware Studio Lisbon" />,
)
