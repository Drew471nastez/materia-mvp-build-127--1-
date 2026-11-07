import { redirect } from "next/navigation"

/*
  Leads moved into Emails (round AL): /app/emails?tab=leads, beside
  Subscribers and Messages. An old link, a bookmark or a notification email
  sent before the move lands on the same lead or form there.
*/
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const q = new URLSearchParams({ tab: "leads" })
  for (const k of ["lead", "form"]) if (typeof sp[k] === "string") q.set(k, sp[k] as string)
  redirect(`/app/emails?${q}`)
}
