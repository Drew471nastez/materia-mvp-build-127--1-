/**
 * The browser half of scripts/render-business-switch-tree.tsx: at /app,
 * hydrates the new business's HTML the probe's server rendered (with the
 * name its cookie carried, window.__arriving); anywhere else, draws the old
 * business's /app the way a loaded app is drawn.
 */
import React from "react"
import { createRoot, hydrateRoot } from "react-dom/client"
import { NewTree, OldTree } from "./render-business-switch-tree"

const w = window as unknown as { __arriving?: string | null; __hydrateAt?: number }
const el = document.getElementById("app")!
if (location.pathname === "/app") {
  w.__hydrateAt = performance.now()
  hydrateRoot(el, <NewTree arriving={w.__arriving ?? null} />)
} else {
  createRoot(el).render(<OldTree />)
}
