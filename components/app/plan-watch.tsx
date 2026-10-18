"use client"

/**
 * ===========================================================================
 *  A PLAN SET FROM /admin REACHES AN OPEN APP
 * ===========================================================================
 * The owner: "it updates in real time across its accounts and everything".
 * An admin's plan is written where every server check reads it at once
 * (lib/billing/plan-override.ts), so a request made after the change already
 * gets it. What is already on screen was drawn with the old plan: this
 * listens for the creator's own `creator_plan_overrides` row (part 252 puts
 * it in the realtime publication, and row level security lets only its
 * creator read it) and, when it changes, draws the page again from the
 * server and tells anything listening (`storelib:plan-changed`).
 *
 * Nothing on screen, nothing to do before part 252 runs: the subscription
 * simply never fires.
 */
import * as React from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"

export const PLAN_CHANGED_EVENT = "storelib:plan-changed"

export function PlanWatch({ creatorId }: { creatorId: string | null | undefined }) {
  const router = useRouter()
  React.useEffect(() => {
    if (!creatorId) return
    let gone = false
    let timer: number | null = null
    let supabase: ReturnType<typeof createClient> | null = null
    let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null
    const changed = () => {
      if (timer) window.clearTimeout(timer)
      /* The trigger and the function can write the row twice in one change: one refresh. */
      timer = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent(PLAN_CHANGED_EVENT))
        router.refresh()
      }, 300)
    }
    void (async () => {
      try {
        supabase = createClient()
        /* The join carries the signed in token, or the row is not readable to it. */
        try {
          await supabase.realtime.setAuth()
        } catch {
          /* The join goes as it would have. */
        }
        if (gone) return
        channel = supabase
          .channel(`plan:${creatorId}`)
          .on("postgres_changes", { event: "*", schema: "public", table: "creator_plan_overrides", filter: `creator_id=eq.${creatorId}` }, changed)
          .subscribe()
      } catch {
        /* No realtime: the next page load reads the plan as it is. */
      }
    })()
    return () => {
      gone = true
      if (timer) window.clearTimeout(timer)
      if (supabase && channel) supabase.removeChannel(channel)
    }
  }, [creatorId, router])
  return null
}
