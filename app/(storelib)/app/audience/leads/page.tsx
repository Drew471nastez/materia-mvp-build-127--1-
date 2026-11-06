import { pageUser } from "@/lib/auth/page-user"
import { LeadsManager } from "@/components/forms/leads-manager"
export const metadata = {
  title: "Leads | Storelib",
  robots: { index: false, follow: false },
}
export default async function Page() {
  if (!(await pageUser())) return null
  return <LeadsManager />
}
