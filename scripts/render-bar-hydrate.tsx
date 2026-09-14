/**
 * The real SubscribeBar, mounted in a browser and left to hydrate.
 *
 * THIS IS THE CRASH, REPRODUCED. The bar renders nothing on its first pass
 * (`isHydrated` is false) and everything on its second. Any hook declared
 * below that early return runs on the second pass and not the first, which
 * is React error #310, and #310 inside a page's tree is the "Something went
 * wrong on this page" screen on every creator page carrying a visible bar.
 *
 * Nothing here simulates the flip: mounting the component IS the flip. The
 * probe only has to let it happen and then look.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { SubscribeBar } from "@/components/store-builder/subscribe-bar"
import { defaultSubscribeBarSettings } from "@/lib/store-builder/defaults"

const errors: string[] = []
;(window as unknown as { __errors: string[] }).__errors = errors
window.addEventListener("error", (e) => errors.push(String(e.message)))

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: string | null }> {
  state = { failed: null as string | null }
  static getDerivedStateFromError(e: unknown) {
    return { failed: (e as Error)?.message ?? "unknown" }
  }
  render() {
    if (this.state.failed) {
      errors.push(this.state.failed)
      return <div data-failed="1" />
    }
    return this.props.children
  }
}

createRoot(document.getElementById("app")!).render(
  <Boundary>
    <SubscribeBar
      settings={{ ...defaultSubscribeBarSettings, visible: true, enableStickyBar: true }}
      creatorId="creator-1"
    />
  </Boundary>,
)
