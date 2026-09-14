/**
 * The product bar's three dots, driven.
 *
 * Two claims that only exist over time: the menu opens ANCHORED TO THE DOTS
 * rather than sliding up from the bottom of the screen, and a press leaves a
 * mark you can see even when the tap is faster than a frame.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

createRoot(document.getElementById("app")!).render(
  <LiveProductCreatorBar
    settings={{ ...defaultProductCreatorBarSettings, visible: true, showSubscribe: true }}
    creatorName="AndrewRullz"
    creatorId="creator-1"
    creatorUsername="andrewrullz"
    bio="Handmade ceramic tableware fired in small batches"
    productTitle="CineTone Presets"
    productSlug="a-thing"
  />,
)
