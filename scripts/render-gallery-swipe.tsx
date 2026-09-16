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

createRoot(document.getElementById("app")!).render(
  <div id="host" style={{ width: 390, background: "#fff" }}>
    <ProductGallery images={[PNG, PNG, PNG]} title="Geanta Guess Reptila" />
  </div>,
)
