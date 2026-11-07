/**
 * /app/emails/forms: the creator's forms, reached from Emails › Leads
 * (./forms-list.tsx). A form is also made and edited where it is used: the
 * OnePage's Form block and a chat button's questions open the same builder.
 */
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { pageUser } from "@/lib/auth/page-user"
import { FormsList } from "./forms-list"

export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Forms"), robots: { index: false, follow: false } }
}

export default async function Page() {
  if (!(await pageUser())) return null
  return <FormsList />
}
