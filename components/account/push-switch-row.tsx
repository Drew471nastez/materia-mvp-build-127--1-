"use client"

/**
 * PUSH NOTIFICATIONS, ONE SWITCH FOR THE PERSON.
 *
 * The phone apps push what happens in your communities and from creators
 * you follow or bought from (lib/push, run by the push worker). Whether
 * they push to you at all is this switch, saved by PATCH /api/me/push
 * { enabled } and read by GET /api/me/push.
 *
 * GUARDED. The route belongs to the push work (GET answers { enabled,
 * devices }, PATCH { enabled } answers { ok, enabled }). A 404 means it is
 * not deployed here, and the row is not drawn at all: a switch that saves
 * nowhere is a dead button. A 503 not_set_up means the route is there but
 * its table is not yet: the row says it turns on after the next update,
 * with no switch. Sale and payout pushes are a seller's own and are not
 * this switch.
 */
import { useCallback, useEffect, useState } from "react"
import { PrivacyRow, Saved, Switch, useSavedSwitch } from "@/components/app/settings/account-panels"
import { pushStateFrom } from "@/lib/account/push-state"

export const PUSH_ROUTE = "/api/me/push"

async function savePush(enabled: boolean) {
  let res: Response
  try {
    res = await fetch(PUSH_ROUTE, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) })
  } catch {
    throw new Error("Could not reach Storelib. Check your connection and try again.")
  }
  if (res.status === 503) throw new Error(NOT_YET)
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error((data && typeof data.error === "string" && data.error !== "not_set_up" && data.error) || "That did not save. Try again.")
  }
}

const NOT_YET = "This turns on after the next update."
const TITLE = "Push notifications from communities and people"
const DETAIL = "Replies, mentions, messages and news from your communities and the creators you follow. Sale and payout alerts are not affected."

function Row({ initial }: { initial: boolean }) {
  const push = useSavedSwitch(initial, useCallback((v: boolean) => savePush(v), []))
  return (
    <PrivacyRow
      id="push"
      title={
        <>
          {TITLE}
          <Saved at={push.savedAt} />
        </>
      }
      detail={
        <>
          {DETAIL}
          {push.error && <span className={push.error === NOT_YET ? "mt-1 block text-[#6b7280]" : "mt-1 block text-red-600"}>{push.error}</span>}
        </>
      }
      control={<Switch label={TITLE} checked={push.value} busy={push.busy} onChange={push.change} />}
    />
  )
}

export function PushSwitchRow() {
  const [state, setState] = useState<boolean | "not_yet" | null>(null)
  useEffect(() => {
    let live = true
    fetch(PUSH_ROUTE, { credentials: "include", cache: "no-store" })
      .then(async (res) => pushStateFrom(res.status, await res.json().catch(() => null)))
      .catch(() => null)
      .then((v) => {
        if (live) setState(v)
      })
    return () => {
      live = false
    }
  }, [])
  if (state === null) return null
  if (state === "not_yet") {
    return (
      <PrivacyRow
        id="push"
        title={TITLE}
        detail={
          <>
            {DETAIL}
            <span className="mt-1 block text-[#6b7280]" data-push-not-yet="">
              {NOT_YET}
            </span>
          </>
        }
        control={null}
      />
    )
  }
  return <Row initial={state} />
}
