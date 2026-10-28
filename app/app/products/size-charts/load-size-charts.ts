import "server-only"

import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
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
  const user = await pageUser()
  if (!user) return { state: "signed-out" as const }
  const creator = await creatorForRequest(user.id)
  if (!creator) return { state: "no-creator" as const }
  const area = await listSizeCharts(createAdminClient(), creator.id)
  return { state: "ok" as const, creatorId: creator.id as string, ...area }
}
