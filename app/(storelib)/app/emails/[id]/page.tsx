import { redirect } from "next/navigation"

/**
 * An email opens over the Emails list (app/app/emails/emails-client.tsx), so
 * the list is still there, exactly as it was, when the email is closed, the
 * way an order opens over Orders. A link to /app/emails/<id> lands on the
 * same email. The id is only carried across: the page reads an email only
 * if it is this creator's own (app/api/email/campaigns/[id]/report).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function EmailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(UUID.test(id) ? `/app/emails?tab=published&email=${encodeURIComponent(id)}` : "/app/emails")
}
