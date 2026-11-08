import { redirect } from "next/navigation"

/*
  Leads moved into Contacts (round 51), after a round under Emails (round AL).
  An old link, a bookmark or a notification email sent before the move lands
  on the same person (?lead=, through /app/contacts/open, which checks the
  store owns it) or the same form's responses (?form=), else on the People
  list showing leads.
*/
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  if (typeof sp.lead === "string") redirect(`/app/contacts/open?from=lead&id=${encodeURIComponent(sp.lead)}`)
  if (typeof sp.form === "string") redirect(`/app/contacts/forms?form=${encodeURIComponent(sp.form)}`)
  redirect("/app/contacts?filter=leads")
}
