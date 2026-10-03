"use client"

/**
 * Times in the viewer's own zone. The server does not know it, so an event's
 * date is drawn once the page is in the browser; until then the slot keeps
 * its size and says nothing wrong.
 */
import { useEffect, useState } from "react"
import { eventDateBadge, eventTime } from "@/lib/communities/format"

function useMounted(): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => setOn(true), [])
  return on
}

export function EventWhen({ startsAt, endsAt }: { startsAt: string; endsAt: string | null }) {
  const on = useMounted()
  return <span suppressHydrationWarning>{on ? eventTime(startsAt, endsAt) : " "}</span>
}

export function EventBadge({ startsAt }: { startsAt: string }) {
  const on = useMounted()
  const b = on ? eventDateBadge(startsAt) : { month: "", day: "" }
  return (
    <span className="flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-[#e8e9ec] leading-none">
      <span className="h-3 text-[10.5px] font-semibold uppercase text-[#c4290c]">{b.month}</span>
      <span className="mt-0.5 h-[18px] text-[17px] font-semibold text-[#1a1a2e]">{b.day}</span>
    </span>
  )
}
