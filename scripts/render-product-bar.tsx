/**
 * The real LiveProductCreatorBar, twice: once with an ordinary creator name
 * and once with one long enough to be the problem. Bundled by
 * scripts/check-product-bar.mjs.
 *
 * createRoot rather than renderToStaticMarkup: the bar is a client component
 * full of hooks, and the thing being measured is what a browser lays out.
 *
 * THE LONG ONES ARE NOT DECORATION. Text with no floor next to anything else
 * in a flex row is what squeezes a row, so the text has to be the part that
 * gives way: the product's title on the phone bar, the creator's name on the
 * desktop one, each ending in an ellipsis rather than pushing a control off
 * the end.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

function Bar({ name, title }: { name: string; title: string }) {
  return (
    <LiveProductCreatorBar
      settings={{ ...defaultProductCreatorBarSettings, visible: true, showSubscribe: true }}
      creatorName={name}
      creatorId="creator-1"
      creatorUsername="andrewrullz"
      productTitle={title}
      productSlug="a-thing"
    />
  )
}

createRoot(document.getElementById("app")!).render(
  <Bar name="AndrewRullz" title="CineTone Presets" />,
)
createRoot(document.getElementById("app-long")!).render(
  <Bar
    name="Andrew Rullz Ceramics And Homeware Studio Lisbon"
    title="The Complete Colour Grading Masterclass for Documentary Film"
  />,
)
