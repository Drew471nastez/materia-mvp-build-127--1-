/**
 * /app/emails: subscribers, messages from website contact forms, automations,
 * the emails buyers get from the store (Customer emails, the same editor as
 * Settings) and the emails sent, scheduled and
 * drafted (app/app/emails/emails-client.tsx), with an email's own page
 * opened over the list (?email=<id>). The tab comes from the address so a
 * reload or a shared link opens the same one.
 */
import { EmailsClient } from "./emails-client"
import type { EmailsTab } from "./emails-home"

export const dynamic = "force-dynamic"
export const revalidate = 0

const TABS: EmailsTab[] = ["subscribers", "messages", "flows", "customer", "published", "scheduled", "drafts"]

export default async function EmailsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const tab = typeof sp.tab === "string" && (TABS as string[]).includes(sp.tab) ? (sp.tab as EmailsTab) : typeof sp.message === "string" ? "messages" : "subscribers"
  return <EmailsClient initialTab={tab} />
}
