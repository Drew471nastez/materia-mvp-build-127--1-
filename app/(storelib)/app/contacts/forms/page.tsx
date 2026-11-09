/**
 * /app/contacts/forms: Contacts › Forms (round 51; wave 5, a page under
 * Contacts with Back, no tabs). The creator's forms, the list Emails › Leads
 * › Forms drew (app/app/emails/forms/forms-list.tsx). FormsList reads its own
 * address (?form, ?view, ?response, ?message, ?inbox, ?siteform), so a link
 * to a form, a response or a message opens it here, and it draws the whole
 * page, its pane and the one bar each screen has (wave 6: a form open under
 * the Forms bar had two bars and two back arrows).
 */
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerTt } from "@/lib/i18n/server"
import { contactsPage } from "@/lib/contacts/gate"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { FormsList } from "../../emails/forms/forms-list"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Forms"), robots: { index: false, follow: false } }
}

export default async function ContactsFormsPage() {
  const access = await contactsPage()
  if (access.kind === "signed_out") return null
  if (access.kind === "none") redirect("/onboarding")
  if (access.kind === "denied") return <TeamAreaClosed area="customers" store={access.store} permissions={access.permissions} />
  /* The pane and every bar are FormsList's: the list's (Back to People, Forms), a form's own, the inbox's. One per screen. */
  return <FormsList />
}
