"use client"

/**
 * STORELIB REVIEWS › SETTINGS. The one place the app is turned on or off and
 * its rules are set: what happens to a new review, who may write one, photos,
 * how long a buyer can change theirs, and how reviews look on the website
 * (ReviewsAppPanel, sections general and display). When the request emails
 * go is set under Requests, beside the emails themselves, and nowhere else.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { ReviewsAppPanel } from "@/components/app/settings/reviews-app-panel"
import { CARD, CARD_HEAD, H3, MUTED } from "./parts"

export function SettingsView({ onAppChanged }: { onAppChanged?: (on: boolean) => void }) {
  return (
    <div className="space-y-4 sm:space-y-5" data-reviews-settings="">
      <section className={cn(CARD, "overflow-hidden")} aria-labelledby="reviews-settings-title">
        <div className={CARD_HEAD}>
          <h3 id="reviews-settings-title" className={H3}>
            {tt("Settings")}
          </h3>
        </div>
        <div className="px-4 py-4 sm:px-6 sm:py-5">
          <ReviewsAppPanel sections={["general", "display"]} onChanged={(s) => onAppChanged?.(s.enabled)} />
        </div>
      </section>
      <p className={cn(MUTED, "px-1")}>{tt("When review emails go, and what they say, is under Requests.")}</p>
    </div>
  )
}
