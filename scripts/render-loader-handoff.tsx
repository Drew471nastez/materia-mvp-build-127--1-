/**
 * The workspace's loader, at the moment it hands over.
 *
 * The complaint is about a single frame: the loader was removed from the tree
 * the instant the frame reported loaded, while the page under it was still
 * part-way through its own 320ms fade-in. So there was a frame with the
 * loader gone and the page not yet there, which is the cut.
 *
 * The two states are rendered side by side rather than animated, because what
 * is being measured is whether the loader is STILL THERE, and fading, once
 * loading is over — not how it looks mid-transition.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { BuilderLoader, useLinger } from "@/components/website-builder/builder-loader"

/**
 * ONE canvas that actually transitions. The first attempt rendered a second
 * canvas that started with `loading={false}`, and `useLinger` only lingers
 * over a change — a component mounted already-finished has nothing to linger
 * from. It reported the loader missing and that was true and meaningless.
 */
function Canvas() {
  const [loading, setLoading] = React.useState(true)
  const visible = useLinger(loading, 320)
  React.useEffect(() => {
    const id = window.setTimeout(() => setLoading(false), 250)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <div data-canvas className="relative h-40 w-full bg-white">
      <div className="absolute inset-0 bg-[#eef2ff]" data-page />
      {visible && (
        <div
          className="wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-white"
          data-leaving={!loading}
          data-loader
        >
          <BuilderLoader tone="light" lines={["Loading your page"]} />
        </div>
      )}
    </div>
  )
}

createRoot(document.getElementById("app")!).render(<Canvas />)
