/**
 * /app/contacts/forms: Contacts › Forms (round 51). The page's own bar
 * (Contacts, People | Forms) over the creator's forms, the list Emails ›
 * Leads › Forms drew (app/app/emails/forms/forms-list.tsx, whose insides are
 * the forms' own). FormsList reads its own address (?form, ?view, ?response,
 * ?message, ?inbox, ?siteform), so a link to a form, a response or a message
 * opens it here; it draws no container or title of its own, this page does.
 */
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerTt } from "@/lib/i18n/server"
import { contactsPage } from "@/lib/contacts/gate"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { FormsList } from "../../emails/forms/forms-list"
import { ContactsHeader } from "../contacts-header"
import { GUTTER, LIST_WIDTH } from "../../orders/order-parts"
import { cn } from "@/lib/utils"

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
  return (
    <>
      <ContactsHeader tab="forms" />
      <div className={cn("mx-auto pb-24 pt-3 md:pb-8", LIST_WIDTH, GUTTER)} data-contacts-forms="">
        <FormsList />
      </div>
    </>
  )
}
