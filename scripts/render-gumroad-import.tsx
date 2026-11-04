/**
 * Products › Import from Gumroad (app/app/products/import/gumroad/
 * gumroad-import-client.tsx) for scripts/check-gumroad-import.mjs. The
 * page's API is the probe's (window.fetch, answered in the page), so the
 * whole flow runs with no server and no Gumroad.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { GumroadImportClient } from "@/app/app/products/import/gumroad/gumroad-import-client"

createRoot(document.getElementById("app")!).render(
  <div className="h-svh bg-[#f8f9fa]">
    <GumroadImportClient />
  </div>,
)
