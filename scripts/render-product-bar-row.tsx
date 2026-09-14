/**
 * The live product bar at phone width, with an ordinary product title and
 * with one long enough to be the problem.
 *
 * The phone bar is the product's now: the way back, the product, and the
 * three dots. One row is only worth claiming if it survives a long title, so
 * both are rendered and both are measured.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

const settings = { ...defaultProductCreatorBarSettings, showSubscribe: true } as never

class Boundary extends React.Component<{ children: React.ReactNode }, { msg: string | null }> {
  state = { msg: null as string | null }
  static getDerivedStateFromError(e: unknown) { return { msg: e instanceof Error ? `${e.name}: ${e.message}` : String(e) } }
  render() { return this.state.msg ? <pre data-boundary>{this.state.msg}</pre> : this.props.children }
}

createRoot(document.getElementById("app")!).render(
  <Boundary>
  <div>
    <div data-case="short">
      <LiveProductCreatorBar
        settings={settings}
        creatorName="Andrew Rullz"
        creatorUsername="andrew-rullz"
        creatorId="c1"
        productTitle="CineTone Lightroom Presets"
        productSlug="cinetone-lightroom-presets"
      />
    </div>
    <div data-case="long">
      <LiveProductCreatorBar
        settings={settings}
        creatorName="Alexandrina Konstantinopoulou-Whitfield"
        creatorUsername="alexandrina"
        creatorId="c2"
        productTitle="The Complete Colour Grading Masterclass for Documentary Film"
        productSlug="colour-grading-masterclass"
      />
    </div>
  </div>,
  </Boundary>,
)
