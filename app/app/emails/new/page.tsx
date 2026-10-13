/**
 * /app/emails/new: a new email, written in the composer
 * (components/email/compose/composer.tsx). The first save gives it an
 * address of its own, /app/emails/edit/<id>, so a reload opens the draft.
 */
import { ComposePage } from "@/components/email/compose/compose-page"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New email") }
}

export default function NewEmailPage() {
  return <ComposePage campaignId={null} />
}
