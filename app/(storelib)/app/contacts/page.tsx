/**
 * /app/contacts: People, the store's people in one list (round 51).
 *
 * Read on the server from the address (?filter, ?q, ?sort, ?page and the
 * advanced filters, lib/contacts/identity readPeopleQuery), so a reload, a
 * back and a shared link show the same page. lib/contacts/people-server
 * answers through SQL part 378 when it has run and by joining the sources
 * here when it has not; either way the page draws. Customers or Marketing
 * opens it (lib/contacts/gate).
 */
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerTt } from "@/lib/i18n/server"
import { contactsPage } from "@/lib/contacts/gate"
import { readPeopleQuery } from "@/lib/contacts/identity"
import { listPeople, type PeoplePage } from "@/lib/contacts/people-server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { PeopleClient, type CommunityOption } from "./people-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Contacts"), robots: { index: false, follow: false } }
}

type SP = Record<string, string | string[] | undefined>

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const access = await contactsPage()
  if (access.kind === "signed_out") return null
  if (access.kind === "none") redirect("/onboarding")
  if (access.kind === "denied") return <TeamAreaClosed area="customers" store={access.store} permissions={access.permissions} />
  const query = readPeopleQuery((k) => sp[k])
  const db = access.db
  const [page, communities] = await Promise.all([
    listPeople(db, access.scope, query).catch((error: unknown): PeoplePage | null => {
      console.error("[contacts] list not read:", (error as Error)?.message)
      return null
    }),
    readCommunityOptions(db, access.scope.creatorId),
  ])
  const notice = typeof sp.notice === "string" && ["not_found", "no_person"].includes(sp.notice) ? (sp.notice as "not_found" | "no_person") : null
  return <PeopleClient query={query} page={page} communities={communities} marketing={access.marketing} notice={notice} />
}

/** The store's own communities and their tiers, for the advanced filters. */
async function readCommunityOptions(db: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>, creatorId: string): Promise<CommunityOption[]> {
  try {
    const { data } = await db.from("communities").select("id, name").eq("creator_id", creatorId).is("deleted_at", null).order("created_at", { ascending: true }).limit(50)
    const list = (data ?? []) as { id: string; name: string | null }[]
    if (!list.length) return []
    const { data: tiers } = await db.from("community_tiers").select("id, name, community_id").in("community_id", list.map((c) => c.id)).is("archived_at", null).order("position", { ascending: true }).limit(500)
    return list.map((c) => ({
      id: c.id.toLowerCase(),
      name: c.name || "",
      tiers: ((tiers ?? []) as { id: string; name: string | null; community_id: string }[]).filter((t) => t.community_id === c.id).map((t) => ({ id: t.id.toLowerCase(), name: t.name || "" })),
    }))
  } catch {
    return []
  }
}
