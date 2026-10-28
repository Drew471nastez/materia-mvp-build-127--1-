import "server-only"

import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { collectionsArea } from "@/lib/physical/collections-server"

/**
 * A collection's own page reads what the list reads (./page.tsx): the
 * store's collections and products by this creator's id, through the reader
 * the API uses (lib/physical/collections-server).
 */
export async function loadCollectionArea() {
  const user = await pageUser()
  if (!user) return { state: "signed-out" as const }
  const creator = await creatorForRequest(user.id)
  if (!creator) return { state: "no-creator" as const }
  const area = await collectionsArea(createAdminClient(), creator.id)
  return { state: "ok" as const, ...area }
}
