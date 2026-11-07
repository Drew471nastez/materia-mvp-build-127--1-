import { redirect } from "next/navigation"

/* Forms moved beside Leads, under Emails (round AL): /app/emails/forms. An old link keeps the form it named. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  redirect(typeof sp.form === "string" ? `/app/emails/forms?form=${encodeURIComponent(sp.form)}` : "/app/emails/forms")
}
