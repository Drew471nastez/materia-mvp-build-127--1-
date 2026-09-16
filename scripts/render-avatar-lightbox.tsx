/**
 * The real AvatarLightbox, with the real Radix dialog under it, on a page
 * that is tall enough to have a scrollbar.
 *
 * The scrollbar is not incidental. `w-screen` is `100vw`, which INCLUDES the
 * scrollbar, while the overlay's `inset-0` is measured against the viewport,
 * which excludes it. A probe that hides scrollbars measures a page where the
 * two agree, and reports that a panel hanging off the right edge fits.
 *
 * Nothing here reimplements the component. It is imported, opened, and read.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { AvatarLightbox } from "@/components/storefront/avatar-lightbox"

/* A 2x2 PNG, so the picture really decodes and really gets laid out. */
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz8DAwMgABYwMDAAmLwH/PVxMDAAAAABJRU5ErkJggg=="

createRoot(document.getElementById("app")!).render(
  <div style={{ background: "#fff" }}>
    {/* Tall enough that the document scrolls, so the viewport has a scrollbar. */}
    <div style={{ height: "300vh", padding: 24 }}>
      <AvatarLightbox src={PNG} name="Andrew Rullz">
        <span
          id="trigger"
          style={{ display: "inline-block", width: 150, height: 150, borderRadius: 9999, background: "#ddd" }}
        />
      </AvatarLightbox>
    </div>
  </div>,
)
