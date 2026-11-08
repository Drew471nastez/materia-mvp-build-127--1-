/**
 * /app/contacts/<contactId>: one person (round 51).
 *
 * Any of a person's keys opens them (lib/contacts/identity contactKey); a
 * key that is not their id now is sent on to the one that is, so a link made
 * before two rows were joined still lands on the right person. A key of
 * another store, or of nobody, says so on the People list and reads nothing
 * of it (lib/contacts/profile-server personByKey checks the store first).
 */
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getServerTt } from "@/lib/i18n/server"
import { contactsPage } from "@/lib/contacts/gate"
import { parseContactKey } from "@/lib/contacts/identity"
import { personByKey, readProfile } from "@/lib/contacts/profile-server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { ProfileClient } from "./profile-client"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Contact"), robots: { index: false, follow: false } }
}

export default async function ContactProfilePage({ params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = await params
  const key = decodeURIComponent(raw).toLowerCase()
  if (!parseContactKey(key)) notFound()
  const access = await contactsPage()
  if (access.kind === "signed_out") return null
  if (access.kind === "none") redirect("/onboarding")
  if (access.kind === "denied") return <TeamAreaClosed area="customers" store={access.store} permissions={access.permissions} />
  const g = await personByKey(access.db, access.scope, key).catch(() => null)
  if (!g) redirect("/app/contacts?notice=not_found")
  if (g.person.id !== key) redirect(`/app/contacts/${g.person.id}`)
  /* Join answers only for who may approve members: the store's owner (lib/communities permissions; a team member sees the rest). */
  const profile = await readProfile(access.db, access.scope, g, { joinAnswers: access.isOwner })
  return <ProfileClient profile={profile} marketing={access.marketing} />
}
