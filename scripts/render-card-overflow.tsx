/**
 * The real ProductCard, in the grid it lives in, at phone width, with the
 * exact product that broke: a long title next to a long category name.
 */
import React from "react"
import { createRoot } from "react-dom/client"

import { ProductCard } from "@/components/explore/product-card"

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQz8DAwMgABYwMDAAmLwH/PVxMDAAAAABJRU5ErkJggg=="

const PRODUCTS = [
  {
    id: "a",
    slug: "trapsodia",
    title: "Trapsodia Trap Pack",
    price_cents: 0,
    compare_at_cents: 6900,
    thumbnail_url: PNG,
    categoryName: "Other",
    creator: { username: "negruw", name: "Negru W" },
  },
  {
    id: "b",
    slug: "cinetone",
    /* The one in the screenshot. */
    title: "CineTone Lightroom Presets Pack 1000 Cinematic Film Looks",
    price_cents: 9200,
    compare_at_cents: 23000,
    thumbnail_url: PNG,
    categoryName: "Lightroom Presets",
    creator: { username: "andrewrullz", name: "Andrew Rullz" },
  },
]

createRoot(document.getElementById("app")!).render(
  <div id="host" style={{ background: "#f5f5f5", padding: 16 }}>
    <div className="grid grid-cols-2 gap-4" id="grid">
      {PRODUCTS.map((p) => (
        <ProductCard key={p.id} product={p as never} srcParam="?src=platform" />
      ))}
    </div>
    {/* Whatever comes after the grid. If a card overflows, this is what it
        paints over — the footer, in the report. */}
    <div id="after" style={{ height: 200, background: "#0f0f0f" }} />
  </div>,
)
