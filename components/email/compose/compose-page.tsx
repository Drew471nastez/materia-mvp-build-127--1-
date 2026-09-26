"use client"

/**
 * /app/emails/new and /app/emails/edit/<id>: the composer as a page of its
 * own. On the way back the lists it may have changed are read again right
 * away (components/email/emails-cache.ts), so the list is fresh when it is
 * drawn, on the tab that now holds this email.
 *
 * THE WAY BACK IS A BACK when it can be: the list right behind the composer,
 * on the tab this email now belongs to, with nothing open over it
 * (app/app/emails/list-return.ts). Then the list comes back as it was left,
 * its scroll kept and with no landing, where pushing it again drew it as a
 * new page at the top with the whole list fading and rising in. Anything
 * else (a draft that is now scheduled, a composer opened from a link) is
 * pushed at the right tab, as it always was.
 */
import { useRouter } from "next/navigation"
import { refreshMatching } from "@/components/email/emails-cache"
import { canReturnTo } from "@/lib/navigation/in-app-history"
import { listBehindShows } from "@/app/app/emails/list-return"
import { leaveLayer } from "@/app/app/emails/layer-nav"
import { EmailComposer } from "./composer"

export function ComposePage({ campaignId }: { campaignId: string | null }) {
  const router = useRouter()
  return (
    <EmailComposer
      key={campaignId ?? "new"}
      campaignId={campaignId}
      onExit={(tab) => {
        refreshMatching("emails:")
        /* On a phone the composer is a layer, and goes off the list the way it came (app/app/emails/layer-nav.ts). */
        leaveLayer(() => {
          if (tab && listBehindShows(tab, canReturnTo("/app/emails"))) router.back()
          else router.push(tab ? `/app/emails?tab=${tab}` : "/app/emails")
        })
      }}
    />
  )
}
