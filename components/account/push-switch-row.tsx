"use client"

/**
 * PUSH NOTIFICATIONS, ONE SWITCH FOR THE PERSON.
 *
 * The phone apps push what happens in your communities and from creators
 * you follow or bought from (lib/push, run by the push worker). Whether
 * they push to you at all is this switch, saved by PATCH /api/me/push
 * { enabled } and read by GET /api/me/push. It is the first row of
 * Settings, Notifications (components/account/notification-settings.tsx),
 * which reads the route once and hands this row its value, so the kind
 * switches under it know whether they are live.
 *
 * GUARDED. A 503 not_set_up means the route is there but its table is not
 * yet: the row says it turns on after the next update, with no switch.
 * Sale and payout pushes are a seller's own and are not this switch.
 *
 * IN THE APP, turning it on is also the moment the phone is asked (the
 * section's onTurnedOn, lib/native-push.ts): the person's own tap, never
 * on launch.
 */
import { useCallback, useEffect } from "react"
import { PrivacyRow, Saved, Switch, useSavedSwitch } from "@/components/app/settings/account-panels"

export const PUSH_ROUTE = "/api/me/push"

export async function savePush(enabled: boolean) {
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

export const NOT_YET = "This turns on after the next update."
export const PUSH_TITLE = "Allow push notifications"
export const PUSH_DETAIL = "From your communities and the people you follow. Sale and payout alerts are not affected."

export function PushSwitchRow({ initial, onValue, onTurnedOn }: { initial: boolean | "not_yet"; onValue?: (enabled: boolean) => void; onTurnedOn?: () => void }) {
  if (initial === "not_yet") {
    return (
      <PrivacyRow
        id="push"
        title={PUSH_TITLE}
        detail={
          <>
            {PUSH_DETAIL}
            <span className="mt-1 block text-[#6b7280]" data-push-not-yet="">
              {NOT_YET}
            </span>
          </>
        }
        control={null}
      />
    )
  }
  return <LiveRow initial={initial} onValue={onValue} onTurnedOn={onTurnedOn} />
}

function LiveRow({ initial, onValue, onTurnedOn }: { initial: boolean; onValue?: (enabled: boolean) => void; onTurnedOn?: () => void }) {
  const push = useSavedSwitch(initial, useCallback((v: boolean) => savePush(v), []))
  /* The kinds under it follow what the switch shows, including going back after a failed save. */
  useEffect(() => onValue?.(push.value), [push.value, onValue])
  return (
    <PrivacyRow
      id="push"
      title={
        <>
          {PUSH_TITLE}
          <Saved at={push.savedAt} />
        </>
      }
      detail={
        <>
          {PUSH_DETAIL}
          {push.error && <span className={push.error === NOT_YET ? "mt-1 block text-[#6b7280]" : "mt-1 block text-red-600"}>{push.error}</span>}
        </>
      }
      control={
        <Switch
          id="push-switch"
          label={PUSH_TITLE}
          checked={push.value}
          busy={push.busy}
          onChange={(v) => {
            push.change(v)
            /* Straight from the tap: the phone's own question, if it has not been answered yet. */
            if (v) onTurnedOn?.()
          }}
        />
      }
    />
  )
}
