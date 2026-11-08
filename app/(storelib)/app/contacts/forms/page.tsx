/**
 * /app/contacts/forms: Contacts › Forms (round 51). The page's own bar
 * (Contacts, People | Forms) over the creator's forms, the list Emails ›
 * Leads › Forms drew (app/app/emails/forms/forms-list.tsx, whose insides are
 * the forms' own). `?form=<id>` opens a form and `?message=<id>` a website
 * message; both stay in the address, which FormsList reads, and are handed
 * to it as well.
 */
import type * as React from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerTt } from "@/lib/i18n/server"
import { contactsPage } from "@/lib/contacts/gate"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { FormsList } from "../../emails/forms/forms-list"
import { ContactsHeader } from "../contacts-header"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Forms"), robots: { index: false, follow: false } }
}

/* The list takes `form` and `message` once the forms' side reads them as props; until then it reads the same from the address. */
const Forms = FormsList as unknown as React.ComponentType<{ form?: string; message?: string }>

export default async function ContactsFormsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const access = await contactsPage()
  if (access.kind === "signed_out") return null
  if (access.kind === "none") redirect("/onboarding")
  if (access.kind === "denied") return <TeamAreaClosed area="customers" store={access.store} permissions={access.permissions} />
  const form = typeof sp.form === "string" ? sp.form : undefined
  const message = typeof sp.message === "string" ? sp.message : undefined
  return (
    <>
      <ContactsHeader tab="forms" />
      <Forms form={form} message={message} />
    </>
  )
}
