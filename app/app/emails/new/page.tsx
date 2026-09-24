"use client"

/**
 * /app/emails/new: a new email, written in the composer
 * (components/email/compose/composer.tsx). The first save gives it an
 * address of its own, /app/emails/edit/<id>, so a reload opens the draft.
 */
import { useRouter } from "next/navigation"
import { EmailComposer } from "@/components/email/compose/composer"

export default function NewEmailPage() {
  const router = useRouter()
  return <EmailComposer campaignId={null} onExit={(tab) => router.push(tab ? `/app/emails?tab=${tab}` : "/app/emails")} />
}
