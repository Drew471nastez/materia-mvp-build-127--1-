"use client"

/**
 * ===========================================================================
 *  SETTINGS › INTEGRATIONS › STORELIB REVIEWS: WHERE IT LIVES
 * ===========================================================================
 * Storelib Reviews is set up in one place, Reviews (app/app/reviews, its
 * Settings tab for the switch, moderation, spam and the website, its
 * Requests tab for the emails). The integration's page says whether it is
 * on, the three numbers a store looks for, and goes there; it keeps no
 * second copy of any setting.
 */
import * as React from "react"
import Link from "next/link"
import { BTN_PRIMARY, BTN_SECONDARY, Notice, api, peekGet } from "@/components/physical/ui"
import type { ReviewsAppSettings } from "@/lib/reviews/app-settings"
import { reviewsHref } from "@/components/app/reviews/reviews-nav"
import { tt } from "@/lib/i18n/text"

type Loaded = { settings: ReviewsAppSettings; ready: boolean; counts?: { pending: number; published: number; asked: number } }

export function ReviewsAppPanel({ onChanged }: { onChanged?: (s: ReviewsAppSettings) => void }) {
  /* Drawn at once from what the Integrations page already read (peekGet), never a grey box first when it is there (round 30). */
  const [loaded, setLoaded] = React.useState<Loaded | null>(() => peekGet<Loaded>("/api/store/reviews-app"))
  const [error, setError] = React.useState<string | null>(null)
  const told = React.useRef(onChanged)
  React.useEffect(() => {
    told.current = onChanged
  }, [onChanged])

  React.useEffect(() => {
    void api<Loaded>("/api/store/reviews-app").then((r) => {
      if (!r.ok) return setError(r.error)
      setLoaded(r.data)
      told.current?.(r.data.settings)
    })
  }, [])

  if (!loaded) {
    return error ? <Notice>{error}</Notice> : <div className="h-24 animate-pulse rounded-xl bg-[#f3f4f6]" aria-label={tt("Loading")} />
  }
  if (!loaded.ready) return <Notice tone="amber">{tt("Storelib Reviews needs its database update (SQL part 134). Until it runs, nothing here is kept.")}</Notice>

  const on = loaded.settings.enabled
  return (
    <div className="space-y-4" data-reviews-app-panel="">
      <div>
        <p className="text-[14px] font-medium text-[#1a1a2e]">{on ? tt("Storelib Reviews is on") : tt("Storelib Reviews is off")}</p>
        <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">
          {on ? tt("Reviews show on your website and buyers are asked by email.") : tt("Show reviews on your website, collect them by email and approve them in Reviews.")}
        </p>
      </div>
      {loaded.counts && on ? (
        <p className="text-[13px] text-[#6b7280]" data-reviews-app-counts="">
          {tt("{published} published · {pending} waiting for approval · {asked} asked by email", { published: loaded.counts.published, pending: loaded.counts.pending, asked: loaded.counts.asked })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Link href={reviewsHref("settings")} className={BTN_PRIMARY} data-reviews-app-settings="">
          {on ? tt("Reviews settings") : tt("Set up in Reviews")}
        </Link>
        <Link href={reviewsHref("overview")} className={BTN_SECONDARY}>
          {tt("Open Reviews")}
        </Link>
      </div>
      <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{tt("Moderation, spam, the request email and how reviews look on your website are all in Reviews.")}</p>
    </div>
  )
}
