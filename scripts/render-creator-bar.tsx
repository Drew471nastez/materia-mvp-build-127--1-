/**
 * The live product bar, mounted.
 *
 * It shipped throwing a ReferenceError before it could paint — `goBack` read
 * `creatorHref` in a dependency array before the const was declared, which is
 * a temporal dead zone — and every product page showed the error screen. The
 * build was green, because next.config.mjs sets `ignoreBuildErrors`.
 *
 * So this renders it for real. A component that throws cannot be measured,
 * which is the point: the probe fails rather than reporting on nothing.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { LiveProductCreatorBar } from "@/components/store-builder/product-creator-bar"
import { defaultProductCreatorBarSettings } from "@/lib/store-builder/defaults"

class Boundary extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? `${e.name}: ${e.message}` : String(e) }
  }
  render() {
    if (this.state.error) return <p data-crash>{this.state.error}</p>
    return this.props.children
  }
}

createRoot(document.getElementById("app")!).render(
  <Boundary>
    <div data-bar>
      <LiveProductCreatorBar
        settings={defaultProductCreatorBarSettings}
        creatorName="Andrew Rullz"
        creatorUsername="andrewrullz"
        avatarUrl=""
      />
    </div>
  </Boundary>,
)
