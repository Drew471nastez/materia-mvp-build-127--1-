import { pageUser } from "@/lib/auth/page-user"
import { FormsManager } from "@/components/forms/forms-manager"
export const metadata = { title: "Forms and quizzes | Storelib" }
export default async function Page() {
  if (!(await pageUser())) return null
  return <FormsManager />
}
