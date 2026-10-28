"use client"

/**
 * THE LIVE PAGE REDRAWS ITSELF WHEN A SCHEDULED BLOCK STARTS OR ENDS
 * (lib/onepage/schedule-clock). Rendered by the public route with the next
 * moment the server found. At that moment it asks the server for the page
 * again (router.refresh: the same route, the same rule, no reload and no
 * scroll lost). A tab that slept through the moment asks as soon as it is
 * looked at again. It draws nothing.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { scheduleWait } from "@/lib/onepage/schedule-clock"

export function ScheduleRefresh({ at }: { at: number | null }) {
  const router = useRouter()
  React.useEffect(() => {
    if (at === null) return
    let timer = 0
    let done = false
    const fire = () => {
      if (done) return
      done = true
      window.clearTimeout(timer)
      router.refresh()
    }
    const wait = scheduleWait(at, Date.now())
    if (wait !== null) timer = window.setTimeout(fire, wait)
    const onLook = () => {
      if (document.visibilityState === "visible" && Date.now() >= at) fire()
    }
    document.addEventListener("visibilitychange", onLook)
    return () => {
      done = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onLook)
    }
  }, [at, router])
  return null
}
