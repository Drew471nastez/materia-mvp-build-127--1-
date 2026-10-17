/**
 * The REAL Inventory page (app/app/inventory/inventory-client.tsx), for
 * scripts/check-inventory-adjust.mjs. The probe answers
 * /api/physical/inventory itself, so Adjust opens the real window with its
 * real fields, preview and settings.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { InventoryClient } from "@/app/app/inventory/inventory-client"

createRoot(document.getElementById("app")!).render(
  <div style={{ fontFamily: "Inter, system-ui", height: "100vh" }}>
    <InventoryClient />
  </div>,
)
