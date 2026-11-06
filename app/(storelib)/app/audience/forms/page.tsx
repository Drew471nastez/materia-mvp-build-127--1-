import { getServerTt } from "@/lib/i18n/server"
import { pageUser } from "@/lib/auth/page-user"
import { FormsManager } from "@/components/forms/forms-manager"
export async function generateMetadata() {
  const { tt } = await getServerTt()
  return { title: tt("Forms and quizzes") }
}
export default async function Page() {
  if (!(await pageUser())) return null
  return <FormsManager />
}
