/**
 * The real LiveProductCreatorBar, mounted at a phone width and at a desktop
 * width, with a bio far longer than the line it has to fit in. Bundled by
 * scripts/check-product-bar.mjs.
 *
 * createRoot rather than renderToStaticMarkup: the bar is a client component
 * full of hooks, and the thing being measured is what a browser lays out.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

/* Fourteen words. The row is allowed six of them. */
const LONG_BIO =
  "Handmade ceramic tableware fired in small batches in a studio just outside Lisbon, Portugal"

createRoot(document.getElementById("app")!).render(
  <LiveProductCreatorBar
    settings={{ ...defaultProductCreatorBarSettings, visible: true, showSubscribe: true }}
    creatorName="AndrewRullz"
    creatorId="creator-1"
    creatorUsername="andrewrullz"
    bio={LONG_BIO}
  />,
)
