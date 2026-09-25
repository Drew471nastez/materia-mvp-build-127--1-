"use client"

/**
 * /app/emails/new and /app/emails/edit/<id>: the composer as a page of its
 * own. On the way back the lists it may have changed are read again right
 * away (components/email/emails-cache.ts), so the list is fresh when it is
 * drawn, on the tab that now holds this email.
 */
import { useRouter } from "next/navigation"
import { refreshMatching } from "@/components/email/emails-cache"
import { EmailComposer } from "./composer"

export function ComposePage({ campaignId }: { campaignId: string | null }) {
  const router = useRouter()
  return (
    <EmailComposer
      key={campaignId ?? "new"}
      campaignId={campaignId}
      onExit={(tab) => {
        refreshMatching("emails:")
        router.push(tab ? `/app/emails?tab=${tab}` : "/app/emails")
      }}
    />
  )
}
