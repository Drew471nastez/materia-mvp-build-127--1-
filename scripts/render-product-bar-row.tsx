/**
 * The live product bar at phone width, with an ordinary name and with a name
 * long enough to be the problem.
 *
 * The bar was two rows: the way back and the creator on one, the form on
 * another, on the page where the product photo is the thing somebody came
 * for. One row is only worth claiming if it survives a long display name, so
 * both are rendered and both are measured.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

const settings = { ...defaultProductCreatorBarSettings, showSubscribe: true } as never

createRoot(document.getElementById("app")!).render(
  <div>
    <div data-case="short">
      <LiveProductCreatorBar settings={settings} creatorName="Andrew Rullz" creatorUsername="andrew-rullz" creatorId="c1" />
    </div>
    <div data-case="long">
      <LiveProductCreatorBar
        settings={settings}
        creatorName="Alexandrina Konstantinopoulou-Whitfield"
        creatorUsername="alexandrina"
        creatorId="c2"
      />
    </div>
  </div>,
)
