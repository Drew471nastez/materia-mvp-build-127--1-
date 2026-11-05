import "server-only"

import { teamPageStore } from "@/lib/team/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePhysicalPage } from "@/lib/physical/gate"
import { listSizeCharts } from "@/lib/size-charts/server"

/**
 * A chart's own page reads what the list reads (./page.tsx): the store's
 * charts by this creator's id (lib/size-charts/server.ts, the reader the API
 * uses), what a chart can also be set for, and whether SQL parts 283 and 309
 * have run. Physical products only: while physical commerce is off this is a
 * 404, like the list.
 */
export async function loadSizeChartArea() {
  await requirePhysicalPage()
  /* Whose store (round 41): the owner's own, or the store a team member with Products works in. A member without it draws nothing; the team bar says why. */
  const access = await teamPageStore("products")
  if (access.kind === "signed_out" || access.kind === "denied") return { state: "signed-out" as const }
  if (access.kind === "none") return { state: "no-creator" as const }
  const area = await listSizeCharts(createAdminClient(), access.creatorId)
  return { state: "ok" as const, creatorId: access.creatorId, ...area }
}
