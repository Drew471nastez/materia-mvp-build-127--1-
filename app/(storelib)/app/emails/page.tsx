/**
 * /app/emails: three tabs (round 51, the owner's "Campaigns | Automations |
 * Settings"), each with one main action:
 *
 *   ?tab=campaigns     every email sent, scheduled or drafted, in one list
 *                      filtered by &show=all|sent|scheduled|drafts, with an
 *                      email's own page opened over it (?email=<id>)
 *   ?tab=automations   the automations, and each community's own
 *   ?tab=settings      how email goes out (&section=sending) and the emails
 *                      buyers and members get (&section=customer)
 *
 * The people (subscribers, leads) moved to Contacts and the website's
 * messages to Contacts › Forms. Every older address still lands somewhere
 * true: ./emails-route.ts legacyEmailsRedirect says where, and this page
 * sends it there before anything is drawn.
 */
import { redirect } from "next/navigation"
import { EmailsClient } from "./emails-client"
import { emailsAddress, legacyEmailsRedirect } from "./emails-route"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function EmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const moved = legacyEmailsRedirect(sp)
  if (moved) redirect(moved)
  const at = emailsAddress(sp)
  return <EmailsClient initialTab={at.tab} initialShow={at.show} initialSection={at.section} />
}
