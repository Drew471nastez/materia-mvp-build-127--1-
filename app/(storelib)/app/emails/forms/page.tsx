import { redirect } from "next/navigation"

/**
 * /app/emails/forms moved to Contacts › Forms (round 51): /app/contacts/forms.
 * A link, a bookmark or a notification sent before the move lands on the same
 * form or message there. The list itself is still ./forms-list.tsx.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const q = new URLSearchParams()
  for (const k of ["form", "view", "response", "message", "inbox", "siteform"]) if (typeof sp[k] === "string") q.set(k, sp[k] as string)
  redirect(q.toString() ? `/app/contacts/forms?${q}` : "/app/contacts/forms")
}
