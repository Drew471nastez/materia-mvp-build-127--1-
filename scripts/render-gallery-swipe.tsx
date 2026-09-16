/**
 * The real ProductGallery, at phone width, with three pictures in it.
 *
 * Nothing about the gesture is reimplemented here — the point is to touch the
 * real component and watch what the strip does between the first move and the
 * release.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { ProductGallery } from "@/components/product/product-gallery"

/* Three distinguishable 2x2 PNGs, so each slide is really a different image. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz8DAwMgABYwMDAAmLwH/PVxMDAAAAABJRU5ErkJggg=="

/**
 * HOW MANY TIMES REACT COMMITS DURING A DRAG, which is the whole of the lag
 * report. Counted rather than inferred, because "it feels laggy" and "it
 * re-renders the whole gallery on every touchmove" are the same sentence said
 * two ways, and only one of them can be measured.
 *
 * A Profiler and not a counter in a wrapper component. A wrapper counts its
 * OWN renders, and the gallery's drag state lived inside the gallery, so a
 * wrapper around it reported zero whether the fault was there or not. The
 * Profiler is told about every commit in the subtree beneath it, which is the
 * work being claimed about.
 *
 * It only reports in React's development build, which is why this bundle is
 * built that way. Nothing under test changes with it: the gesture is DOM
 * events and inline styles, and the stylesheet the page loads is the real
 * production one either way.
 */
declare global {
  interface Window { __commits: number }
}
window.__commits = 0

createRoot(document.getElementById("app")!).render(
  <div id="host" style={{ width: 390, background: "#fff" }}>
    <React.Profiler id="gallery" onRender={() => { window.__commits += 1 }}>
      <ProductGallery images={[PNG, PNG, PNG]} title="Geanta Guess Reptila" />
    </React.Profiler>
  </div>,
)
