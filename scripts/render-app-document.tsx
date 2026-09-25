/**
 * The browser half of scripts/render-app-document-tree.tsx: hydrates the
 * HTML the probe's server rendered from the same tree (`?doc=before` for
 * the wrapper as it was).
 */
import React from "react"
import { hydrateRoot } from "react-dom/client"
import { DocumentTree } from "./render-app-document-tree"

const before = new URLSearchParams(location.search).get("doc") === "before"
;(window as unknown as { __hydrateAt: number }).__hydrateAt = performance.now()
hydrateRoot(document.getElementById("app")!, <DocumentTree before={before} />)
