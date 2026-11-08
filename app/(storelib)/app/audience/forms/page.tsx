import { redirect } from "next/navigation"

/* Forms moved beside the people they collect (round 51): /app/contacts/forms. An old link keeps the form it named. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  redirect(typeof sp.form === "string" ? `/app/contacts/forms?form=${encodeURIComponent(sp.form)}` : "/app/contacts/forms")
}
