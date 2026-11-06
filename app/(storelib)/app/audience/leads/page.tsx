import { getServerTt } from "@/lib/i18n/server"
import { pageUser } from "@/lib/auth/page-user"
import { LeadsManager } from "@/components/forms/leads-manager"
export async function generateMetadata() {
  const { tt } = await getServerTt()
  return { title: tt("Leads"), robots: { index: false, follow: false } }
}
export default async function Page() {
  if (!(await pageUser())) return null
  return <LeadsManager />
}
