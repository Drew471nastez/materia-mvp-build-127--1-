/**
 * /app/bookings (round AR): the creator's bookings from every booking form,
 * upcoming and past, each opening in a sheet with who booked, their answers
 * and what can be done (confirm, decline, move, cancel), and their Google
 * Calendar connection. A notification, the creator's booking email and a
 * Google event all link here with ?booking=<id>.
 */
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerTt } from "@/lib/i18n/server"
import { contactsPage } from "@/lib/contacts/gate"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { BookingsClient } from "./bookings-client"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Bookings"), robots: { index: false, follow: false } }
}

export default async function BookingsPage() {
  const access = await contactsPage()
  if (access.kind === "signed_out") return null
  if (access.kind === "none") redirect("/onboarding")
  if (access.kind === "denied") return <TeamAreaClosed area="customers" store={access.store} permissions={access.permissions} />
  return <BookingsClient />
}
