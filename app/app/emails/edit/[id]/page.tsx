/**
 * /app/emails/edit/<id>: a draft or a scheduled email, in the composer. The
 * composer reads it through /api/email/campaigns/<id>, which only answers
 * for the signed-in creator's own email.
 */
import { ComposePage } from "@/components/email/compose/compose-page"

export const metadata = { title: "Edit email" }

export default async function EditEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ComposePage campaignId={id} />
}
