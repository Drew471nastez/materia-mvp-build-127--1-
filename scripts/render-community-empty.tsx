/* /app/community with no community yet, drawn for scripts/check-community-empty.mjs (?view=owner|team|unavailable, &plan=free). */
import React from "react"
import { createRoot } from "react-dom/client"
import { CommunityList } from "@/components/community/creator/community-list"

const params = new URLSearchParams(location.search)
const view = params.get("view") ?? "owner"
const limit = { max: params.get("plan") === "free" ? 2 : null, owned: 0 }
createRoot(document.getElementById("app")!).render(
  <div style={{ height: "100vh" }}>
    <CommunityList rows={[]} available={view !== "unavailable"} limit={limit} canCreate={view !== "team"} />
  </div>,
)
